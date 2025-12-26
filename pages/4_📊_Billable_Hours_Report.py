"""
Billable Hours Report
Generates monthly billable hours report with capacity analysis
"""

import streamlit as st
import pandas as pd
import calendar
from datetime import date, datetime, timedelta
from io import BytesIO
import os
import requests

# Authentication check
def check_auth():
    """Simple password authentication"""
    if 'authenticated' not in st.session_state:
        st.session_state.authenticated = False
    
    if not st.session_state.authenticated:
        st.title("🔐 Login Required")
        password = st.text_input("Enter password:", type="password")
        
        if st.button("Login"):
            # Check against environment variable or hardcoded password
            correct_password = os.environ.get("APP_PASSWORD", "voyage2024")
            if password == correct_password:
                st.session_state.authenticated = True
                st.rerun()
            else:
                st.error("Incorrect password")
        st.stop()
    
    return True

# Check authentication
check_auth()


def get_bigtime_report(start_date, end_date, report_id=284796):
    """
    Fetch BigTime Detailed Time Report data for date range
    Report 284796 = "Detailed Time Report - ACS w/paid"
    
    Returns DataFrame with columns: Staff Member, Date, Billable, etc.
    """
    try:
        api_key = st.secrets["BIGTIME_API_KEY"]
        firm_id = st.secrets["BIGTIME_FIRM_ID"]
    except Exception as e:
        st.error(f"Missing BigTime credentials in secrets: {str(e)}")
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
                st.warning(f"⚠️ BigTime report returned 0 rows for {start_date} to {end_date}")
                return pd.DataFrame()
            
            column_names = [field.get('FieldNm') for field in field_list]
            df = pd.DataFrame(data_rows, columns=column_names)
            
            # Map BigTime column names to expected names
            # Based on actual BigTime API response
            mapping = {
                'tmstaffnm': 'Staff Member',
                'tmdt': 'Date',
                'tmhrsbill': 'Billable',  # Billable hours
                'tmchgbillbase': 'Billable ($)',  # Billable amount
                'tmclientnm': 'Client',
                'tmprojectnm': 'Project'
            }
            df = df.rename(columns={k: v for k, v in mapping.items() if k in df.columns})
            
            # Convert Date column to datetime
            if 'Date' in df.columns:
                df['Date'] = pd.to_datetime(df['Date'])
            
            # Convert Billable to numeric
            if 'Billable' in df.columns:
                df['Billable'] = pd.to_numeric(df['Billable'], errors='coerce')
            
            return df
        else:
            st.error(f"❌ BigTime API Error {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        st.error(f"❌ BigTime API Exception: {str(e)}")
        return None

st.title("📊 Billable Hours Report")

# Staff Override Section
with st.expander("⚙️ Staff Classification Overrides (Optional)"):
    st.markdown("""
    Override the automatic classification for specific staff members.
    Useful for recently terminated employees or special cases.
    """)
    
    col1, col2 = st.columns(2)
    with col1:
        override_name = st.text_input(
            "Staff Name",
            placeholder="e.g., Victor Alao",
            key="override_name"
        )
    with col2:
        override_category = st.selectbox(
            "Force Classification As:",
            options=["Active Employee", "Contractor", "Inactive"],
            key="override_category"
        )
    
    if st.button("➕ Add Override", key="add_override"):
        if override_name:
            if 'staff_overrides' not in st.session_state:
                st.session_state.staff_overrides = {}
            st.session_state.staff_overrides[override_name] = override_category
            st.success(f"✅ Added override: {override_name} → {override_category}")
    
    # Show current overrides
    if 'staff_overrides' not in st.session_state:
        st.session_state.staff_overrides = {}
    
    if st.session_state.staff_overrides:
        st.subheader("Current Overrides:")
        for name, category in st.session_state.staff_overrides.items():
            col_a, col_b = st.columns([3, 1])
            with col_a:
                st.write(f"**{name}** → {category}")
            with col_b:
                if st.button("🗑️ Remove", key=f"remove_{name}"):
                    del st.session_state.staff_overrides[name]
                    st.rerun()

# Configuration
st.sidebar.header("Report Configuration")

# Date range selection
col1, col2 = st.sidebar.columns(2)
with col1:
    start_month = st.selectbox(
        "Start Month",
        options=list(range(1, 13)),
        format_func=lambda x: calendar.month_name[x],
        index=0
    )
with col2:
    start_year = st.selectbox("Start Year", options=[2024, 2025, 2026], index=1)

col3, col4 = st.sidebar.columns(2)
with col3:
    end_month = st.selectbox(
        "End Month", 
        options=list(range(1, 13)),
        format_func=lambda x: calendar.month_name[x],
        index=11
    )
with col4:
    end_year = st.selectbox("End Year", options=[2024, 2025, 2026], index=1)

# Calculate date range
start_date = date(start_year, start_month, 1)
end_day = calendar.monthrange(end_year, end_month)[1]
end_date = date(end_year, end_month, end_day)

st.sidebar.write(f"Report Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

# Email section in sidebar (always visible if report exists)
if 'report_data' in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")
    
    email_address = st.sidebar.text_input(
        "Send to:",
        placeholder="email@example.com",
        key="email_address_input"
    )
    
    if st.sidebar.button("📧 Send Email", type="secondary", use_container_width=True):
        if not email_address:
            st.sidebar.error("Please enter an email address")
        else:
            # Send email via Gmail API
            try:
                st.sidebar.info("🔄 Preparing email...")
                
                from googleapiclient.discovery import build
                from google.oauth2 import service_account
                import base64
                from email.mime.multipart import MIMEMultipart
                from email.mime.base import MIMEBase
                from email.mime.text import MIMEText
                from email import encoders
                
                report_data = st.session_state.report_data
                
                st.sidebar.info("🔄 Authenticating...")
                
                # Get service account credentials with Gmail scope
                service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info,
                    scopes=['https://www.googleapis.com/auth/gmail.send'],
                    subject='astudee@voyageadvisory.com'
                )
                
                gmail_service = build('gmail', 'v1', credentials=credentials)
                
                st.sidebar.info("🔄 Building message...")
                
                # Create email message
                msg = MIMEMultipart()
                msg['From'] = 'astudee@voyageadvisory.com'
                msg['To'] = email_address
                msg['Subject'] = f"Billable Hours Report - {report_data['start_date'].strftime('%b %Y')} to {report_data['end_date'].strftime('%b %Y')}"
                
                body = f"""
Attached is the Billable Hours Report for {report_data['start_date'].strftime('%B %Y')} through {report_data['end_date'].strftime('%B %Y')}.

Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Summary:
- Total entries: {report_data['summary']['total_entries']:,}
- Active Employees: {report_data['summary']['active_employees']}
- Contractors: {report_data['summary']['contractors']}
- Inactive: {report_data['summary']['inactive']}

Best regards,
Voyage Advisory Reporting System
"""
                msg.attach(MIMEText(body, 'plain'))
                
                st.sidebar.info("🔄 Attaching file...")
                
                # Attach Excel file
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(report_data['excel_file'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={report_data["filename"]}'
                )
                msg.attach(part)
                
                st.sidebar.info("🔄 Sending via Gmail API...")
                
                # Encode message
                raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
                
                # Send via Gmail API
                message_body = {'raw': raw_message}
                sent_message = gmail_service.users().messages().send(
                    userId='me',
                    body=message_body
                ).execute()
                
                st.sidebar.success(f"✅ Email sent successfully to {email_address}!")
                st.sidebar.write(f"Message ID: {sent_message.get('id')}")
                
            except Exception as e:
                st.sidebar.error(f"❌ Error sending email")
                st.sidebar.code(f"Error type: {type(e).__name__}")
                st.sidebar.code(f"Error message: {str(e)}")
                
                # More detailed error info
                import traceback
                with st.sidebar.expander("📋 Full Error Details"):
                    st.code(traceback.format_exc())
                
                with st.sidebar.expander("🔧 Setup Help"):
                    st.markdown("""
                    **Gmail API Setup Required:**
                    
                    1. Go to [Google Admin Console](https://admin.google.com)
                    2. Security → API Controls → Domain-wide Delegation
                    3. Find service account client ID  
                    4. Add scope: `https://www.googleapis.com/auth/gmail.send`
                    5. Save and retry
                    
                    **Service Account:** `voyage-app-executor@voyage-app-store.iam.gserviceaccount.com`
                    """)



# Federal holidays for capacity calculation
FEDERAL_HOLIDAYS_2024 = [
    date(2024, 1, 1),   # New Year's Day
    date(2024, 1, 15),  # MLK Day
    date(2024, 2, 19),  # Presidents' Day
    date(2024, 5, 27),  # Memorial Day
    date(2024, 6, 19),  # Juneteenth
    date(2024, 7, 4),   # Independence Day
    date(2024, 9, 2),   # Labor Day
    date(2024, 10, 14), # Columbus Day
    date(2024, 11, 11), # Veterans Day
    date(2024, 11, 28), # Thanksgiving
    date(2024, 12, 25), # Christmas
]

FEDERAL_HOLIDAYS_2025 = [
    date(2025, 1, 1),   # New Year's Day
    date(2025, 1, 20),  # MLK Day
    date(2025, 2, 17),  # Presidents' Day
    date(2025, 5, 26),  # Memorial Day
    date(2025, 6, 19),  # Juneteenth
    date(2025, 7, 4),   # Independence Day
    date(2025, 9, 1),   # Labor Day
    date(2025, 10, 13), # Columbus Day
    date(2025, 11, 11), # Veterans Day
    date(2025, 11, 27), # Thanksgiving
    date(2025, 12, 25), # Christmas
]

FEDERAL_HOLIDAYS_2026 = [
    date(2026, 1, 1),   # New Year's Day
    date(2026, 1, 19),  # MLK Day
    date(2026, 2, 16),  # Presidents' Day
    date(2026, 5, 25),  # Memorial Day
    date(2026, 6, 19),  # Juneteenth
    date(2026, 7, 3),   # Independence Day (observed Friday)
    date(2026, 9, 7),   # Labor Day
    date(2026, 10, 12), # Columbus Day
    date(2026, 11, 11), # Veterans Day
    date(2026, 11, 26), # Thanksgiving
    date(2026, 12, 25), # Christmas
]

# Cache for AI-calculated holidays
if 'holiday_cache' not in st.session_state:
    st.session_state.holiday_cache = {}


def calculate_holidays_with_ai(year):
    """
    Use Claude API to calculate federal holidays for a given year
    This is called for years beyond our hardcoded lists
    """
    cache_key = f"holidays_{year}"
    
    # Check cache first
    if cache_key in st.session_state.holiday_cache:
        return st.session_state.holiday_cache[cache_key]
    
    try:
        # Try Claude API first
        api_key = st.secrets.get("CLAUDE_API_KEY")
        if not api_key:
            # Fallback to Gemini
            api_key = st.secrets.get("GEMINI_API_KEY")
            if api_key:
                return calculate_holidays_with_gemini(year)
            else:
                st.warning(f"⚠️ No AI API key found. Using estimated holidays for {year}")
                return estimate_holidays_simple(year)
        
        prompt = f"""Calculate the exact dates of all 11 US federal holidays for the year {year}.

Federal holidays are:
1. New Year's Day (January 1, or observed date if weekend)
2. Martin Luther King Jr. Day (3rd Monday in January)
3. Presidents' Day (3rd Monday in February)
4. Memorial Day (last Monday in May)
5. Juneteenth (June 19, or observed date if weekend)
6. Independence Day (July 4, or observed date if weekend)
7. Labor Day (1st Monday in September)
8. Columbus Day (2nd Monday in October)
9. Veterans Day (November 11, or observed date if weekend)
10. Thanksgiving (4th Thursday in November)
11. Christmas (December 25, or observed date if weekend)

Rules for observed dates:
- If a holiday falls on Saturday, it's observed on Friday
- If a holiday falls on Sunday, it's observed on Monday

Return ONLY a Python list of date objects in this exact format:
[date({year}, 1, 1), date({year}, 1, 20), ...]

No explanations, just the list."""

        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}]
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result['content'][0]['text']
            
            # Extract the list from the response
            # Look for pattern like [date(2027, 1, 1), ...]
            import re
            dates_str = content.strip()
            if dates_str.startswith('[') and dates_str.endswith(']'):
                # Parse the dates safely
                holidays = []
                # Extract all date(YYYY, M, D) patterns
                date_patterns = re.findall(r'date\((\d{4}),\s*(\d+),\s*(\d+)\)', dates_str)
                for year_str, month_str, day_str in date_patterns:
                    holidays.append(date(int(year_str), int(month_str), int(day_str)))
                
                if len(holidays) == 11:
                    st.session_state.holiday_cache[cache_key] = holidays
                    st.info(f"✅ Calculated {year} holidays using Claude API")
                    return holidays
        
        # If AI fails, use estimation
        st.warning(f"⚠️ AI calculation failed. Using estimated holidays for {year}")
        return estimate_holidays_simple(year)
        
    except Exception as e:
        st.warning(f"⚠️ Error calculating holidays with AI: {str(e)}. Using estimation.")
        return estimate_holidays_simple(year)


