import streamlit as st
import pandas as pd
import sys
from datetime import datetime
import gspread
from google.auth import default

# Add functions to path
sys.path.append('./functions')

import quickbooks
import bigtime
import sheets

st.set_page_config(page_title="Commission Calculator", page_icon="💰", layout="wide")

st.title("💰 Commission Calculator")
st.markdown("Calculate sales commissions from QuickBooks and BigTime data")

# Year selector
col1, col2 = st.columns([1, 3])
with col1:
    year = st.selectbox("Select Year", [2023, 2024, 2025, 2026], index=2)

# Config from secrets
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
    REPORTS_FOLDER_ID = st.secrets["REPORTS_FOLDER_ID"]
except:
    # Fallback for Colab (shouldn't happen in Streamlit)
    import credentials
    CONFIG_SHEET_ID = credentials.get("SHEET_CONFIG_ID")
    REPORTS_FOLDER_ID = credentials.get("REPORTS_FOLDER_ID")

if st.button("🚀 Calculate Commissions", type="primary"):
    
    # ============================================================
    # PHASE 1: LOAD CONFIGURATION
    # ============================================================
    
    with st.spinner("📋 Loading configuration from Voyage_Global_Config..."):
        rules_df = sheets.read_config(CONFIG_SHEET_ID, "Rules")
        offsets_df = sheets.read_config(CONFIG_SHEET_ID, "Offsets")
        mapping_df = sheets.read_config(CONFIG_SHEET_ID, "Mapping")
        
        if rules_df is None or offsets_df is None or mapping_df is None:
            st.error("❌ Error: Could not load config sheets")
            st.stop()
        
        rules_df = rules_df.rename(columns={'Client': 'Client_or_Resource'})
        
        client_name_map = dict(zip(
            mapping_df[mapping_df['Source_System'] == 'QuickBooks']['Before_Name'],
            mapping_df[mapping_df['Source_System'] == 'QuickBooks']['After_Name']
        ))
        
        st.success(f"✅ Loaded {len(rules_df)} rules, {len(offsets_df)} offsets, {len(client_name_map)} mappings")
    
    # ============================================================
    # PHASE 2: PULL API DATA
    # ============================================================
    
    with st.spinner("📡 Pulling data from QuickBooks and BigTime..."):
        df_qb_raw = quickbooks.get_consulting_income(year)
        df_bt_raw = bigtime.get_time_report(year)
        
        if df_qb_raw.empty or df_bt_raw.empty:
            st.error("❌ Error: No data returned from APIs")
            st.stop()
        
        st.success(f"✅ QB: {len(df_qb_raw)} transactions (${df_qb_raw['TotalAmount'].astype(float).sum():,.2f}) | BT: {len(df_bt_raw)} entries")
    
    # ============================================================
    # PHASE 3: PROCESS QUICKBOOKS DATA (CLIENT COMMISSIONS)
    # ============================================================
    
    with st.spinner("💰 Calculating client commissions..."):
        qb = df_qb_raw.copy()
        qb["TransactionDate"] = pd.to_datetime(qb["TransactionDate"])
        qb["Amount"] = pd.to_numeric(qb["TotalAmount"])
        qb["Year"] = qb["TransactionDate"].dt.year
        
        # Parse client name - split on ":" and take first part
        qb["Client_Raw"] = qb["Customer"].astype(str).str.split(":", n=1).str[0].str.strip()
        qb["Client_Normalized"] = qb["Client_Raw"].replace(client_name_map)
        
        qb_year = qb[qb["Year"] == year].copy()
        
        # Prepare rules
        rules_client = rules_df[rules_df['Rule_Scope'] == 'client'].copy()
        rules_client['Start_Date'] = pd.to_datetime(rules_client['Start_Date'])
        rules_client['End_Date'] = pd.to_datetime(rules_client['End_Date'], errors='coerce')
        
        # Calculate commissions
        commission_records = []
        
        for idx, invoice in qb_year.iterrows():
            client = invoice['Client_Normalized']
            inv_date = invoice['TransactionDate']
            amount = invoice['Amount']
            
            applicable_rules = rules_client[
                (rules_client['Client_or_Resource'] == client) &
                (rules_client['Start_Date'] <= inv_date) &
                ((rules_client['End_Date'].isna()) | (rules_client['End_Date'] >= inv_date))
            ]
            
            for _, rule in applicable_rules.iterrows():
                commission_records.append({
                    'Salesperson': rule['Salesperson'],
                    'Client': client,
                    'Category': rule['Category'],
                    'Invoice_Date': inv_date,
                    'Invoice_Amount': amount,
                    'Commission_Rate': rule['Rate'],
                    'Commission_Amount': amount * rule['Rate'],
                    'Source': 'QuickBooks - Client Commission'
                })
        
        client_commissions = pd.DataFrame(commission_records)
        
        if not client_commissions.empty:
            st.success(f"✅ {len(client_commissions)} client commission entries: ${client_commissions['Commission_Amount'].sum():,.2f}")
        else:
            st.warning("⚠️ No client commissions calculated")
    
    # ============================================================
    # PHASE 4: PROCESS BIGTIME DATA (DELIVERY & REFERRAL)
    # ============================================================
    
    with st.spinner("🔨 Calculating delivery & referral commissions..."):
        bt = df_bt_raw.copy()
        
        rules_resource = rules_df[rules_df['Rule_Scope'] == 'resource'].copy()
        rules_resource['Start_Date'] = pd.to_datetime(rules_resource['Start_Date'])
        rules_resource['End_Date'] = pd.to_datetime(rules_resource['End_Date'], errors='coerce')
        
        resource_records = []
        
        # Find columns
        revenue_col = None
        for col_name in ['Billable ($)', 'Revenue_Amount', 'tmchgbillbase']:
            if col_name in bt.columns:
                revenue_col = col_name
                break
        
        date_col = None
        for col_name in ['Date', 'tmdt']:
            if col_name in bt.columns:
                date_col = col_name
                break
        
        staff_col = None
        for col_name in ['Staff Member', 'Staff_Member', 'tmstaffnm']:
            if col_name in bt.columns:
                staff_col = col_name
                break
        
        if revenue_col and date_col and staff_col:
            bt['Revenue'] = pd.to_numeric(bt[revenue_col], errors='coerce')
            bt['Date'] = pd.to_datetime(bt[date_col], errors='coerce')
            bt['Year_Month'] = bt['Date'].dt.to_period('M')
            
            # Get client column if it exists (for delivery commissions)
            client_col = None
            for col_name in ['Client', 'tmclientnm']:
                if col_name in bt.columns:
                    client_col = col_name
                    break
            
            # Apply commission rules to each entry first
            bt_with_rules = []
            for idx, time_entry in bt.iterrows():
                staff = time_entry.get(staff_col, None)
                date = time_entry.get('Date', None)
                revenue = time_entry.get('Revenue', 0)
                year_month = time_entry.get('Year_Month', None)
                client = time_entry.get(client_col, '') if client_col else ''
                
                if not staff or pd.isna(date) or revenue == 0:
                    continue
                
                applicable_rules = rules_resource[
                    (rules_resource['Client_or_Resource'] == staff) &
                    (rules_resource['Start_Date'] <= date) &
                    ((rules_resource['End_Date'].isna()) | (rules_resource['End_Date'] >= date))
                ]
                
                for _, rule in applicable_rules.iterrows():
                    bt_with_rules.append({
                        'Salesperson': rule['Salesperson'],
                        'Resource': staff,
                        'Client': client,
                        'Category': rule['Category'],
                        'Year_Month': year_month,
                        'Revenue': revenue,
                        'Rate': rule['Rate'],
                        'Commission': revenue * rule['Rate']
                    })
            
            if bt_with_rules:
                bt_rules_df = pd.DataFrame(bt_with_rules)
                
                # Aggregate by month
                # For Referral Commission: group by Salesperson, Resource, Category, Year_Month
                # For Delivery Commission: group by Salesperson, Resource, Client, Category, Year_Month
                
                referral_df = bt_rules_df[bt_rules_df['Category'] == 'Referral Commission']
                delivery_df = bt_rules_df[bt_rules_df['Category'] == 'Delivery Commission']
                
                # Aggregate Referral (by month, per resource)
                if not referral_df.empty:
                    referral_monthly = referral_df.groupby(
                        ['Salesperson', 'Resource', 'Category', 'Year_Month'], 
                        as_index=False
                    ).agg({
                        'Revenue': 'sum',
                        'Commission': 'sum',
                        'Rate': 'first'  # Rate should be same for all entries in month
                    })
                    
                    # Set date to last day of month
                    referral_monthly['Invoice_Date'] = referral_monthly['Year_Month'].dt.to_timestamp('M')
                    
                    for _, row in referral_monthly.iterrows():
                        resource_records.append({
                            'Salesperson': row['Salesperson'],
                            'Client': row['Resource'],
                            'Category': row['Category'],
                            'Invoice_Date': row['Invoice_Date'],
                            'Invoice_Amount': row['Revenue'],
                            'Commission_Rate': row['Rate'],
                            'Commission_Amount': row['Commission'],
                            'Source': f'BigTime - {row["Category"]} (Monthly)'
                        })
                
                # Aggregate Delivery (by month, per resource, per client)
                if not delivery_df.empty:
                    delivery_monthly = delivery_df.groupby(
                        ['Salesperson', 'Resource', 'Client', 'Category', 'Year_Month'], 
                        as_index=False
                    ).agg({
                        'Revenue': 'sum',
                        'Commission': 'sum',
                        'Rate': 'first'
                    })
                    
                    # Set date to last day of month
                    delivery_monthly['Invoice_Date'] = delivery_monthly['Year_Month'].dt.to_timestamp('M')
                    
                    for _, row in delivery_monthly.iterrows():
                        # For delivery, show "Resource @ Client" in the Client field
                        client_display = f"{row['Resource']} @ {row['Client']}" if row['Client'] else row['Resource']
                        
                        resource_records.append({
                            'Salesperson': row['Salesperson'],
                            'Client': client_display,
                            'Category': row['Category'],
                            'Invoice_Date': row['Invoice_Date'],
                            'Invoice_Amount': row['Revenue'],
                            'Commission_Rate': row['Rate'],
                            'Commission_Amount': row['Commission'],
                            'Source': f'BigTime - {row["Category"]} (Monthly)'
                        })
        
        resource_commissions = pd.DataFrame(resource_records)
        
        if not resource_commissions.empty:
            st.success(f"✅ {len(resource_commissions)} resource commission entries (monthly aggregated): ${resource_commissions['Commission_Amount'].sum():,.2f}")
        else:
            st.warning("⚠️ No resource commissions calculated")
    
    # ============================================================
    # PHASE 5: COMBINE & APPLY OFFSETS
    # ============================================================
    
    with st.spinner("🔄 Applying offsets..."):
        all_commissions = pd.concat([client_commissions, resource_commissions], ignore_index=True)
        
        # Process offsets
        offsets_df['Effective_Date'] = pd.to_datetime(offsets_df['Effective_Date'], format='mixed')
        
        def parse_accounting_amount(val):
            if pd.isna(val):
                return 0
            val_str = str(val).strip()
            is_negative = val_str.startswith('(') and val_str.endswith(')')
            val_clean = val_str.replace('(', '').replace(')', '').replace(',', '').strip()
            try:
                amount = float(val_clean)
                return -amount if is_negative else amount
            except:
                return 0
        
        offsets_df['Amount'] = offsets_df['Amount'].apply(parse_accounting_amount)
        offsets_year = offsets_df[offsets_df['Effective_Date'].dt.year == year]
        
        if not offsets_year.empty:
            for _, offset in offsets_year.iterrows():
                offset_record = pd.DataFrame([{
                    'Salesperson': offset['Salesperson'],
                    'Client': 'Offset',
                    'Category': offset['Category'],
                    'Invoice_Date': offset['Effective_Date'],
                    'Invoice_Amount': 0,
                    'Commission_Rate': 0,
                    'Commission_Amount': offset['Amount'],
                    'Source': f"Offset - {offset.get('Note', '')}"
                }])
                all_commissions = pd.concat([all_commissions, offset_record], ignore_index=True)
            
            st.success(f"✅ Applied {len(offsets_year)} offsets: ${offsets_year['Amount'].sum():,.2f}")
    
    # ============================================================
    # PHASE 6: CALCULATE SUMMARIES
    # ============================================================
    
    final_summary = all_commissions.groupby('Salesperson', as_index=False).agg({
        'Commission_Amount': 'sum'
    }).round(2)
    final_summary.columns = ['Salesperson', 'Total_Commission']
    
    category_summary = all_commissions.groupby(['Salesperson', 'Category'], as_index=False).agg({
        'Commission_Amount': 'sum'
    }).round(2)
    
    revenue_by_client = qb_year.groupby('Client_Normalized').agg({
        'Amount': 'sum',
        'TransactionDate': 'count'
    }).rename(columns={'Amount': 'Total_Revenue', 'TransactionDate': 'Transactions'})
    revenue_by_client = revenue_by_client.sort_values('Total_Revenue', ascending=False)
    
    # ============================================================
    # PHASE 7: DISPLAY RESULTS
    # ============================================================
    
    st.success("✅ Calculations complete!")
    
    st.header("📊 Results Summary")
    
    # Summary metrics
    cols = st.columns(len(final_summary))
    for idx, (_, row) in enumerate(final_summary.iterrows()):
        with cols[idx]:
            st.metric(
                row['Salesperson'],
                f"${row['Total_Commission']:,.2f}",
                delta=None
            )
    
    # Tabs for detailed views
    tab1, tab2, tab3 = st.tabs(["💰 By Category", "🏢 Revenue by Client", "📋 Full Ledger"])
    
    with tab1:
        st.subheader("Commission Breakdown by Category")
        for salesperson in final_summary['Salesperson'].unique():
            sp_categories = category_summary[category_summary['Salesperson'] == salesperson]
            with st.expander(f"**{salesperson}** - ${sp_categories['Commission_Amount'].sum():,.2f}"):
                st.dataframe(
                    sp_categories[['Category', 'Commission_Amount']].style.format({'Commission_Amount': '${:,.2f}'}),
                    hide_index=True
                )
    
    with tab2:
        st.subheader(f"Revenue by Client - {year}")
        st.write(f"**Total Clients:** {len(revenue_by_client)} | **Total Revenue:** ${revenue_by_client['Total_Revenue'].sum():,.2f}")
        st.dataframe(
            revenue_by_client.style.format({'Total_Revenue': '${:,.2f}', 'Transactions': '{:.0f}'}),
            height=400
        )
    
    with tab3:
        st.subheader("Full Commission Ledger")
        ledger_sorted = all_commissions.sort_values(['Invoice_Date', 'Client'], ascending=[True, True])
        ledger_display = ledger_sorted[['Salesperson', 'Client', 'Category', 'Invoice_Date', 'Invoice_Amount', 'Commission_Rate', 'Commission_Amount', 'Source']].copy()
        ledger_display = ledger_display.rename(columns={'Client': 'Client or Resource'})
        st.dataframe(
            ledger_display.style.format({
                'Invoice_Amount': '${:,.2f}',
                'Commission_Rate': '{:.2%}',
                'Commission_Amount': '${:,.2f}',
                'Invoice_Date': lambda x: x.strftime('%Y-%m-%d') if pd.notna(x) else ''
            }),
            height=400,
            hide_index=True
        )
    
    # ============================================================
    # PHASE 8: EXPORT TO EXCEL
    # ============================================================
    
    st.divider()
    
    if st.button("📥 Download Excel Report", type="secondary"):
        with st.spinner("Creating Excel report..."):
            try:
                from io import BytesIO
                
                # Create Excel file in memory
                output = BytesIO()
                
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    # Tab 1: Overall Summary
                    overall_summary_data = pd.DataFrame([
                        ['COMMISSION REPORT', year],
                        ['', ''],
                        ['SUMMARY BY SALESPERSON', ''],
                    ])
                    
                    overall_summary_data = pd.concat([
                        overall_summary_data,
                        pd.DataFrame([['Salesperson', 'Total Commission']]),
                        final_summary[['Salesperson', 'Total_Commission']],
                        pd.DataFrame([['', '']]),
                        pd.DataFrame([['BREAKDOWN BY CATEGORY', '']]),
                        pd.DataFrame([['Salesperson', 'Category', 'Amount']]),
                        category_summary[['Salesperson', 'Category', 'Commission_Amount']]
                    ], ignore_index=True)
                    
                    overall_summary_data.to_excel(writer, sheet_name='Overall_Summary', index=False, header=False)
                    
                    # Tab 2: Full Ledger
                    ledger_sorted = all_commissions.sort_values(['Invoice_Date', 'Client'], ascending=[True, True])
                    ledger_export = ledger_sorted[['Salesperson', 'Client', 'Category', 'Invoice_Date', 'Invoice_Amount', 'Commission_Rate', 'Commission_Amount', 'Source']].copy()
                    ledger_export = ledger_export.rename(columns={'Client': 'Client or Resource'})
                    ledger_export.to_excel(writer, sheet_name='Full_Ledger', index=False)
                    
                    # Tab 3: Revenue by Client
                    revenue_export = revenue_by_client.reset_index()
                    revenue_export = revenue_export.rename(columns={'Client_Normalized': 'Client'})
                    revenue_export.to_excel(writer, sheet_name='Revenue_by_Client', index=False)
                    
                    # Tab 4+: Individual salesperson tabs
                    for salesperson in final_summary['Salesperson'].unique():
                        sp_commissions = all_commissions[all_commissions['Salesperson'] == salesperson].copy()
                        sp_summary = final_summary[final_summary['Salesperson'] == salesperson]
                        sp_categories = category_summary[category_summary['Salesperson'] == salesperson]
                        
                        # Create summary section
                        sp_data = pd.DataFrame([
                            [f'COMMISSION REPORT: {salesperson.upper()}', ''],
                            [f'Year: {year}', ''],
                            ['', ''],
                            ['SUMMARY', ''],
                            ['Total Commission', sp_summary.iloc[0]['Total_Commission']],
                            ['', ''],
                            ['BREAKDOWN BY CATEGORY', ''],
                            ['Category', 'Amount']
                        ])
                        
                        sp_data = pd.concat([
                            sp_data,
                            sp_categories[['Category', 'Commission_Amount']],
                            pd.DataFrame([['', '']]),
                            pd.DataFrame([['COMMISSION LEDGER', '']]),
                            pd.DataFrame([['Client or Resource', 'Category', 'Date', 'Invoice Amount', 'Rate', 'Commission', 'Source']]),
                        ], ignore_index=True)
                        
                        # Add ledger entries
                        sp_commissions_sorted = sp_commissions.sort_values(['Invoice_Date', 'Client'], ascending=[True, True])
                        sp_ledger = sp_commissions_sorted[['Client', 'Category', 'Invoice_Date', 'Invoice_Amount', 'Commission_Rate', 'Commission_Amount', 'Source']].copy()
                        
                        sp_data = pd.concat([sp_data, sp_ledger], ignore_index=True)
                        
                        # Excel sheet names limited to 31 chars
                        sheet_name = salesperson.replace(' ', '_')[:31]
                        sp_data.to_excel(writer, sheet_name=sheet_name, index=False, header=False)
                
                # Prepare download
                excel_data = output.getvalue()
                report_timestamp = datetime.now().strftime('%Y-%m-%d_%H%M')
                filename = f"Commission_Report_{report_timestamp}.xlsx"
                
                st.download_button(
                    label="⬇️ Click to Download",
                    data=excel_data,
                    file_name=filename,
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
                
                st.success("✅ Excel report ready for download!")
                
            except Exception as e:
                st.error(f"❌ Export failed: {e}")
                import traceback
                st.code(traceback.format_exc())

else:
    st.info("👆 Click the button above to calculate commissions for the selected year")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This calculator:
        1. Loads commission rules from **Voyage_Global_Config** Google Sheet
        2. Pulls **QuickBooks** consulting income (cash basis)
        3. Pulls **BigTime** time entries for delivery and referral commissions
        4. Calculates commissions based on date ranges and rates
        5. Applies offsets (salaries, benefits, etc.)
        6. Exports detailed report to Google Sheets
        
        **Commission Types:**
        - **Client Commission** - % of revenue from specific clients
        - **Delivery Commission** - % of own billable work
        - **Referral Commission** - % of referred staff's work
        - **Offsets** - Salaries, benefits, prior payments
        """)
