import streamlit as st
import pandas as pd
import sys
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from io import BytesIO

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')

import bigtime
import sheets

st.set_page_config(page_title="Resource Checker", page_icon="🎯", layout="wide")

st.title("🎯 Resource Checker")
st.markdown("Monitor utilization adherence, revenue underruns, and schedule pace")

# Config from secrets
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
except:
    import credentials
    CONFIG_SHEET_ID = credentials.get("SHEET_CONFIG_ID")

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def normalize_project_id(pid):
    """Normalize project ID to string for matching"""
    if pd.isna(pid):
        return None
    return str(pid).strip()

def get_utilization_status(percent_used):
    """Determine utilization status based on percent used"""
    if percent_used >= 100:
        return {'status': 'Overrun', 'color': '🔴', 'sort_order': 1}
    elif percent_used >= 95:
        return {'status': 'On Target', 'color': '🟢', 'sort_order': 5}
    elif percent_used >= 85:
        return {'status': 'At Risk (High)', 'color': '🟡', 'sort_order': 3}
    elif percent_used >= 70:
        return {'status': 'Under Target', 'color': '🔵', 'sort_order': 4}
    else:
        return {'status': 'Severely Under', 'color': '🟣', 'sort_order': 2}

def get_schedule_status(pace_ratio):
    """Determine schedule status based on pace ratio"""
    if pace_ratio >= 1.05:
        return 'Ahead'
    elif pace_ratio >= 0.95:
        return 'On Schedule'
    elif pace_ratio >= 0.85:
        return 'At Risk (Late)'
    else:
        return 'Late'

# ============================================================
# DATE RANGE SELECTION
# ============================================================

st.subheader("Analysis Period")

today = date.today()
default_start = date(today.year, 1, 1)
default_end = date(today.year, 12, 31)

col1, col2 = st.columns(2)
with col1:
    start_date = st.date_input("Start Date", value=default_start)
with col2:
    end_date = st.date_input("End Date", value=default_end)

