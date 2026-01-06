"""
Project Health Monitor
Track project health across bookings, plan, and delivery
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from io import BytesIO
import requests

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

sys.path.append('./functions')
import bigtime
import sheets

st.set_page_config(page_title="Project Health Monitor", page_icon="📊", layout="wide")

st.title("📊 Project Health Monitor")
st.markdown("Track project health: Bookings vs Plan vs Delivery")

# Config from secrets
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
    PIPEDRIVE_API_TOKEN = st.secrets["PIPEDRIVE_API_TOKEN"]
except:
    st.error("❌ Missing required secrets: SHEET_CONFIG_ID, PIPEDRIVE_API_TOKEN")
    st.stop()

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def normalize_project_id(pid):
    """Normalize project ID to string for matching"""
    if pd.isna(pid):
        return None
    return str(pid).strip()

def calculate_months_elapsed(start_date, end_date):
    """Calculate fractional months between two dates"""
    if pd.isna(start_date) or pd.isna(end_date):
        return 0
    
    # Convert to datetime if needed
    if isinstance(start_date, str):
        start_date = pd.to_datetime(start_date)
    if isinstance(end_date, str):
        end_date = pd.to_datetime(end_date)
    
    # Calculate days and convert to months
    days = (end_date - start_date).days
    months = days / 30.44  # Average days per month
    return max(0, months)

def get_project_status(start_date, end_date, today):
    """Determine if project is Active, Completed, or Not Started"""
    if pd.isna(start_date) or pd.isna(end_date):
        return 'Unknown'
    
    if today < start_date:
        return 'Not Started'
    elif today > end_date:
        return 'Completed'
    else:
        return 'Active'

def get_status_color(variance_pct, is_revenue=False):
    """Get color emoji based on variance"""
    threshold_high = 15 if is_revenue else 10
    threshold_medium = 5 if is_revenue else 5
    
    if variance_pct >= threshold_high:
        return '🔴'
    elif variance_pct >= threshold_medium:
        return '🟡'
    elif variance_pct >= -threshold_medium:
        return '🟢'
    elif variance_pct >= -threshold_high:
        return '🔵'
    else:
        return '🟣'

def get_plan_match_status(match_pct):
    """Get status for plan vs booking match"""
    if 95 <= match_pct <= 105:
        return '✅'
    elif 85 <= match_pct < 95 or 105 < match_pct <= 120:
        return '⚠️'
    else:
        return '🔴'

def fetch_pipedrive_deals():
    """Fetch won deals from Pipedrive"""
    base_url = "https://api.pipedrive.com/v1"
    url = f"{base_url}/deals"
    
    params = {
        'api_token': PIPEDRIVE_API_TOKEN,
        'status': 'won',
        'start': 0,
        'limit': 500
    }
    
    all_deals = []
    
    try:
        while True:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code != 200:
                st.error(f"❌ Pipedrive API error: {response.status_code}")
                return None
            
            data = response.json()
            
            if not data.get('success'):
                st.error(f"❌ Pipedrive error: {data.get('error', 'Unknown')}")
                return None
            
            deals = data.get('data', [])
            if not deals:
                break
            
            all_deals.extend(deals)
            
            # Check pagination
            additional_data = data.get('additional_data', {})
            pagination = additional_data.get('pagination', {})
            if not pagination.get('more_items_in_collection'):
                break
            
            params['start'] = pagination.get('next_start', 0)
        
        return all_deals
    
    except Exception as e:
        st.error(f"❌ Error fetching Pipedrive deals: {e}")
        return None

def get_pipedrive_custom_field_keys():
    """Get custom field keys from Pipedrive"""
    base_url = "https://api.pipedrive.com/v1"
    url = f"{base_url}/dealFields"
    
    params = {'api_token': PIPEDRIVE_API_TOKEN}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                fields = data.get('data', [])
                
                field_map = {}
                for field in fields:
                    name = field.get('name', '').lower()
                    key = field.get('key')
                    
                    if 'bigtime project id' in name or 'project id' in name:
                        field_map['bigtime_project_id'] = key
                    elif 'project start date' in name or 'start date' in name:
                        field_map['project_start_date'] = key
                    elif 'project duration' in name or 'duration' in name:
                        field_map['project_duration'] = key
                
                return field_map
        
        return {}
    
    except Exception as e:
        st.warning(f"⚠️ Could not fetch Pipedrive custom fields: {e}")
        return {}

# ============================================================
# UI CONTROLS
# ============================================================

st.subheader("Analysis Options")

col1, col2, col3 = st.columns(3)

with col1:
    project_status_filter = st.selectbox(
        "Project Status",
        ["All Projects", "Active Only", "Completed Only", "Not Started"],
        index=1
    )

with col2:
    date_filter_enabled = st.checkbox("Filter by date range", value=False)

with col3:
    if date_filter_enabled:
        today = date.today()
        default_start = date(today.year, 1, 1)
        default_end = date(today.year, 12, 31)
        
        date_range_start = st.date_input("Start Date", value=default_start)
        date_range_end = st.date_input("End Date", value=default_end)

if st.button("📊 Generate Project Health Report", type="primary"):
    
    # ============================================================
    # PHASE 1: LOAD PIPEDRIVE DEALS
    # ============================================================
    
    with st.spinner("📡 Fetching deals from Pipedrive..."):
        pipedrive_deals = fetch_pipedrive_deals()
        
        if not pipedrive_deals:
            st.error("❌ Could not load Pipedrive deals")
            st.stop()
        
        st.success(f"✅ Loaded {len(pipedrive_deals)} won deals from Pipedrive")
        
        # Get custom field keys
        custom_fields = get_pipedrive_custom_field_keys()
    
    # ============================================================
    # PHASE 2: LOAD ASSIGNMENTS
    # ============================================================
    
    with st.spinner("📡 Loading assignments from Google Sheets..."):
        assignments_df = sheets.read_config(CONFIG_SHEET_ID, "Assignments")
        
        if assignments_df is None or assignments_df.empty:
            st.error("❌ Could not load Assignments data")
            st.stop()
        
        st.success(f"✅ Loaded {len(assignments_df)} assignment rows")
    
    # ============================================================
    # PHASE 3: LOAD BIGTIME ACTUALS
    # ============================================================
    
    with st.spinner("📡 Fetching actuals from BigTime..."):
        current_year = datetime.now().year
        years_to_fetch = [current_year - 1, current_year]
        
        bt_time_list = []
        for year in years_to_fetch:
            bt_year = bigtime.get_time_report(year)
            if bt_year is not None and not bt_year.empty:
                bt_time_list.append(bt_year)
        
        if not bt_time_list:
            st.error("❌ No BigTime data available")
            st.stop()
        
        bt_time = pd.concat(bt_time_list, ignore_index=True)
        
        # Filter out Internal projects
        client_id_col = None
        for col in ['tmclientnm_id', 'Client_ID', 'exclientnm_id']:
            if col in bt_time.columns:
                client_id_col = col
                break
        
        if client_id_col:
            bt_time = bt_time[bt_time[client_id_col] != 5556066].copy()
        
        # Find required columns
        date_col = next((c for c in ['Date', 'tmdt'] if c in bt_time.columns), None)
        staff_col = next((c for c in ['Staff Member', 'tmstaffnm'] if c in bt_time.columns), None)
        project_id_col = next((c for c in ['tmprojectnm_id', 'Project_ID'] if c in bt_time.columns), None)
        hours_col = next((c for c in ['tmhrsin', 'Hours'] if c in bt_time.columns), None)
        
        if not all([date_col, staff_col, project_id_col, hours_col]):
            st.error(f"❌ Missing required BigTime columns")
            st.stop()
        
        # Normalize
        bt_time['Date'] = pd.to_datetime(bt_time[date_col])
        bt_time['Staff_Member'] = bt_time[staff_col]
        bt_time['Project_ID'] = bt_time[project_id_col].apply(normalize_project_id)
        bt_time['Hours'] = pd.to_numeric(bt_time[hours_col], errors='coerce').fillna(0)
        
        st.success(f"✅ Loaded {len(bt_time)} BigTime entries")
    
    # ============================================================
    # PHASE 4: PROCESS PROJECTS
    # ============================================================
    
    with st.spinner("🔨 Analyzing project health..."):
        
        # Get unique project IDs from Assignments
        assignments_df['Project_ID_Norm'] = assignments_df['Project ID'].apply(normalize_project_id)
        
        # Identify month columns
        standard_cols = ['Client', 'Project Name', 'Project ID', 'Staff Member', 'Bill Rate', 'Project Status', 'Total']
        month_cols = []
        
        for col in assignments_df.columns:
            if col not in standard_cols:
                try:
                    col_date = pd.to_datetime(col)
                    month_cols.append({
                        'column': col,
                        'date': col_date,
                        'period': col_date.to_period('M')
                    })
                except:
                    pass
        
        month_cols = sorted(month_cols, key=lambda x: x['date'])
        
        # Build project-level data
        projects = {}
        
        for _, row in assignments_df.iterrows():
            project_id = row['Project_ID_Norm']
            if not project_id:
                continue
            
            if project_id not in projects:
                projects[project_id] = {
                    'Project_ID': project_id,
                    'Client': row.get('Client'),
                    'Project_Name': row.get('Project Name'),
                    'Resources': [],
                    'Total_Planned_Hours': 0,
                    'Bill_Rates': [],
                    'Monthly_Plan': {},
                    'First_Month': None,
                    'Last_Month': None
                }
            
            # Aggregate hours and rates
            staff = row.get('Staff Member')
            total_hours = pd.to_numeric(row.get('Total', 0), errors='coerce')
            bill_rate = pd.to_numeric(row.get('Bill Rate', 0), errors='coerce')
            
            if not pd.isna(staff) and total_hours > 0:
                projects[project_id]['Resources'].append(staff)
                projects[project_id]['Total_Planned_Hours'] += total_hours
                
                if not pd.isna(bill_rate) and bill_rate > 0:
                    projects[project_id]['Bill_Rates'].append({
                        'rate': bill_rate,
                        'hours': total_hours
                    })
                
                # Track monthly distribution
                for m in month_cols:
                    hours = pd.to_numeric(row.get(m['column'], 0), errors='coerce')
                    if pd.isna(hours):
                        hours = 0
                    
                    if hours > 0:
                        period = m['period']
                        if period not in projects[project_id]['Monthly_Plan']:
                            projects[project_id]['Monthly_Plan'][period] = 0
                        projects[project_id]['Monthly_Plan'][period] += hours
                        
                        if projects[project_id]['First_Month'] is None:
                            projects[project_id]['First_Month'] = period
                        projects[project_id]['Last_Month'] = period
        
        # Calculate weighted average bill rate per project
        for project_id, proj in projects.items():
            if proj['Bill_Rates']:
                total_weighted = sum(br['rate'] * br['hours'] for br in proj['Bill_Rates'])
                total_hours = sum(br['hours'] for br in proj['Bill_Rates'])
                proj['Weighted_Bill_Rate'] = total_weighted / total_hours if total_hours > 0 else 0
            else:
                proj['Weighted_Bill_Rate'] = 0
        
        # Match with Pipedrive deals
        for deal in pipedrive_deals:
            # Get BigTime Project ID from custom field
            bt_project_id = None
            if 'bigtime_project_id' in custom_fields:
                bt_project_id = deal.get(custom_fields['bigtime_project_id'])
            
            bt_project_id = normalize_project_id(bt_project_id)
            
            if bt_project_id and bt_project_id in projects:
                projects[bt_project_id]['Deal_Value'] = deal.get('value', 0)
                projects[bt_project_id]['Deal_Title'] = deal.get('title')
                projects[bt_project_id]['Won_Date'] = deal.get('won_time')
                
                # Get custom fields
                if 'project_start_date' in custom_fields:
                    projects[bt_project_id]['PD_Start_Date'] = deal.get(custom_fields['project_start_date'])
                if 'project_duration' in custom_fields:
                    projects[bt_project_id]['PD_Duration'] = deal.get(custom_fields['project_duration'])
        
        # Calculate actuals from BigTime
        actuals_by_project = bt_time.groupby('Project_ID').agg({
            'Hours': 'sum'
        }).reset_index()
        actuals_by_project = actuals_by_project.rename(columns={'Hours': 'Total_Actual_Hours'})
        
        # Merge actuals
        for _, actual in actuals_by_project.iterrows():
            project_id = actual['Project_ID']
            if project_id in projects:
                projects[project_id]['Total_Actual_Hours'] = actual['Total_Actual_Hours']
        
        # Build results
        results = []
        today_dt = pd.Timestamp(datetime.now())
        
        for project_id, proj in projects.items():
            # Skip if no deal value (not in Pipedrive)
            if 'Deal_Value' not in proj or proj['Deal_Value'] == 0:
                continue
            
            # Determine timeline
            if proj['First_Month'] and proj['Last_Month']:
                start_date = proj['First_Month'].to_timestamp()
                end_date = proj['Last_Month'].to_timestamp() + relativedelta(months=1) - relativedelta(days=1)
            else:
                continue
            
            # Calculate metrics
            total_planned_hours = proj['Total_Planned_Hours']
            total_actual_hours = proj.get('Total_Actual_Hours', 0)
            bill_rate = proj['Weighted_Bill_Rate']
            deal_value = proj['Deal_Value']
            
            # Plan Match
            planned_revenue = total_planned_hours * bill_rate
            plan_match_pct = (planned_revenue / deal_value * 100) if deal_value > 0 else 0
            
            # Progress calculations
            total_months = calculate_months_elapsed(start_date, end_date + relativedelta(days=1))
            months_elapsed = calculate_months_elapsed(start_date, today_dt)
            
            progress_plan_pct = (months_elapsed / total_months * 100) if total_months > 0 else 0
            progress_actual_pct = (total_actual_hours / total_planned_hours * 100) if total_planned_hours > 0 else 0
            
            # Variance
            variance_pct = progress_actual_pct - progress_plan_pct
            
            # Revenue metrics
            billed_to_date = total_actual_hours * bill_rate
            expected_revenue = deal_value * (progress_plan_pct / 100)
            revenue_variance_pct = ((billed_to_date - expected_revenue) / expected_revenue * 100) if expected_revenue > 0 else 0
            
            # Status
            project_status = get_project_status(start_date, end_date, today_dt)
            
            # Pace
            if variance_pct >= 10:
                pace = 'Fast'
            elif variance_pct >= 5:
                pace = 'Warm'
            elif variance_pct >= -5:
                pace = 'Good'
            elif variance_pct >= -10:
                pace = 'Cool'
            else:
                pace = 'Slow'
            
            if project_status == 'Not Started':
                pace = 'N/S'
            elif project_status == 'Completed':
                pace = 'Done'
            
            results.append({
                'Client': proj['Client'],
                'Project_Name': proj['Project_Name'],
                'Project_ID': project_id,
                'Timeline': f"{start_date.strftime('%b')}-{end_date.strftime('%b')}({int(total_months)})",
                'Booking': deal_value,
                'Plan_Match_Pct': plan_match_pct,
                'Plan_Match_Status': get_plan_match_status(plan_match_pct),
                'Billed_to_Date': billed_to_date,
                'Progress_Plan_Pct': progress_plan_pct,
                'Progress_Actual_Pct': progress_actual_pct,
                'Variance_Pct': variance_pct,
                'Variance_Status': get_status_color(variance_pct, False),
                'Revenue_Variance_Pct': revenue_variance_pct,
                'Revenue_Status': get_status_color(revenue_variance_pct, True),
                'Bill_Rate': bill_rate,
                'Pace': pace,
                'Project_Status': project_status,
                'Start_Date': start_date,
                'End_Date': end_date,
                'Total_Planned_Hours': total_planned_hours,
                'Total_Actual_Hours': total_actual_hours
            })
        
        results_df = pd.DataFrame(results)
        
        # Apply filters
        if project_status_filter != "All Projects":
            if project_status_filter == "Active Only":
                results_df = results_df[results_df['Project_Status'] == 'Active']
            elif project_status_filter == "Completed Only":
                results_df = results_df[results_df['Project_Status'] == 'Completed']
            elif project_status_filter == "Not Started":
                results_df = results_df[results_df['Project_Status'] == 'Not Started']
        
        if date_filter_enabled:
            results_df = results_df[
                (results_df['Start_Date'] <= pd.Timestamp(date_range_end)) &
                (results_df['End_Date'] >= pd.Timestamp(date_range_start))
            ]
        
        st.success(f"✅ Analyzed {len(results_df)} projects")
    
    # ============================================================
    # DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Project Health Dashboard")
    st.caption(f"As of: {datetime.now().strftime('%B %d, %Y')}")
    
    # Summary metrics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        overruns = len(results_df[results_df['Variance_Pct'] >= 10])
        st.metric("🔴 Running Hot", overruns)
    with col2:
        underruns = len(results_df[results_df['Variance_Pct'] <= -10])
        st.metric("🔵 Running Cold", underruns)
    with col3:
        scoping_errors = len(results_df[
            (results_df['Plan_Match_Pct'] < 85) | (results_df['Plan_Match_Pct'] > 120)
        ])
        st.metric("🔴 Scoping Errors", scoping_errors)
    with col4:
        total_booking = results_df['Booking'].sum()
        st.metric("💰 Total Bookings", f"${total_booking:,.0f}")
    
    st.divider()
    
    # Main table
    st.subheader("📋 Project Details")
    
    display_df = results_df[[
        'Client', 'Project_Name', 'Timeline', 'Booking', 'Plan_Match_Status', 
        'Billed_to_Date', 'Progress_Plan_Pct', 'Progress_Actual_Pct', 
        'Variance_Pct', 'Variance_Status', 'Revenue_Variance_Pct', 
        'Revenue_Status', 'Bill_Rate', 'Pace'
    ]].copy()
    
    display_df['Plan_Match'] = display_df['Plan_Match_Status']
    display_df['Variance'] = display_df['Variance_Status'] + ' ' + display_df['Variance_Pct'].apply(lambda x: f"{x:+.0f}%")
    display_df['Revenue'] = display_df['Revenue_Status'] + ' ' + display_df['Revenue_Variance_Pct'].apply(lambda x: f"{x:+.0f}%")
    display_df['Prog Plan'] = display_df['Progress_Plan_Pct'].apply(lambda x: f"{x:.0f}%")
    display_df['Prog Actual'] = display_df['Progress_Actual_Pct'].apply(lambda x: f"{x:.0f}%")
    
    display_final = display_df[[
        'Client', 'Project_Name', 'Timeline', 'Booking', 'Plan_Match',
        'Billed_to_Date', 'Prog Plan', 'Prog Actual', 'Variance', 
        'Revenue', 'Bill_Rate', 'Pace'
    ]].rename(columns={
        'Project_Name': 'Project',
        'Billed_to_Date': 'Billed to Date',
        'Bill_Rate': 'Rate'
    })
    
    st.dataframe(
        display_final.style.format({
            'Booking': '${:,.0f}',
            'Billed to Date': '${:,.0f}',
            'Rate': '${:.0f}'
        }),
        hide_index=True,
        use_container_width=True,
        height=600
    )
    
    # Excel export
    st.divider()
    st.subheader("📥 Export Report")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            results_df.to_excel(writer, sheet_name='Project_Health', index=False)
        
        excel_data = output.getvalue()
        filename = f"project_health_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        st.download_button(
            label="📥 Download Excel Report",
            data=excel_data,
            file_name=filename,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
        
    except Exception as e:
        st.error(f"❌ Export failed: {e}")

else:
    st.info("👆 Configure options and click the button to generate report")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        ### Three-Way Project Health Analysis
        
        This app reconciles data from three sources to assess project health:
        
        **1. Bookings (Pipedrive)** - What we sold
        **2. Plan (Assignments Sheet)** - What we planned to deliver
        **3. Delivery (BigTime)** - What we actually delivered
        
        ### Key Metrics
        
        **Plan Match:**
        - Compares planned revenue (Assignments hours × rate) to booking (Pipedrive deal value)
        - ✅ 95-105%: Good scoping
        - ⚠️ 85-95% or 105-120%: Warning
        - 🔴 <85% or >120%: Scoping error
        
        **Progress Plan:**
        - Time-based: How far through the project timeline?
        - Example: 2 months into 6 months = 33%
        
        **Progress Actual:**
        - Consumption-based: How many hours consumed vs planned?
        - Example: 390 hours used of 900 planned = 43%
        
        **Variance:**
        - Progress Actual - Progress Plan
        - Positive = Running hot (consuming faster than time)
        - Negative = Running cold (consuming slower than time)
        
        **Revenue Status:**
        - Compares billed to date vs expected revenue (Booking × Progress Plan)
        - Shows if project is over/under-billing
        
        ### Project Status
        
        - **Active:** Work in progress
        - **Completed:** Finished, shows final metrics
        - **Not Started:** Future project
        """)
