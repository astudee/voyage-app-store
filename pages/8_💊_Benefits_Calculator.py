"""
Benefits Calculator
Calculate employee benefits costs based on current selections
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime
from io import BytesIO

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')
import sheets

st.set_page_config(page_title="Benefits Calculator", page_icon="💊", layout="wide")

st.title("💊 Benefits Calculator")
st.markdown("Calculate total benefits costs based on current employee selections")

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------
config_sheet_id = st.secrets.get("SHEET_CONFIG_ID")
if not config_sheet_id:
    st.error("❌ SHEET_CONFIG_ID not found in secrets")
    st.stop()

# -------------------------------------------------------------------
# Load configuration data
# -------------------------------------------------------------------
with st.spinner("📊 Loading configuration data..."):
    staff_df = sheets.read_config(config_sheet_id, "Staff")
    benefits_df = sheets.read_config(config_sheet_id, "Benefits")

    if staff_df is None or staff_df.empty:
        st.error("❌ Could not load Staff configuration")
        st.stop()

    if benefits_df is None or benefits_df.empty:
        st.error("❌ Could not load Benefits configuration")
        st.stop()

# -------------------------------------------------------------------
# Normalize Benefits column names (CRITICAL FIX)
# -------------------------------------------------------------------
benefits_df.columns = (
    benefits_df.columns
    .astype(str)
    .str.strip()
    .str.replace(' ', '_')
)

benefits_df = benefits_df.rename(columns={
    'EE_Monthly_Cost_': 'EE_Monthly_Cost',
    'Firm_Monthly_Cost_': 'Firm_Monthly_Cost',
    'EE_Monthly': 'EE_Monthly_Cost',
    'Firm_Monthly': 'Firm_Monthly_Cost'
})

st.success(f"✅ Loaded {len(staff_df)} staff members and {len(benefits_df)} benefit options")

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def to_float(val):
    try:
        if pd.isna(val):
            return 0.0
        return float(str(val).replace('$', '').replace(',', '').strip())
    except Exception:
        return 0.0

# -------------------------------------------------------------------
# Build benefits lookup
# -------------------------------------------------------------------
benefits_lookup = {}

for _, row in benefits_df.iterrows():
    code = row['Code']

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

# -------------------------------------------------------------------
# Formula calculations
# -------------------------------------------------------------------
def calculate_std_cost(salary):
    weekly_salary = salary / 52
    weekly_benefit = min(weekly_salary * 0.6667, 2100)
    return round((weekly_benefit / 10) * 0.18, 2)

def calculate_ltd_cost(salary):
    monthly_salary = salary / 12
    return round((monthly_salary / 100) * 0.21, 2)

# -------------------------------------------------------------------
# Benefit cost resolution
# -------------------------------------------------------------------
def get_benefit_cost(code, salary, benefit_type):
    declined_codes = {
        'Medical_Plan': 'MX',
        'Dental_Plan': 'DX',
        'Vision_Plan': 'VX',
        'STD': 'SEX',
        'LTD': 'LEX',
        'Life': 'TEX'
    }

    if not code or code not in benefits_lookup:
        return 0, 0, 0, f"Unknown {benefit_type} code – assumed declined"

    benefit = benefits_lookup[code]

    if benefit['is_formula']:
        if code.startswith('SE'):
            total = calculate_std_cost(salary)
        elif code.startswith('LE'):
            total = calculate_ltd_cost(salary)
        else:
            return 0, 0, 0, None

        if code in ('SE1', 'LE1'):
            return total, 0, total, None
        elif code in ('SE2', 'LE2'):
            return total, total, 0, None
        else:
            return 0, 0, 0, None

    return (
        benefit['total_cost'],
        benefit['ee_cost'],
        benefit['firm_cost'],
        None
    )

# -------------------------------------------------------------------
# Calculate per-employee results
# -------------------------------------------------------------------
results = []

for _, emp in staff_df.iterrows():
    salary = to_float(emp.get('Salary'))
    notes = []

    costs = {}
    for b in ['Medical', 'Dental', 'Vision', 'STD', 'LTD', 'Life']:
        code = emp.get(f"{b}_Plan") if b in ['Medical', 'Dental', 'Vision'] else emp.get(b)
        total, ee, firm
