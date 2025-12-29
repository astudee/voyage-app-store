"""
Forecasted Billable Hours Report
Generates forward-looking billable hours and revenue forecast from assignment data
"""

import streamlit as st
import pandas as pd
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from io import BytesIO

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

st.set_page_config(page_title="Forecasted Billable Hours", page_icon="📈", layout="wide")

# Config from secrets
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
except:
    import credentials
    CONFIG_SHEET_ID = credentials.get("SHEET_CONFIG_ID")

import sys
sys.path.append('./functions')
import sheets

st.title("📈 Forecasted Billable Hours & Revenue")
st.markdown("Forward-looking forecast based on project assignments")

# ============================================================
# DATE RANGE SELECTION
# ============================================================

st.subheader("Forecast Period")

# Default: Current month to 12 months out
today = date.today()
default_start = date(today.year, today.month, 1)  # First day of current month
default_end = default_start + relativedelta(months=12)

col1, col2 = st.columns(2)
with col1:
    start_date = st.date_input(
        "Start Month",
        value=default_start,
        min_value=default_start,  # Cannot select past months
        help="Forecast starts from current month or later"
    )
with col2:
    end_date = st.date_input(
        "End Month", 
        value=default_end,
        min_value=default_start,
        help="Last month to include in forecast"
    )

# Metric toggle
metric_type = st.radio(
    "Display Metric",
    ["Billable Hours", "Billable Revenue ($)"],
    horizontal=True,
    help="Choose between hours or revenue view"
)

