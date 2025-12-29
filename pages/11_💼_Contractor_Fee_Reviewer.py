import streamlit as st
import pandas as pd
import sys
from datetime import datetime, timedelta
from io import BytesIO

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')

import bigtime

st.set_page_config(page_title="Contractor Fee Reviewer", page_icon="💼", layout="wide")

st.title("💼 Contractor Fee Reviewer")
st.markdown("Review contractor fees and hours for compliance and accuracy")

# Date inputs
st.subheader("Review Period")
col1, col2 = st.columns(2)
with col1:
    start_date = st.date_input("Start Date", value=datetime.now() - timedelta(days=30))
with col2:
    end_date = st.date_input("End Date", value=datetime.now())

if st.button("🚀 Review Contractor Fees", type="primary"):
    
    debug_log = []
    
    # ============================================================
    # PHASE 1: PULL BIGTIME DATA
    # ============================================================
    
    with st.spinner("📡 Pulling data from BigTime..."):
        # Get time report (for contractor hours)
        bt_time = bigtime.get_time_report(start_date.year)
        
        if bt_time is None or bt_time.empty:
            st.error("❌ No BigTime time data available")
            st.stop()
        
        # Find date column and filter to review period
        date_col = None
        for col in ['Date', 'tmdt']:
            if col in bt_time.columns:
                date_col = col
                break
        
        if date_col:
            bt_time['Date'] = pd.to_datetime(bt_time[date_col])
            bt_time = bt_time[
                (bt_time['Date'] >= pd.Timestamp(start_date)) & 
                (bt_time['Date'] <= pd.Timestamp(end_date))
            ].copy()
        else:
            st.error("❌ Could not find date column in BigTime data")
            st.stop()
        
        debug_log.append(f"✅ Pulled {len(bt_time)} time entries")
        
        # Get expense report (for contractor fees) - Report 284803
        try:
            api_key = st.secrets["BIGTIME_API_KEY"]
            firm_id = st.secrets["BIGTIME_FIRM_ID"]
            
            url = f"https://iq.bigtime.net/BigtimeData/api/v2/report/data/284803"
            headers = {
                "X-Auth-ApiToken": api_key,
                "X-Auth-Realm": firm_id,
                "Accept": "application/json"
            }
            
            payload = {
                "DT_BEGIN": start_date.strftime("%Y-%m-%d"),
                "DT_END": end_date.strftime("%Y-%m-%d")
            }
            
            import requests
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            
            if response.status_code == 200:
                report_data = response.json()
                data_rows = report_data.get('Data', [])
                field_list = report_data.get('FieldList', [])
                
                if data_rows and field_list:
                    bt_expenses = pd.DataFrame(data_rows, columns=field_list)
                    debug_log.append(f"✅ Pulled {len(bt_expenses)} expense entries")
                else:
                    st.warning("⚠️ No expense data found for this period")
                    bt_expenses = pd.DataFrame()
            else:
                st.warning(f"⚠️ Expense report API returned status {response.status_code}")
                bt_expenses = pd.DataFrame()
                
        except Exception as e:
            st.warning(f"⚠️ Could not fetch expense data: {e}")
            bt_expenses = pd.DataFrame()
    
    # ============================================================
    # PHASE 2: IDENTIFY CONTRACTORS & PROCESS TIME DATA
    # ============================================================
    
    with st.spinner("🔨 Processing contractor data..."):
        # Find column names for time data
        staff_col = None
        for col in ['Staff Member', 'Staff_Member', 'tmstaffnm']:
            if col in bt_time.columns:
                staff_col = col
                break
        
        hours_col = None
        for col in ['tmhrsin', 'Hours', 'Billable']:
            if col in bt_time.columns:
                hours_col = col
                break
        
        if not all([staff_col, hours_col]):
            st.error("❌ Could not find required columns in time data")
            st.stop()
        
        bt_time['Staff'] = bt_time[staff_col]
        bt_time['Hours'] = pd.to_numeric(bt_time[hours_col], errors='coerce')
        bt_time['Week_Ending'] = bt_time['Date'] + pd.to_timedelta((4 - bt_time['Date'].dt.dayofweek) % 7, unit='D')
        
        # Identify contractors (those with "Contractor Fee" expenses)
        if not bt_expenses.empty:
            contractor_names = bt_expenses['Staff'].unique().tolist() if 'Staff' in bt_expenses.columns else []
        else:
            contractor_names = []
        
        # Filter time entries to contractors only
        contractor_time = bt_time[bt_time['Staff'].isin(contractor_names)].copy()
        
        # Aggregate hours by contractor and week
        weekly_hours = contractor_time.groupby(['Staff', 'Week_Ending'])['Hours'].sum().reset_index()
        weekly_hours = weekly_hours.rename(columns={'Hours': 'Total_Hours'})
        
        debug_log.append(f"✅ Found {len(contractor_names)} contractors with fees")
        debug_log.append(f"✅ Processed {len(weekly_hours)} contractor-weeks")
    
    # ============================================================
    # PHASE 3: PROCESS EXPENSE DATA
    # ============================================================
    
    with st.spinner("💰 Processing contractor fees..."):
        non_friday_fees = []
        weekly_fees = pd.DataFrame()
        
        if not bt_expenses.empty:
            # Find expense columns
            expense_staff_col = None
            for col in ['Staff', 'Staff Member', 'tmstaffnm']:
                if col in bt_expenses.columns:
                    expense_staff_col = col
                    break
            
            expense_date_col = None
            for col in ['Date', 'Transaction Date', 'tmdt']:
                if col in bt_expenses.columns:
                    expense_date_col = col
                    break
            
            expense_amount_col = None
            for col in ['Amount', 'Total', 'tmamt']:
                if col in bt_expenses.columns:
                    expense_amount_col = col
                    break
            
            category_col = None
            for col in ['Category', 'Expense Type', 'tmcatname']:
                if col in bt_expenses.columns:
                    category_col = col
                    break
            
            if expense_staff_col and expense_date_col and expense_amount_col:
                bt_expenses['Staff'] = bt_expenses[expense_staff_col]
                bt_expenses['Expense_Date'] = pd.to_datetime(bt_expenses[expense_date_col])
                bt_expenses['Amount'] = pd.to_numeric(bt_expenses[expense_amount_col], errors='coerce')
                
                # Filter to contractor fees only
                if category_col:
                    contractor_fees = bt_expenses[
                        bt_expenses[category_col].str.contains('Contractor Fee', case=False, na=False)
                    ].copy()
                else:
                    # Assume all expenses are contractor fees if no category column
                    contractor_fees = bt_expenses.copy()
                
                # Check 1: Flag fees not on Friday
                for _, fee in contractor_fees.iterrows():
                    fee_date = fee['Expense_Date']
                    if fee_date.dayofweek != 4:  # 4 = Friday
                        non_friday_fees.append({
                            'Contractor': fee['Staff'],
                            'Date': fee_date.strftime('%Y-%m-%d'),
                            'Day': fee_date.strftime('%A'),
                            'Amount': fee['Amount'],
                            'Issue': f'Fee charged on {fee_date.strftime("%A")} (should be Friday)'
                        })
                
                # Aggregate fees by contractor and week
                contractor_fees['Week_Ending'] = contractor_fees['Expense_Date'] + pd.to_timedelta(
                    (4 - contractor_fees['Expense_Date'].dt.dayofweek) % 7, unit='D'
                )
                
                weekly_fees = contractor_fees.groupby(['Staff', 'Week_Ending'])['Amount'].sum().reset_index()
                weekly_fees = weekly_fees.rename(columns={'Amount': 'Total_Fees'})
        
        non_friday_df = pd.DataFrame(non_friday_fees) if non_friday_fees else pd.DataFrame(
            columns=['Contractor', 'Date', 'Day', 'Amount', 'Issue']
        )
        
        # Ensure weekly_fees has required columns even if empty
        if weekly_fees.empty:
            weekly_fees = pd.DataFrame(columns=['Staff', 'Week_Ending', 'Total_Fees'])
        
        debug_log.append(f"✅ Found {len(non_friday_df)} non-Friday fees")
    
    # ============================================================
    # PHASE 4: COMBINE & ANALYZE
    # ============================================================
    
    with st.spinner("📊 Analyzing contractor data..."):
        # Merge hours and fees
        contractor_summary = weekly_hours.merge(
            weekly_fees,
            on=['Staff', 'Week_Ending'],
            how='outer'
        ).fillna(0)
        
        # Calculate average hourly rate
        contractor_summary['Avg_Hourly_Rate'] = contractor_summary.apply(
            lambda row: row['Total_Fees'] / row['Total_Hours'] if row['Total_Hours'] > 0 else 0,
            axis=1
        )
        
        # Flag issues
        contractor_summary['Issues'] = ''
        contractor_summary.loc[
            (contractor_summary['Total_Hours'] > 0) & (contractor_summary['Total_Fees'] == 0),
            'Issues'
        ] = 'Hours submitted but no invoice'
        
        # Sort by contractor and week
        contractor_summary = contractor_summary.sort_values(['Staff', 'Week_Ending'])
        
        # Separate out issues
        missing_invoices = contractor_summary[
            contractor_summary['Issues'].str.contains('no invoice', case=False, na=False)
        ].copy()
        
        debug_log.append(f"✅ Found {len(missing_invoices)} weeks with missing invoices")
        debug_log.append(f"✅ Analysis complete")
    
    # ============================================================
    # PHASE 5: DISPLAY DEBUG LOG
    # ============================================================
    
    with st.expander("🔍 Debug Log", expanded=False):
        for msg in debug_log:
            if msg.startswith("✅"):
                st.success(msg)
            elif msg.startswith("⚠️"):
                st.warning(msg)
            elif msg.startswith("❌"):
                st.error(msg)
            else:
                st.info(msg)
    
    # ============================================================
    # PHASE 6: DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Contractor Fee Review")
    st.caption(f"Review Period: {start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}")
    
    # Section 1: Non-Friday Fees
    st.subheader("1️⃣ Fees Charged on Non-Friday")
    st.caption("Contractor fees should be charged on Fridays")
    if not non_friday_df.empty:
        st.warning(f"Found {len(non_friday_df)} fee(s) charged on non-Friday")
        st.dataframe(
            non_friday_df.style.format({
                'Amount': '${:,.2f}'
            }),
            hide_index=True,
            use_container_width=True
        )
    else:
        st.success("✅ All contractor fees charged on Friday")
    
    st.divider()
    
    # Section 2: Missing Invoices
    st.subheader("2️⃣ Hours Without Invoices")
    st.caption("Contractors who submitted hours but no invoice for the week")
    if not missing_invoices.empty:
        st.warning(f"Found {len(missing_invoices)} week(s) with missing invoices")
        
        display_missing = missing_invoices[['Staff', 'Week_Ending', 'Total_Hours', 'Total_Fees']].copy()
        display_missing = display_missing.rename(columns={
            'Staff': 'Contractor',
            'Week_Ending': 'Week Ending',
            'Total_Hours': 'Hours',
            'Total_Fees': 'Fees'
        })
        
        st.dataframe(
            display_missing.style.format({
                'Hours': '{:.1f}',
                'Fees': '${:,.2f}'
            }),
            hide_index=True,
            use_container_width=True
        )
    else:
        st.success("✅ All contractor hours have corresponding invoices")
    
    st.divider()
    
    # Section 3: Full Contractor Summary
    st.subheader("3️⃣ Contractor Summary by Week")
    st.caption("Hours, fees, and average hourly rates")
    
    if not contractor_summary.empty:
        display_summary = contractor_summary[['Staff', 'Week_Ending', 'Total_Hours', 'Total_Fees', 'Avg_Hourly_Rate']].copy()
        display_summary = display_summary.rename(columns={
            'Staff': 'Contractor',
            'Week_Ending': 'Week Ending',
            'Total_Hours': 'Hours',
            'Total_Fees': 'Fees',
            'Avg_Hourly_Rate': 'Avg Rate/Hour'
        })
        
        st.dataframe(
            display_summary.style.format({
                'Hours': '{:.1f}',
                'Fees': '${:,.2f}',
                'Avg Rate/Hour': '${:,.2f}'
            }),
            hide_index=True,
            use_container_width=True
        )
    else:
        st.info("No contractor data found for this period")
    
    # ============================================================
    # PHASE 7: EXCEL EXPORT
    # ============================================================
    
    st.divider()
    st.subheader("📥 Export Report")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Tab 1: Non-Friday Fees
            non_friday_df.to_excel(writer, sheet_name='Non_Friday_Fees', index=False)
            
            # Tab 2: Missing Invoices
            missing_invoices[['Staff', 'Week_Ending', 'Total_Hours', 'Total_Fees', 'Issues']].to_excel(
                writer, sheet_name='Missing_Invoices', index=False
            )
            
            # Tab 3: Full Summary
            contractor_summary.to_excel(writer, sheet_name='Contractor_Summary', index=False)
        
        excel_data = output.getvalue()
        filename = f"Contractor_Fee_Review_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.xlsx"
        
        st.download_button(
            label="📥 Download Excel Report",
            data=excel_data,
            file_name=filename,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
        
    except Exception as e:
        st.error(f"❌ Export failed: {e}")
        import traceback
        st.code(traceback.format_exc())

else:
    st.info("👆 Select date range and click the button to review contractor fees")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app reviews contractor fees for compliance and accuracy:
        
        **Data Sources:**
        - **BigTime Time Report** - Contractor hours submitted
        - **BigTime Expense Report** - Contractor fee invoices
        
        **Checks:**
        1. **Non-Friday Fees** - Flags contractor fees charged on days other than Friday
        2. **Missing Invoices** - Identifies weeks where contractor worked but didn't submit invoice
        3. **Hourly Rates** - Calculates average hourly billing rate per contractor per week
        
        **Weekly Analysis:**
        - Groups data by week ending (Friday)
        - Compares hours submitted vs fees billed
        - Calculates average rate: Total Fees / Total Hours
        """)
