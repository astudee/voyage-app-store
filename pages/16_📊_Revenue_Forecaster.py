"""
Revenue Forecaster
Project-level revenue forecast combining BigTime actuals (past) with Assignment plan (future)
"""

import streamlit as st
import pandas as pd
import sys
import requests
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from io import BytesIO

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

sys.path.append('./functions')
import bigtime
import sheets

st.set_page_config(page_title="Revenue Forecaster", page_icon="📊", layout="wide")

st.title("📊 Revenue Forecaster")
st.markdown("Project-level revenue forecast: Actuals (past) + Plan (future)")

# Config from secrets
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
    PIPEDRIVE_API_TOKEN = st.secrets.get("PIPEDRIVE_API_TOKEN", None)
except:
    import credentials
    CONFIG_SHEET_ID = credentials.get("SHEET_CONFIG_ID")
    PIPEDRIVE_API_TOKEN = None

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def normalize_project_id(pid):
    """Normalize project ID to string for matching"""
    if pd.isna(pid):
        return None
    return str(pid).strip()

def fetch_pipedrive_deals():
    """Fetch pipeline deals from Pipedrive"""
    if not PIPEDRIVE_API_TOKEN:
        return None
    
    base_url = "https://api.pipedrive.com/v1"
    url = f"{base_url}/deals"
    
    params = {
        'api_token': PIPEDRIVE_API_TOKEN,
        'status': 'open',  # Pipeline deals
        'start': 0,
        'limit': 500
    }
    
    all_deals = []
    
    try:
        while True:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            if not data.get('success'):
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
    if not PIPEDRIVE_API_TOKEN:
        return {}
    
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
                    
                    if 'project start date' in name or 'start date' in name:
                        field_map['project_start_date'] = key
                    elif 'project duration' in name or 'duration' in name:
                        field_map['project_duration'] = key
                
                return field_map
        
        return {}
    
    except Exception as e:
        return {}

def get_deal_probability_factor(stage_name):
    """Get probability factor based on deal stage"""
    if not stage_name:
        return 0.33  # Default
    
    stage_lower = stage_name.lower()
    
    # Map stage names to probability factors
    if 'forecast' in stage_lower:
        return 0.75
    elif 'proposal' in stage_lower or 'sow' in stage_lower or 'resourcing' in stage_lower:
        return 0.50
    elif 'qualified' in stage_lower:
        return 0.33
    else:
        return 0.33  # Default for unknown stages

# ============================================================
# DATE RANGE SELECTION
# ============================================================

st.subheader("Forecast Period")

# Default: Current month to 12 months out
today = date.today()
default_start = date(today.year, today.month, 1)  # First day of current month
default_end = default_start + relativedelta(months=12)

# Generate list of months: 24 months back + 48 months forward = 72 months total
month_options = []
start_month = date(today.year, today.month, 1) - relativedelta(months=24)  # 2 years back

for i in range(72):  # 6 years total (2 back + 4 forward)
    month_options.append({
        'label': start_month.strftime('%Y-%m'),
        'value': start_month
    })
    start_month = start_month + relativedelta(months=1)

# Find default indices (current month for start, +12 months for end)
default_start_idx = next((i for i, m in enumerate(month_options) if m['value'] == default_start), 24)
default_end_idx = next((i for i, m in enumerate(month_options) if m['value'] == default_end), 36)

col1, col2 = st.columns(2)
with col1:
    start_month = st.selectbox(
        "Start Month",
        options=range(len(month_options)),
        format_func=lambda i: month_options[i]['label'],
        index=default_start_idx,
        help="First month to include in forecast"
    )
    start_date = month_options[start_month]['value']
    
with col2:
    end_month = st.selectbox(
        "End Month",
        options=range(len(month_options)),
        format_func=lambda i: month_options[i]['label'],
        index=default_end_idx,
        help="Last month to include in forecast"
    )
    end_date = month_options[end_month]['value']

# Validate range
if end_date < start_date:
    st.error("⚠️ End month must be after start month")
    st.stop()

