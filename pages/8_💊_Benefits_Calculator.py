"""
Benefits Calculator
Calculate employee benefits costs based on current selections
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime
from io import BytesIO

# -------------------------
# Authentication check
# -------------------------
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# -------------------------
# Imports
# -------------------------
sys.path.append('./functions')
import sheets

st.set_page_config(page_title="Benefits Calculator", page_icon="💊", layout="wide")

st.title("💊 Benefits Calculator")
st.markdown("Calculate total benefits costs based on current employee selections")

# -------------------------
# Config from secrets
# -------------------------
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
# Helpers
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

    # Detect formula-based by code prefix (SE* or LE*) since Is_Formula_Based column may not exist
    is_formula = code.startswith('SE') or code.startswith('LE')
    
    benefits_lookup[code] = {
        "description": safe_str(row.get("Description", "")),
        "is_formula": is_formula,
        "total_cost": safe_float(row.get("Total_Monthly_Cost", 0)),
        "ee_cost": safe_float(row.get("EE_Monthly_Cost", 0)),
        "firm_cost": safe_float(row.get("Firm_Monthly_Cost", 0)),
    }

# -------------------------
# Resolve benefit cost (total/ee/firm)
# -------------------------
def resolve_benefit_cost(code, salary, benefit_type):
    """
    Returns: (total, ee, firm, note)
    """
    code = safe_str(code)

    # Treat blank as declined
    if code == "":
        return 0.0, 0.0, 0.0, None

    if code not in benefits_lookup:
        # Unknown code → assume declined
        note = f"Unknown {benefit_type} code: {code} - assumed declined"
        return 0.0, 0.0, 0.0, note

    benefit = benefits_lookup[code]

    # Formula-based (STD/LTD)
    if benefit["is_formula"]:
        if code.startswith("SE"):  # STD
            total = calculate_std_cost(salary)
            if code == "SE1":  # firm paid
                return total, 0.0, total, None
            if code == "SE2":  # employee paid
                return total, total, 0.0, None
            return 0.0, 0.0, 0.0, None

        if code.startswith("LE"):  # LTD
            total = calculate_ltd_cost(salary)
            if code == "LE1":  # firm paid
                return total, 0.0, total, None
            if code == "LE2":  # employee paid
                return total, total, 0.0, None
            return 0.0, 0.0, 0.0, None

        return 0.0, 0.0, 0.0, None

    # Fixed cost from lookup
    total = benefit["total_cost"]
    ee = benefit["ee_cost"]
    firm = benefit["firm_cost"]
    return total, ee, firm, None

# =========================================================
# Generate Report Button (with persistent state flag)
# =========================================================
st.divider()

if "benefits_report_ready" not in st.session_state:
    st.session_state.benefits_report_ready = False

generate_clicked = st.button("📊 Generate Benefits Report", type="primary", use_container_width=True)

if generate_clicked:
    st.session_state.benefits_report_ready = True

# If report not ready, stop (but email logic below still runs if data exists)
if not st.session_state.benefits_report_ready:
    st.info("👆 Click the button above to generate the benefits cost report")
    st.stop()

st.divider()

# =========================================================
# Calculate costs for each employee
# =========================================================
results = []

for _, employee in staff_df.iterrows():
    name = safe_str(employee.get("Staff_Name", ""))
    salary = safe_float(employee.get("Salary", 0))

    medical_code = safe_str(employee.get("Medical_Plan", "")) or "MX"
    dental_code = safe_str(employee.get("Dental_Plan", "")) or "DX"
    vision_code = safe_str(employee.get("Vision_Plan", "")) or "VX"
    std_code = safe_str(employee.get("STD", "")) or "SEX"
    ltd_code = safe_str(employee.get("LTD", "")) or "LEX"
    life_code = safe_str(employee.get("Life", "")) or "TEX"

    notes = []

    med_total, med_ee, med_firm, med_note = resolve_benefit_cost(medical_code, salary, "Medical_Plan")
    den_total, den_ee, den_firm, den_note = resolve_benefit_cost(dental_code, salary, "Dental_Plan")
    vis_total, vis_ee, vis_firm, vis_note = resolve_benefit_cost(vision_code, salary, "Vision_Plan")
    std_total, std_ee, std_firm, std_note = resolve_benefit_cost(std_code, salary, "STD")
    ltd_total, ltd_ee, ltd_firm, ltd_note = resolve_benefit_cost(ltd_code, salary, "LTD")
    life_total, life_ee, life_firm, life_note = resolve_benefit_cost(life_code, salary, "Life")

    for n in [med_note, den_note, vis_note, std_note, ltd_note, life_note]:
        if n:
            notes.append(n)

    total_monthly = med_total + den_total + vis_total + std_total + ltd_total + life_total
    ee_monthly = med_ee + den_ee + vis_ee + std_ee + ltd_ee + life_ee
    firm_monthly = med_firm + den_firm + vis_firm + std_firm + ltd_firm + life_firm

    results.append({
        "Staff_Name": name,
        "Salary": salary,
        # Selections
        "Medical": medical_code,
        "Dental": dental_code,
        "Vision": vision_code,
        "STD": std_code,
        "LTD": ltd_code,
        "Life": life_code,
        # Totals per benefit (monthly)
        "Medical_Cost": med_total,
        "Dental_Cost": den_total,
        "Vision_Cost": vis_total,
        "STD_Cost": std_total,
        "LTD_Cost": ltd_total,
        "Life_Cost": life_total,
        # Totals
        "Total_Monthly": total_monthly,
        "EE_Monthly": ee_monthly,
        "Firm_Monthly": firm_monthly,
        "Total_Yearly": total_monthly * 12,
        "EE_Yearly": ee_monthly * 12,
        "Firm_Yearly": firm_monthly * 12,
        "Notes": "; ".join(notes) if notes else "",
    })

results_df = pd.DataFrame(results)

# =========================================================
# Summary metrics
# =========================================================
st.header("📊 Summary")

total_monthly_sum = float(results_df["Total_Monthly"].sum())
total_yearly_sum = float(results_df["Total_Yearly"].sum())
ee_monthly_sum = float(results_df["EE_Monthly"].sum())
ee_yearly_sum = float(results_df["EE_Yearly"].sum())
firm_monthly_sum = float(results_df["Firm_Monthly"].sum())
firm_yearly_sum = float(results_df["Firm_Yearly"].sum())

col1, col2, col3 = st.columns(3)

card_style = "padding: 1rem; background-color: #FFF4E6; border-radius: 0.5rem; border-left: 4px solid #FF9800;"

with col1:
    st.markdown(f"""
    <div style='{card_style}'>
        <h3 style='margin: 0; color: #666;'>Total Monthly Cost</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${total_monthly_sum:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${total_yearly_sum:,.2f}/year</p>
    </div>
    """, unsafe_allow_html=True)

with col2:
    st.markdown(f"""
    <div style='{card_style}'>
        <h3 style='margin: 0; color: #666;'>Employee Paid (Monthly)</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${ee_monthly_sum:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${ee_yearly_sum:,.2f}/year</p>
    </div>
    """, unsafe_allow_html=True)

with col3:
    st.markdown(f"""
    <div style='{card_style}'>
        <h3 style='margin: 0; color: #666;'>Firm Paid (Monthly)</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${firm_monthly_sum:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${firm_yearly_sum:,.2f}/year</p>
    </div>
    """, unsafe_allow_html=True)

st.divider()

# =========================================================
# Breakdown by benefit type
# =========================================================
st.header("📈 Breakdown by Benefit Type")

benefit_mapping = {
    "Medical": ("Medical_Cost", "Medical"),
    "Dental": ("Dental_Cost", "Dental"),
    "Vision": ("Vision_Cost", "Vision"),
    "STD": ("STD_Cost", "STD"),
    "LTD": ("LTD_Cost", "LTD"),
    "Life/AD&D": ("Life_Cost", "Life"),
}

breakdown_rows = []
for benefit_name, (cost_col, selection_col) in benefit_mapping.items():
    ee_m = 0.0
    firm_m = 0.0

    for _, emp in results_df.iterrows():
        code = safe_str(emp.get(selection_col, ""))
        if not code or code not in benefits_lookup:
            continue

        b = benefits_lookup[code]
        emp_cost = float(emp.get(cost_col, 0.0))

        if b["is_formula"]:
            if code in ["SE1", "LE1"]:
                firm_m += emp_cost
            elif code in ["SE2", "LE2"]:
                ee_m += emp_cost
        else:
            ee_m += b["ee_cost"]
            firm_m += b["firm_cost"]

    total_m = ee_m + firm_m
    breakdown_rows.append({
        "Benefit Type": benefit_name,
        "Employee Monthly Cost": ee_m,
        "Firm Monthly Cost": firm_m,
        "Total Monthly Cost": total_m,
        "Employee Annual Cost": ee_m * 12,
        "Firm Annual Cost": firm_m * 12,
        "Total Annual Cost": total_m * 12,
    })

# totals row
breakdown_rows.append({
    "Benefit Type": "TOTAL",
    "Employee Monthly Cost": sum(r["Employee Monthly Cost"] for r in breakdown_rows),
    "Firm Monthly Cost": sum(r["Firm Monthly Cost"] for r in breakdown_rows),
    "Total Monthly Cost": sum(r["Total Monthly Cost"] for r in breakdown_rows),
    "Employee Annual Cost": sum(r["Employee Annual Cost"] for r in breakdown_rows),
    "Firm Annual Cost": sum(r["Firm Annual Cost"] for r in breakdown_rows),
    "Total Annual Cost": sum(r["Total Annual Cost"] for r in breakdown_rows),
})

breakdown_df = pd.DataFrame(breakdown_rows)

def highlight_total(row):
    if row["Benefit Type"] == "TOTAL":
        return ["font-weight: bold; background-color: #f0f0f0"] * len(row)
    return [""] * len(row)

st.dataframe(
    breakdown_df.style.apply(highlight_total, axis=1),
    use_container_width=True,
    hide_index=True,
    column_config={
        "Employee Monthly Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Firm Monthly Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Total Monthly Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Employee Annual Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Firm Annual Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Total Annual Cost": st.column_config.NumberColumn(format="$%.2f"),
    }
)

st.divider()

# =========================================================
# Benefits Legend
# =========================================================
st.header("📖 Benefits Legend")

with st.expander("View benefit plan codes and descriptions", expanded=False):
    legend_data_with_costs = []
    legend_data_no_costs = []
    
    for code, details in sorted(benefits_lookup.items()):
        if details["is_formula"]:
            legend_data_no_costs.append({
                'Code': code,
                'Description': details["description"]
            })
        else:
            legend_data_with_costs.append({
                'Code': code,
                'Description': details["description"],
                'Total Cost': f"${details['total_cost']:,.2f}",
                'Employee Cost': f"${details['ee_cost']:,.2f}",
                'Firm Cost': f"${details['firm_cost']:,.2f}"
            })
    
    legend_with_costs_df = pd.DataFrame(legend_data_with_costs)
    legend_no_costs_df = pd.DataFrame(legend_data_no_costs)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Medical, Dental, Vision")
        if not legend_with_costs_df.empty:
            mdv_df = legend_with_costs_df[legend_with_costs_df['Code'].str.match(r'^(M|D|V)', na=False)].copy()
            st.dataframe(mdv_df, use_container_width=True, hide_index=True)
        else:
            st.info("No fixed-cost benefits found")
    
    with col2:
        st.subheader("STD, LTD, Life/AD&D")
        if not legend_no_costs_df.empty:
            other_df = legend_no_costs_df[legend_no_costs_df['Code'].str.match(r'^(SE|LE|TE)', na=False)].copy()
            st.dataframe(other_df, use_container_width=True, hide_index=True)
        else:
            st.info("No formula-based benefits found")
    
    st.info("""
**Formula-Based Benefits:**
- **SE1/SE2**: STD cost calculated from salary (66.67% of weekly salary, max $2,100/week benefit)
- **LE1/LE2**: LTD cost calculated from salary (60% benefit cap; premium based on salary formula)
- **SE1/LE1**: 100% Firm Paid
- **SE2/LE2**: 100% Employee Paid
""")

st.divider()

# =========================================================
# Employee Details (with full EE/Firm breakdown)
# =========================================================
st.header("👥 Employee Details")

# Build detailed display with all EE/Firm split columns
detail_rows = []

for _, emp in results_df.iterrows():
    # Get individual benefit codes and costs
    medical_code = emp['Medical']
    dental_code = emp['Dental']
    vision_code = emp['Vision']
    std_code = emp['STD']
    ltd_code = emp['LTD']
    life_code = emp['Life']
    
    salary = emp['Salary']
    
    # Calculate individual EE/Firm splits for each benefit
    def get_ee_firm_for_benefit(code):
        """Returns (total, ee, firm) for a benefit code"""
        if pd.isna(code) or code == '' or code not in benefits_lookup:
            return 0.0, 0.0, 0.0
        
        benefit = benefits_lookup[code]
        
        if benefit['is_formula']:
            # Calculate cost
            if code.startswith('SE'):
                total = calculate_std_cost(salary)
            elif code.startswith('LE'):
                total = calculate_ltd_cost(salary)
            else:
                total = 0.0
            
            # Determine split
            if code in ['SE1', 'LE1']:  # Firm paid
                return total, 0.0, total
            elif code in ['SE2', 'LE2']:  # Employee paid
                return total, total, 0.0
            else:
                return 0.0, 0.0, 0.0
        else:
            # Fixed cost from lookup
            return benefit['total_cost'], benefit['ee_cost'], benefit['firm_cost']
    
    med_total, med_ee, med_firm = get_ee_firm_for_benefit(medical_code)
    den_total, den_ee, den_firm = get_ee_firm_for_benefit(dental_code)
    vis_total, vis_ee, vis_firm = get_ee_firm_for_benefit(vision_code)
    std_total, std_ee, std_firm = get_ee_firm_for_benefit(std_code)
    ltd_total, ltd_ee, ltd_firm = get_ee_firm_for_benefit(ltd_code)
    life_total, life_ee, life_firm = get_ee_firm_for_benefit(life_code)
    
    detail_rows.append({
        'Staff Member': emp['Staff_Name'],
        # Selections
        'Medical': medical_code,
        'Dental': dental_code,
        'Vision': vision_code,
        'STD': std_code,
        'LTD': ltd_code,
        'Life AD&D': life_code,
        # Total Costs (monthly)
        'Medical Cost': med_total,
        'Dental Cost': den_total,
        'Vision Cost': vis_total,
        'STD Cost': std_total,
        'LTD Cost': ltd_total,
        'Life AD&D Cost': life_total,
        'Total $/mo': emp['Total_Monthly'],
        'Total $/year': emp['Total_Yearly'],
        # EE Portion
        'EE Medical': med_ee,
        'EE Dental': den_ee,
        'EE Vision': vis_ee,
        'EE STD': std_ee,
        'EE LTD': ltd_ee,
        'EE Life AD&D': life_ee,
        'EE $/mo': emp['EE_Monthly'],
        'EE $/year': emp['EE_Yearly'],
        # Firm Portion
        'Firm Medical': med_firm,
        'Firm Dental': den_firm,
        'Firm Vision': vis_firm,
        'Firm STD': std_firm,
        'Firm LTD': ltd_firm,
        'Firm Life AD&D': life_firm,
        'Firm $/mo': emp['Firm_Monthly'],
        'Firm $/year': emp['Firm_Yearly'],
        'Notes': emp['Notes']
    })

detail_df = pd.DataFrame(detail_rows)

# Display with currency formatting for all cost columns
st.dataframe(
    detail_df,
    use_container_width=True,
    hide_index=True,
    column_config={
        "Medical Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Dental Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Vision Cost": st.column_config.NumberColumn(format="$%.2f"),
        "STD Cost": st.column_config.NumberColumn(format="$%.2f"),
        "LTD Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Life AD&D Cost": st.column_config.NumberColumn(format="$%.2f"),
        "Total $/mo": st.column_config.NumberColumn(format="$%.2f"),
        "Total $/year": st.column_config.NumberColumn(format="$%.2f"),
        "EE Medical": st.column_config.NumberColumn(format="$%.2f"),
        "EE Dental": st.column_config.NumberColumn(format="$%.2f"),
        "EE Vision": st.column_config.NumberColumn(format="$%.2f"),
        "EE STD": st.column_config.NumberColumn(format="$%.2f"),
        "EE LTD": st.column_config.NumberColumn(format="$%.2f"),
        "EE Life AD&D": st.column_config.NumberColumn(format="$%.2f"),
        "EE $/mo": st.column_config.NumberColumn(format="$%.2f"),
        "EE $/year": st.column_config.NumberColumn(format="$%.2f"),
        "Firm Medical": st.column_config.NumberColumn(format="$%.2f"),
        "Firm Dental": st.column_config.NumberColumn(format="$%.2f"),
        "Firm Vision": st.column_config.NumberColumn(format="$%.2f"),
        "Firm STD": st.column_config.NumberColumn(format="$%.2f"),
        "Firm LTD": st.column_config.NumberColumn(format="$%.2f"),
        "Firm Life AD&D": st.column_config.NumberColumn(format="$%.2f"),
        "Firm $/mo": st.column_config.NumberColumn(format="$%.2f"),
        "Firm $/year": st.column_config.NumberColumn(format="$%.2f"),
    }
)

if "Notes" in results_df.columns and results_df["Notes"].notna().any() and (results_df["Notes"] != "").any():
    st.warning("⚠️ Some employees have notes about benefit selections — see Notes column above.")

st.divider()

# =========================================================
# Export
# =========================================================
st.header("📥 Download Report")

# Build Excel (keep as bytes for stability)
output = BytesIO()
with pd.ExcelWriter(output, engine="openpyxl") as writer:
    summary_df = pd.DataFrame([
        {"Metric": "Total Monthly Cost", "Amount": total_monthly_sum},
        {"Metric": "Total Yearly Cost", "Amount": total_yearly_sum},
        {"Metric": "Employee Paid (Monthly)", "Amount": ee_monthly_sum},
        {"Metric": "Employee Paid (Yearly)", "Amount": ee_yearly_sum},
        {"Metric": "Firm Paid (Monthly)", "Amount": firm_monthly_sum},
        {"Metric": "Firm Paid (Yearly)", "Amount": firm_yearly_sum},
    ])
    summary_df.to_excel(writer, sheet_name="Summary", index=False)
    breakdown_df.to_excel(writer, sheet_name="Breakdown", index=False)
    
    # Export WITHOUT Salary column
    export_df = results_df.drop(columns=["Salary"], errors="ignore")
    export_df.to_excel(writer, sheet_name="Employee Details", index=False)

excel_bytes = output.getvalue()

st.download_button(
    label="📊 Download Excel Report",
    data=excel_bytes,
    file_name=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    use_container_width=True,
)

# Store report data for email (bytes, not BytesIO)
st.session_state.benefits_report_data = {
    "total_monthly": total_monthly_sum,
    "total_yearly": total_yearly_sum,
    "ee_monthly": ee_monthly_sum,
    "ee_yearly": ee_yearly_sum,
    "firm_monthly": firm_monthly_sum,
    "firm_yearly": firm_yearly_sum,
    "excel_bytes": excel_bytes,
}

# =========================================================
# ⚠️ CRITICAL: Email block is UN-NESTED (runs on every rerun)
# =========================================================
if "benefits_report_data" in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")

    notification_email = st.secrets.get("NOTIFICATION_EMAIL", "astudee@voyageadvisory.com")

    email_to = st.sidebar.text_input(
        "Send to:",
        value=notification_email,
        placeholder="email@example.com",
        key="benefits_email_input",
    )

    send_clicked = st.sidebar.button(
        "Send Email",
        type="primary",
        use_container_width=True,
        key="send_benefits_button",
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

                    data = st.session_state.benefits_report_data

                    msg = EmailMessage()
                    msg["To"] = email_to
                    msg["From"] = "astudee@voyageadvisory.com"
                    msg["Subject"] = f"Benefits Calculator Report - {datetime.now().strftime('%B %d, %Y')}"

                    msg.set_content(
                        f"""Benefits Calculator Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Summary:
- Total Monthly Cost: ${data['total_monthly']:,.2f}
- Employee Paid: ${data['ee_monthly']:,.2f}
- Firm Paid: ${data['firm_monthly']:,.2f}

Total Annual Cost: ${data['total_yearly']:,.2f}
- Employee: ${data['ee_yearly']:,.2f}
- Firm: ${data['firm_yearly']:,.2f}

Detailed breakdown attached in Excel file.

--
Voyage Advisory Benefits Calculator
"""
                    )

                    msg.add_attachment(
                        data["excel_bytes"],
                        maintype="application",
                        subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        filename=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
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
