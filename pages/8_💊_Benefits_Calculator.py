"""
Benefits Calculator
Calculate employee benefits costs based on current selections
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

st.set_page_config(page_title="Benefits Calculator", page_icon="💊", layout="wide")

st.title("💊 Benefits Calculator")
st.markdown("Calculate total benefits costs based on current employee selections")

# Config from secrets
config_sheet_id = st.secrets.get("SHEET_CONFIG_ID")
if not config_sheet_id:
    st.error("❌ SHEET_CONFIG_ID not found in secrets")
    st.stop()

# -----------------------------
# Helpers
# -----------------------------
def to_float(val) -> float:
    """Robust float conversion for sheet values (handles $, commas, blanks, strings)."""
    try:
        if pd.isna(val):
            return 0.0
        s = str(val).strip()
        if s == "" or s.lower() in ("none", "nan"):
            return 0.0
        s = s.replace("$", "").replace(",", "")
        return float(s)
    except Exception:
        return 0.0

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to consistent snake-ish format."""
    df = df.copy()
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.replace("\n", " ")
        .str.replace("\t", " ")
        .str.replace("  ", " ")
        .str.replace(" ", "_")
    )
    return df

# -----------------------------
# Load configuration data
# -----------------------------
with st.spinner("📊 Loading configuration data..."):
    try:
        staff_df = sheets.read_config(config_sheet_id, "Staff")
        benefits_df = sheets.read_config(config_sheet_id, "Benefits")

        if staff_df is None or staff_df.empty:
            st.error("❌ Could not load Staff configuration")
            st.stop()

        if benefits_df is None or benefits_df.empty:
            st.error("❌ Could not load Benefits configuration")
            st.stop()

    except Exception as e:
        st.error(f"❌ Error loading configuration: {str(e)}")
        st.stop()

# Normalize columns (this prevents subtle header mismatch issues)
staff_df = normalize_columns(staff_df)
benefits_df = normalize_columns(benefits_df)

# Defensive rename in case sheet uses slightly different labels
benefits_df = benefits_df.rename(columns={
    "EE_Monthly": "EE_Monthly_Cost",
    "Firm_Monthly": "Firm_Monthly_Cost",
    "Employee_Monthly_Cost": "EE_Monthly_Cost",
    "Company_Monthly_Cost": "Firm_Monthly_Cost",
    "Employer_Monthly_Cost": "Firm_Monthly_Cost",
})

st.success(f"✅ Loaded {len(staff_df)} staff members and {len(benefits_df)} benefit options")

# -----------------------------
# Create lookup dictionary for benefits
# -----------------------------
required_cols = ["Code", "Description", "Total_Monthly_Cost", "EE_Monthly_Cost", "Firm_Monthly_Cost"]
missing = [c for c in required_cols if c not in benefits_df.columns]
if missing:
    st.error(f"❌ Benefits tab is missing required columns: {', '.join(missing)}")
    st.stop()

benefits_lookup = {}
for _, row in benefits_df.iterrows():
    code = str(row["Code"]).strip() if not pd.isna(row["Code"]) else ""
    if code == "":
        continue

    benefits_lookup[code] = {
        "description": row.get("Description", ""),
        "is_formula": bool(row.get("Is_Formula_Based", False)),
        "total_cost": to_float(row.get("Total_Monthly_Cost")),
        "ee_cost": to_float(row.get("EE_Monthly_Cost")),
        "firm_cost": to_float(row.get("Firm_Monthly_Cost")),
        "coverage_pct": row.get("Coverage_Percentage", None),
        "max_weekly": row.get("Max_Weekly_Benefit", None),
        "max_monthly": row.get("Max_Monthly_Benefit", None),
        "rate": row.get("Rate_Per_Unit", None),
    }

# Optional debug
with st.sidebar:
    st.subheader("Debug")
    show_debug = st.checkbox("Show ME1 lookup", value=False)
    if show_debug:
        st.write("ME1:", benefits_lookup.get("ME1", "ME1 not found"))

