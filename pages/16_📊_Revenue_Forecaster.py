"""
Revenue Forecaster
Project-level revenue forecast combining BigTime actuals (past) with Assignment plan (future)
"""

import streamlit as st
import pandas as pd
import sys
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
    
    # Show variance if revenue view
    if metric_type == "Billable Revenue ($)":
        st.divider()
        st.subheader("📊 Revenue Timing Impact")
        
        variance_data = {'Metric': 'Variance (Section 2 - Section 1)'}
        for period in forecast_months:
            month_label = period.strftime('%Y-%m')
            variance_data[month_label] = totals_row_s2[month_label] - totals_row_s1[month_label]
        
        variance_df = pd.DataFrame([variance_data])
        
        st.dataframe(
            variance_df.style.format({
                col: '${:+,.0f}' for col in variance_df.columns if col != 'Metric'
            }),
            hide_index=True,
            use_container_width=True
        )
        
        st.caption("Positive = Fixed fee timing creates revenue acceleration | Negative = Fixed fee timing creates revenue delay")
    
    # Excel export
    st.divider()
    st.subheader("📥 Export Forecast")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            display_s1_df.to_excel(writer, sheet_name='Section_1_Hours_Based', index=False)
            display_s2_df.to_excel(writer, sheet_name='Section_2_Fixed_Fee', index=False)
            
            if metric_type == "Billable Revenue ($)":
                variance_df.to_excel(writer, sheet_name='Revenue_Timing_Impact', index=False)
        
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
