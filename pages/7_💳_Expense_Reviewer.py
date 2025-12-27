"""
Expense Reviewer App
Reviews expenses for compliance and quality
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime, timedelta
import requests
from io import BytesIO

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')

import sheets

st.set_page_config(page_title="Expense Reviewer", page_icon="💳", layout="wide")

st.title("💳 Expense Reviewer")
st.markdown("Review expenses for compliance and quality")

# ============================================
# HELPER FUNCTIONS
# ============================================

def get_bigtime_report(report_id, start_date, end_date):
    """Fetch data from BigTime report API"""
    try:
        api_key = st.secrets["BIGTIME_API_KEY"]
        firm_id = st.secrets["BIGTIME_FIRM_ID"]
    except Exception as e:
        st.error(f"Missing BigTime credentials: {str(e)}")
        return None
    
    url = f"https://iq.bigtime.net/BigtimeData/api/v2/report/data/{report_id}"
    
    headers = {
        "X-Auth-ApiToken": api_key,
        "X-Auth-Realm": firm_id,
        "Accept": "application/json"
    }
    
    payload = {
        "DT_BEGIN": start_date.strftime("%Y-%m-%d"),
        "DT_END": end_date.strftime("%Y-%m-%d")
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            report_data = response.json()
            data_rows = report_data.get('Data', [])
            field_list = report_data.get('FieldList', [])
            
            if not data_rows:
                return pd.DataFrame()
            
            column_names = [field.get('FieldNm') for field in field_list]
            df = pd.DataFrame(data_rows, columns=column_names)
            return df
        else:
            st.error(f"BigTime API Error {response.status_code}")
            return None
    except Exception as e:
        st.error(f"BigTime API Exception: {str(e)}")
        return None


# ============================================
# MAIN UI
# ============================================

# Sidebar configuration
st.sidebar.header("Report Configuration")

# Date range mode selection
date_mode = st.sidebar.radio(
    "Select Date Range Mode",
    options=["Weekly (Week Ending)", "Custom Date Range"],
    help="Choose how to filter expenses"
)

if date_mode == "Weekly (Week Ending)":
    # Friday-only selector (similar to Time Reviewer)
    selected_date = st.sidebar.date_input(
        "Week Ending Date",
        value=datetime.now().date(),
        help="Select a Friday (week ending date)"
    )
    
    # Validate it's a Friday
    if selected_date.weekday() != 4:  # Friday is 4
        st.sidebar.error("⚠️ Please select a Friday")
        st.sidebar.info(f"You selected {selected_date.strftime('%A, %B %d, %Y')}")
        
        # Find nearest Friday
        days_until_friday = (4 - selected_date.weekday()) % 7
        if days_until_friday == 0:
            days_until_friday = 7
        nearest_friday = selected_date + timedelta(days=days_until_friday)
        
        st.sidebar.info(f"💡 Next Friday: {nearest_friday.strftime('%B %d, %Y')}")
        st.stop()
    
    week_ending = selected_date
    week_starting = week_ending - timedelta(days=6)
    use_week_end_field = True
    
    st.sidebar.write(f"**Report Period:**")
    st.sidebar.write(f"{week_starting.strftime('%A, %B %d, %Y')}")
    st.sidebar.write(f"through")
    st.sidebar.write(f"{week_ending.strftime('%A, %B %d, %Y')}")
    
else:  # Custom Date Range
    col1, col2 = st.sidebar.columns(2)
    with col1:
        start_date = st.date_input("Start Date", value=datetime.now().date() - timedelta(days=30))
    with col2:
        end_date = st.date_input("End Date", value=datetime.now().date())
    
    if start_date > end_date:
        st.sidebar.error("Start date must be before end date")
        st.stop()
    
    week_starting = start_date
    week_ending = end_date
    use_week_end_field = False
    
    st.sidebar.write(f"**Report Period:**")
    st.sidebar.write(f"{week_starting.strftime('%B %d, %Y')} through {week_ending.strftime('%B %d, %Y')}")

if st.sidebar.button("🔍 Review Expenses", type="primary"):
    
    # ============================================================
    # PHASE 1: FETCH EXPENSE DATA
    # ============================================================
    
    with st.spinner("📡 Fetching expense data from BigTime..."):
        
        # Report ID: 284803 (Detailed Expense Report)
        expenses_df = get_bigtime_report(284803, week_starting, week_ending)
        
        if expenses_df is None or expenses_df.empty:
            st.warning("No expense data found for the selected period")
            st.stop()
        
        st.success(f"✅ Fetched {len(expenses_df)} expense entries")
        
        # Debug: Show column names to help map them
        st.info(f"📋 BigTime expense columns ({len(expenses_df.columns)}): {', '.join(expenses_df.columns.tolist())}")
    
    # ============================================================
    # PHASE 2: MAP COLUMNS
    # ============================================================
    
    with st.spinner("🔧 Mapping expense columns..."):
        # Map BigTime column names based on actual API response
        # Actual columns: fromcurrencysid, currencysid, sid, issubmitted, exprojectnm, exprojectnm_id,
        # exclientnm, exclientnm_id, exsourcenm, exsourcenm_id, exdt, exdt_id, exweekenddt,
        # excatnm, excatnm_id, excatnm_sort, exnt, excostin, excostin_id, excostbill, excostbill_id,
        # excostnc, excostnc_id, exnc, exnc_id, expaidbyco, exhasreceipt, exissubmitted, exissubmitted_id,
        # exapprstatus, exapprstatus_id, exisinvoiced, exisinvoiced_id
        
        rename_map = {
            'exsourcenm': 'Staff',           # Staff/Source name
            'exclientnm': 'Client',          # Client name
            'exprojectnm': 'Project',        # Project name
            'exdt': 'Date',                   # Expense date
            'exweekenddt': 'Week_End',       # Week ending date
            'excatnm': 'Category',           # Category (Billable:Meals, etc.)
            'exnt': 'Note',                   # Note/description
            'excostin': 'Amount_Input',      # Input amount
            'excostbill': 'Amount_Billable', # Billable amount
            'excostnc': 'Amount_NoCharge',   # No-charge amount
            'exnc': 'No_Charge',             # No-charge flag (yes/no)
            'expaidbyco': 'Non_Reimbursable', # Non-reimbursable/paid by company
            'exhasreceipt': 'Receipt_Attached' # Receipt attached (yes/no)
        }
        
        # Rename columns
        expenses_df = expenses_df.rename(columns=rename_map)
        
        st.success(f"✓ Mapped BigTime columns to standard names")
        
        # Convert amounts to numeric
        for col in ['Amount_Input', 'Amount_Billable', 'Amount_NoCharge']:
            if col in expenses_df.columns:
                expenses_df[col] = pd.to_numeric(expenses_df[col], errors='coerce').fillna(0)
        
        # Use Amount_Input as the primary amount
        expenses_df['Amount'] = expenses_df.get('Amount_Input', 0)
    
    # ============================================================
    # PHASE 3: FILTER BY DATE
    # ============================================================
    
    if use_week_end_field and 'Week_End' in expenses_df.columns:
        # Filter by Week End field - convert to datetime for comparison
        expenses_df['Week_End_dt'] = pd.to_datetime(expenses_df['Week_End'], errors='coerce')
        week_end_target = pd.Timestamp(week_ending)
        
        # Filter to exact week ending date
        filtered_df = expenses_df[expenses_df['Week_End_dt'] == week_end_target]
        
        st.info(f"📅 Filtered to week ending {week_ending.strftime('%m/%d/%y')}: {len(filtered_df)} expenses (from {len(expenses_df)} total)")
        
        # Debug: Show what week end dates we found
        if len(filtered_df) == 0:
            unique_weeks = expenses_df['Week_End_dt'].dropna().unique()
            st.warning(f"⚠️ No expenses found for week ending {week_ending.strftime('%m/%d/%y')}")
            st.write(f"Available week ending dates in data: {sorted([pd.Timestamp(d).strftime('%m/%d/%y') for d in unique_weeks])}")
            
    elif 'Date' in expenses_df.columns:
        # Filter by Date field
        expenses_df['Date_dt'] = pd.to_datetime(expenses_df['Date'], errors='coerce')
        filtered_df = expenses_df[
            (expenses_df['Date_dt'] >= pd.Timestamp(week_starting)) &
            (expenses_df['Date_dt'] <= pd.Timestamp(week_ending))
        ]
        st.info(f"📅 Filtered by date range: {len(filtered_df)} expenses")
    else:
        st.warning("⚠️ Could not filter by date - using all expenses")
        filtered_df = expenses_df
    
    if len(filtered_df) == 0:
        st.error("❌ No expenses found for the selected period")
        st.stop()
    
    # Use filtered data for analysis
    df = filtered_df.copy()
    
    # ============================================================
    # PHASE 4: RUN COMPLIANCE CHECKS
    # ============================================================
    
    issues = {
        'incorrect_contractor_fees': [],
        'inconsistent_classification': [],
        'missing_receipts': [],
        'company_paid': [],
        'non_reimbursable': []
    }
    
    with st.spinner("🔍 Running compliance checks..."):
        
        # Debug: Show sample values of key fields
        st.write("**Debug: Sample field values from BigTime**")
        if 'No_Charge' in df.columns:
            st.write(f"No_Charge unique values: {df['No_Charge'].unique()}")
        if 'Receipt_Attached' in df.columns:
            st.write(f"Receipt_Attached unique values: {df['Receipt_Attached'].unique()}")
        if 'Non_Reimbursable' in df.columns:
            st.write(f"Non_Reimbursable unique values: {df['Non_Reimbursable'].unique()}")
        
        # CRITICAL: BigTime API returns 0/1 (numeric), not "yes"/"no" (text)
        # Convert all flag fields to numeric for proper comparison
        if 'No_Charge' in df.columns:
            df['No_Charge_numeric'] = pd.to_numeric(df['No_Charge'], errors='coerce').fillna(0)
            # 1 = yes (no charge), 0 = no (charged)
        
        if 'Non_Reimbursable' in df.columns:
            df['Non_Reimbursable_numeric'] = pd.to_numeric(df['Non_Reimbursable'], errors='coerce').fillna(0)
            # 1 = yes (non-reimbursable), 0 = no (reimbursable)
        
        if 'Receipt_Attached' in df.columns:
            df['Receipt_Attached_numeric'] = pd.to_numeric(df['Receipt_Attached'], errors='coerce').fillna(0)
            # 1 = yes (has receipt), 0 = no (missing receipt)
        
        # Check 1: Incorrect Contractor Fees
        # Category contains "Contractor Fees" AND No-Charge is NOT 1 (i.e., it's being charged)
        if all(col in df.columns for col in ['Staff', 'Client', 'Project', 'Date', 'Category', 'Amount', 'No_Charge_numeric']):
            contractor_fees = df[
                (df['Category'].astype(str).str.contains('Contractor Fees', case=False, na=False)) &
                (df['No_Charge_numeric'] != 1)  # Should be 1 (no-charge=yes)
            ]
            
            for _, row in contractor_fees.iterrows():
                issues['incorrect_contractor_fees'].append({
                    'Staff': row.get('Staff', ''),
                    'Client': row.get('Client', ''),
                    'Project': row.get('Project', ''),
                    'Date': row.get('Date', ''),
                    'Amount': row.get('Amount', 0)
                })
        
        # Check 2: Inconsistent Classification
        # Non-Billable but charged (No-Charge = 0) OR Billable but not charged (No-Charge = 1)
        if all(col in df.columns for col in ['Staff', 'Client', 'Project', 'Date', 'Category', 'Amount', 'No_Charge_numeric', 'No_Charge']):
            # Non-Billable but charged (should be no-charge=1 but is 0)
            non_billable_charged = df[
                (df['Category'].astype(str).str.startswith('Non-Billable', na=False)) &
                (df['No_Charge_numeric'] != 1)  # Should be 1
            ]
            
            # Billable but not charged (should be no-charge=0 but is 1)
            billable_not_charged = df[
                (df['Category'].astype(str).str.startswith('Billable', na=False)) &
                (df['No_Charge_numeric'] == 1)  # Should be 0
            ]
            
            for _, row in pd.concat([non_billable_charged, billable_not_charged]).iterrows():
                issues['inconsistent_classification'].append({
                    'Staff': row.get('Staff', ''),
                    'Client': row.get('Client', ''),
                    'Project': row.get('Project', ''),
                    'Date': row.get('Date', ''),
                    'Category': row.get('Category', ''),
                    'Amount': row.get('Amount', 0),
                    'No_Charge': row.get('No_Charge', '')
                })
        
        # Check 3: Missing Receipts
        # Receipt_Attached should be 1, flag if 0
        if all(col in df.columns for col in ['Staff', 'Client', 'Project', 'Date', 'Category', 'Amount', 'Receipt_Attached_numeric']):
            missing_receipts = df[
                (df['Receipt_Attached_numeric'] != 1)
            ]
            
            for _, row in missing_receipts.iterrows():
                issues['missing_receipts'].append({
                    'Staff': row.get('Staff', ''),
                    'Client': row.get('Client', ''),
                    'Project': row.get('Project', ''),
                    'Date': row.get('Date', ''),
                    'Category': row.get('Category', ''),
                    'Amount': row.get('Amount', 0)
                })
        
        # Check 4: Company Paid Expenses (No-Charge = 1, excluding contractor fees)
        if all(col in df.columns for col in ['Staff', 'Client', 'Project', 'Date', 'Category', 'Amount', 'No_Charge_numeric']):
            company_paid = df[
                (df['No_Charge_numeric'] == 1) &  # No charge = yes
                (~df['Category'].astype(str).str.contains('Contractor Fees', case=False, na=False))
            ]
            
            for _, row in company_paid.iterrows():
                issues['company_paid'].append({
                    'Staff': row.get('Staff', ''),
                    'Client': row.get('Client', ''),
                    'Project': row.get('Project', ''),
                    'Date': row.get('Date', ''),
                    'Category': row.get('Category', ''),
                    'Amount': row.get('Amount', 0)
                })
        
        # Check 5: Non-Reimbursable Expenses (excluding contractor fees)
        if all(col in df.columns for col in ['Staff', 'Client', 'Project', 'Date', 'Category', 'Amount', 'Non_Reimbursable_numeric']):
            non_reimbursable = df[
                (df['Non_Reimbursable_numeric'] == 1) &  # Non-reimbursable = yes
                (~df['Category'].astype(str).str.contains('Contractor Fees', case=False, na=False))
            ]
            
            for _, row in non_reimbursable.iterrows():
                issues['non_reimbursable'].append({
                    'Staff': row.get('Staff', ''),
                    'Client': row.get('Client', ''),
                    'Project': row.get('Project', ''),
                    'Date': row.get('Date', ''),
                    'Category': row.get('Category', ''),
                    'Amount': row.get('Amount', 0)
                })
    
    # ============================================================
    # PHASE 5: DISPLAY RESULTS
    # ============================================================
    
    st.success("✅ Analysis complete!")
    
    st.header(f"📊 Expense Reviewer Report")
    if use_week_end_field:
        st.subheader(f"Week Ending {week_ending.strftime('%A, %B %d, %Y')}")
        st.caption(f"Period: {week_starting.strftime('%b %d')} - {week_ending.strftime('%b %d, %Y')}")
    else:
        st.subheader(f"Date Range: {week_starting.strftime('%b %d, %Y')} - {week_ending.strftime('%b %d, %Y')}")
    
    # Summary metrics
    total_issues = sum(len(v) for v in issues.values())
    
    if total_issues == 0:
        st.success("🎉 No compliance issues found! All expenses look good.")
    else:
        st.warning(f"⚠️ Found {total_issues} total compliance issues")
    
    st.divider()
    
    # Issue sections
    # 1. Incorrect Contractor Fees
    with st.expander(f"❌ Incorrect Contractor Fees ({len(issues['incorrect_contractor_fees'])})", expanded=len(issues['incorrect_contractor_fees']) > 0):
        if issues['incorrect_contractor_fees']:
            st.write("Contractor fees should always be marked as No-Charge. The following are charged:")
            for issue in issues['incorrect_contractor_fees']:
                st.write(f"- {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, ${issue['Amount']:.2f}")
        else:
            st.success("✅ All contractor fees properly marked as no-charge")
    
    # 2. Inconsistent Classification
    with st.expander(f"⚠️ Inconsistent Classification ({len(issues['inconsistent_classification'])})", expanded=len(issues['inconsistent_classification']) > 0):
        if issues['inconsistent_classification']:
            st.write("Non-Billable expenses should be No-Charge=Yes. Billable expenses should be No-Charge=No:")
            for issue in issues['inconsistent_classification']:
                nc_flag = issue.get('No_Charge', '')
                st.write(f"- {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Category']}, ${issue['Amount']:.2f} (No-Charge: {nc_flag})")
        else:
            st.success("✅ All expenses properly classified")
    
    # 3. Missing Receipts
    with st.expander(f"📎 Missing Receipts ({len(issues['missing_receipts'])})", expanded=len(issues['missing_receipts']) > 0):
        if issues['missing_receipts']:
            st.write("The following expenses are missing receipts:")
            for issue in issues['missing_receipts']:
                st.write(f"- {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Category']}, ${issue['Amount']:.2f}")
        else:
            st.success("✅ All expenses have receipts attached")
    
    # 4. Company Paid Expenses
    with st.expander(f"💰 Company Paid Expenses ({len(issues['company_paid'])})", expanded=len(issues['company_paid']) > 0):
        if issues['company_paid']:
            st.write("The following expenses are being paid by the company (No-Charge=Yes):")
            total_company_paid = sum(issue['Amount'] for issue in issues['company_paid'])
            st.info(f"**Total Company Paid: ${total_company_paid:,.2f}**")
            for issue in issues['company_paid']:
                st.write(f"- {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Category']}, ${issue['Amount']:.2f}")
        else:
            st.success("✅ No company-paid expenses (excluding contractor fees)")
    
    # 5. Non-Reimbursable Expenses
    with st.expander(f"🚫 Non-Reimbursable Expenses ({len(issues['non_reimbursable'])})", expanded=len(issues['non_reimbursable']) > 0):
        if issues['non_reimbursable']:
            st.write("The following expenses are marked as non-reimbursable:")
            total_non_reimbursable = sum(issue['Amount'] for issue in issues['non_reimbursable'])
            st.info(f"**Total Non-Reimbursable: ${total_non_reimbursable:,.2f}**")
            for issue in issues['non_reimbursable']:
                st.write(f"- {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Category']}, ${issue['Amount']:.2f}")
        else:
            st.success("✅ No non-reimbursable expenses (excluding contractor fees)")
    
    # Store report data for export
    st.session_state.expense_review_data = {
        'date_mode': date_mode,
        'week_ending': week_ending if use_week_end_field else None,
        'week_starting': week_starting,
        'issues': issues,
        'total_issues': total_issues
    }

else:
    st.info("👈 Configure your date range and click 'Review Expenses'")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app reviews expense entries for compliance:
        
        **Checks performed:**
        1. **Incorrect Contractor Fees** - Contractor fees must be marked No-Charge
        2. **Inconsistent Classification** - Non-Billable must be No-Charge, Billable must be charged
        3. **Missing Receipts** - All expenses must have receipts attached
        4. **Company Paid Expenses** - Track when company pays (No-Charge=Yes)
        5. **Non-Reimbursable Expenses** - Track expenses marked non-reimbursable
        
        **Data Source:**
        - BigTime Report 284803 (Detailed Expense Report)
        
        **Date Filtering:**
        - Weekly mode uses "Week End" field
        - Custom range mode uses "Date" field
        """)