# -----------------------------
# Formula calculations
# -----------------------------
def calculate_std_cost(salary: float) -> float:
    """Calculate STD monthly cost based on salary."""
    weekly_salary = salary / 52
    weekly_benefit = min(weekly_salary * 0.6667, 2100)
    monthly_cost = (weekly_benefit / 10) * 0.18
    return round(monthly_cost, 2)

def calculate_ltd_cost(salary: float) -> float:
    """Calculate LTD monthly cost based on salary."""
    monthly_salary = salary / 12
    # Benefit cap exists but cost formula is based on salary per your spec
    monthly_cost = (monthly_salary / 100) * 0.21
    return round(monthly_cost, 2)

# -----------------------------
# Benefit cost resolver
# -----------------------------
DECLINED_CODES = {
    "Medical_Plan": "MX",
    "Dental_Plan": "DX",
    "Vision_Plan": "VX",
    "STD": "SEX",
    "LTD": "LEX",
    "Life": "TEX",
}

def get_benefit_cost(code, salary: float, benefit_type: str):
    """Return (total, ee, firm, note)."""
    # Handle blanks / missing as declined
    if pd.isna(code) or code is None or str(code).strip() == "":
        return 0.0, 0.0, 0.0, None

    code = str(code).strip()

    if code not in benefits_lookup:
        note = f"Unknown {benefit_type} code: {code} - assumed declined"
        return 0.0, 0.0, 0.0, note

    benefit = benefits_lookup[code]

    # Formula-based benefits (STD/LTD)
    if benefit["is_formula"]:
        if code.startswith("SE"):  # STD
            total_cost = calculate_std_cost(salary)
            if code == "SE1":  # Firm paid
                return total_cost, 0.0, total_cost, None
            if code == "SE2":  # Employee paid
                return total_cost, total_cost, 0.0, None
            # SEX or other declined-like
            return 0.0, 0.0, 0.0, None

        if code.startswith("LE"):  # LTD
            total_cost = calculate_ltd_cost(salary)
            if code == "LE1":  # Firm paid
                return total_cost, 0.0, total_cost, None
            if code == "LE2":  # Employee paid
                return total_cost, total_cost, 0.0, None
            # LEX or other declined-like
            return 0.0, 0.0, 0.0, None

    # Fixed cost from lookup (THIS is where your prior bug manifested)
    total_cost = float(benefit["total_cost"]) if not pd.isna(benefit["total_cost"]) else 0.0
    ee_cost = float(benefit["ee_cost"]) if not pd.isna(benefit["ee_cost"]) else 0.0
    firm_cost = float(benefit["firm_cost"]) if not pd.isna(benefit["firm_cost"]) else 0.0

    # Optional safety: if total is present but splits are 0, flag it
    note = None
    if total_cost > 0 and ee_cost == 0 and firm_cost == 0:
        note = f"{benefit_type} {code} has total>0 but EE/Firm are 0 — check Benefits tab columns E/F"
    return total_cost, ee_cost, firm_cost, note

# -----------------------------
# Calculate costs for each employee
# -----------------------------
results = []

# Normalize expected staff column names (in case sheet headers differ slightly)
staff_df = staff_df.rename(columns={
    "Staff_Name": "Staff_Name",
    "Medical_Plan": "Medical_Plan",
    "Dental_Plan": "Dental_Plan",
    "Vision_Plan": "Vision_Plan",
})

# Validate required staff cols
staff_required = ["Staff_Name", "Salary", "Medical_Plan", "Dental_Plan", "Vision_Plan", "STD", "LTD", "Life"]
missing_staff = [c for c in staff_required if c not in staff_df.columns]
if missing_staff:
    st.error(f"❌ Staff tab is missing required columns: {', '.join(missing_staff)}")
    st.stop()