if st.button("🎯 Run Resource Check", type="primary"):
    
    # ============================================================
    # PHASE 1: LOAD ASSIGNMENTS DATA
    # ============================================================
    
    with st.spinner("📡 Loading assignments from Google Sheets..."):
        assignments_df = sheets.read_config(CONFIG_SHEET_ID, "Assignments")
        
        if assignments_df is None or assignments_df.empty:
            st.error("❌ Could not load Assignments data")
            st.stop()
        
        st.success(f"✅ Loaded {len(assignments_df)} assignment rows")
        if sheets.should_use_snowflake():
            st.success("❄️ Config: Snowflake")
        else:
            st.info("📊 Config: Google Sheets")

    # ============================================================
    # PHASE 2: LOAD BIGTIME ACTUALS
    # ============================================================
    
    with st.spinner("📡 Fetching actuals from BigTime..."):
        # Get all years in the date range
        years_needed = list(range(start_date.year, end_date.year + 1))
        bt_time_list = []
        
        for year in years_needed:
            bt_year = bigtime.get_time_report(year)
            if bt_year is not None and not bt_year.empty:
                bt_time_list.append(bt_year)
        
        if not bt_time_list:
            st.error("❌ No BigTime data available")
            st.stop()
        
        bt_time = pd.concat(bt_time_list, ignore_index=True)
        
        # Filter out Internal projects (BigTime Client ID = 5556066)
        client_id_col = None
        for col in ['tmclientnm_id', 'Client_ID', 'exclientnm_id']:
            if col in bt_time.columns:
                client_id_col = col
                break
        
        if client_id_col:
            bt_time = bt_time[bt_time[client_id_col] != 5556066].copy()
            st.info(f"🔍 Filtered out Internal projects (Client ID 5556066)")
        
        # Find columns
        date_col = None
        for col in ['Date', 'tmdt']:
            if col in bt_time.columns:
                date_col = col
                break
        
        staff_col = None
        for col in ['Staff Member', 'tmstaffnm']:
            if col in bt_time.columns:
                staff_col = col
                break
        
        project_id_col = None
        for col in ['tmprojectnm_id', 'Project_ID']:
            if col in bt_time.columns:
                project_id_col = col
                break
        
        hours_col = None
        for col in ['tmhrsin', 'Hours']:
            if col in bt_time.columns:
                hours_col = col
                break
        
        if not all([date_col, staff_col, project_id_col, hours_col]):
            st.error(f"❌ Missing required columns. Found: {bt_time.columns.tolist()}")
            st.stop()
        
        # Filter and normalize
        bt_time['Date'] = pd.to_datetime(bt_time[date_col])
        bt_time = bt_time[
            (bt_time['Date'] >= pd.Timestamp(start_date)) & 
            (bt_time['Date'] <= pd.Timestamp(end_date))
        ].copy()
        
        bt_time['Staff_Member'] = bt_time[staff_col]
        bt_time['Project_ID'] = bt_time[project_id_col].apply(normalize_project_id)
        bt_time['Hours'] = pd.to_numeric(bt_time[hours_col], errors='coerce').fillna(0)
        bt_time['Month'] = bt_time['Date'].dt.to_period('M')
        
        # Also extract project and client names for unassigned work detection
        for col in ['Project', 'tmprojectnm', 'exprojectnm']:
            if col in bt_time.columns:
                bt_time['Project'] = bt_time[col]
                break
        
        for col in ['Client', 'tmclientnm', 'exclientnm']:
            if col in bt_time.columns:
                bt_time['Client'] = bt_time[col]
                break
        
        st.success(f"✅ Loaded {len(bt_time)} BigTime entries")
    
    # ============================================================
    # PHASE 3: PROCESS ASSIGNMENTS
    # ============================================================
    
    with st.spinner("🔨 Processing assignments..."):
        # Identify month columns in assignments sheet
        standard_cols = ['Client', 'Project Name', 'Project ID', 'Staff Member', 'Bill Rate', 'Project Status', 'Total']
        
        month_cols = []
        for col in assignments_df.columns:
            if col not in standard_cols:
                try:
                    # Try to parse as date
                    col_date = pd.to_datetime(col)
                    month_cols.append({
                        'column': col,
                        'date': col_date,
                        'period': col_date.to_period('M'),
                        'year': col_date.year,
                        'month': col_date.month
                    })
                except:
                    pass
        
        month_cols = sorted(month_cols, key=lambda x: x['date'])
        
        st.info(f"📅 Found {len(month_cols)} month columns from {month_cols[0]['period']} to {month_cols[-1]['period']}")
        
        # Determine which months are actual vs plan
        current_month = pd.Period(datetime.now(), freq='M')
        for m in month_cols:
            if m['period'] < current_month:
                m['type'] = 'Actual'
            else:
                m['type'] = 'Plan'
        
        # Build resource-project records
        resources = []
        
        for _, row in assignments_df.iterrows():
            staff = row.get('Staff Member')
            client = row.get('Client')
            project_name = row.get('Project Name')
            project_id = normalize_project_id(row.get('Project ID'))
            total_assigned = pd.to_numeric(row.get('Total', 0), errors='coerce')
            
            if pd.isna(staff) or not staff or pd.isna(total_assigned):
                continue
            
            # Skip Internal projects (admin, travel, team meetings, etc.)
            if isinstance(project_name, str) and project_name.lower().startswith('internal:'):
                continue
            
            # Get planned hours by month
            monthly_plan = {}
            first_month = None
            last_month = None
            
            for m in month_cols:
                hours = pd.to_numeric(row.get(m['column'], 0), errors='coerce')
                if pd.isna(hours):
                    hours = 0
                
                if hours > 0:
                    monthly_plan[m['period']] = hours
                    if first_month is None:
                        first_month = m['period']
                    last_month = m['period']
            
            resources.append({
                'Staff_Member': staff,
                'Client': client,
                'Project_Name': project_name,
                'Project_ID': project_id,
                'Total_Assigned': total_assigned,
                'Monthly_Plan': monthly_plan,
                'First_Month': first_month,
                'Last_Month': last_month
            })
        
        st.success(f"✅ Processed {len(resources)} resource assignments")
    
    # ============================================================
    # PHASE 4: CALCULATE ACTUALS
    # ============================================================
    
    with st.spinner("📊 Calculating actuals..."):
        # Aggregate actuals by staff + project + month
        actuals_monthly = bt_time.groupby(['Staff_Member', 'Project_ID', 'Month'])['Hours'].sum().reset_index()
        
        # Aggregate total actuals by staff + project
        actuals_total = bt_time.groupby(['Staff_Member', 'Project_ID'])['Hours'].sum().reset_index()
        actuals_total = actuals_total.rename(columns={'Hours': 'Total_Actual'})
    
    # ============================================================
    # PHASE 5: MERGE & CALCULATE METRICS
    # ============================================================
    
    with st.spinner("🧮 Calculating utilization and schedule metrics..."):
        results = []
        
        for resource in resources:
            staff = resource['Staff_Member']
            project_id = resource['Project_ID']
            total_assigned = resource['Total_Assigned']
            
            # Get total actuals
            actual_row = actuals_total[
                (actuals_total['Staff_Member'] == staff) & 
                (actuals_total['Project_ID'] == project_id)
            ]
            
            total_actual = actual_row['Total_Actual'].iloc[0] if len(actual_row) > 0 else 0
            
            # Calculate percent used (avoid divide by zero for unassigned)
            if total_assigned > 0:
                percent_used = (total_actual / total_assigned) * 100
                is_unassigned = False
            else:
                # Unassigned work (actuals exist but no assignment)
                if total_actual > 0:
                    percent_used = 999  # Flag as massive overrun
                    is_unassigned = True
                else:
                    percent_used = 0
                    is_unassigned = False
            
            # Calculate schedule metrics
            first_month = resource['First_Month']
            last_month = resource['Last_Month']
            
            if first_month and last_month and total_assigned > 0:
                # Count months in schedule
                current_period = pd.Period(datetime.now(), freq='M')
                
                # Calculate total planned months
                total_months = 0
                m = first_month
                while m <= last_month:
                    total_months += 1
                    m += 1
                
                # Calculate elapsed months
                elapsed_months = 0
                m = first_month
                while m <= min(current_period, last_month):
                    elapsed_months += 1
                    m += 1
                
                # Schedule progress
                if total_months > 0:
                    schedule_progress = elapsed_months / total_months
                    expected_hours_to_date = total_assigned * schedule_progress
                    
                    if expected_hours_to_date > 0:
                        pace_ratio = total_actual / expected_hours_to_date
                    else:
                        pace_ratio = 0
                else:
                    schedule_progress = 0
                    expected_hours_to_date = 0
                    pace_ratio = 0
            else:
                schedule_progress = 0
                expected_hours_to_date = 0
                pace_ratio = 0
            
            # Get statuses
            util_status = get_utilization_status(percent_used)
            sched_status = get_schedule_status(pace_ratio)
            
            # Delta vs target
            delta = total_actual - total_assigned
            
            results.append({
                'Staff_Member': staff,
                'Client': resource['Client'],
                'Project_Name': resource['Project_Name'],
                'Project_ID': project_id,
                'Total_Assigned': total_assigned,
                'Total_Actual': total_actual,
                'Percent_Used': percent_used,
                'Utilization_Status': util_status['status'],
                'Utilization_Color': util_status['color'],
                'Sort_Order': util_status['sort_order'],
                'Schedule_Status': sched_status,
                'Pace_Ratio': pace_ratio,
                'Expected_Hours': expected_hours_to_date,
                'Delta': delta,
                'Is_Unassigned': is_unassigned,
                'First_Month': first_month,
                'Last_Month': last_month,
                'Monthly_Plan': resource['Monthly_Plan']
            })
        
        # Also check for unassigned work (actuals with no assignment)
        unassigned_work = []
        for _, actual in actuals_total.iterrows():
            staff = actual['Staff_Member']
            project_id = actual['Project_ID']
            total_actual = actual['Total_Actual']
            
            # Check if this combo exists in assignments
            exists = any(
                r['Staff_Member'] == staff and r['Project_ID'] == project_id
                for r in resources
            )
            
            if not exists and total_actual > 0:
                # Unassigned work
                util_status = get_utilization_status(999)
                
                # Try to get project name from BigTime data
                bt_project_name = bt_time[bt_time['Project_ID'] == project_id]['Project'].iloc[0] if 'Project' in bt_time.columns else 'Unknown'
                bt_client_name = bt_time[bt_time['Project_ID'] == project_id]['Client'].iloc[0] if 'Client' in bt_time.columns else 'Unknown'
                
                unassigned_work.append({
                    'Staff_Member': staff,
                    'Client': bt_client_name,
                    'Project_Name': bt_project_name,
                    'Project_ID': project_id,
                    'Total_Assigned': 0,
                    'Total_Actual': total_actual,
                    'Percent_Used': 999,
                    'Utilization_Status': 'Overrun',
                    'Utilization_Color': '🔴',
                    'Sort_Order': 1,
                    'Schedule_Status': 'N/A',
                    'Pace_Ratio': 0,
                    'Expected_Hours': 0,
                    'Delta': total_actual,
                    'Is_Unassigned': True,
                    'First_Month': None,
                    'Last_Month': None,
                    'Monthly_Plan': {}
                })
                
                results.append(unassigned_work[-1])
        
        if unassigned_work:
            st.warning(f"⚠️ Found {len(unassigned_work)} project(s) with actuals but no assignment in sheet")
            with st.expander("🔍 Debug: Unassigned Work Details"):
                for uw in unassigned_work:
                    st.write(f"- **{uw['Staff_Member']}** worked {uw['Total_Actual']:.1f} hrs on Project ID **{uw['Project_ID']}** ({uw['Project_Name']}) but has no assignment in Google Sheet")
        
        results_df = pd.DataFrame(results)
        
        # Filter out records where both assigned and actual are 0
        # These are placeholders with no work and no plan
        results_df = results_df[
            (results_df['Total_Assigned'] > 0) | (results_df['Total_Actual'] > 0)
        ]
        
        # Sort: worst problems first
        results_df = results_df.sort_values(['Sort_Order', 'Pace_Ratio'])
        
        st.success(f"✅ Generated {len(results_df)} resource-project combinations")
    
    # ============================================================
    # DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Resource Utilization & Schedule Analysis")
    st.caption(f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    
    # Summary metrics
    st.subheader("📈 Summary")
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        overruns = len(results_df[results_df['Utilization_Status'] == 'Overrun'])
        st.metric("🔴 Overruns", overruns)
    with col2:
        severely_under = len(results_df[results_df['Utilization_Status'] == 'Severely Under'])
        st.metric("🟣 Severely Under", severely_under)
    with col3:
        late = len(results_df[results_df['Schedule_Status'] == 'Late'])
        st.metric("⏰ Late", late)
    with col4:
        unassigned = len(results_df[results_df['Is_Unassigned'] == True])
        st.metric("⚠️ Unassigned Work", unassigned)
    
    st.divider()
    
    # Filters
    st.subheader("🔍 Filters")
    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        staff_filter = st.multiselect(
            "Staff Member",
            options=sorted(results_df['Staff_Member'].unique()),
            default=[]
        )
    with col2:
        client_filter = st.multiselect(
            "Client",
            options=sorted(results_df['Client'].unique()),
            default=[]
        )
    with col3:
        project_filter = st.multiselect(
            "Project",
            options=sorted(results_df['Project_Name'].unique()),
            default=[]
        )
    with col4:
        util_filter = st.multiselect(
            "Utilization Status",
            options=['Overrun', 'On Target', 'At Risk (High)', 'Under Target', 'Severely Under'],
            default=[]
        )
    with col5:
        sched_filter = st.multiselect(
            "Schedule Status",
            options=['Ahead', 'On Schedule', 'At Risk (Late)', 'Late', 'N/A'],
            default=[]
        )
    
    # Apply filters
    filtered_df = results_df.copy()
    if staff_filter:
        filtered_df = filtered_df[filtered_df['Staff_Member'].isin(staff_filter)]
    if client_filter:
        filtered_df = filtered_df[filtered_df['Client'].isin(client_filter)]
    if project_filter:
        filtered_df = filtered_df[filtered_df['Project_Name'].isin(project_filter)]
    if util_filter:
        filtered_df = filtered_df[filtered_df['Utilization_Status'].isin(util_filter)]
    if sched_filter:
        filtered_df = filtered_df[filtered_df['Schedule_Status'].isin(sched_filter)]
    
    st.info(f"Showing {len(filtered_df)} of {len(results_df)} resources")
    
    st.divider()
    
    # Main table
    st.subheader("📋 Resource Details")
    
    # Prepare display
    display_df = filtered_df.copy()
    display_df['Status'] = display_df['Utilization_Color'] + ' ' + display_df['Utilization_Status']
    
    # Add unassigned flag
    display_df['Flags'] = display_df.apply(
        lambda row: '⚠️ Unassigned' if row['Is_Unassigned'] else '',
        axis=1
    )
    
    display_df['Pace'] = display_df['Pace_Ratio'].apply(lambda x: f"{x:.2f}×" if x > 0 else 'N/A')
    
    display_columns = [
        'Flags', 'Staff_Member', 'Client', 'Project_Name', 'Project_ID',
        'Total_Assigned', 'Total_Actual', 'Percent_Used',
        'Status', 'Schedule_Status', 'Pace', 'Delta'
    ]
    
    display_final = display_df[display_columns].rename(columns={
        'Staff_Member': 'Resource',
        'Project_Name': 'Project',
        'Project_ID': 'Project ID',
        'Total_Assigned': 'Assigned (hrs)',
        'Total_Actual': 'Actual (hrs)',
        'Percent_Used': 'Used %',
        'Status': 'Utilization',
        'Schedule_Status': 'Schedule',
        'Pace': 'Pace Ratio',
        'Delta': 'Δ vs Target'
    })
    
    st.dataframe(
        display_final.style.format({
            'Assigned (hrs)': '{:.1f}',
            'Actual (hrs)': '{:.1f}',
            'Used %': '{:.1f}%',
            'Δ vs Target': '{:+.1f}'
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
            results_df.to_excel(writer, sheet_name='Resource_Check', index=False)
        
        excel_data = output.getvalue()
        filename = f"resource_check_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.xlsx"
        
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
    st.info("👆 Select analysis period and click the button to run resource check")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        ### Purpose
        
        Monitor resource utilization and schedule adherence across three dimensions:
        1. **Utilization** - Are total authorized hours being respected?
        2. **Underruns** - Are we leaving billable revenue on the table?
        3. **Schedule Pace** - Are resources consuming hours at the required rate?
        
        ### Utilization Status Bands
        
        | Status | Used % | Color | Meaning |
        |--------|--------|-------|---------|
        | Overrun | ≥100% | 🔴 Red | Exceeded authorization |
        | On Target | 95-99% | 🟢 Green | Perfect |
        | At Risk | 85-94% | 🟡 Yellow | Trending to overrun |
        | Under Target | 70-84% | 🔵 Blue | Under-utilization |
        | Severely Under | <70% | 🟣 Purple | Revenue leakage |
        
        ### Schedule Status
        
        | Status | Pace Ratio | Meaning |
        |--------|------------|---------|
        | Ahead | ≥1.05× | Burning faster than plan |
        | On Schedule | 0.95-1.04× | Healthy |
        | At Risk | 0.85-0.94× | Starting to slip |
        | Late | <0.85× | Material schedule drift |
        
        ### Data Sources
        
        - **Assignments Sheet** - Planned/authorized hours (source of truth for plan)
        - **BigTime Actuals** - Hours worked (source of truth for actuals)
        
        ### Key Principles
        
        - Past months: BigTime actuals only
        - Current month: BigTime actuals to date
        - Future months: Assignments plan
        - Total authorized: Assignments "Total" column
        """)