def calculate_holidays_with_gemini(year):
    """Fallback to Gemini API for holiday calculation"""
    try:
        api_key = st.secrets.get("GEMINI_API_KEY")
        
        prompt = f"""Calculate the exact dates of all 11 US federal holidays for {year}.
Return only a Python list: [date({year}, M, D), ...]
Include: New Year's, MLK Day, Presidents Day, Memorial Day, Juneteenth, July 4th, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas.
Account for observed dates when holidays fall on weekends."""

        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}]
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result['candidates'][0]['content']['parts'][0]['text']
            
            import re
            holidays = []
            date_patterns = re.findall(r'date\((\d{4}),\s*(\d+),\s*(\d+)\)', content)
            for year_str, month_str, day_str in date_patterns:
                holidays.append(date(int(year_str), int(month_str), int(day_str)))
            
            if len(holidays) == 11:
                cache_key = f"holidays_{year}"
                st.session_state.holiday_cache[cache_key] = holidays
                st.info(f"✅ Calculated {year} holidays using Gemini API")
                return holidays
        
        return estimate_holidays_simple(year)
    except:
        return estimate_holidays_simple(year)


def estimate_holidays_simple(year):
    """
    Simple estimation of federal holidays based on rules
    Used as fallback if AI calculation fails
    """
    from datetime import timedelta
    
    holidays = []
    
    # New Year's Day
    ny = date(year, 1, 1)
    if ny.weekday() == 5:  # Saturday
        holidays.append(date(year - 1, 12, 31))
    elif ny.weekday() == 6:  # Sunday
        holidays.append(date(year, 1, 2))
    else:
        holidays.append(ny)
    
    # MLK Day - 3rd Monday in January
    first_jan = date(year, 1, 1)
    days_until_monday = (7 - first_jan.weekday()) % 7
    first_monday = first_jan + timedelta(days=days_until_monday)
    holidays.append(first_monday + timedelta(weeks=2))
    
    # Presidents Day - 3rd Monday in February
    first_feb = date(year, 2, 1)
    days_until_monday = (7 - first_feb.weekday()) % 7
    first_monday = first_feb + timedelta(days=days_until_monday)
    holidays.append(first_monday + timedelta(weeks=2))
    
    # Memorial Day - Last Monday in May
    last_may = date(year, 5, 31)
    days_since_monday = (last_may.weekday() - 0) % 7
    holidays.append(last_may - timedelta(days=days_since_monday))
    
    # Juneteenth
    june19 = date(year, 6, 19)
    if june19.weekday() == 5:
        holidays.append(date(year, 6, 18))
    elif june19.weekday() == 6:
        holidays.append(date(year, 6, 20))
    else:
        holidays.append(june19)
    
    # Independence Day
    july4 = date(year, 7, 4)
    if july4.weekday() == 5:
        holidays.append(date(year, 7, 3))
    elif july4.weekday() == 6:
        holidays.append(date(year, 7, 5))
    else:
        holidays.append(july4)
    
    # Labor Day - 1st Monday in September
    first_sep = date(year, 9, 1)
    days_until_monday = (7 - first_sep.weekday()) % 7
    holidays.append(first_sep + timedelta(days=days_until_monday))
    
    # Columbus Day - 2nd Monday in October
    first_oct = date(year, 10, 1)
    days_until_monday = (7 - first_oct.weekday()) % 7
    first_monday = first_oct + timedelta(days=days_until_monday)
    holidays.append(first_monday + timedelta(weeks=1))
    
    # Veterans Day
    nov11 = date(year, 11, 11)
    if nov11.weekday() == 5:
        holidays.append(date(year, 11, 10))
    elif nov11.weekday() == 6:
        holidays.append(date(year, 11, 12))
    else:
        holidays.append(nov11)
    
    # Thanksgiving - 4th Thursday in November
    first_nov = date(year, 11, 1)
    days_until_thursday = (3 - first_nov.weekday()) % 7
    first_thursday = first_nov + timedelta(days=days_until_thursday)
    holidays.append(first_thursday + timedelta(weeks=3))
    
    # Christmas
    dec25 = date(year, 12, 25)
    if dec25.weekday() == 5:
        holidays.append(date(year, 12, 24))
    elif dec25.weekday() == 6:
        holidays.append(date(year, 12, 26))
    else:
        holidays.append(dec25)
    
    return holidays


