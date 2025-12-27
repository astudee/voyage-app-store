"""
Benefits Calculator
Calculate employee benefits costs based on current selections
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime
from io import BytesIO

# --------------------------------------------------
# Authentication check
# --------------------------------------------------
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# --------------------------------------------------
# Imports
# --------------------------------------------------
sys.path.append('./functions')
import sheets

st.set_page_config(page_title="Benefits Calculator", page_icon="💊", layout="wide")

st.title("💊 Benefits Calculator")
st.markdown("Calculate total benefits costs based on current employee selections")

# --------------------------------------------------
# Config
# --------------------------------------------------
config_sheet_id = st.secrets.get("SHEET_CONFIG_ID")
if not config_sheet_id:
    st.error("❌ SHEET_CONFIG_ID not found in secrets")
    st.stop()

# --------------------------------------------------
# Load configuration data
# --------------------------------------------------
with st.spinner("📊 Loading configuration data..."):
    staff_df = sheets.read_config(config_sheet_id, "Staff")
    benefits_df = sheets.read_config(config_sheet_id, "Benefits")

    if staff_df is None or staff_df.empty:
        st.error("❌ Could not load Staff configuration")
        st.stop()

    if benefits_df is None or benefits_df.empty:
        st.error("❌ Could not load Benefits configuration")
        st.stop()

st.success(f"✅ Loaded {len(staff_df)} staff members and {len(benefits_df)} benefit options")

# --------------------------------------------------
# Normalize Benefits column names (CRITICAL)
# --------------------------------------------------
benefits_df.columns = (
    benefits_df.columns
    .astype(str)
    .str.strip()
    .str.replace(' ', '_')
)

benefits_df = benefits_df.rename(columns={
    'EE_Monthly': 'EE_Monthly_Cost',
    'Firm_Monthly': 'Firm_Monthly_Cost',
    'EE_Monthly_Cost_': 'EE_Monthly_Cost',
    'Firm_Monthly_Cost_': 'Firm_Monthly_Cost'
})

# --------------------------------------------------
# Helpers
# --------------------------------------------------
def to_float(val):
    try:
        if pd.isna(val):
            return 0.0
        return float(str(val).replace('$', '').replace(',', '').strip())
    except Exception:
        return 0.0

# --------------------------------------------------
# Build benefits lookup
# --------------------------------------------------
benefits_lookup = {}

for _, row in benefits_df.iterrows():
    code = row.get('Code')

    benefits_lookup[code] = {
        'description': row.get('Description', ''),
        'is_formula': bool(row.get('Is_Formula_Based', False)),
        'total_cost': to_float(row.get('Total_Monthly_Cost')),
        'ee_cost': to_float(row.get('EE_Monthly_Cost')),
        'firm_cost': to_float(row.get('Firm_Monthly_Cost')),
        'coverage_pct': row.get('Coverage_Percentage'),
        'max_weekly': row.get('Max_Weekly_Benefit'),
        'max_monthly': row.get('Max_Monthly_Benefit'),
        'rate': row.get('Rate_Per_Unit')
    }

# --------------------------------------------------
# Formula calculations
# --------------------------------------------------
def calculate_std_cost(salary):
    weekly_salary = salary / 52
    weekly_benefit = min(weekly_salary * 0.6667, 2100)
    return round((weekly_benefit / 10) * 0.18, 2)

def calculate_ltd_cost(salary):
    monthly_salary = salary / 12
    return round((monthly_salary / 100) * 0.21, 2)

# --------------------------------------------------
# Benefit cost resolver (FIXED)
# --------------------------------------------------
def get_benefit_cost(code, salary, benefit_type):
    declined_codes = {
        'Medical': 'MX',
        'Dental': 'DX',
        'Vision': 'VX',
        'STD': 'SEX',
        'LTD': 'LEX',
        'Life': 'TEX'
    }

    if not code or code not in benefits_lookup:
        return 0.0, 0.0, 0.0

    benefit = benefits_lookup[code]

    # Formula-based benefits
    if benefit['is_formula']:
        if code.startswith('SE'):
            total = calculate_std_cost(salary)
        elif code.startswith('LE'):
            total = calculate_ltd_cost(salary)
        else:
            return 0.0, 0.0, 0.0

        if code in ('SE1', 'LE1'):
            return total, 0.0, total
        elif code in ('SE2', 'LE2'):
            return total, total, 0.0
        else:
            return 0.0, 0.0, 0.0

    # Fixed-cost benefits
    total = benefit['total_cost']
    ee = benefit['ee_cost']
    firm = benefit['firm_cost']

    return total, ee, firm

# --------------------------------------------------
# Calculate per-employee results
# --------------------------------------------------
results = []

for _, emp in staff_df.iterrows():
    salary = to_float(emp.get('Salary'))

    medical = emp.get('Medical_Plan')
    dental = emp.get('Dental_Plan')
    vision = emp.get('Vision_Plan')
    std = emp.get('STD')
    ltd = emp.get('LTD')
    life = emp.get('Life')

    med_total, med_ee, med_firm = get_benefit_cost(medical, salary, 'Medical')
    den_total, den_ee, den_firm = get_benefit_cost(dental, salary, 'Dental')
    vis_total, vis_ee, vis_firm = get_benefit_cost(vision, salary, 'Vision')
    std_total, std_ee, std_firm = get_benefit_cost(std, salary, 'STD')
    ltd_total, ltd_ee, ltd_firm = get_benefit_cost(ltd, salary, 'LTD')
    life_total, life_ee, life_firm = get_benefit_cost(life, salary, 'Life')

    total_monthly = (
        med_total + den_total + vis_total +
        std_total + ltd_total + life_total
    )

    ee_monthly = (
        med_ee + den_ee + vis_ee +
        std_ee + ltd_ee + life_ee
    )

    firm_monthly = (
        med_firm + den_firm + vis_firm +
        std_firm + ltd_firm + life_firm
    )

    results.append({
        'Staff_Name': emp['Staff_Name'],
        'Salary': salary,
        'Total_Monthly': total_monthly,
        'EE_Monthly': ee_monthly,
        'Firm_Monthly': firm_monthly,
        'Total_Yearly': total_monthly * 12,
        'EE_Yearly': ee_monthly * 12,
        'Firm_Yearly': firm_monthly * 12
    })

results_df = pd.DataFrame(results)

# --------------------------------------------------
# Display
# --------------------------------------------------
st.header("📊 Results")
st.dataframe(results_df, use_container_width=True, hide_index=True)

# --------------------------------------------------
# Export
# --------------------------------------------------
st.header("📥 Export")

output = BytesIO()
with pd.ExcelWriter(output, engine='openpyxl') as writer:
    results_df.to_excel(writer, sheet_name='Employee Summary', index=False)

st.download_button(
    "📊 Download Excel Report",
    output.getvalue(),
    file_name=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)