for _, employee in staff_df.iterrows():
    name = employee.get("Staff_Name", "")
    salary = to_float(employee.get("Salary", 0))

    medical_code = employee.get("Medical_Plan")
    dental_code = employee.get("Dental_Plan")
    vision_code = employee.get("Vision_Plan")
    std_code = employee.get("STD")
    ltd_code = employee.get("LTD")
    life_code = employee.get("Life")

    notes = []

    med_total, med_ee, med_firm, med_note = get_benefit_cost(medical_code, salary, "Medical_Plan")
    den_total, den_ee, den_firm, den_note = get_benefit_cost(dental_code, salary, "Dental_Plan")
    vis_total, vis_ee, vis_firm, vis_note = get_benefit_cost(vision_code, salary, "Vision_Plan")
    std_total, std_ee, std_firm, std_note = get_benefit_cost(std_code, salary, "STD")
    ltd_total, ltd_ee, ltd_firm, ltd_note = get_benefit_cost(ltd_code, salary, "LTD")
    life_total, life_ee, life_firm, life_note = get_benefit_cost(life_code, salary, "Life")

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
        "Medical": str(medical_code).strip() if not pd.isna(medical_code) and str(medical_code).strip() else "MX",
        "Dental": str(dental_code).strip() if not pd.isna(dental_code) and str(dental_code).strip() else "DX",
        "Vision": str(vision_code).strip() if not pd.isna(vision_code) and str(vision_code).strip() else "VX",
        "STD": str(std_code).strip() if not pd.isna(std_code) and str(std_code).strip() else "SEX",
        "LTD": str(ltd_code).strip() if not pd.isna(ltd_code) and str(ltd_code).strip() else "LEX",
        "Life": str(life_code).strip() if not pd.isna(life_code) and str(life_code).strip() else "TEX",

        # Totals (monthly)
        "Medical_Cost": med_total,
        "Dental_Cost": den_total,
        "Vision_Cost": vis_total,
        "STD_Cost": std_total,
        "LTD_Cost": ltd_total,
        "Life_Cost": life_total,

        "Total_Monthly": total_monthly,
        "EE_Monthly": ee_monthly,
        "Firm_Monthly": firm_monthly,

        # Annual
        "Total_Yearly": total_monthly * 12,
        "EE_Yearly": ee_monthly * 12,
        "Firm_Yearly": firm_monthly * 12,

        # EE Split (monthly)
        "EE_Medical": med_ee,
        "EE_Dental": den_ee,
        "EE_Vision": vis_ee,
        "EE_STD": std_ee,
        "EE_LTD": ltd_ee,
        "EE_Life": life_ee,

        # Firm Split (monthly)
        "Firm_Medical": med_firm,
        "Firm_Dental": den_firm,
        "Firm_Vision": vis_firm,
        "Firm_STD": std_firm,
        "Firm_LTD": ltd_firm,
        "Firm_Life": life_firm,

        "Notes": "; ".join(notes) if notes else "",
    })

results_df = pd.DataFrame(results)

# -----------------------------
# SORT LOGIC (FIX FOR ISSUE #3)
# -----------------------------
if not results_df.empty:
    results_df = results_df.sort_values(by="Staff_Name", ignore_index=True)

# -----------------------------
# Summary metrics
# -----------------------------
st.header("📊 Summary")

col1, col2, col3 = st.columns(3)

total_monthly = results_df["Total_Monthly"].sum()
total_yearly = results_df["Total_Yearly"].sum()
ee_monthly_sum = results_df["EE_Monthly"].sum()
ee_yearly_sum = results_df["EE_Yearly"].sum()
firm_monthly_sum = results_df["Firm_Monthly"].sum()
firm_yearly_sum = results_df["Firm_Yearly"].sum()

card_style = "padding: 1rem; background-color: #FFF4E6; border-radius: 0.5rem; border-left: 4px solid #FF9800;"