def calculate_monthly_capacity(year, month):
    """Calculate billable hours capacity for a given month"""
    # Get federal holidays for the year
    if year == 2024:
        federal_holidays = FEDERAL_HOLIDAYS_2024
    elif year == 2025:
        federal_holidays = FEDERAL_HOLIDAYS_2025
    elif year == 2026:
        federal_holidays = FEDERAL_HOLIDAYS_2026
    else:
        # Use AI to calculate holidays for years beyond 2026
        federal_holidays = calculate_holidays_with_ai(year)
    
    # Get number of days in month
    num_days = calendar.monthrange(year, month)[1]
    
    weekdays = 0
    holidays_in_month = 0
    
    for day in range(1, num_days + 1):
        current_date = date(year, month, day)
        day_of_week = current_date.weekday()
        
        if day_of_week < 5:  # Monday-Friday
            weekdays += 1
            if current_date in federal_holidays:
                holidays_in_month += 1
    
    billable_days = weekdays - holidays_in_month
    billable_hours = billable_days * 8
    
    return billable_hours


def get_month_columns(start_date, end_date):
    """Generate list of month columns for the report"""
    months = []
    current = start_date
    
    while current <= end_date:
        months.append({
            'year': current.year,
            'month': current.month,
            'col_name': f"{current.year}-{current.month:02d}",
            'display_name': f"{calendar.month_abbr[current.month]}-{current.year % 100}"
        })
        
        # Move to next month
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)
    
    return months


