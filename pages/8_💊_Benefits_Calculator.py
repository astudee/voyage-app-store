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
# Authentication
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
# Config
# -------------------------
config_sheet_id = st.secrets.get("SHEET_CONFIG_ID")
if not config_sheet_id:
    st.error("❌ SHEET_CONFIG_ID not found in secrets")
    st.stop()

# -------------------------
# Load Data
# -------------------------
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

# -------------------------
# Build Benefits Lookup
# -------------------------
benefits_lookup = {}

for _, row in benefits_df.iterrows():
    code = row['Code']
    benefits_lookup[code] = {
        'description': row['Description'],
        'is_formula': bool(row.get('Is_Formula_Based', False)),
        'total_cost': float(row['Total_Monthly_Cost']) if pd.notna(row['Total_Monthly_Cost']) else 0.0,
        'ee_cost': float(row['EE_Monthly_Cost']) if pd.notna(row['EE_Monthly_Cost']) else 0.0,
        'firm_cost': float(row['Firm_Monthly_Cost']) if pd.notna(row['Firm_Monthly_Cost']) else 0.0,
    }

# -------------------------
# STD / LTD Calculations
# -------------------------
def calculate_std_cost(salary):
    weekly_salary = salary / 52
    weekly_benefit = min(weekly_salary * 0.6667, 2100)
    return round((weekly_benefit / 10) * 0.18, 2)

def calculate_ltd_cost(salary):
    monthly_salary = salary / 12
    return round((monthly_salary / 100) * 0.21, 2)

# -------------------------
# Benefit Cost Resolver
# -------------------------
def resolve_benefit_cost(code, salary):
    if not code or code not in benefits_lookup:
        return 0.0, 0.0, 0.0

    benefit = benefits_lookup[code]

    if benefit['is_formula']:
        if code.startswith('SE'):  # STD
            total = calculate_std_cost(salary)
        elif code.startswith('LE'):  # LTD
            total = calculate_ltd_cost(salary)
        else:
            return 0.0, 0.0, 0.0

        if code.endswith('1'):  # Firm paid
            return total, 0.0, total
        elif code.endswith('2'):  # Employee paid
            return total, total, 0.0
        else:
            return 0.0, 0.0, 0.0

    return benefit['total_cost'], benefit['ee_cost'], benefit['firm_cost']

# =========================================================
# 🚀 GENERATE REPORT BUTTON (CHANGE #1)
# =========================================================
if not st.button("🚀 Generate Benefits Report", type="primary"):
    st.info("Click **Generate Benefits Report** to run calculations.")
    st.stop()

# -------------------------
# Calculate Results
# -------------------------
results = []

for _, emp in staff_df.iterrows():
    salary = emp.get('Salary', 0)

    benefit_codes = {
        'Medical': emp.get('Medical_Plan'),
        'Dental': emp.get('Dental_Plan'),
        'Vision': emp.get('Vision_Plan'),
        'STD': emp.get('STD'),
        'LTD': emp.get('LTD'),
        'Life': emp.get('Life'),
    }

    totals = {}
    ee_totals = {}
    firm_totals = {}

    for k, v in benefit_codes.items():
        t, ee, f = resolve_benefit_cost(v, salary)
        totals[k] = t
        ee_totals[k] = ee
        firm_totals[k] = f

    total_monthly = sum(totals.values())
    ee_monthly = sum(ee_totals.values())
    firm_monthly = sum(firm_totals.values())

    results.append({
        'Staff_Name': emp['Staff_Name'],
        **benefit_codes,
        **{f"{k}_Cost": v for k, v in totals.items()},
        'Total_Monthly': total_monthly,
        'EE_Monthly': ee_monthly,
        'Firm_Monthly': firm_monthly,
        'Total_Yearly': total_monthly * 12,
        'EE_Yearly': ee_monthly * 12,
        'Firm_Yearly': firm_monthly * 12,
    })

results_df = pd.DataFrame(results)

# =========================================================
# 📊 SUMMARY (PRESERVED)
# =========================================================
st.header("📊 Summary")

c1, c2, c3 = st.columns(3)

c1.metric("Total Monthly Cost", f"${results_df['Total_Monthly'].sum():,.2f}")
c2.metric("Employee Paid (Monthly)", f"${results_df['EE_Monthly'].sum():,.2f}")
c3.metric("Firm Paid (Monthly)", f"${results_df['Firm_Monthly'].sum():,.2f}")

st.divider()

# =========================================================
# 📖 BENEFITS LEGEND (CHANGE #2)
# =========================================================
st.header("📖 Benefits Legend")

legend_rows = []

for code, b in benefits_lookup.items():
    if code.startswith(('M', 'D', 'V')):
        legend_rows.append({
            'Code': code,
            'Description': b['description'],
            'Employee Monthly Cost': b['ee_cost'],
            'Firm Monthly Cost': b['firm_cost'],
            'Total Monthly Cost': b['total_cost'],
        })

legend_df = pd.DataFrame(legend_rows)

st.dataframe(
    legend_df.sort_values('Code'),
    use_container_width=True,
    column_config={
        'Employee Monthly Cost': st.column_config.NumberColumn(format="$%.2f"),
        'Firm Monthly Cost': st.column_config.NumberColumn(format="$%.2f"),
        'Total Monthly Cost': st.column_config.NumberColumn(format="$%.2f"),
    },
    hide_index=True
)

st.divider()

# =========================================================
# 👥 EMPLOYEE DETAILS (CHANGE #3 & #4)
# =========================================================
st.header("👥 Employee Details")

detail_cols = [
    'Staff_Name',
    'Medical', 'Dental', 'Vision', 'STD', 'LTD', 'Life',
    'Total_Monthly', 'Total_Yearly',
    'EE_Monthly', 'EE_Yearly',
    'Firm_Monthly', 'Firm_Yearly',
]

detail_df = results_df[detail_cols].copy()

st.dataframe(
    detail_df,
    use_container_width=True,
    hide_index=True,
    column_config={
        'Total_Monthly': st.column_config.NumberColumn(format="$%.2f"),
        'Total_Yearly': st.column_config.NumberColumn(format="$%.2f"),
        'EE_Monthly': st.column_config.NumberColumn(format="$%.2f"),
        'EE_Yearly': st.column_config.NumberColumn(format="$%.2f"),
        'Firm_Monthly': st.column_config.NumberColumn(format="$%.2f"),
        'Firm_Yearly': st.column_config.NumberColumn(format="$%.2f"),
    }
)

st.divider()

# =========================================================
# 📥 EXPORT + EMAIL (PRESERVED)
# =========================================================
st.header("📥 Export")

output = BytesIO()
with pd.ExcelWriter(output, engine='openpyxl') as writer:
    results_df.to_excel(writer, sheet_name='Employee Details', index=False)

excel_data = output.getvalue()

st.download_button(
    "📊 Download Excel",
    excel_data,
    f"benefits_{datetime.now().strftime('%Y%m%d')}.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

st.divider()

st.success("✅ Benefits report generated successfully.")