if st.button("🚀 Generate Forecast", type="primary"):
    
    # ============================================================
    # LOAD ASSIGNMENTS DATA
    # ============================================================
    
    with st.spinner("📡 Loading assignment data..."):
        assignments_df = sheets.read_config(CONFIG_SHEET_ID, "Assignments")
        
        if assignments_df is None or assignments_df.empty:
            st.error("❌ Could not load Assignments data from Voyage_Global_Config")
            st.stop()
        
        st.success(f"✅ Loaded {len(assignments_df)} assignment rows")
    
    # ============================================================
    # LOAD STAFF LIST
    # ============================================================
    
    with st.spinner("📡 Loading staff list..."):
        staff_df = sheets.read_config(CONFIG_SHEET_ID, "Staff")
        
        if staff_df is None or staff_df.empty:
            st.warning("⚠️ Could not load Staff list")
            employee_names = []
        else:
            employee_names = staff_df['Staff_Name'].tolist()
    
    # ============================================================
    # PROCESS ASSIGNMENTS DATA
    # ============================================================
    
    with st.spinner("🔨 Processing forecast data..."):
        # Identify month columns (format: 2026-01, 2026-02, etc.)
        # These should be after the standard columns
        standard_cols = ['Client', 'Project Name', 'Project ID', 'Staff Member', 'Bill Rate', 'Project Status', 'Total', '2025']
        
        month_cols = []
        for col in assignments_df.columns:
            # Month columns look like: 2026-01, 2026-02, etc.
            if isinstance(col, str) and '-' in col and col not in standard_cols:
                try:
                    # Try to parse as YYYY-MM
                    year, month = col.split('-')
                    if len(year) == 4 and len(month) == 2:
                        month_cols.append({
                            'column': col,
                            'year': int(year),
                            'month': int(month),
                            'date': date(int(year), int(month), 1)
                        })
                except:
                    pass
        
        # Sort month columns chronologically
        month_cols = sorted(month_cols, key=lambda x: x['date'])
        
        # Filter to selected date range
        filtered_months = [
            m for m in month_cols
            if m['date'] >= date(start_date.year, start_date.month, 1) and
               m['date'] <= date(end_date.year, end_date.month, 1)
        ]
        
        if not filtered_months:
            st.error("❌ No data found for selected date range")
            st.stop()
        
        # Calculate expected months in range
        from dateutil.relativedelta import relativedelta
        expected_months = []
        current = date(start_date.year, start_date.month, 1)
        end_month = date(end_date.year, end_date.month, 1)
        while current <= end_month:
            expected_months.append(current)
            current = current + relativedelta(months=1)
        
        # Warn if missing months
        if len(filtered_months) < len(expected_months):
            missing_count = len(expected_months) - len(filtered_months)
            st.warning(f"""
⚠️ **Missing Data Columns**

Your Assignments sheet is missing {missing_count} month column(s) for your selected date range.

**To fix:** Add month columns (format: YYYY-MM) to the Assignments sheet for the missing months.

Currently showing only months that have data columns.
            """)
            
            with st.expander("📋 Details: Which months are missing?"):
                available = [m['column'] for m in filtered_months]
                available_dates = set([m['column'] for m in filtered_months])
                expected_dates = [d.strftime('%Y-%m') for d in expected_months]
                missing_dates = [d for d in expected_dates if d not in available_dates]
                
                st.write(f"**Selected range:** {start_date.strftime('%Y-%m')} to {end_date.strftime('%Y-%m')} ({len(expected_months)} months)")
                st.write(f"**Available in sheet:** {filtered_months[0]['column']} to {filtered_months[-1]['column']} ({len(filtered_months)} months)")
                st.write(f"**Missing columns:** {', '.join(missing_dates)}")
        
        # Build forecast data
        forecast_data = []
        
        for _, row in assignments_df.iterrows():
            staff_member = row.get('Staff Member', '')
            bill_rate = pd.to_numeric(row.get('Bill Rate', 0), errors='coerce')
            
            if pd.isna(staff_member) or not staff_member:
                continue
            
            # Classify as employee or contractor
            is_employee = staff_member in employee_names
            
            for month_info in filtered_months:
                col_name = month_info['column']
                hours = pd.to_numeric(row.get(col_name, 0), errors='coerce')
                
                if pd.isna(hours):
                    hours = 0
                
                if hours > 0:
                    revenue = hours * bill_rate if not pd.isna(bill_rate) else 0
                    
                    forecast_data.append({
                        'Staff': staff_member,
                        'Classification': 'Active Employee' if is_employee else 'Contractor',
                        'Month': month_info['column'],
                        'Month_Date': month_info['date'],
                        'Hours': hours,
                        'Revenue': revenue
                    })
        
        forecast_df = pd.DataFrame(forecast_data)
        
        if forecast_df.empty:
            st.warning("⚠️ No forecast data found for selected period")
            st.stop()
        
        # Pivot data by staff and month
        pivot_hours = forecast_df.pivot_table(
            index=['Staff', 'Classification'],
            columns='Month',
            values='Hours',
            aggfunc='sum',
            fill_value=0
        )
        
        pivot_revenue = forecast_df.pivot_table(
            index=['Staff', 'Classification'],
            columns='Month',
            values='Revenue',
            aggfunc='sum',
            fill_value=0
        )
        
        # Add totals
        pivot_hours['Total'] = pivot_hours.sum(axis=1)
        pivot_revenue['Total'] = pivot_revenue.sum(axis=1)
        
        # Sort columns chronologically (months are already in order from filtered_months)
        month_order = [m['column'] for m in filtered_months]
        pivot_hours = pivot_hours[month_order + ['Total']]
        pivot_revenue = pivot_revenue[month_order + ['Total']]
        
        # Choose metric
        pivot = pivot_hours if metric_type == "Billable Hours" else pivot_revenue
        
        st.success(f"✅ Processed forecast for {len(pivot)} staff members")
    
    # ============================================================
    # DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Forecast Results")
    st.caption(f"Period: {start_date.strftime('%Y-%m')} to {end_date.strftime('%Y-%m')}")
    
    # Section 1: Active Employees
    st.subheader("1️⃣ Active Employees")
    
    employee_data = pivot[pivot.index.get_level_values('Classification') == 'Active Employee']
    
    if not employee_data.empty:
        # Reset index to make Staff a column
        employee_display = employee_data.reset_index()[['Staff'] + list(employee_data.columns)]
        
        # Format based on metric
        if metric_type == "Billable Hours":
            st.dataframe(
                employee_display.style.format({col: '{:.1f}' for col in employee_data.columns}),
                hide_index=True,
                use_container_width=True
            )
        else:
            st.dataframe(
                employee_display.style.format({col: '${:,.0f}' for col in employee_data.columns}),
                hide_index=True,
                use_container_width=True
            )
    else:
        st.info("No employee forecast data for this period")
    
    st.divider()
    
    # Section 2: Contractors
    st.subheader("2️⃣ Contractors")
    
    contractor_data = pivot[pivot.index.get_level_values('Classification') == 'Contractor']
    
    if not contractor_data.empty:
        # Reset index to make Staff a column
        contractor_display = contractor_data.reset_index()[['Staff'] + list(contractor_data.columns)]
        
        # Format based on metric
        if metric_type == "Billable Hours":
            st.dataframe(
                contractor_display.style.format({col: '{:.1f}' for col in contractor_data.columns}),
                hide_index=True,
                use_container_width=True
            )
        else:
            st.dataframe(
                contractor_display.style.format({col: '${:,.0f}' for col in contractor_data.columns}),
                hide_index=True,
                use_container_width=True
            )
    else:
        st.info("No contractor forecast data for this period")
    
    st.divider()
    
    # Section 3: Monthly Totals
    st.subheader("3️⃣ Monthly Totals")
    st.caption(f"Total {metric_type.lower()} by month across all staff")
    
    # Calculate totals by month
    monthly_totals = {}
    for month_col in [m['column'] for m in filtered_months]:
        if month_col in pivot.columns:
            monthly_totals[month_col] = pivot[month_col].sum()
    
    # Add grand total
    if 'Total' in pivot.columns:
        monthly_totals['Total'] = pivot['Total'].sum()
    
    # Create display dataframe
    monthly_totals_df = pd.DataFrame([monthly_totals])
    monthly_totals_df.insert(0, 'Metric', metric_type)
    
    # Format based on metric
    if metric_type == "Billable Hours":
        st.dataframe(
            monthly_totals_df.style.format({col: '{:.1f}' for col in monthly_totals.keys()}),
            hide_index=True,
            use_container_width=True
        )
    else:
        st.dataframe(
            monthly_totals_df.style.format({col: '${:,.0f}' for col in monthly_totals.keys()}),
            hide_index=True,
            use_container_width=True
        )
    
    # ============================================================
    # EXCEL EXPORT
    # ============================================================
    
    st.divider()
    st.subheader("📥 Export Forecast")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Employee sheet
            if not employee_data.empty:
                employee_export = employee_data.reset_index()
                employee_export.to_excel(writer, sheet_name='Active_Employees', index=False)
            
            # Contractor sheet
            if not contractor_data.empty:
                contractor_export = contractor_data.reset_index()
                contractor_export.to_excel(writer, sheet_name='Contractors', index=False)
            
            # Monthly Totals sheet
            monthly_totals_df.to_excel(writer, sheet_name='Monthly_Totals', index=False)
            
            # Combined sheet
            pivot_export = pivot.reset_index()
            pivot_export.to_excel(writer, sheet_name='All_Staff', index=False)
        
        excel_data = output.getvalue()
        
        metric_slug = "hours" if metric_type == "Billable Hours" else "revenue"
        filename = f"forecast_{metric_slug}_{start_date.strftime('%Y%m')}_{end_date.strftime('%Y%m')}.xlsx"
        
        st.download_button(
            label="📥 Download Excel Forecast",
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
    st.info("👆 Select forecast period and click the button to generate forecast")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app generates forward-looking billable hours and revenue forecasts based on project assignments.
        
        **Data Source:**
        - **Voyage_Global_Config** → **Assignments** tab
        - Contains planned hours per staff member per project per month
        
        **Key Features:**
        1. **Forward-Looking Only** - Cannot forecast the past (use Billable Hours Report for actuals)
        2. **Employee vs Contractor Sections** - Automatically categorized from Staff list
        3. **Hours or Revenue** - Toggle between billable hours and revenue forecast
        4. **Default Range** - Current month + 12 months
        
        **Revenue Calculation:**
        - Revenue = Hours × Bill Rate (from Assignments sheet)
        
        **Month Columns:**
        - Format: 2026-01, 2026-02, etc.
        - Values represent forecasted hours for that month
        """)