with col1:
    st.markdown(
        f"""
        <div style='{card_style}'>
            <h3 style='margin: 0; color: #666;'>Total Monthly Cost</h3>
            <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${total_monthly:,.2f}</h2>
            <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${total_yearly:,.2f}/year</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

with col2:
    st.markdown(
        f"""
        <div style='{card_style}'>
            <h3 style='margin: 0; color: #666;'>Employee Paid (Monthly)</h3>
            <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${ee_monthly_sum:,.2f}</h2>
            <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${ee_yearly_sum:,.2f}/year</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

with col3:
    st.markdown(
        f"""
        <div style='{card_style}'>
            <h3 style='margin: 0; color: #666;'>Firm Paid (Monthly)</h3>
            <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${firm_monthly_sum:,.2f}</h2>
            <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${firm_yearly_sum:,.2f}/year</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

st.divider()

# -----------------------------
# Breakdown by benefit type
# -----------------------------
st.header("📈 Breakdown by Benefit Type")

breakdown_rows = [
    {
        "Benefit Type": "Medical",
        "Employee Monthly Cost": results_df["EE_Medical"].sum(),
        "Firm Monthly Cost": results_df["Firm_Medical"].sum(),
    },
    {
        "Benefit Type": "Dental",
        "Employee Monthly Cost": results_df["EE_Dental"].sum(),
        "Firm Monthly Cost": results_df["Firm_Dental"].sum(),
    },
    {
        "Benefit Type": "Vision",
        "Employee Monthly Cost": results_df["EE_Vision"].sum(),
        "Firm Monthly Cost": results_df["Firm_Vision"].sum(),
    },
    {
        "Benefit Type": "STD",
        "Employee Monthly Cost": results_df["EE_STD"].sum(),
        "Firm Monthly Cost": results_df["Firm_STD"].sum(),
    },
    {
        "Benefit Type": "LTD",
        "Employee Monthly Cost": results_df["EE_LTD"].sum(),
        "Firm Monthly Cost": results_df["Firm_LTD"].sum(),
    },
    {
        "Benefit Type": "Life/AD&D",
        "Employee Monthly Cost": results_df["EE_Life"].sum(),
        "Firm Monthly Cost": results_df["Firm_Life"].sum(),
    },
]

for r in breakdown_rows:
    r["Total Monthly Cost"] = r["Employee Monthly Cost"] + r["Firm Monthly Cost"]
    r["Employee Annual Cost"] = r["Employee Monthly Cost"] * 12
    r["Firm Annual Cost"] = r["Firm Monthly Cost"] * 12
    r["Total Annual Cost"] = r["Total Monthly Cost"] * 12

# Totals row
total_ee = sum(r["Employee Monthly Cost"] for r in breakdown_rows)
total_firm = sum(r["Firm Monthly Cost"] for r in breakdown_rows)
total_all = sum(r["Total Monthly Cost"] for r in breakdown_rows)

breakdown_rows.append({
    "Benefit Type": "TOTAL",
    "Employee Monthly Cost": total_ee,
    "Firm Monthly Cost": total_firm,
    "Total Monthly Cost": total_all,
    "Employee Annual Cost": total_ee * 12,
    "Firm Annual Cost": total_firm * 12,
    "Total Annual Cost": total_all * 12,
})

breakdown_export_df = pd.DataFrame(breakdown_rows)

# Display formatted
breakdown_display_df = breakdown_export_df.copy()
for col in breakdown_display_df.columns:
    if "Cost" in col:
        breakdown_display_df[col] = breakdown_display_df[col].apply(lambda x: f"${x:,.2f}")

def highlight_total(row):
    if row["Benefit Type"] == "TOTAL":
        return ["font-weight: bold; background-color: #f0f0f0"] * len(row)
    return [""] * len(row)

st.dataframe(
    breakdown_display_df.style.apply(highlight_total, axis=1),
    use_container_width=True,
    hide_index=True
)

st.divider()

# -----------------------------
# Benefits Legend
# -----------------------------
st.header("📖 Benefits Legend")

with st.expander("View benefit plan codes and descriptions", expanded=False):
    # Prepare legend data with costs (FIX FOR ISSUE #1)
    legend_data = []
    for code, details in sorted(benefits_lookup.items()):
        is_formula = details.get("is_formula", False)
        
        # Format costs for display
        if is_formula:
            # For formula benefits, we don't have a single fixed cost to display in the legend
            t_cost = "Formula"
            e_cost = "Formula"
            f_cost = "Formula"
        else:
            t_cost = f"${details.get('total_cost', 0):,.2f}"
            e_cost = f"${details.get('ee_cost', 0):,.2f}"
            f_cost = f"${details.get('firm_cost', 0):,.2f}"

        legend_data.append({
            "Code": code, 
            "Description": details.get("description", ""),
            "Total Cost": t_cost,
            "EE Cost": e_cost,
            "Firm Cost": f_cost
        })
        
    legend_df = pd.DataFrame(legend_data)

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Medical, Dental, Vision")
        # Filter for M, D, V codes
        mdv_df = legend_df[legend_df["Code"].str.match(r"^(M|D|V)", na=False)].copy()
        st.dataframe(mdv_df, use_container_width=True, hide_index=True)

    with col2:
        st.subheader("STD, LTD, Life/AD&D")
        # Filter for SE, LE, TE codes
        other_df = legend_df[legend_df["Code"].str.match(r"^(SE|LE|TE)", na=False)].copy()
        # For these, the cost columns might say "Formula", which is fine
        st.dataframe(other_df, use_container_width=True, hide_index=True)

    st.info(
        """
**Formula-Based Benefits:**
- **SE1/SE2**: STD cost calculated from salary (66.67% of weekly salary, max $2,100/week benefit)
- **LE1/LE2**: LTD cost calculated from salary (60% benefit cap exists; premium calculated per salary formula)
- **SE1/LE1**: 100% Firm Paid
- **SE2/LE2**: 100% Employee Paid
"""
    )

st.divider()

# -----------------------------
# Employee Details (Sorted)
# -----------------------------
st.header("👥 Employee Details")

# Create display table similar to your prior version
# FIX FOR ISSUE #2: Removed Salary column from UI
detail_df = pd.DataFrame({
    "Staff Member": results_df["Staff_Name"],
    # "Salary": results_df["Salary"], # Removed for privacy/UI cleanup

    "Medical": results_df["Medical"],
    "Dental": results_df["Dental"],
    "Vision": results_df["Vision"],
    "STD": results_df["STD"],
    "LTD": results_df["LTD"],
    "Life AD&D": results_df["Life"],

    "Medical Cost": results_df["Medical_Cost"],
    "Dental Cost": results_df["Dental_Cost"],
    "Vision Cost": results_df["Vision_Cost"],
    "STD Cost": results_df["STD_Cost"],
    "LTD Cost": results_df["LTD_Cost"],
    "Life AD&D Cost": results_df["Life_Cost"],

    "Total $/mo": results_df["Total_Monthly"],
    "Total $/year": results_df["Total_Yearly"],

    "EE Medical": results_df["EE_Medical"],
    "EE Dental": results_df["EE_Dental"],
    "EE Vision": results_df["EE_Vision"],
    "EE STD": results_df["EE_STD"],
    "EE LTD": results_df["EE_LTD"],
    "EE Life AD&D": results_df["EE_Life"],
    "EE $/mo": results_df["EE_Monthly"],
    "EE $/year": results_df["EE_Yearly"],

    "Firm Medical": results_df["Firm_Medical"],
    "Firm Dental": results_df["Firm_Dental"],
    "Firm Vision": results_df["Firm_Vision"],
    "Firm STD": results_df["Firm_STD"],
    "Firm LTD": results_df["Firm_LTD"],
    "Firm Life AD&D": results_df["Firm_Life"],
    "Firm $/mo": results_df["Firm_Monthly"],
    "Firm $/year": results_df["Firm_Yearly"],

    "Notes": results_df["Notes"],
})

# Format currency columns for display
currency_cols = [c for c in detail_df.columns if ("Cost" in c) or (c.endswith("$/mo")) or (c.endswith("$/year")) or c.startswith("EE ") or c.startswith("Firm ") or c == "Salary"]
for c in currency_cols:
    if c in detail_df.columns:
        detail_df[c] = detail_df[c].apply(lambda x: f"${to_float(x):,.2f}")

st.dataframe(detail_df, use_container_width=True, hide_index=True)

if (results_df["Notes"].fillna("") != "").any():
    st.warning("⚠️ Some employees have notes about benefit selections — see Notes column above")

st.divider()

# -----------------------------
# Export options
# -----------------------------
st.header("📥 Export")

# Build Excel bytes ONCE so both Download + Email share the same attachment
output = BytesIO()
with pd.ExcelWriter(output, engine="openpyxl") as writer:
    summary_export_df = pd.DataFrame([
        {"Metric": "Total Monthly Cost", "Amount": total_monthly},
        {"Metric": "Total Yearly Cost", "Amount": total_yearly},
        {"Metric": "Employee Paid (Monthly)", "Amount": ee_monthly_sum},
        {"Metric": "Employee Paid (Yearly)", "Amount": ee_yearly_sum},
        {"Metric": "Firm Paid (Monthly)", "Amount": firm_monthly_sum},
        {"Metric": "Firm Paid (Yearly)", "Amount": firm_yearly_sum},
    ])
    summary_export_df.to_excel(writer, sheet_name="Summary", index=False)
    breakdown_export_df.to_excel(writer, sheet_name="Breakdown", index=False)
    
    # Export full details (excluding Salary column from Excel as well to match UI request)
    export_details = results_df.drop(columns=["Salary"], errors="ignore")
    export_details.to_excel(writer, sheet_name="Employee Details", index=False)

excel_data = output.getvalue()

col1, col2 = st.columns(2)

with col1:
    st.download_button(
        label="📊 Download Excel Report",
        data=excel_data,
        file_name=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

with col2:
    notification_email = st.secrets.get("NOTIFICATION_EMAIL", "astudee@voyageadvisory.com")
    email_to = st.text_input("Email report to:", value=notification_email)

    if st.button("📧 Send Email Report"):
        if email_to:
            try:
                from googleapiclient.discovery import build
                from google.oauth2 import service_account
                import base64
                from email.message import EmailMessage

                service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
                credentials = service_account.Credentials.from_service_account_info(
                    service_account_info,
                    scopes=["https://www.googleapis.com/auth/gmail.send"],
                    subject="astudee@voyageadvisory.com",
                )

                gmail_service = build("gmail", "v1", credentials=credentials)

                msg = EmailMessage()
                msg["To"] = email_to
                msg["From"] = "astudee@voyageadvisory.com"
                msg["Subject"] = f"Benefits Calculator Report - {datetime.now().strftime('%B %d, %Y')}"

                msg.set_content(
                    f"""Benefits Calculator Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Summary:
- Total Monthly Cost: ${total_monthly:,.2f}
- Employee Paid: ${ee_monthly_sum:,.2f}
- Firm Paid: ${firm_monthly_sum:,.2f}

Total Annual Cost: ${total_yearly:,.2f}
- Employee: ${ee_yearly_sum:,.2f}
- Firm: ${firm_yearly_sum:,.2f}

Detailed breakdown attached in Excel file.

--
Voyage Advisory Benefits Calculator
"""
                )

                msg.add_attachment(
                    excel_data,
                    maintype="application",
                    subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    filename=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
                )

                encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode()
                gmail_service.users().messages().send(
                    userId="me",
                    body={"raw": encoded},
                ).execute()

                st.success(f"✅ Email sent to {email_to}")

            except Exception as e:
                st.error(f"❌ Failed to send email: {str(e)}")
        else:
            st.warning("Please enter an email address")
