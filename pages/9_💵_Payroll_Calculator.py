"""
Payroll Calculator
Calculate total employer payroll costs including salary, benefits, bonuses, and taxes
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime
from io import BytesIO

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')
import sheets

st.set_page_config(page_title="Payroll Calculator", page_icon="💵", layout="wide")

st.title("💵 Payroll Calculator")
st.markdown("Calculate total employer payroll costs including salary, benefits, bonuses, and taxes")

# Config from secrets
config_sheet_id = st.secrets.get("SHEET_CONFIG_ID")
if not config_sheet_id:
    st.error("❌ SHEET_CONFIG_ID not found in secrets")
    st.stop()

# -------------------------
# Load configuration data
# -------------------------
with st.spinner("📊 Loading configuration data..."):
    try:
        staff_df = sheets.read_config(config_sheet_id, "Staff")
        benefits_df = sheets.read_config(config_sheet_id, "Benefits")
    except Exception as e:
        st.error(f"❌ Error loading configuration: {str(e)}")
        st.stop()

if staff_df is None or staff_df.empty:
    st.error("❌ Could not load Staff configuration")
    st.stop()

if benefits_df is None or benefits_df.empty:
    st.error("❌ Could not load Benefits configuration")
    st.stop()

st.success(f"✅ Loaded {len(staff_df)} staff members and {len(benefits_df)} benefit options")

# -------------------------
# Helper functions (copied from Benefits Calculator)
# -------------------------
def safe_str(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return ""
    return str(x).strip()

def safe_float(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().replace("$", "").replace(",", "")
    if s == "":
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0

def calculate_std_cost(salary):
    """Calculate STD monthly cost based on salary"""
    weekly_salary = salary / 52
    weekly_benefit = min(weekly_salary * 0.6667, 2100)
    monthly_cost = (weekly_benefit / 10) * 0.18
    return round(monthly_cost, 2)

def calculate_ltd_cost(salary):
    """Calculate LTD monthly cost based on salary"""
    monthly_salary = salary / 12
    monthly_cost = (monthly_salary / 100) * 0.21
    return round(monthly_cost, 2)

# -------------------------
# Create lookup dictionary for benefits
# -------------------------
benefits_lookup = {}
for _, row in benefits_df.iterrows():
    code = safe_str(row.get("Code", ""))
    if not code:
        continue

    # Detect formula-based by code prefix
    is_formula = code.startswith('SE') or code.startswith('LE')
    
    benefits_lookup[code] = {
        "description": safe_str(row.get("Description", "")),
        "is_formula": is_formula,
        "total_cost": safe_float(row.get("Total_Monthly_Cost", 0)),
        "ee_cost": safe_float(row.get("EE_Monthly_Cost", 0)),
        "firm_cost": safe_float(row.get("Firm_Monthly_Cost", 0)),
    }

# -------------------------
# Calculate firm-paid benefits for an employee
# -------------------------
def calculate_firm_benefits(employee_row):
    """Calculate total firm-paid benefits for an employee (monthly)"""
    salary = safe_float(employee_row.get("Salary", 0))
    
    medical_code = safe_str(employee_row.get("Medical_Plan", "")) or "MX"
    dental_code = safe_str(employee_row.get("Dental_Plan", "")) or "DX"
    vision_code = safe_str(employee_row.get("Vision_Plan", "")) or "VX"
    std_code = safe_str(employee_row.get("STD", "")) or "SEX"
    ltd_code = safe_str(employee_row.get("LTD", "")) or "LEX"
    life_code = safe_str(employee_row.get("Life", "")) or "TEX"
    
    total_firm = 0.0
    
    for code in [medical_code, dental_code, vision_code, std_code, ltd_code, life_code]:
        if not code or code not in benefits_lookup:
            continue
        
        benefit = benefits_lookup[code]
        
        if benefit["is_formula"]:
            # Calculate formula-based cost
            if code.startswith("SE"):
                cost = calculate_std_cost(salary)
            elif code.startswith("LE"):
                cost = calculate_ltd_cost(salary)
            else:
                cost = 0.0
            
            # Only add if firm-paid
            if code in ["SE1", "LE1"]:
                total_firm += cost
        else:
            # Fixed cost - add firm portion
            total_firm += benefit["firm_cost"]
    
    return round(total_firm, 2)

# =========================================================
# Configuration Options
# =========================================================
st.divider()

include_bonuses = st.checkbox(
    "Include Bonuses",
    value=True,
    help="Include utilization and other bonuses in total compensation. 401(k) and FICA will be calculated based on included components."
)

st.caption("💡 401(k) match (4%) and FICA (7.65%) are calculated based on components included in the report")

st.divider()

# Time period selector
time_period = st.radio(
    "Display costs as:",
    options=["Per Pay Period (2x/month)", "Monthly", "Annual"],
    horizontal=True,
    help="Choose how to display employee costs in the details section"
)

# =========================================================
# Generate Report Button
# =========================================================
st.divider()

if "payroll_report_ready" not in st.session_state:
    st.session_state.payroll_report_ready = False

generate_clicked = st.button("📊 Generate Payroll Report", type="primary", use_container_width=True)

if generate_clicked:
    st.session_state.payroll_report_ready = True

if not st.session_state.payroll_report_ready:
    st.info("👆 Click the button above to calculate payroll costs")
    st.stop()

st.divider()

# =========================================================
# Calculate payroll costs for each employee
# =========================================================
results = []

for _, employee in staff_df.iterrows():
    name = safe_str(employee.get("Staff_Name", ""))
    
    # Base components from Staff tab
    annual_salary = safe_float(employee.get("Salary", 0))
    monthly_salary = annual_salary / 12
    
    utilization_bonus = safe_float(employee.get("Utilization_Bonus_Target", 0)) if include_bonuses else 0.0
    other_bonus = safe_float(employee.get("Other_Bonus_Target", 0))
    phone_allowance = safe_float(employee.get("Phone_Allowance", 0))
    
    # Calculate firm benefits
    firm_benefits = calculate_firm_benefits(employee)
    
    # Calculate based on bonus toggle
    if include_bonuses:
        # Bonus ON: include all bonuses
        total_annual_comp = annual_salary + utilization_bonus + other_bonus
        total_monthly_comp = monthly_salary + (utilization_bonus / 12) + (other_bonus / 12)
    else:
        # Bonus OFF: salary ONLY (no bonuses at all)
        total_annual_comp = annual_salary
        total_monthly_comp = monthly_salary
    
    # 401(k) match: 4% of compensation
    monthly_401k = (total_annual_comp * 0.04) / 12
    
    # FICA: 7.65% of compensation
    monthly_fica = total_monthly_comp * 0.0765
    
    # Total monthly cost
    total_monthly = (
        total_monthly_comp +
        phone_allowance +
        firm_benefits +
        monthly_401k +
        monthly_fica
    )
    
    results.append({
        "Staff_Name": name,
        "Annual_Salary": annual_salary,
        "Monthly_Salary": monthly_salary,
        "Utilization_Bonus": utilization_bonus,
        "Other_Bonus": other_bonus,
        "Monthly_Utilization_Bonus": utilization_bonus / 12,
        "Monthly_Other_Bonus": other_bonus / 12,
        "Phone_Allowance": phone_allowance,
        "Firm_Benefits": firm_benefits,
        "Monthly_401k": monthly_401k,
        "Monthly_FICA": monthly_fica,
        "Total_Monthly_Cost": total_monthly,
        "Total_Annual_Cost": total_monthly * 12,
    })

results_df = pd.DataFrame(results)

# =========================================================
# Summary metrics
# =========================================================
st.header("📊 Summary")

total_monthly_sum = float(results_df["Total_Monthly_Cost"].sum())
total_annual_sum = float(results_df["Total_Annual_Cost"].sum())
total_per_payroll_sum = total_monthly_sum / 2  # 2 pay periods per month

total_salary_monthly = float(results_df["Monthly_Salary"].sum())
total_benefits = float(results_df["Firm_Benefits"].sum())
total_401k = float(results_df["Monthly_401k"].sum())
total_fica = float(results_df["Monthly_FICA"].sum())

# Create 3 columns for the three time periods
col1, col2, col3 = st.columns(3)

card_style = "padding: 1rem; background-color: #E8F5E9; border-radius: 0.5rem; border-left: 4px solid #4CAF50;"

with col1:
    st.markdown(f"""
    <div style='{card_style}'>
        <h3 style='margin: 0; color: #666; font-size: 1rem;'>Per Payroll Cost</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${total_per_payroll_sum:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>2 pay periods/month</p>
    </div>
    """, unsafe_allow_html=True)

with col2:
    st.markdown(f"""
    <div style='{card_style}'>
        <h3 style='margin: 0; color: #666; font-size: 1rem;'>Total Monthly Cost</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${total_monthly_sum:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>Per month</p>
    </div>
    """, unsafe_allow_html=True)

with col3:
    st.markdown(f"""
    <div style='{card_style}'>
        <h3 style='margin: 0; color: #666; font-size: 1rem;'>Total Annual Cost</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${total_annual_sum:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>Per year</p>
    </div>
    """, unsafe_allow_html=True)

st.divider()

# Secondary metrics with different styling
col1, col2, col3 = st.columns(3)

with col1:
    st.metric(
        "Base Salaries (Monthly)", 
        f"${total_salary_monthly:,.2f}", 
        f"${total_salary_monthly * 12:,.2f}/year",
        delta_color="off"
    )

with col2:
    st.metric(
        "Benefits + Taxes (Monthly)", 
        f"${total_benefits + total_401k + total_fica:,.2f}", 
        f"${(total_benefits + total_401k + total_fica) * 12:,.2f}/year",
        delta_color="off"
    )

with col3:
    st.metric(
        "Burden Rate", 
        f"{burden_rate:.1f}%", 
        "Above base salary",
        delta_color="off"
    )

st.divider()

# =========================================================
# Cost Breakdown
# =========================================================
st.header("📈 Cost Breakdown")

if include_bonuses:
    breakdown_data = {
        "Component": [
            "Base Salaries",
            "Utilization Bonuses",
            "Other Bonuses",
            "Total Compensation",
            "Phone Allowances",
            "Firm Benefits",
            "401(k) Match (4%)",
            "FICA (7.65%)",
        ],
        "Per Pay Period": [
            total_salary_monthly / 2,
            results_df["Monthly_Utilization_Bonus"].sum() / 2,
            results_df["Monthly_Other_Bonus"].sum() / 2,
            (total_salary_monthly + results_df["Monthly_Utilization_Bonus"].sum() + results_df["Monthly_Other_Bonus"].sum()) / 2,
            results_df["Phone_Allowance"].sum() / 2,
            total_benefits / 2,
            total_401k / 2,
            total_fica / 2,
        ],
        "Monthly": [
            total_salary_monthly,
            results_df["Monthly_Utilization_Bonus"].sum(),
            results_df["Monthly_Other_Bonus"].sum(),
            total_salary_monthly + results_df["Monthly_Utilization_Bonus"].sum() + results_df["Monthly_Other_Bonus"].sum(),
            results_df["Phone_Allowance"].sum(),
            total_benefits,
            total_401k,
            total_fica,
        ],
    }
else:
    breakdown_data = {
        "Component": [
            "Base Salaries",
            "Phone Allowances",
            "Firm Benefits",
            "401(k) Match (4%)",
            "FICA (7.65%)",
        ],
        "Per Pay Period": [
            total_salary_monthly / 2,
            results_df["Phone_Allowance"].sum() / 2,
            total_benefits / 2,
            total_401k / 2,
            total_fica / 2,
        ],
        "Monthly": [
            total_salary_monthly,
            results_df["Phone_Allowance"].sum(),
            total_benefits,
            total_401k,
            total_fica,
        ],
    }

breakdown_df = pd.DataFrame(breakdown_data)

# Add annual column
breakdown_df["Annual"] = breakdown_df["Monthly"] * 12

# Add total row
total_row = pd.DataFrame({
    "Component": ["TOTAL"],
    "Per Pay Period": [breakdown_df["Per Pay Period"].sum()],
    "Monthly": [breakdown_df["Monthly"].sum()],
    "Annual": [breakdown_df["Annual"].sum()]
})
breakdown_df = pd.concat([breakdown_df, total_row], ignore_index=True)

def highlight_total_row(row):
    if row["Component"] == "TOTAL":
        return ["font-weight: bold; background-color: #f0f0f0"] * len(row)
    return [""] * len(row)

st.dataframe(
    breakdown_df.style.apply(highlight_total_row, axis=1),
    use_container_width=True,
    hide_index=True,
    column_config={
        "Per Pay Period": st.column_config.NumberColumn(format="$%.2f"),
        "Monthly": st.column_config.NumberColumn(format="$%.2f"),
        "Annual": st.column_config.NumberColumn(format="$%.2f"),
    }
)

st.divider()

# =========================================================
# Employee Details
# =========================================================
st.header("👥 Employee Details")

# Calculate multiplier based on time period selection
if time_period == "Per Pay Period (2x/month)":
    multiplier = 0.5  # Divide monthly by 2
    period_label = "Pay Period"
elif time_period == "Monthly":
    multiplier = 1.0
    period_label = "Month"
else:  # Annual
    multiplier = 12.0
    period_label = "Year"

# Create display dataframe with adjusted values
if include_bonuses:
    display_df = results_df[[
        "Staff_Name",
        "Monthly_Salary",
        "Monthly_Utilization_Bonus",
        "Monthly_Other_Bonus",
        "Phone_Allowance",
        "Firm_Benefits",
        "Monthly_401k",
        "Monthly_FICA",
        "Total_Monthly_Cost",
    ]].copy()
    
    # Apply multiplier to all numeric columns
    numeric_cols = ["Monthly_Salary", "Monthly_Utilization_Bonus", "Monthly_Other_Bonus", 
                    "Phone_Allowance", "Firm_Benefits", "Monthly_401k", "Monthly_FICA", "Total_Monthly_Cost"]
    for col in numeric_cols:
        display_df[col] = display_df[col] * multiplier
    
    # Rename for display
    column_names = {
        "Staff_Name": "Staff Member",
        "Monthly_Salary": f"Base Salary",
        "Monthly_Utilization_Bonus": f"Util. Bonus",
        "Monthly_Other_Bonus": f"Other Bonus",
        "Phone_Allowance": f"Phone",
        "Firm_Benefits": f"Benefits",
        "Monthly_401k": f"401(k)",
        "Monthly_FICA": f"FICA",
        "Total_Monthly_Cost": f"Total $/{period_label.lower()}",
    }
    
    display_df = display_df.rename(columns=column_names)
    
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Base Salary": st.column_config.NumberColumn(format="$%.2f"),
            "Util. Bonus": st.column_config.NumberColumn(format="$%.2f"),
            "Other Bonus": st.column_config.NumberColumn(format="$%.2f"),
            "Phone": st.column_config.NumberColumn(format="$%.2f"),
            "Benefits": st.column_config.NumberColumn(format="$%.2f"),
            "401(k)": st.column_config.NumberColumn(format="$%.2f"),
            "FICA": st.column_config.NumberColumn(format="$%.2f"),
            f"Total $/{period_label.lower()}": st.column_config.NumberColumn(format="$%.2f"),
        }
    )
else:
    display_df = results_df[[
        "Staff_Name",
        "Monthly_Salary",
        "Phone_Allowance",
        "Firm_Benefits",
        "Monthly_401k",
        "Monthly_FICA",
        "Total_Monthly_Cost",
    ]].copy()
    
    # Apply multiplier to all numeric columns
    numeric_cols = ["Monthly_Salary", "Phone_Allowance", "Firm_Benefits", "Monthly_401k", "Monthly_FICA", "Total_Monthly_Cost"]
    for col in numeric_cols:
        display_df[col] = display_df[col] * multiplier
    
    # Rename for display
    column_names = {
        "Staff_Name": "Staff Member",
        "Monthly_Salary": f"Base Salary",
        "Phone_Allowance": f"Phone",
        "Firm_Benefits": f"Benefits",
        "Monthly_401k": f"401(k)",
        "Monthly_FICA": f"FICA",
        "Total_Monthly_Cost": f"Total $/{period_label.lower()}",
    }
    
    display_df = display_df.rename(columns=column_names)
    
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Base Salary": st.column_config.NumberColumn(format="$%.2f"),
            "Phone": st.column_config.NumberColumn(format="$%.2f"),
            "Benefits": st.column_config.NumberColumn(format="$%.2f"),
            "401(k)": st.column_config.NumberColumn(format="$%.2f"),
            "FICA": st.column_config.NumberColumn(format="$%.2f"),
            f"Total $/{period_label.lower()}": st.column_config.NumberColumn(format="$%.2f"),
        }
    )

st.divider()

# =========================================================
# Export
# =========================================================
st.header("📥 Download Report")

# Build Excel
output = BytesIO()
with pd.ExcelWriter(output, engine="openpyxl") as writer:
    # Summary sheet
    summary_df = pd.DataFrame([
        {"Metric": "Total Monthly Cost", "Amount": total_monthly_sum},
        {"Metric": "Total Annual Cost", "Amount": total_annual_sum},
        {"Metric": "Base Salaries (Monthly)", "Amount": total_salary_monthly},
        {"Metric": "Benefits (Monthly)", "Amount": total_benefits},
        {"Metric": "401(k) Match (Monthly)", "Amount": total_401k},
        {"Metric": "FICA (Monthly)", "Amount": total_fica},
        {"Metric": "Burden Rate %", "Amount": burden_rate},
    ])
    summary_df.to_excel(writer, sheet_name="Summary", index=False)
    
    breakdown_df.to_excel(writer, sheet_name="Breakdown", index=False)
    results_df.to_excel(writer, sheet_name="Employee Details", index=False)

excel_bytes = output.getvalue()

st.download_button(
    label="📊 Download Excel Report",
    data=excel_bytes,
    file_name=f"payroll_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    use_container_width=True,
)

# Store report data for email
st.session_state.payroll_report_data = {
    "total_monthly": total_monthly_sum,
    "total_annual": total_annual_sum,
    "include_bonuses": include_bonuses,
    "excel_bytes": excel_bytes,
}

# =========================================================
# Sidebar Email (UN-NESTED)
# =========================================================
if "payroll_report_data" in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")

    notification_email = st.secrets.get("NOTIFICATION_EMAIL", "astudee@voyageadvisory.com")

    email_to = st.sidebar.text_input(
        "Send to:",
        value=notification_email,
        placeholder="email@example.com",
        key="payroll_email_input",
    )

    send_clicked = st.sidebar.button(
        "Send Email",
        type="primary",
        use_container_width=True,
        key="send_payroll_button",
    )

    if send_clicked:
        if not safe_str(email_to):
            st.sidebar.error("Enter an email address")
        else:
            try:
                from googleapiclient.discovery import build
                from google.oauth2 import service_account
                import base64
                from email.message import EmailMessage

                service_account_info = st.secrets.get("SERVICE_ACCOUNT_KEY")
                if not service_account_info:
                    st.sidebar.error("❌ SERVICE_ACCOUNT_KEY missing in secrets")
                else:
                    credentials = service_account.Credentials.from_service_account_info(
                        service_account_info,
                        scopes=["https://www.googleapis.com/auth/gmail.send"],
                        subject="astudee@voyageadvisory.com",
                    )

                    gmail_service = build("gmail", "v1", credentials=credentials)

                    data = st.session_state.payroll_report_data

                    msg = EmailMessage()
                    msg["To"] = email_to
                    msg["From"] = "astudee@voyageadvisory.com"
                    msg["Subject"] = f"Payroll Calculator Report - {datetime.now().strftime('%B %d, %Y')}"

                    bonus_note = "with Bonuses" if data['include_bonuses'] else "without Bonuses"

                    msg.set_content(
                        f"""Payroll Calculator Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Configuration: {bonus_note}

Summary:
- Total Monthly Cost: ${data['total_monthly']:,.2f}
- Total Annual Cost: ${data['total_annual']:,.2f}

Detailed breakdown attached in Excel file.

--
Voyage Advisory Payroll Calculator
"""
                    )

                    msg.add_attachment(
                        data["excel_bytes"],
                        maintype="application",
                        subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        filename=f"payroll_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
                    )

                    encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode()
                    gmail_service.users().messages().send(
                        userId="me",
                        body={"raw": encoded},
                    ).execute()

                    st.sidebar.success(f"✅ Sent to {email_to}!")

            except Exception as e:
                st.sidebar.error(f"❌ {type(e).__name__}")
                st.sidebar.code(str(e))