# Metric toggle
metric_type = st.radio(
    "Display Metric",
    ["Billable Hours", "Billable Revenue ($)"],
    horizontal=True,
    help="Choose between hours or revenue view"
)

if st.button("📊 Generate Revenue Forecast", type="primary"):
    
    # ============================================================
    # PHASE 1: LOAD ASSIGNMENTS DATA
    # ============================================================
    
    with st.spinner("📡 Loading assignment data..."):
        assignments_df = sheets.read_config(CONFIG_SHEET_ID, "Assignments")
        
        if assignments_df is None or assignments_df.empty:
            st.error("❌ Could not load Assignments data")
            st.stop()
        
        st.success(f"✅ Loaded {len(assignments_df)} assignment rows")
        
        # Load FixedFee tab
        fixedfee_df = sheets.read_config(CONFIG_SHEET_ID, "FixedFee")
        
        if fixedfee_df is not None and not fixedfee_df.empty:
            st.success(f"✅ Loaded {len(fixedfee_df)} fixed fee project rows")
        else:
            st.warning("⚠️ No FixedFee data found - Section 2 will match Section 1")
            fixedfee_df = pd.DataFrame()
    
    # ============================================================
    # PHASE 2: LOAD BIGTIME ACTUALS (for past months)
    # ============================================================
    
    with st.spinner("📡 Loading BigTime actuals..."):
        # Determine which years we need based on date range
        years_needed = list(range(start_date.year, end_date.year + 1))
        bt_time_list = []
        
        for year in years_needed:
            bt_year = bigtime.get_time_report(year)
            if bt_year is not None and not bt_year.empty:
                bt_time_list.append(bt_year)
        
        if bt_time_list:
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
            project_id_col = next((c for c in ['tmprojectnm_id', 'Project_ID'] if c in bt_time.columns), None)
            hours_col = next((c for c in ['tmhrsin', 'Hours'] if c in bt_time.columns), None)
            
            # Normalize
            bt_time['Date'] = pd.to_datetime(bt_time[date_col])
            bt_time['Project_ID'] = bt_time[project_id_col].apply(normalize_project_id)
            bt_time['Hours'] = pd.to_numeric(bt_time[hours_col], errors='coerce').fillna(0)
            bt_time['Month'] = bt_time['Date'].dt.to_period('M')
            
            st.success(f"✅ Loaded {len(bt_time)} BigTime entries")
        else:
            bt_time = pd.DataFrame()
            st.warning("⚠️ No BigTime data available")
    
    # ============================================================
    # PHASE 3: PROCESS ASSIGNMENTS
    # ============================================================
    
    with st.spinner("🔨 Building project forecast..."):
        
        # Normalize Project IDs
        assignments_df['Project_ID_Norm'] = assignments_df['Project ID'].apply(normalize_project_id)
        
        # Identify month columns in Assignments
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
        
        # Process FixedFee tab
        fixedfee_lookup = {}
        
        if not fixedfee_df.empty:
            # Normalize Project IDs in FixedFee
            fixedfee_df['Project_ID_Norm'] = fixedfee_df['Project ID'].apply(normalize_project_id)
            
            # Identify month columns in FixedFee
            fixedfee_standard_cols = ['Client', 'Project Name', 'Project ID', 'Project Status', 'Total']
            fixedfee_month_cols = []
            
            for col in fixedfee_df.columns:
                if col not in fixedfee_standard_cols:
                    try:
                        col_date = pd.to_datetime(col)
                        fixedfee_month_cols.append({
                            'column': col,
                            'date': col_date,
                            'period': col_date.to_period('M')
                        })
                    except:
                        pass
            
            fixedfee_month_cols = sorted(fixedfee_month_cols, key=lambda x: x['date'])
            
            # Build lookup: project_id -> {period: revenue}
            for _, row in fixedfee_df.iterrows():
                project_id = row['Project_ID_Norm']
                if not project_id:
                    continue
                
                fixedfee_lookup[project_id] = {}
                
                for m in fixedfee_month_cols:
                    revenue = pd.to_numeric(row.get(m['column'], 0), errors='coerce')
                    if pd.isna(revenue):
                        revenue = 0
                    
                    if revenue > 0:
                        fixedfee_lookup[project_id][m['period']] = revenue
        
        # Build project-level data
        projects = {}
        
        for _, row in assignments_df.iterrows():
            project_id = row['Project_ID_Norm']
            client = row.get('Client')
            project_name = row.get('Project Name')
            bill_rate = pd.to_numeric(row.get('Bill Rate', 0), errors='coerce')
            
            if not project_id or pd.isna(bill_rate) or bill_rate == 0:
                continue
            
            # Initialize project if first time seeing it
            if project_id not in projects:
                projects[project_id] = {
                    'Project_ID': project_id,
                    'Client': client,
                    'Project_Name': project_name,
                    'Monthly_Plan': {},
                    'Weighted_Rates': []
                }
            
            # Aggregate monthly hours and rates
            for m in month_cols:
                hours = pd.to_numeric(row.get(m['column'], 0), errors='coerce')
                if pd.isna(hours):
                    hours = 0
                
                if hours > 0:
                    period = m['period']
                    if period not in projects[project_id]['Monthly_Plan']:
                        projects[project_id]['Monthly_Plan'][period] = {
                            'hours': 0,
                            'weighted_rate_hours': []
                        }
                    
                    projects[project_id]['Monthly_Plan'][period]['hours'] += hours
                    projects[project_id]['Monthly_Plan'][period]['weighted_rate_hours'].append({
                        'rate': bill_rate,
                        'hours': hours
                    })
        
        # Calculate weighted average rates per project per month
        for project_id, proj in projects.items():
            for period, data in proj['Monthly_Plan'].items():
                if data['weighted_rate_hours']:
                    total_weighted = sum(r['rate'] * r['hours'] for r in data['weighted_rate_hours'])
                    total_hours = sum(r['hours'] for r in data['weighted_rate_hours'])
                    data['avg_rate'] = total_weighted / total_hours if total_hours > 0 else 0
                else:
                    data['avg_rate'] = 0
        
        # Get BigTime actuals aggregated by project and month
        bt_actuals = {}
        if not bt_time.empty:
            bt_monthly = bt_time.groupby(['Project_ID', 'Month'])['Hours'].sum().reset_index()
            
            for _, row in bt_monthly.iterrows():
                project_id = row['Project_ID']
                period = row['Month']
                hours = row['Hours']
                
                if project_id not in bt_actuals:
                    bt_actuals[project_id] = {}
                bt_actuals[project_id][period] = hours
        
        # Build forecast table
        current_month_period = pd.Period(datetime.now(), freq='M')
        
        # Generate list of months in forecast range
        forecast_months = []
        current = pd.Period(start_date, freq='M')
        end = pd.Period(end_date, freq='M')
        
        while current <= end:
            forecast_months.append(current)
            current += 1
        
        # Build results for Section 1 (Hours-Based)
        results_section1 = []
        
        for project_id, proj in projects.items():
            row_data = {
                'Client': proj['Client'],
                'Project': proj['Project_Name'],
                'Project_ID': project_id
            }
            
            # Add data for each month
            for period in forecast_months:
                month_label = period.strftime('%Y-%m')
                
                # Determine if this is past, current, or future month
                if period < current_month_period:
                    # Past month - use BigTime actuals
                    if project_id in bt_actuals and period in bt_actuals[project_id]:
                        hours = bt_actuals[project_id][period]
                        # Get rate from plan if available, otherwise estimate
                        if period in proj['Monthly_Plan']:
                            rate = proj['Monthly_Plan'][period]['avg_rate']
                        else:
                            rate = 0
                        row_data[month_label] = hours if metric_type == "Billable Hours" else hours * rate
                    else:
                        row_data[month_label] = 0
                else:
                    # Current or future month - use Assignments plan
                    if period in proj['Monthly_Plan']:
                        hours = proj['Monthly_Plan'][period]['hours']
                        rate = proj['Monthly_Plan'][period]['avg_rate']
                        row_data[month_label] = hours if metric_type == "Billable Hours" else hours * rate
                    else:
                        row_data[month_label] = 0
            
            results_section1.append(row_data)
        
        results_section1_df = pd.DataFrame(results_section1)
        
        # Build results for Section 2 (Fixed Fee Reflected)
        results_section2 = []
        
        for project_id, proj in projects.items():
            row_data = {
                'Client': proj['Client'],
                'Project': proj['Project_Name'],
                'Project_ID': project_id
            }
            
            # Check if this is a fixed fee project
            is_fixed_fee = project_id in fixedfee_lookup
            
            # Add data for each month
            for period in forecast_months:
                month_label = period.strftime('%Y-%m')
                
                if metric_type == "Billable Hours":
                    # Hours view: Same as Section 1
                    if period < current_month_period:
                        # Past month - use BigTime actuals
                        if project_id in bt_actuals and period in bt_actuals[project_id]:
                            hours = bt_actuals[project_id][period]
                            row_data[month_label] = hours
                        else:
                            row_data[month_label] = 0
                    else:
                        # Current or future month - use Assignments plan
                        if period in proj['Monthly_Plan']:
                            hours = proj['Monthly_Plan'][period]['hours']
                            row_data[month_label] = hours
                        else:
                            row_data[month_label] = 0
                else:
                    # Revenue ($) view
                    if is_fixed_fee:
                        # Use FixedFee tab revenue
                        if period in fixedfee_lookup[project_id]:
                            row_data[month_label] = fixedfee_lookup[project_id][period]
                        else:
                            row_data[month_label] = 0
                    else:
                        # T&M project - same as Section 1
                        if period < current_month_period:
                            # Past month - use BigTime actuals
                            if project_id in bt_actuals and period in bt_actuals[project_id]:
                                hours = bt_actuals[project_id][period]
                                if period in proj['Monthly_Plan']:
                                    rate = proj['Monthly_Plan'][period]['avg_rate']
                                else:
                                    rate = 0
                                row_data[month_label] = hours * rate
                            else:
                                row_data[month_label] = 0
                        else:
                            # Current or future month - use Assignments plan
                            if period in proj['Monthly_Plan']:
                                hours = proj['Monthly_Plan'][period]['hours']
                                rate = proj['Monthly_Plan'][period]['avg_rate']
                                row_data[month_label] = hours * rate
                            else:
                                row_data[month_label] = 0
            
            results_section2.append(row_data)
        
        results_section2_df = pd.DataFrame(results_section2)
        
        # ============================================================
        # BUILD SECTION 3: PIPELINE DEALS
        # ============================================================
        
        results_section3 = []
        
        if PIPEDRIVE_API_TOKEN:
            with st.spinner("📡 Loading pipeline deals from Pipedrive..."):
                pipeline_deals = fetch_pipedrive_deals()
                
                if pipeline_deals:
                    st.success(f"✅ Loaded {len(pipeline_deals)} pipeline deals")
                    
                    # Get custom field keys
                    custom_fields = get_pipedrive_custom_field_keys()
                    
                    for deal in pipeline_deals:
                        org_name = deal.get('org_id', {}).get('name', 'Unknown') if isinstance(deal.get('org_id'), dict) else 'Unknown'
                        deal_name = deal.get('title', 'Unknown')
                        deal_value = deal.get('value', 0)
                        
                        # Get start date and duration from custom fields
                        start_date_str = None
                        duration_months = 3  # Default
                        
                        if 'project_start_date' in custom_fields:
                            start_date_str = deal.get(custom_fields['project_start_date'])
                        
                        if 'project_duration' in custom_fields:
                            duration = deal.get(custom_fields['project_duration'])
                            if duration:
                                try:
                                    duration_months = int(duration)
                                except:
                                    duration_months = 3
                        
                        # Determine start month
                        if start_date_str:
                            try:
                                project_start = pd.to_datetime(start_date_str)
                                start_period = pd.Period(project_start, freq='M')
                            except:
                                # Fall back to close date + 1 month
                                close_date_str = deal.get('expected_close_date') or deal.get('close_time')
                                if close_date_str:
                                    close_date = pd.to_datetime(close_date_str)
                                    start_period = pd.Period(close_date, freq='M') + 1
                                else:
                                    continue  # Skip if no dates
                        else:
                            # Use close date + 1 month
                            close_date_str = deal.get('expected_close_date') or deal.get('close_time')
                            if close_date_str:
                                close_date = pd.to_datetime(close_date_str)
                                start_period = pd.Period(close_date, freq='M') + 1
                            else:
                                continue  # Skip if no dates
                        
                        # Straight-line monthly revenue
                        monthly_revenue = deal_value / duration_months if duration_months > 0 else deal_value
                        
                        # Build row
                        row_data = {
                            'Client': org_name,
                            'Project': deal_name
                        }
                        
                        # Add monthly revenue for duration
                        for period in forecast_months:
                            month_label = period.strftime('%Y-%m')
                            
                            # Check if this month falls within the project duration
                            if start_period <= period < (start_period + duration_months):
                                if metric_type == "Billable Hours":
                                    row_data[month_label] = 0  # No hours for pipeline
                                else:
                                    row_data[month_label] = monthly_revenue
                            else:
                                row_data[month_label] = 0
                        
                        results_section3.append(row_data)
                else:
                    st.warning("⚠️ Could not load Pipedrive pipeline deals")
        else:
            st.info("ℹ️ Pipedrive API token not configured - Section 3 will be empty")
        
        results_section3_df = pd.DataFrame(results_section3)
        
        # ============================================================
        # BUILD SECTION 4: PIPELINE DEALS WITH FACTORING
        # ============================================================
        
        results_section4 = []
        
        if PIPEDRIVE_API_TOKEN and pipeline_deals:
            for deal in pipeline_deals:
                org_name = deal.get('org_id', {}).get('name', 'Unknown') if isinstance(deal.get('org_id'), dict) else 'Unknown'
                deal_name = deal.get('title', 'Unknown')
                deal_value = deal.get('value', 0)
                
                # Get stage name for probability factor
                stage_name = deal.get('stage_id', {}).get('name', '') if isinstance(deal.get('stage_id'), dict) else ''
                probability_factor = get_deal_probability_factor(stage_name)
                
                # Get start date and duration from custom fields (same logic as Section 3)
                start_date_str = None
                duration_months = 3  # Default
                
                if 'project_start_date' in custom_fields:
                    start_date_str = deal.get(custom_fields['project_start_date'])
                
                if 'project_duration' in custom_fields:
                    duration = deal.get(custom_fields['project_duration'])
                    if duration:
                        try:
                            duration_months = int(duration)
                        except:
                            duration_months = 3
                
                # Determine start month (same logic as Section 3)
                if start_date_str:
                    try:
                        project_start = pd.to_datetime(start_date_str)
                        start_period = pd.Period(project_start, freq='M')
                    except:
                        close_date_str = deal.get('expected_close_date') or deal.get('close_time')
                        if close_date_str:
                            close_date = pd.to_datetime(close_date_str)
                            start_period = pd.Period(close_date, freq='M') + 1
                        else:
                            continue
                else:
                    close_date_str = deal.get('expected_close_date') or deal.get('close_time')
                    if close_date_str:
                        close_date = pd.to_datetime(close_date_str)
                        start_period = pd.Period(close_date, freq='M') + 1
                    else:
                        continue
                
                # Factored deal value
                factored_value = deal_value * probability_factor
                
                # Straight-line monthly revenue (factored)
                monthly_revenue = factored_value / duration_months if duration_months > 0 else factored_value
                
                # Build row
                row_data = {
                    'Client': org_name,
                    'Project': deal_name,
                    'Factor': f"{int(probability_factor * 100)}%"
                }
                
                # Add monthly revenue for duration
                for period in forecast_months:
                    month_label = period.strftime('%Y-%m')
                    
                    # Check if this month falls within the project duration
                    if start_period <= period < (start_period + duration_months):
                        if metric_type == "Billable Hours":
                            row_data[month_label] = 0  # No hours for pipeline
                        else:
                            row_data[month_label] = monthly_revenue
                    else:
                        row_data[month_label] = 0
                
                results_section4.append(row_data)
        
        results_section4_df = pd.DataFrame(results_section4)
        
        st.success(f"✅ Generated forecast for {len(results_section1_df)} projects")
    
    # ============================================================
    # DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Project Revenue Forecast")
    st.caption(f"Period: {start_date.strftime('%Y-%m')} to {end_date.strftime('%Y-%m')}")
    
    st.info("📊 = Actual (BigTime) | 📅 = Plan (Assignments)")
    
    # ============================================================
    # SECTION 1: Hours-Based Revenue
    # ============================================================
    
    st.subheader("Section 1: Revenue and Hours Forecast - Based Upon Hours")
    st.caption("All projects: Revenue = Hours × Bill Rate")
    
    # Add totals row for Section 1
    totals_row_s1 = {
        'Client': '---',
        'Project': 'TOTAL',
        'Project_ID': ''
    }
    for period in forecast_months:
        month_label = period.strftime('%Y-%m')
        totals_row_s1[month_label] = results_section1_df[month_label].sum()
    
    # Append totals row
    display_s1_df = pd.concat([results_section1_df, pd.DataFrame([totals_row_s1])], ignore_index=True)
    
    # Format display
    if metric_type == "Billable Hours":
        st.dataframe(
            display_s1_df.style.format({
                col: '{:.1f}' for col in display_s1_df.columns if col not in ['Client', 'Project', 'Project_ID']
            }),
            hide_index=True,
            use_container_width=True,
            height=400
        )
    else:
        st.dataframe(
            display_s1_df.style.format({
                col: '${:,.0f}' for col in display_s1_df.columns if col not in ['Client', 'Project', 'Project_ID']
            }),
            hide_index=True,
            use_container_width=True,
            height=400
        )
    
    st.divider()
    
    # ============================================================
    # SECTION 2: Fixed Fee Reflected
    # ============================================================
    
    st.subheader("Section 2: Revenue and Hours Forecast - Fixed Fees Reflected")
    if metric_type == "Billable Hours":
        st.caption("Hours view: Same as Section 1")
    else:
        st.caption("Revenue view: Fixed fee projects use FixedFee tab schedule, T&M projects use Hours × Rate")
    
    # Add totals row for Section 2
    totals_row_s2 = {
        'Client': '---',
        'Project': 'TOTAL',
        'Project_ID': ''
    }
    for period in forecast_months:
        month_label = period.strftime('%Y-%m')
        totals_row_s2[month_label] = results_section2_df[month_label].sum()
    
    # Append totals row
    display_s2_df = pd.concat([results_section2_df, pd.DataFrame([totals_row_s2])], ignore_index=True)
    
    # Format display
    if metric_type == "Billable Hours":
        st.dataframe(
            display_s2_df.style.format({
                col: '{:.1f}' for col in display_s2_df.columns if col not in ['Client', 'Project', 'Project_ID']
            }),
            hide_index=True,
            use_container_width=True,
            height=400
        )
    else:
        st.dataframe(
            display_s2_df.style.format({
                col: '${:,.0f}' for col in display_s2_df.columns if col not in ['Client', 'Project', 'Project_ID']
            }),
            hide_index=True,
            use_container_width=True,
            height=400
        )
    
    st.divider()
    
    # ============================================================
    # SECTION 3: PIPELINE DEALS
    # ============================================================
    
    if not results_section3_df.empty:
        st.subheader("Section 3: Higher Probability Deals (Without Factoring)")
        if metric_type == "Billable Hours":
            st.caption("Hours view: Pipeline deals have no hours assigned")
        else:
            st.caption("Revenue view: Deal value spread evenly across project duration (no probability factoring)")
        
        # Add totals row for Section 3
        totals_row_s3 = {
            'Client': '---',
            'Project': 'TOTAL'
        }
        for period in forecast_months:
            month_label = period.strftime('%Y-%m')
            totals_row_s3[month_label] = results_section3_df[month_label].sum()
        
        # Append totals row
        display_s3_df = pd.concat([results_section3_df, pd.DataFrame([totals_row_s3])], ignore_index=True)
        
        # Format display
        if metric_type == "Billable Hours":
            st.dataframe(
                display_s3_df.style.format({
                    col: '{:.1f}' for col in display_s3_df.columns if col not in ['Client', 'Project']
                }),
                hide_index=True,
                use_container_width=True,
                height=400
            )
        else:
            st.dataframe(
                display_s3_df.style.format({
                    col: '${:,.0f}' for col in display_s3_df.columns if col not in ['Client', 'Project']
                }),
                hide_index=True,
                use_container_width=True,
                height=400
            )
        
        st.divider()
    
    # ============================================================
    # SECTION 4: PIPELINE DEALS WITH FACTORING
    # ============================================================
    
    if not results_section4_df.empty:
        st.subheader("Section 4: Higher Probability Deals (With Factoring)")
        if metric_type == "Billable Hours":
            st.caption("Hours view: Pipeline deals have no hours assigned")
        else:
            st.caption("Revenue view: Deal values factored by probability (Forecast=75%, Proposal/SOW/Resourcing=50%, Qualified=33%)")
        
        # Add totals row for Section 4
        totals_row_s4 = {
            'Client': '---',
            'Project': 'TOTAL',
            'Factor': ''
        }
        for period in forecast_months:
            month_label = period.strftime('%Y-%m')
            totals_row_s4[month_label] = results_section4_df[month_label].sum()
        
        # Append totals row
        display_s4_df = pd.concat([results_section4_df, pd.DataFrame([totals_row_s4])], ignore_index=True)
        
        # Format display
        if metric_type == "Billable Hours":
            st.dataframe(
                display_s4_df.style.format({
                    col: '{:.1f}' for col in display_s4_df.columns if col not in ['Client', 'Project', 'Factor']
                }),
                hide_index=True,
                use_container_width=True,
                height=400
            )
        else:
            st.dataframe(
                display_s4_df.style.format({
                    col: '${:,.0f}' for col in display_s4_df.columns if col not in ['Client', 'Project', 'Factor']
                }),
                hide_index=True,
                use_container_width=True,
                height=400
            )
        
        st.divider()
    
    # Excel export
    st.divider()
    st.subheader("📥 Export Forecast")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            display_s1_df.to_excel(writer, sheet_name='Section_1_Hours_Based', index=False)
            display_s2_df.to_excel(writer, sheet_name='Section_2_Fixed_Fee', index=False)
            
            if not results_section3_df.empty:
                display_s3_df.to_excel(writer, sheet_name='Section_3_Pipeline', index=False)
            
            if not results_section4_df.empty:
                display_s4_df.to_excel(writer, sheet_name='Section_4_Pipeline_Factored', index=False)
        
        excel_data = output.getvalue()
        filename = f"revenue_forecast_{start_date.strftime('%Y%m')}_{end_date.strftime('%Y%m')}.xlsx"
        
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
    st.info("👆 Select forecast period and click the button to generate report")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        ### Revenue Forecaster
        
        This app creates a project-level revenue forecast by combining actual performance with planned work.
        
        **Data Sources:**
        
        1. **Past Months (📊 Actual):**
           - Hours: BigTime actuals
           - Revenue: BigTime hours × Bill rate from Assignments
        
        2. **Current & Future Months (📅 Plan):**
           - Hours: Planned hours from Assignments sheet
           - Revenue: Planned hours × Bill rate from Assignments
        
        **Display Options:**
        
        - **Billable Hours:** Show hours by project by month
        - **Billable Revenue ($):** Show revenue by project by month
        
        **Sections:**
        
        - **Section 1:** Project-level detail (one row per project)
        - **Section 2:** Monthly totals (sum across all projects)
        
        **Use Cases:**
        
        - Revenue forecasting and planning
        - Project pipeline visibility
        - Capacity planning
        - Budget tracking
        """)