def load_active_employees():
    """Load active employees from Voyage_Global_Config Staff tab"""
    try:
        # Try Google Sheets first if available
        try:
            import gspread
            from google.oauth2 import service_account
            
            # Get credentials from Streamlit secrets
            service_account_info = st.secrets.get("SERVICE_ACCOUNT_KEY")
            spreadsheet_id = st.secrets.get("SHEET_CONFIG_ID")
            
            if service_account_info and spreadsheet_id:
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info,
                    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
                )
                gc = gspread.authorize(credentials)
                
                # Open the spreadsheet
                sh = gc.open_by_key(spreadsheet_id)
                worksheet = sh.worksheet('Staff')
                data = worksheet.get_all_records()
                staff_df = pd.DataFrame(data)
                active_employees = set(staff_df['Staff_Name'].tolist())
                st.success(f"✅ Loaded {len(active_employees)} active employees from Google Sheets")
                return active_employees
        except Exception as e:
            st.warning(f"Could not load from Google Sheets: {str(e)}")
            # Fall through to file uploader
        
        # Fallback to uploaded file
        uploaded_file = st.file_uploader(
            "Upload Voyage_Global_Config.xlsx",
            type=['xlsx'],
            key='config_uploader',
            help="Upload the Excel file containing the Staff tab"
        )
        
        if uploaded_file:
            staff_df = pd.read_excel(uploaded_file, sheet_name='Staff')
            active_employees = set(staff_df['Staff_Name'].tolist())
            st.success(f"✅ Loaded {len(active_employees)} active employees from uploaded file")
            return active_employees
        else:
            st.warning("⚠️ Please upload Voyage_Global_Config.xlsx to continue")
            st.stop()
            
    except Exception as e:
        st.error(f"Error loading staff configuration: {str(e)}")
        return set()


