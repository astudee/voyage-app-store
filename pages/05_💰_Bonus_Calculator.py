"""
Bonus Calculator
Calculates employee bonuses based on billable hours and utilization targets
"""

import streamlit as st
import pandas as pd
import calendar
from datetime import date, datetime, timedelta
from io import BytesIO
import os
import requests

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

st.title("💰 Bonus Calculator")

# Overrides Section
with st.expander("⚙️ Bonus Target Overrides (Optional)"):
    st.markdown("""
    Override bonus targets for specific employees. Useful for:
    - Running reports for previous years with different targets
    - Adjusting targets mid-year
    - Special bonus arrangements
    """)
    
    col1, col2, col3 = st.columns(3)
    with col1:
        override_name = st.text_input(
            "Employee Name",
            placeholder="e.g., John Adelphia",
            key="override_name"
        )
    with col2:
        override_util_target = st.number_input(
            "Utilization Bonus Target ($)",
            min_value=0,
            value=0,
            step=1000,
            key="override_util"
        )
    with col3:
        override_other_target = st.number_input(
            "Other Bonus Target ($)",
            min_value=0,
            value=0,
            step=1000,
            key="override_other"
        )
    
    if st.button("➕ Add Override", key="add_override"):
        if override_name and (override_util_target > 0 or override_other_target > 0):
            if 'bonus_overrides' not in st.session_state:
                st.session_state.bonus_overrides = {}
            st.session_state.bonus_overrides[override_name] = {
                'util_target': override_util_target,
                'other_target': override_other_target
            }
            st.success(f"✅ Added override for {override_name}")
        else:
            st.error("Enter employee name and at least one target amount")
    
    # Show current overrides
    if 'bonus_overrides' not in st.session_state:
        st.session_state.bonus_overrides = {}
    
    if st.session_state.bonus_overrides:
        st.subheader("Current Overrides:")
        for name, values in st.session_state.bonus_overrides.items():
            col_a, col_b = st.columns([4, 1])
            with col_a:
                st.write(f"**{name}**: Util Target: ${values['util_target']:,} | Other Target: ${values['other_target']:,}")
            with col_b:
                if st.button("🗑️ Remove", key=f"remove_{name}"):
                    del st.session_state.bonus_overrides[name]
                    st.rerun()

# Configuration
st.sidebar.header("Report Configuration")

# Date selection - auto-determines year from selected date
as_of_date = st.sidebar.date_input(
    "As of Date",
    value=date.today(),
    min_value=date(2020, 1, 1),
    max_value=date(2030, 12, 31)
)

# Auto-calculate start date and year from selected date
year = as_of_date.year
start_date = date(year, 1, 1)

st.sidebar.write(f"**Report Period:**")
st.sidebar.write(f"{start_date.strftime('%B %d, %Y')} to {as_of_date.strftime('%B %d, %Y')}")


def load_staff_config():
    """Load staff configuration from Voyage_Global_Config"""
    try:
        from functions import sheets

        spreadsheet_id = st.secrets.get("SHEET_CONFIG_ID")
        if not spreadsheet_id:
            st.error("Missing SHEET_CONFIG_ID configuration")
            return None

        staff_df = sheets.read_config(spreadsheet_id, "Staff")
        if staff_df is None or staff_df.empty:
            st.error("Could not load staff configuration")
            return None

        # Convert Start_Date to datetime
        staff_df['Start_Date'] = pd.to_datetime(staff_df['Start_Date'])

        st.success(f"✅ Loaded {len(staff_df)} employees from config")
        return staff_df

    except Exception as e:
        st.error(f"Error loading staff config: {str(e)}")
        return None


def get_bigtime_hours(start_date, end_date, report_id=284796):
    """Fetch billable hours from BigTime API"""
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
                st.warning(f"⚠️ BigTime returned 0 rows")
                return pd.DataFrame()
            
            column_names = [field.get('FieldNm') for field in field_list]
            df = pd.DataFrame(data_rows, columns=column_names)
            
            # Map column names
            mapping = {
                'tmstaffnm': 'Staff Member',
                'tmdt': 'Date',
                'tmhrsbill': 'Billable',
                'tmprojectnm': 'Project',
                'tmclientnm': 'Client'
            }
            df = df.rename(columns={k: v for k, v in mapping.items() if k in df.columns})
            
            if 'Date' in df.columns:
                df['Date'] = pd.to_datetime(df['Date'])
            if 'Billable' in df.columns:
                df['Billable'] = pd.to_numeric(df['Billable'], errors='coerce')
            
            return df
        else:
            st.error(f"BigTime API Error {response.status_code}")
            return None
    except Exception as e:
        st.error(f"BigTime API Exception: {str(e)}")
        return None