# Email functionality (similar to Time Reviewer)
if 'expense_review_data' in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")
    
    email_to = st.sidebar.text_input(
        "Send to:",
        placeholder="email@example.com",
        key="expense_review_email"
    )
    
    send_clicked = st.sidebar.button("Send Email", type="primary", use_container_width=True, key="send_expense_review")
    
    if send_clicked:
        if not email_to:
            st.sidebar.error("Enter an email address")
        else:
            try:
                from googleapiclient.discovery import build
                from google.oauth2 import service_account
                import base64
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText
                
                rd = st.session_state.expense_review_data
                
                creds = service_account.Credentials.from_service_account_info(
                    st.secrets["SERVICE_ACCOUNT_KEY"],
                    scopes=['https://www.googleapis.com/auth/gmail.send'],
                    subject='astudee@voyageadvisory.com'
                )
                
                gmail = build('gmail', 'v1', credentials=creds)
                
                msg = MIMEMultipart()
                msg['From'] = 'astudee@voyageadvisory.com'
                msg['To'] = email_to
                
                if rd['date_mode'] == "Weekly (Week Ending)":
                    msg['Subject'] = f"Expense Review - Week Ending {rd['week_ending'].strftime('%b %d, %Y')}"
                    period = f"Week Ending: {rd['week_ending'].strftime('%b %d, %Y')}"
                else:
                    msg['Subject'] = f"Expense Review - {rd['week_starting'].strftime('%b %d')} to {rd['week_ending'].strftime('%b %d, %Y')}"
                    period = f"Period: {rd['week_starting'].strftime('%b %d, %Y')} - {rd['week_ending'].strftime('%b %d, %Y')}"
                
                body = f"""Expense Reviewer Report

{period}

Total Issues Found: {rd['total_issues']}

Summary:
- Incorrect Contractor Fees: {len(rd['issues']['incorrect_contractor_fees'])}
- Inconsistent Classification: {len(rd['issues']['inconsistent_classification'])}
- Missing Receipts: {len(rd['issues']['missing_receipts'])}
- Company Paid Expenses: {len(rd['issues']['company_paid'])}
- Non-Reimbursable Expenses: {len(rd['issues']['non_reimbursable'])}

Please review the details in the Streamlit app.

Best regards,
Voyage Advisory
"""
                
                msg.attach(MIMEText(body, 'plain'))
                
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
                result = gmail.users().messages().send(userId='me', body={'raw': raw}).execute()
                
                st.sidebar.success(f"✅ Sent to {email_to}!")
                
            except Exception as e:
                st.sidebar.error(f"❌ {type(e).__name__}")
                st.sidebar.code(str(e))