def classify_staff(name, active_employees, staff_hours_by_month, all_month_periods, overrides=None):
    """
    Classify staff as Active Employee, Contractor, or Inactive
    
    Logic:
    1. Check overrides first (manual classification)
    2. If in Voyage_Global_Config Staff tab → Active Employee
    3. If has billable hours in last 2 months → Contractor  
    4. Otherwise → Inactive
    
    Args:
        name: Staff member name
        active_employees: Set of active employee names from config
        staff_hours_by_month: Dict of {period: hours} for this staff member
        all_month_periods: List of all periods in the report (sorted)
        overrides: Dict of manual staff classifications
    
    Returns:
        str: 'Active Employee', 'Contractor', or 'Inactive'
    """
    # Check overrides first
    if overrides and name in overrides:
        return overrides[name]
    
    if name in active_employees:
        return 'Active Employee'
    
    # Check if has hours in the most recent 2 months
    if len(all_month_periods) >= 2:
        recent_periods = all_month_periods[-2:]
    else:
        recent_periods = all_month_periods
    
    has_recent_hours = any(
        staff_hours_by_month.get(period, 0) > 0 
        for period in recent_periods
    )
    
    if has_recent_hours:
        return 'Contractor'
    else:
        return 'Inactive'


def apply_color_coding(val, capacity):
    """Apply color coding based on percentage of capacity"""
    if pd.isna(val) or capacity == 0:
        return ''
    
    pct = val / capacity
    
    if pct < 0.8:
        return 'background-color: #D6EAF8'  # Light blue
    elif pct < 1.0:
        return 'background-color: #FCF3CF'  # Light yellow
    else:
        return 'background-color: #D5F4E6'  # Light green


