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

# Authentication check
def check_auth():
    """Simple password authentication"""
    if 'authenticated' not in st.session_state:
        st.session_state.authenticated = False
    
    if not st.session_state.authenticated:
        st.title("🔐 Login Required")
        password = st.text_input("Enter password:", type="password")
        
        if st.button("Login"):
            correct_password = os.environ.get("APP_PASSWORD", "voyage2024")
            if password == correct_password:
                st.session_state.authenticated = True
                st.rerun()
            else:
                st.error("Incorrect password")
        st.stop()
    
    return True

check_auth()

st.title("💰 Bonus Calculator")

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
        import gspread
        from google.oauth2 import service_account
        
        service_account_info = st.secrets.get("SERVICE_ACCOUNT_KEY")
        spreadsheet_id = st.secrets.get("SHEET_CONFIG_ID")
        
        if service_account_info and spreadsheet_id:
            credentials = service_account.Credentials.from_service_account_info(
                service_account_info,
                scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
            )
            gc = gspread.authorize(credentials)
            
            sh = gc.open_by_key(spreadsheet_id)
            worksheet = sh.worksheet('Staff')
            data = worksheet.get_all_records()
            staff_df = pd.DataFrame(data)
            
            # Convert Start_Date to datetime
            staff_df['Start_Date'] = pd.to_datetime(staff_df['Start_Date'])
            
            st.success(f"✅ Loaded {len(staff_df)} employees from config")
            return staff_df
        else:
            st.error("Missing configuration")
            return None
            
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


def calculate_proration(start_date, report_year):
    """Calculate proration percentage for first-year employees"""
    if start_date.year != report_year:
        return 1.0  # 100% if they started before this year
    
    # Days from start date to Dec 31 of report year
    year_end = date(report_year, 12, 31)
    days_employed = (year_end - start_date).days + 1  # +1 to include start date
    days_in_year = 366 if calendar.isleap(report_year) else 365
    
    return days_employed / days_in_year


def calculate_tier_bonus(eligible_hours, target, proration):
    """Calculate bonus based on tier and hours"""
    if eligible_hours >= 1840:
        # Tier 1
        tier = 1
        bonus = target * (eligible_hours / 1840) * proration
    elif eligible_hours >= 1350:
        # Tier 2
        tier = 2
        bonus = target * 0.75 * (eligible_hours / 1840) * proration
    else:
        # Tier 3
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
            
            for _, employee in staff_df.iterrows():
                name = employee['Staff_Name']
                emp_start_date = employee['Start_Date'].date() if pd.notna(employee['Start_Date']) else date(year, 1, 1)
                util_target = employee.get('Utilization_Bonus_Target', 0)
                other_target = employee.get('Other_Bonus_Target', 0)
                
                # Get hours for this employee
                ytd_billable = regular_hours.get(name, 0)
                ytd_probono = pro_bono_hours.get(name, 0)
                
                # Cap pro bono at 40
                ytd_probono_credit = min(ytd_probono, 40)
                ytd_eligible = ytd_billable + ytd_probono_credit
                
                # Calculate proration
                proration = calculate_proration(emp_start_date, year)
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
                    'Days_in_Year': days_in_year_employed,
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
            
            # Create display dataframe with formatted values
            display_df = pd.DataFrame({
                'Employee': results_df['Employee'],
                'Start Date': results_df['Start_Date'].apply(lambda x: x.strftime('%Y-%m-%d')),
                'Days': results_df['Days_in_Year'],
                'Proration': results_df['Proration'],
                'Util Target': results_df['Util_Target'].apply(lambda x: f"${x:,.0f}"),
                'Other Target': results_df['Other_Target'].apply(lambda x: f"${x:,.0f}"),
                'YTD Bill': results_df['YTD_Billable'],
                'YTD PB': results_df['YTD_ProBono'],
                'YTD Elig': results_df['YTD_Eligible'],
                'YTD Tier': results_df['YTD_Tier'],
                'YTD Bonus': results_df['YTD_Bonus'].apply(lambda x: f"${x:,.0f}"),
                'YTD Other': results_df['YTD_Other'].apply(lambda x: f"${x:,.0f}"),
                'YTD Total': results_df['YTD_Total_Cost'].apply(lambda x: f"${x:,.0f}"),
                'Proj Bill': results_df['Proj_Billable'],
                'Proj Elig': results_df['Proj_Eligible'],
                'Proj Tier': results_df['Proj_Tier'],
                'Proj Bonus': results_df['Proj_Bonus'].apply(lambda x: f"${x:,.0f}"),
                'Proj Other': results_df['Proj_Other'].apply(lambda x: f"${x:,.0f}"),
                'Proj Total': results_df['Proj_Total_Cost'].apply(lambda x: f"${x:,.0f}")
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
            
            st.download_button(
                label="📥 Download Excel Report",
                data=output.getvalue(),
                file_name=f"bonus_report_{year}_{as_of_date.strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
            
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
