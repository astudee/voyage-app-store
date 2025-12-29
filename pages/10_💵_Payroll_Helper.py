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
import sheets

st.set_page_config(page_title="Payroll Helper", page_icon="💵", layout="wide")

st.title("💵 Payroll Helper")
st.markdown("Prepare payroll data from BigTime for Gusto entry")

# Config from secrets
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
except:
    import credentials
    CONFIG_SHEET_ID = credentials.get("SHEET_CONFIG_ID")

# Date inputs
st.subheader("Payroll Period")
col1, col2 = st.columns(2)
with col1:
    start_date = st.date_input("Start Date", value=datetime(2024, 12, 11))
with col2:
    end_date = st.date_input("End Date", value=datetime(2024, 12, 24))

if st.button("🚀 Generate Payroll Report", type="primary"):
    
    debug_log = []
    
    # ============================================================
    # PHASE 1: LOAD STAFF LIST
    # ============================================================
    
    with st.spinner("📋 Loading staff list from Voyage_Global_Config..."):
        staff_df = sheets.read_config(CONFIG_SHEET_ID, "Staff")
        
        if staff_df is None or staff_df.empty:
            st.error("❌ Error: Could not load Staff sheet")
            st.stop()
        
        # Filter out inactive staff (those without a start date or with old start dates might be inactive)
        # Assuming if someone is in the sheet, they're active
        debug_log.append(f"✅ Loaded {len(staff_df)} staff members")
    
    # ============================================================
    # PHASE 2: PULL BIGTIME DATA
    # ============================================================
    
    with st.spinner("📡 Pulling time data from BigTime..."):
        # Get BigTime report for payroll period
        # Note: get_time_report takes a year parameter, so we'll pull the full year and filter
        bt_full = bigtime.get_time_report(start_date.year)
        
        if bt_full is None or bt_full.empty:
            st.error("❌ No BigTime data available")
            st.stop()
        
        debug_log.append(f"✅ Pulled {len(bt_full)} BigTime entries for full year")
        debug_log.append(f"📋 BigTime columns: {', '.join(bt_full.columns.tolist())}")
        
        # Find date column and filter to payroll period
        date_col = None
        for col in ['Date', 'tmdt']:
            if col in bt_full.columns:
                date_col = col
                break
        
        if date_col:
            bt_full['Date'] = pd.to_datetime(bt_full[date_col])
            bt_period = bt_full[
                (bt_full['Date'] >= pd.Timestamp(start_date)) & 
                (bt_full['Date'] <= pd.Timestamp(end_date))
            ].copy()
            
            # Also get YTD data for policy checks
            year_start = pd.Timestamp(start_date.year, 1, 1)
            bt_ytd = bt_full[
                (bt_full['Date'] >= year_start) & 
                (bt_full['Date'] <= pd.Timestamp(end_date))
            ].copy()
        else:
            st.error("❌ Could not find date column in BigTime data")
            st.stop()
        
        debug_log.append(f"✅ Pulled {len(bt_period)} BigTime entries for payroll period")
        debug_log.append(f"✅ Pulled {len(bt_ytd)} BigTime entries YTD")
    
    # ============================================================
    # PHASE 3: PROCESS PAYROLL PERIOD DATA
    # ============================================================
    
    with st.spinner("🔨 Processing payroll data..."):
        # Find column names first
        staff_col = None
        for col in ['Staff Member', 'Staff_Member', 'tmstaffnm']:
            if col in bt_period.columns:
                staff_col = col
                break
        
        project_col = None
        for col in ['Project', 'tmprojectnm']:
            if col in bt_period.columns:
                project_col = col
                break
        
        project_id_col = None
        for col in ['Project ID', 'Project_ID', 'tmprojectsid']:
            if col in bt_period.columns:
                project_id_col = col
                break
        
        hours_col = None
        for col in ['Billable', 'Hours', 'tmhrsbill']:
            if col in bt_period.columns:
                hours_col = col
                break
        
        # Debug: Show sample project values
        if project_id_col and project_id_col in bt_period.columns:
            sample_projects = bt_period[project_id_col].dropna().unique()[:10]
            debug_log.append(f"📋 Sample Project IDs: {', '.join([str(x) for x in sample_projects])}")
        
        if project_col and project_col in bt_period.columns:
            sample_projects = bt_period[project_col].dropna().unique()[:10]
            debug_log.append(f"📋 Sample Project Names: {', '.join([str(x) for x in sample_projects])}")
        
        if not all([staff_col, hours_col]):
            st.error("❌ Could not find required columns in BigTime data")
            st.stop()
        
        # Convert hours to numeric
        bt_period['Hours'] = pd.to_numeric(bt_period[hours_col], errors='coerce')
        bt_period['Staff'] = bt_period[staff_col]
        
        # Use project ID if available, otherwise project name
        if project_id_col:
            bt_period['Project_ID'] = pd.to_numeric(bt_period[project_id_col], errors='coerce')
            
            # Categorize by project ID
            bt_period['Category'] = 'Regular'
            bt_period.loc[bt_period['Project_ID'] == 7, 'Category'] = 'Paid Leave'
            bt_period.loc[bt_period['Project_ID'] == 10, 'Category'] = 'Sick Leave'
            bt_period.loc[bt_period['Project_ID'] == 13, 'Category'] = 'Unpaid Leave'
            bt_period.loc[bt_period['Project_ID'] == 62, 'Category'] = 'Holiday'
        elif project_col:
            bt_period['Project'] = bt_period[project_col]
            
            # Fallback to project name matching
            bt_period['Category'] = 'Regular'
            bt_period.loc[bt_period['Project'].str.contains('Paid Leave', case=False, na=False), 'Category'] = 'Paid Leave'
            bt_period.loc[bt_period['Project'].str.contains('Sick Leave', case=False, na=False), 'Category'] = 'Sick Leave'
            bt_period.loc[bt_period['Project'].str.contains('Holiday', case=False, na=False), 'Category'] = 'Holiday'
            bt_period.loc[bt_period['Project'].str.contains('Unpaid Leave', case=False, na=False), 'Category'] = 'Unpaid Leave'
        else:
            st.error("❌ Could not find project column in BigTime data")
            st.stop()
        
        # Aggregate by staff and category
        payroll_summary = bt_period.groupby(['Staff', 'Category'])['Hours'].sum().reset_index()
        payroll_pivot = payroll_summary.pivot(index='Staff', columns='Category', values='Hours').fillna(0)
        payroll_pivot = payroll_pivot.reset_index()
        
        # Ensure all columns exist
        for col in ['Regular', 'Paid Leave', 'Sick Leave', 'Holiday', 'Unpaid Leave']:
            if col not in payroll_pivot.columns:
                payroll_pivot[col] = 0
        
        # Merge with staff list
        staff_with_hours = staff_df.merge(
            payroll_pivot,
            left_on='Staff_Name',
            right_on='Staff',
            how='left'
        )
        
        # Fill NaN hours with 0
        for col in ['Regular', 'Paid Leave', 'Sick Leave', 'Holiday', 'Unpaid Leave']:
            if col in staff_with_hours.columns:
                staff_with_hours[col] = staff_with_hours[col].fillna(0)
        
        debug_log.append(f"✅ Processed payroll data for {len(staff_with_hours)} staff members")
    
    # ============================================================
    # PHASE 4: SEPARATE BY EMPLOYEE TYPE
    # ============================================================
    
    # Hourly/TFT/PTE employees
    hourly_types = ['Hourly', 'TFT', 'PTE']
    hourly_employees = staff_with_hours[staff_with_hours['Type'].isin(hourly_types)].copy()
    
    if 'Regular' in hourly_employees.columns:
        hourly_display = hourly_employees[['Staff_Name', 'Type', 'Regular', 'Paid Leave', 'Sick Leave', 'Holiday', 'Unpaid Leave']].copy()
    else:
        hourly_display = hourly_employees[['Staff_Name', 'Type']].copy()
        hourly_display['Regular'] = 0
        hourly_display['Paid Leave'] = 0
        hourly_display['Sick Leave'] = 0
        hourly_display['Holiday'] = 0
        hourly_display['Unpaid Leave'] = 0
    
    hourly_display = hourly_display.rename(columns={'Staff_Name': 'Name'})
    hourly_display = hourly_display.sort_values('Name')
    
    # Full-time employees (everyone not hourly/TFT/PTE and not international)
    ft_employees = staff_with_hours[
        (~staff_with_hours['Type'].isin(hourly_types)) & 
        (staff_with_hours['Type'] != 'International')
    ].copy()
    
    if 'Paid Leave' in ft_employees.columns:
        ft_display = ft_employees[['Staff_Name', 'Type', 'Paid Leave', 'Sick Leave', 'Holiday', 'Unpaid Leave']].copy()
    else:
        ft_display = ft_employees[['Staff_Name', 'Type']].copy()
        ft_display['Paid Leave'] = 0
        ft_display['Sick Leave'] = 0
        ft_display['Holiday'] = 0
        ft_display['Unpaid Leave'] = 0
    
    ft_display = ft_display.rename(columns={'Staff_Name': 'Name'})
    ft_display = ft_display.sort_values('Name')
    
    # ============================================================
    # PHASE 5: POLICY VIOLATION CHECKS
    # ============================================================
    
    with st.spinner("🔍 Checking policy violations..."):
        violations = []
        
        # Process YTD data
        bt_ytd['Hours'] = pd.to_numeric(bt_ytd[hours_col], errors='coerce')
        bt_ytd['Staff'] = bt_ytd[staff_col]
        bt_ytd['Month'] = bt_ytd['Date'].dt.to_period('M')
        
        # Categorize YTD data using project ID if available
        if project_id_col:
            bt_ytd['Project_ID'] = pd.to_numeric(bt_ytd[project_id_col], errors='coerce')
            
            bt_ytd['Category'] = 'Regular'
            bt_ytd.loc[bt_ytd['Project_ID'] == 7, 'Category'] = 'Paid Leave'
            bt_ytd.loc[bt_ytd['Project_ID'] == 10, 'Category'] = 'Sick Leave'
            bt_ytd.loc[bt_ytd['Project_ID'] == 13, 'Category'] = 'Unpaid Leave'
            bt_ytd.loc[bt_ytd['Project_ID'] == 62, 'Category'] = 'Holiday'
        elif project_col:
            bt_ytd['Project'] = bt_ytd[project_col]
            
            bt_ytd['Category'] = 'Regular'
            bt_ytd.loc[bt_ytd['Project'].str.contains('Paid Leave', case=False, na=False), 'Category'] = 'Paid Leave'
            bt_ytd.loc[bt_ytd['Project'].str.contains('Sick Leave', case=False, na=False), 'Category'] = 'Sick Leave'
            bt_ytd.loc[bt_ytd['Project'].str.contains('Holiday', case=False, na=False), 'Category'] = 'Holiday'
            bt_ytd.loc[bt_ytd['Project'].str.contains('Unpaid Leave', case=False, na=False), 'Category'] = 'Unpaid Leave'
        
        # Check 1: Holiday hours by month (max 16 per month)
        holiday_data = bt_ytd[bt_ytd['Category'] == 'Holiday'].copy()
        
        if not holiday_data.empty:
            holiday_by_month = holiday_data.groupby(['Staff', 'Month'])['Hours'].sum().reset_index()
            
            for _, row in holiday_by_month.iterrows():
                if row['Hours'] > 16:
                    violations.append({
                        'Employee': row['Staff'],
                        'Policy': 'Holiday Hours (Monthly)',
                        'Issue': f"{row['Hours']:.1f} hours in {row['Month']} (max 16/month)",
                        'Severity': '⚠️'
                    })
        
        # Check 2: Holiday hours YTD (max 72 per year = 9 holidays)
        if not holiday_data.empty:
            holiday_ytd = holiday_data.groupby('Staff')['Hours'].sum().reset_index()
            
            for _, row in holiday_ytd.iterrows():
                if row['Hours'] > 72:
                    violations.append({
                        'Employee': row['Staff'],
                        'Policy': 'Holiday Hours (Annual)',
                        'Issue': f"{row['Hours']:.1f} hours YTD (max 72/year)",
                        'Severity': '⚠️'
                    })
        
        # Check 3: YTD sick leave (max 40 per year)
        sick_data = bt_ytd[bt_ytd['Category'] == 'Sick Leave'].copy()
        
        if not sick_data.empty:
            sick_ytd = sick_data.groupby('Staff')['Hours'].sum().reset_index()
            
            for _, row in sick_ytd.iterrows():
                if row['Hours'] > 40:
                    violations.append({
                        'Employee': row['Staff'],
                        'Policy': 'Sick Leave',
                        'Issue': f"{row['Hours']:.1f} hours YTD (max 40/year)",
                        'Severity': '⚠️'
                    })
        
        violations_df = pd.DataFrame(violations) if violations else pd.DataFrame(columns=['Employee', 'Policy', 'Issue', 'Severity'])
        
        debug_log.append(f"✅ Found {len(violations)} policy violations")
    
    # ============================================================
    # PHASE 6: DISPLAY DEBUG LOG
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
    # PHASE 7: DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Payroll Summary")
    st.caption(f"Pay Period: {start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}")
    
    # Section 1: Hourly/TFT/PTE Employees
    st.subheader("1️⃣ Hourly/TFT/PTE Employees")
    if not hourly_display.empty:
        st.dataframe(
            hourly_display.style.format({
                'Regular': '{:.1f}',
                'Paid Leave': '{:.1f}',
                'Sick Leave': '{:.1f}',
                'Holiday': '{:.1f}',
                'Unpaid Leave': '{:.1f}'
            }),
            hide_index=True,
            use_container_width=True
        )
    else:
        st.info("No hourly/TFT/PTE employees found")
    
    st.divider()
    
    # Section 2: Full-Time Employees
    st.subheader("2️⃣ Full-Time Employees")
    if not ft_display.empty:
        st.dataframe(
            ft_display.style.format({
                'Paid Leave': '{:.1f}',
                'Sick Leave': '{:.1f}',
                'Holiday': '{:.1f}',
                'Unpaid Leave': '{:.1f}'
            }),
            hide_index=True,
            use_container_width=True
        )
    else:
        st.info("No full-time employees found")
    
    st.divider()
    
    # Section 3: Policy Violations
    st.subheader("3️⃣ Policy Violations")
    if not violations_df.empty:
        st.warning(f"Found {len(violations_df)} policy violation(s)")
        st.dataframe(
            violations_df,
            hide_index=True,
            use_container_width=True
        )
    else:
        st.success("✅ No policy violations detected")
    
    # ============================================================
    # PHASE 8: EXCEL EXPORT
    # ============================================================
    
    st.divider()
    st.subheader("📥 Export Report")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Tab 1: Hourly/TFT/PTE
            hourly_display.to_excel(writer, sheet_name='Hourly_TFT_PTE', index=False)
            
            # Tab 2: Full-Time
            ft_display.to_excel(writer, sheet_name='Full_Time', index=False)
            
            # Tab 3: Policy Violations
            violations_df.to_excel(writer, sheet_name='Policy_Violations', index=False)
        
        excel_data = output.getvalue()
        filename = f"Payroll_Report_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.xlsx"
        
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
    st.info("👆 Select payroll period dates and click the button to generate the report")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app helps prepare payroll data for Gusto entry:
        
        **Data Sources:**
        - Employee roster from **Voyage_Global_Config** (Staff tab)
        - Time entries from **BigTime**
        
        **Sections:**
        1. **Hourly/TFT/PTE Employees** - Shows regular hours + all leave types
        2. **Full-Time Employees** - Shows leave hours only (Gusto pre-fills 86.67 hours)
        3. **Policy Violations** - Flags issues:
           - More than 16 holiday hours in a single month
           - More than 72 holiday hours per year (9 holidays)
           - More than 40 sick leave hours per year
        
        **Leave Categories (BigTime Projects):**
        - Paid Leave: Project 7
        - Sick Leave: Project 10
        - Unpaid Leave: Project 13
        - Holiday: Project 62
        """)