if st.sidebar.button("Generate Report", type="primary"):
    with st.spinner("Loading data..."):
        try:
            # Load active employees from config
            active_employees = load_active_employees()
            
            # Get BigTime data from API
            with st.spinner("📡 Fetching data from BigTime API..."):
                df = get_bigtime_report(start_date, end_date)
                
                if df is None or df.empty:
                    st.error("❌ Failed to fetch data from BigTime. Please check your credentials and try again.")
                    st.stop()
            
            # Validate required columns
            required_cols = ['Staff Member', 'Date', 'Billable']
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                st.error(f"Missing required columns: {', '.join(missing_cols)}")
                st.info(f"Available columns: {', '.join(df.columns.tolist())}")
                
                # Show option to upload file as backup
                st.warning("💡 Alternatively, you can upload a BigTime export file:")
                bigtime_file = st.file_uploader(
                    "Upload BigTime Detailed Time Report (ACS w/paid)",
                    type=['xls', 'xlsx'],
                    key='bigtime_uploader',
                )
                
                if bigtime_file:
                    df = pd.read_excel(bigtime_file)
                    df['Date'] = pd.to_datetime(df['Date'])
                    # Filter to date range
                    df = df[(df['Date'] >= pd.Timestamp(start_date)) & (df['Date'] <= pd.Timestamp(end_date))]
                else:
                    st.stop()
            
            # Filter to billable hours only
            df = df[df['Billable'] > 0].copy()
            
            st.success(f"✅ Loaded {len(df):,} billable time entries from BigTime")
            
            # Get month columns
            month_cols = get_month_columns(start_date, end_date)
            
            # Add year-month column for grouping
            df['YearMonth'] = df['Date'].dt.to_period('M')
            
            # Group by staff and month
            pivot = df.pivot_table(
                index='Staff Member',
                columns='YearMonth',
                values='Billable',
                aggfunc='sum',
                fill_value=0
            )
            
            # Calculate totals
            pivot['Total'] = pivot.sum(axis=1)
            
            # Remove rows where total is 0
            pivot = pivot[pivot['Total'] > 0]
            
            # Sort by total descending
            pivot = pivot.sort_values('Total', ascending=False)
            
            # Classify staff based on recent activity
            all_periods = sorted(pivot.columns[:-1])  # Exclude 'Total' column
            staff_classifications = {}
            overrides = st.session_state.get('staff_overrides', {})
            
            for name in pivot.index:
                if name != 'OVERALL TOTALS':
                    staff_hours = {period: pivot.loc[name, period] for period in all_periods}
                    staff_classifications[name] = classify_staff(
                        name, active_employees, staff_hours, all_periods, overrides
                    )
            
            # Calculate capacity rows
            capacity_rows = []
            
            # Row 1: Monthly Capacity (weekdays * 8 - holidays * 8)
            monthly_capacity = {}
            for m in month_cols:
                cap = calculate_monthly_capacity(m['year'], m['month'])
                monthly_capacity[pd.Period(f"{m['year']}-{m['month']:02d}", freq='M')] = cap
            
            # Row 2: Monthly Capacity @ 1840 (1840/12 = 153.33)
            capacity_1840 = {pd.Period(f"{m['year']}-{m['month']:02d}", freq='M'): 153.33 for m in month_cols}
            
            # Row 3: Monthly Capacity * 80%
            capacity_80 = {k: v * 0.8 for k, v in monthly_capacity.items()}
            
            # Round all values to 1 decimal place
            pivot = pivot.round(1)
            
            # Sort by name (index)
            pivot = pivot.sort_index()
            
            # Display results by category
            st.header("Billable Hours Report")
            st.subheader(f"{start_date.strftime('%B %Y')} - {end_date.strftime('%B %Y')}")
            
            # Show override notice if any are active
            if overrides:
                st.info(f"ℹ️ {len(overrides)} staff classification override(s) active")
            
            # Create styled dataframe for each category
            for category in ['Active Employee', 'Contractor', 'Inactive']:
                staff_in_category = sorted([k for k, v in staff_classifications.items() if v == category])
                
                if not staff_in_category:
                    continue
                
                st.subheader(f"{category}s")
                
                category_data = pivot.loc[staff_in_category].copy()
                
                # Format display
                display_df = category_data.copy()
                display_df.columns = [str(c) for c in display_df.columns]
                
                # Apply styling
                def style_category(row):
                    styles = []
                    for col in row.index[:-1]:  # Exclude Total column
                        try:
                            period = pd.Period(col, freq='M')
                            if period in monthly_capacity:
                                cap = monthly_capacity[period]
                                val = row[col]
                                styles.append(apply_color_coding(val, cap))
                            else:
                                styles.append('')
                        except:
                            styles.append('')
                    styles.append('')  # Total column - no color
                    return styles
                
                styled = display_df.style.apply(style_category, axis=1).format("{:.1f}")
                st.dataframe(styled, use_container_width=True)
            
            # Show capacity reference
            st.subheader("Monthly Capacity Reference")
            capacity_df = pd.DataFrame({
                'Month': [f"{calendar.month_abbr[m['month']]}-{m['year'] % 100}" for m in month_cols],
                'Monthly Capacity': [round(monthly_capacity[pd.Period(f"{m['year']}-{m['month']:02d}", freq='M')], 1) for m in month_cols],
                'Capacity @ 1840': [153.3] * len(month_cols),
                'Capacity * 80%': [round(capacity_80[pd.Period(f"{m['year']}-{m['month']:02d}", freq='M')], 1) for m in month_cols]
            })
            st.dataframe(capacity_df, use_container_width=True)
            
            # Export to Excel
            st.subheader("Export Report")
            
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # Write each category to separate sheet (sorted by name)
                for category in ['Active Employee', 'Contractor', 'Inactive']:
                    staff_in_category = sorted([k for k, v in staff_classifications.items() if v == category])
                    if staff_in_category:
                        category_data = pivot.loc[staff_in_category].sort_index()
                        category_data.to_excel(writer, sheet_name=category.replace(' ', '_'))
                
                # Write capacity reference
                capacity_df.to_excel(writer, sheet_name='Capacity_Reference', index=False)
            
            output.seek(0)
            
            # Store report data in session state for email sending
            st.session_state.report_data = {
                'excel_file': output.getvalue(),
                'filename': f"billable_hours_report_{start_date.strftime('%Y%m')}-{end_date.strftime('%Y%m')}.xlsx",
                'start_date': start_date,
                'end_date': end_date,
                'summary': {
                    'total_entries': len(df),
                    'active_employees': len([k for k, v in staff_classifications.items() if v == 'Active Employee']),
                    'contractors': len([k for k, v in staff_classifications.items() if v == 'Contractor']),
                    'inactive': len([k for k, v in staff_classifications.items() if v == 'Inactive'])
                }
            }
            
            st.download_button(
                label="📥 Download Excel Report",
                data=output.getvalue(),
                file_name=f"billable_hours_report_{start_date.strftime('%Y%m')}-{end_date.strftime('%Y%m')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
            
            st.info("📧 To email this report, use the 'Email Report' section in the sidebar →")
            
        except Exception as e:
            st.error(f"Error generating report: {str(e)}")
            import traceback
            st.code(traceback.format_exc())

else:
    st.info("👈 Configure your report parameters and click 'Generate Report'")
    
    # Show example/instructions
    with st.expander("ℹ️ Report Details"):
        st.markdown("""
        ### Billable Hours Report
        
        This report shows billable hours by staff member, organized by employment type:
        
        **Data Source:**
        - BigTime "Detailed Time Report - ACS w/paid"
        - Only includes billable hours (non-billable excluded)
        
        **Staff Classification:**
        - **Active Employees**: Listed in Voyage_Global_Config → Staff tab
        - **Contractors**: Have billable hours but not in Staff tab
        - **Inactive**: Not in Staff tab and no billable hours in report period
        
        **Capacity Calculations:**
        - **Monthly Capacity**: Weekdays × 8 hours - Federal holidays × 8 hours
        - **Monthly Capacity @ 1840**: Fixed at 153.33 hours/month (1840 annual / 12)
        - **Monthly Capacity × 80%**: Monthly capacity × 0.8
        
        **Color Coding:**
        - 🔵 **Blue**: Less than 80% of capacity
        - 🟡 **Yellow**: 80% to 100% of capacity  
        - 🟢 **Green**: 100% of capacity or higher
        
        **Report Features:**
        - Runs for full month increments only
        - Staff with 0 hours across all months are excluded
        - Totals calculated for entire period
        """)