def calculate_proration(employee_start_date, report_start_date, report_end_date):
    """
    Calculate proration percentage based on how much of the report period the employee worked
    
    Args:
        employee_start_date: When employee started
        report_start_date: Start of report period
        report_end_date: End of report period
    
    Returns:
        Proration percentage (0.0 to 1.0)
    """
    # If employee started before the report period, they worked the full period
    if employee_start_date <= report_start_date:
        return 1.0
    
    # If employee started after report period ended, they worked 0%
    if employee_start_date > report_end_date:
        return 0.0
    
    # Employee started during the report period
    # Calculate what % of the report period they worked
    total_days_in_period = (report_end_date - report_start_date).days + 1
    days_employed_in_period = (report_end_date - employee_start_date).days + 1
    
    return days_employed_in_period / total_days_in_period


def calculate_tier_bonus(eligible_hours, annual_target, proration):
    """
    Calculate bonus based on tier and hours
    
    Args:
        eligible_hours: Actual hours worked (billable + capped pro bono)
        annual_target: Full-year bonus target (before proration)
        proration: Percentage of year employed (0.0 to 1.0)
    
    Returns:
        (tier, bonus)
    """
    # Prorate the target and thresholds based on time employed
    prorated_target = annual_target * proration
    tier1_threshold = 1840 * proration  # Tier 1 threshold
    tier2_threshold = 1350 * proration  # Tier 2 threshold
    
    # Determine tier and calculate bonus using prorated values
    if eligible_hours >= tier1_threshold:
        # Tier 1: Full bonus scaled by hours
        tier = 1
        if tier1_threshold > 0:
            bonus = prorated_target * (eligible_hours / tier1_threshold)
        else:
            bonus = 0
    elif eligible_hours >= tier2_threshold:
        # Tier 2: 75% of bonus scaled by hours
        tier = 2
        if tier1_threshold > 0:
            bonus = prorated_target * 0.75 * (eligible_hours / tier1_threshold)
        else:
            bonus = 0
    else:
        # Tier 3: No bonus
        tier = 3
        bonus = 0
    
    return tier, bonus


def apply_tier_color(tier):
    """Return color for tier"""
    if tier == 1:
        return 'background-color: #D5F4E6'  # Green
    elif tier == 2:
        return 'background-color: #FCF3CF'  # Yellow
    else:
        return 'background-color: #D6EAF8'  # Blue


