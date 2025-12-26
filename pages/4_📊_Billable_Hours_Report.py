"""
Billable Hours Report
Generates monthly billable hours report with capacity analysis
"""

import streamlit as st
import pandas as pd
import calendar
from datetime import date, datetime, timedelta
from io import BytesIO
import sys
sys.path.append('/home/claude')

from functions import auth, sheets

# Authentication
if not auth.check_auth():
    st.stop()

st.title("📊 Billable Hours Report")

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


# Federal holidays for capacity calculation
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

FEDERAL_HOLIDAYS_2024 = [
    date(2024, 1, 1),
    date(2024, 1, 15),
    date(2024, 2, 19),
    date(2024, 5, 27),
    date(2024, 6, 19),
    date(2024, 7, 4),
    date(2024, 9, 2),
    date(2024, 10, 14),
    date(2024, 11, 11),
    date(2024, 11, 28),
    date(2024, 12, 25),
]


def calculate_monthly_capacity(year, month):
    """Calculate billable hours capacity for a given month"""
    # Determine which holiday list to use
    if year == 2025:
        federal_holidays = FEDERAL_HOLIDAYS_2025
    elif year == 2024:
        federal_holidays = FEDERAL_HOLIDAYS_2024
    else:
        federal_holidays = []
    
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
        # Try to load from Google Sheets first
        # TODO: Add Google Sheets integration
        # For now, using uploaded file
        staff_df = pd.read_excel('/mnt/user-data/uploads/Voyage_Global_Config.xlsx', sheet_name='Staff')
        active_employees = set(staff_df['Staff_Name'].tolist())
        return active_employees
    except Exception as e:
        st.error(f"Error loading staff configuration: {str(e)}")
        return set()


def classify_staff(name, active_employees, has_billable_hours):
    """
    Classify staff as Active Employee, Contractor, or Inactive
    
    Logic:
    1. If in Voyage_Global_Config Staff tab → Active Employee
    2. If has billable hours but not in config → Contractor  
    3. Otherwise → Inactive
    
    Args:
        name: Staff member name
        active_employees: Set of active employee names from config
        has_billable_hours: Whether they have any billable hours in the period
    
    Returns:
        str: 'Active Employee', 'Contractor', or 'Inactive'
    """
    if name in active_employees:
        return 'Active Employee'
    elif has_billable_hours:
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
    with st.spinner("Fetching data from BigTime..."):
        try:
            # Load active employees from config
            active_employees = load_active_employees()
            st.info(f"Loaded {len(active_employees)} active employees from Voyage_Global_Config")
            
            # Get BigTime data
            # For now, using uploaded sample file
            # TODO: Replace with BigTime API call
            df = pd.read_excel('/mnt/user-data/uploads/DetailedTimeReport-ACSw_paid__1_.xls')
            
            # Convert date column
            df['Date'] = pd.to_datetime(df['Date'])
            
            # Filter to date range
            df = df[(df['Date'] >= pd.Timestamp(start_date)) & (df['Date'] <= pd.Timestamp(end_date))]
            
            # Filter to billable hours only
            df = df[df['Billable'] > 0].copy()
            
            st.success(f"Loaded {len(df):,} billable time entries")
            
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
            
            # Classify staff
            staff_classifications = {}
            for name in pivot.index:
                if name != 'OVERALL TOTALS':
                    has_billable = pivot.loc[name, 'Total'] > 0
                    staff_classifications[name] = classify_staff(name, active_employees, has_billable)
            
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
            
            # Display results by category
            st.header("Billable Hours Report")
            st.subheader(f"{start_date.strftime('%B %Y')} - {end_date.strftime('%B %Y')}")
            
            # Create styled dataframe for each category
            for category in ['Active Employee', 'Contractor', 'Inactive']:
                staff_in_category = [k for k, v in staff_classifications.items() if v == category]
                
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
                
                styled = display_df.style.apply(style_category, axis=1)
                st.dataframe(styled, use_container_width=True)
            
            # Show capacity reference
            st.subheader("Monthly Capacity Reference")
            capacity_df = pd.DataFrame({
                'Month': [f"{calendar.month_abbr[m['month']]}-{m['year'] % 100}" for m in month_cols],
                'Monthly Capacity': [monthly_capacity[pd.Period(f"{m['year']}-{m['month']:02d}", freq='M')] for m in month_cols],
                'Capacity @ 1840': [153.33] * len(month_cols),
                'Capacity * 80%': [capacity_80[pd.Period(f"{m['year']}-{m['month']:02d}", freq='M')] for m in month_cols]
            })
            st.dataframe(capacity_df, use_container_width=True)
            
            # Export to Excel
            st.subheader("Export Report")
            
            output = BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                # Write each category to separate sheet
                for category in ['Active Employee', 'Contractor', 'Inactive']:
                    staff_in_category = [k for k, v in staff_classifications.items() if v == category]
                    if staff_in_category:
                        category_data = pivot.loc[staff_in_category]
                        category_data.to_excel(writer, sheet_name=category.replace(' ', '_'))
                
                # Write capacity reference
                capacity_df.to_excel(writer, sheet_name='Capacity_Reference', index=False)
            
            output.seek(0)
            
            st.download_button(
                label="📥 Download Excel Report",
                data=output,
                file_name=f"billable_hours_report_{start_date.strftime('%Y%m')}-{end_date.strftime('%Y%m')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            
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