if st.sidebar.button("Generate Report", type="primary"):
    with st.spinner("Loading data..."):
        try:
            # Load staff configuration
            staff_df = load_staff_config()
            if staff_df is None:
                st.stop()
            
            # Get BigTime hours
            hours_df = get_bigtime_hours(start_date, as_of_date)
            if hours_df is None or hours_df.empty:
                st.error("Failed to load BigTime data")
                st.stop()
            
            st.success(f"✅ Loaded {len(hours_df):,} time entries from BigTime")
            
            # Separate regular billable and pro bono
            # Pro bono is identified by project containing "Pro Bono - Leave a Mark"
            pro_bono_mask = hours_df['Project'].str.contains('Pro Bono - Leave a Mark', case=False, na=False)
            
            regular_hours = hours_df[~pro_bono_mask].groupby('Staff Member')['Billable'].sum()
            pro_bono_hours = hours_df[pro_bono_mask].groupby('Staff Member')['Billable'].sum()
            
            # Calculate days elapsed and progress percentage
            days_elapsed = (as_of_date - start_date).days + 1
            days_in_year = 366 if calendar.isleap(year) else 365
            progress_pct = days_elapsed / days_in_year
            
            # Build results dataframe
            results = []
            
            # Get overrides
            overrides = st.session_state.get('bonus_overrides', {})
            
            for _, employee in staff_df.iterrows():
                name = employee['Staff_Name']
                emp_start_date = employee['Start_Date'].date() if pd.notna(employee['Start_Date']) else date(year, 1, 1)
                
                # Check for overrides first
                if name in overrides:
                    util_target = overrides[name]['util_target']
                    other_target = overrides[name]['other_target']
                else:
                    util_target = employee.get('Utilization_Bonus_Target', 0)
                    other_target = employee.get('Other_Bonus_Target', 0)
                
                # Get hours for this employee
                ytd_billable = regular_hours.get(name, 0)
                ytd_probono = pro_bono_hours.get(name, 0)
                
                # Cap pro bono at 40
                ytd_probono_credit = min(ytd_probono, 40)
                ytd_eligible = ytd_billable + ytd_probono_credit
                
                # Calculate proration based on report period
                # If employee started before report period, they worked 100% of it
                if emp_start_date <= start_date:
                    proration = 1.0
                    days_in_period_employed = days_elapsed
                # If employee started during report period
                elif emp_start_date <= as_of_date:
                    days_in_period_employed = (as_of_date - emp_start_date).days + 1
                    proration = days_in_period_employed / days_elapsed
                else:
                    # Started after report period
                    proration = 0.0
                    days_in_period_employed = 0
                days_in_year_employed = int(proration * days_in_year)
                
                # YTD Bonus
                ytd_tier, ytd_bonus = calculate_tier_bonus(ytd_eligible, util_target, proration)
                
                # Project to year-end
                if progress_pct > 0:
                    projected_billable = ytd_billable / progress_pct
                    projected_probono = ytd_probono / progress_pct
                    projected_probono_credit = min(projected_probono, 40)
                    projected_eligible = projected_billable + projected_probono_credit
                else:
                    projected_billable = 0
                    projected_eligible = 0
                
                projected_tier, projected_bonus = calculate_tier_bonus(projected_eligible, util_target, proration)
                
                # Other bonus (prorated by progress)
                ytd_other_bonus = other_target * progress_pct
                projected_other_bonus = other_target
                
                # Total bonuses
                ytd_total_bonus = ytd_bonus + ytd_other_bonus
                projected_total_bonus = projected_bonus + projected_other_bonus
                
                # Employer costs (FICA 7.65% + 401k 4%)
                ytd_fica = ytd_total_bonus * 0.0765
                ytd_401k = ytd_total_bonus * 0.04
                ytd_total_cost = ytd_total_bonus + ytd_fica + ytd_401k
                
                projected_fica = projected_total_bonus * 0.0765
                projected_401k = projected_total_bonus * 0.04
                projected_total_cost = projected_total_bonus + projected_fica + projected_401k
                
                results.append({
                    'Employee': name,
                    'Start_Date': emp_start_date,
                    'Days_in_Period': days_in_period_employed,
                    'Proration': f"{proration:.1%}",
                    'Util_Target': util_target,
                    'Other_Target': other_target,
                    'YTD_Billable': round(ytd_billable, 1),
                    'YTD_ProBono': round(ytd_probono, 1),
                    'YTD_Eligible': round(ytd_eligible, 1),
                    'YTD_Tier': ytd_tier,
                    'YTD_Bonus': ytd_bonus,
                    'YTD_Other': ytd_other_bonus,
                    'YTD_Total_Bonus': ytd_total_bonus,
                    'YTD_FICA': ytd_fica,
                    'YTD_401k': ytd_401k,
                    'YTD_Total_Cost': ytd_total_cost,
                    'Proj_Billable': round(projected_billable, 1),
                    'Proj_Eligible': round(projected_eligible, 1),
                    'Proj_Tier': projected_tier,
                    'Proj_Bonus': projected_bonus,
                    'Proj_Other': projected_other_bonus,
                    'Proj_Total_Bonus': projected_total_bonus,
                    'Proj_FICA': projected_fica,
                    'Proj_401k': projected_401k,
                    'Proj_Total_Cost': projected_total_cost
                })
            
            results_df = pd.DataFrame(results)
            results_df = results_df.sort_values('Employee')
            
            # Display summary cards
            st.header("Bonus Report")
            st.subheader(f"{start_date.strftime('%B %d, %Y')} - {as_of_date.strftime('%B %d, %Y')} ({progress_pct:.1%} of year)")
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.metric(
                    "💰 YTD Total Cost",
                    f"${results_df['YTD_Total_Cost'].sum():,.0f}",
                    help="Total bonus liability including FICA and 401k match"
                )
                st.caption(f"├─ Bonuses: ${results_df['YTD_Total_Bonus'].sum():,.0f}")
                st.caption(f"├─ FICA (7.65%): ${results_df['YTD_FICA'].sum():,.0f}")
                st.caption(f"└─ 401k (4%): ${results_df['YTD_401k'].sum():,.0f}")
            
            with col2:
                st.metric(
                    "📈 Projected Year-End Cost",
                    f"${results_df['Proj_Total_Cost'].sum():,.0f}",
                    help="Projected total cost based on current run rate"
                )
                st.caption(f"├─ Bonuses: ${results_df['Proj_Total_Bonus'].sum():,.0f}")
                st.caption(f"├─ FICA (7.65%): ${results_df['Proj_FICA'].sum():,.0f}")
                st.caption(f"└─ 401k (4%): ${results_df['Proj_401k'].sum():,.0f}")
            
            # Display detailed table
            st.subheader("Employee Details")
            
            # Show override notice if any are active
            if overrides:
                st.info(f"ℹ️ {len(overrides)} bonus target override(s) active")
            
            # Create display dataframe with formatted values
            display_df = pd.DataFrame({
                'Employee': results_df['Employee'],
                'Start Date': results_df['Start_Date'].apply(lambda x: x.strftime('%Y-%m-%d')),
                'Days in Period': results_df['Days_in_Period'],
                'Proration %': results_df['Proration'].str.rstrip('%').astype(float).apply(lambda x: f"{x:.1f}%"),
                'Util Target': results_df['Util_Target'].apply(lambda x: f"${x:,.0f}"),
                'Other Target': results_df['Other_Target'].apply(lambda x: f"${x:,.0f}"),
                # YTD columns
                'YTD Billable Hrs': results_df['YTD_Billable'].apply(lambda x: f"{x:.1f}"),
                'YTD Pro Bono Hrs': results_df['YTD_ProBono'].apply(lambda x: f"{x:.1f}"),
                'YTD Eligible Hrs': results_df['YTD_Eligible'].apply(lambda x: f"{x:.1f}"),
                'YTD Tier': results_df['YTD_Tier'],
                'YTD Util Bonus': results_df['YTD_Bonus'].apply(lambda x: f"${x:,.0f}"),
                'YTD Other Bonus': results_df['YTD_Other'].apply(lambda x: f"${x:,.0f}"),
                'YTD Total Bonus': results_df['YTD_Total_Bonus'].apply(lambda x: f"${x:,.0f}"),
                'YTD FICA': results_df['YTD_FICA'].apply(lambda x: f"${x:,.0f}"),
                'YTD 401k': results_df['YTD_401k'].apply(lambda x: f"${x:,.0f}"),
                'YTD Total Cost': results_df['YTD_Total_Cost'].apply(lambda x: f"${x:,.0f}"),
                # Projected columns
                'Proj Billable Hrs': results_df['Proj_Billable'].apply(lambda x: f"{x:.1f}"),
                'Proj Eligible Hrs': results_df['Proj_Eligible'].apply(lambda x: f"{x:.1f}"),
                'Proj Tier': results_df['Proj_Tier'],
                'Proj Util Bonus': results_df['Proj_Bonus'].apply(lambda x: f"${x:,.0f}"),
                'Proj Other Bonus': results_df['Proj_Other'].apply(lambda x: f"${x:,.0f}"),
                'Proj Total Bonus': results_df['Proj_Total_Bonus'].apply(lambda x: f"${x:,.0f}"),
                'Proj FICA': results_df['Proj_FICA'].apply(lambda x: f"${x:,.0f}"),
                'Proj 401k': results_df['Proj_401k'].apply(lambda x: f"${x:,.0f}"),
                'Proj Total Cost': results_df['Proj_Total_Cost'].apply(lambda x: f"${x:,.0f}")
            })
            
            # Apply color coding to tier columns
            def highlight_tiers(row):
                styles = [''] * len(row)
                # YTD Tier
                ytd_tier_idx = list(display_df.columns).index('YTD Tier')
                styles[ytd_tier_idx] = apply_tier_color(results_df.iloc[row.name]['YTD_Tier'])
                # Proj Tier
                proj_tier_idx = list(display_df.columns).index('Proj Tier')
                styles[proj_tier_idx] = apply_tier_color(results_df.iloc[row.name]['Proj_Tier'])
                return styles
            
            styled_df = display_df.style.apply(highlight_tiers, axis=1)
            st.dataframe(styled_df, use_container_width=True)
            
            # Export to Excel
            st.subheader("Export Report")
            
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                results_df.to_excel(writer, sheet_name='Bonus_Report', index=False)
            
            output.seek(0)
            
            # Store report data in session state for email sending
            st.session_state.bonus_report_data = {
                'excel_file': output.getvalue(),
                'filename': f"bonus_report_{year}_{as_of_date.strftime('%Y%m%d')}.xlsx",
                'as_of_date': as_of_date,
                'summary': {
                    'ytd_total_cost': results_df['YTD_Total_Cost'].sum(),
                    'ytd_bonuses': results_df['YTD_Total_Bonus'].sum(),
                    'ytd_fica': results_df['YTD_FICA'].sum(),
                    'ytd_401k': results_df['YTD_401k'].sum(),
                    'proj_total_cost': results_df['Proj_Total_Cost'].sum(),
                    'proj_bonuses': results_df['Proj_Total_Bonus'].sum(),
                    'proj_fica': results_df['Proj_FICA'].sum(),
                    'proj_401k': results_df['Proj_401k'].sum(),
                    'employee_count': len(results_df)
                }
            }
            
            st.download_button(
                label="📥 Download Excel Report",
                data=output.getvalue(),
                file_name=f"bonus_report_{year}_{as_of_date.strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
            
            st.info("📧 To email this report, use the 'Email Report' section in the sidebar →")
            
        except Exception as e:
            st.error(f"Error generating report: {str(e)}")
            import traceback
            st.code(traceback.format_exc())

else:
    st.info("👈 Select report date and click 'Generate Report'")
    
    with st.expander("ℹ️ How Bonuses Are Calculated"):
        st.markdown("""
        ### Utilization Bonus Formula
        
        **Component A: Delivery (Based on Billable Hours)**
        
        Eligible Hours = Billable Hours + Pro Bono Hours (max 40)
        
        **Tier 1** (≥1,840 hours):
        - Bonus = Target × (Eligible Hours / 1,840) × Proration
        - Example: $10,000 target, 1,900 hours → $10,326
        
        **Tier 2** (1,350-1,839 hours):
        - Bonus = Target × 0.75 × (Eligible Hours / 1,840) × Proration
        - Example: $10,000 target, 1,400 hours → $5,707
        
        **Tier 3** (<1,350 hours):
        - Bonus = $0
        
        **Proration (First Year):**
        - Employees starting mid-year are prorated based on days employed
        - Days Employed = Start Date to December 31
        - Proration % = Days Employed / 365
        
        **Other Bonuses:**
        - Discretionary adjustments from "Other_Bonus_Target" column
        - Prorated based on percentage of year elapsed
        
        **Employer Costs:**
        - FICA: 7.65% of total bonus
        - 401k Match: 4% of total bonus
        - Total Cost = Bonus + FICA + 401k Match
        
        **Projections:**
        - Based on current run rate annualized to year-end
        - YTD Hours / Progress% = Projected Annual Hours
        """)

# Email functionality - placed at end so it's always evaluated
if 'bonus_report_data' in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")
    
    email_to = st.sidebar.text_input(
        "Send to:",
        placeholder="email@example.com",
        key="bonus_email_input"
    )
    
    send_clicked = st.sidebar.button("Send Email", type="primary", use_container_width=True, key="send_bonus_email")
    
    if send_clicked:
        if not email_to:
            st.sidebar.error("Enter an email address")
        else:
            try:
                from googleapiclient.discovery import build
                from google.oauth2 import service_account
                import base64
                from email.mime.multipart import MIMEMultipart
                from email.mime.base import MIMEBase
                from email.mime.text import MIMEText
                from email import encoders
                
                rd = st.session_state.bonus_report_data
                
                creds = service_account.Credentials.from_service_account_info(
                    st.secrets["SERVICE_ACCOUNT_KEY"],
                    scopes=['https://www.googleapis.com/auth/gmail.send'],
                    subject='astudee@voyageadvisory.com'
                )
                
                gmail = build('gmail', 'v1', credentials=creds)
                
                msg = MIMEMultipart()
                msg['From'] = 'astudee@voyageadvisory.com'
                msg['To'] = email_to
                msg['Subject'] = f"Bonus Report - YTD through {rd['as_of_date'].strftime('%b %d, %Y')}"
                
                body = f"""Bonus Report

Period: January 1, {rd['as_of_date'].year} - {rd['as_of_date'].strftime('%B %d, %Y')}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}

YTD Summary:
- Total Cost: ${rd['summary']['ytd_total_cost']:,.0f}
- Bonuses: ${rd['summary']['ytd_bonuses']:,.0f}
- FICA (7.65%): ${rd['summary']['ytd_fica']:,.0f}
- 401k Match (4%): ${rd['summary']['ytd_401k']:,.0f}

Projected Year-End:
- Total Cost: ${rd['summary']['proj_total_cost']:,.0f}
- Bonuses: ${rd['summary']['proj_bonuses']:,.0f}
- FICA (7.65%): ${rd['summary']['proj_fica']:,.0f}
- 401k Match (4%): ${rd['summary']['proj_401k']:,.0f}

Employees: {rd['summary']['employee_count']}

Best regards,
Voyage Advisory"""
                
                msg.attach(MIMEText(body, 'plain'))
                
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(rd['excel_file'])
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename={rd["filename"]}')
                msg.attach(part)
                
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
                result = gmail.users().messages().send(userId='me', body={'raw': raw}).execute()
                
                st.sidebar.success(f"✅ Sent to {email_to}!")
                
            except Exception as e:
                st.sidebar.error(f"❌ {type(e).__name__}")
                st.sidebar.code(str(e))
