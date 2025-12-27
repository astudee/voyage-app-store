"""
Benefits Calculator
Calculate employee benefits costs based on current selections
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime

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

# Load configuration data
with st.spinner("📊 Loading configuration data..."):
    try:
        # Load Staff data
        staff_df = sheets.read_config(config_sheet_id, "Staff")
        if staff_df is None or staff_df.empty:
            st.error("❌ Could not load Staff configuration")
            st.stop()
        
        # Load Benefits data
        benefits_df = sheets.read_config(config_sheet_id, "Benefits")
        if benefits_df is None or benefits_df.empty:
            st.error("❌ Could not load Benefits configuration")
            st.stop()
        
        st.success(f"✅ Loaded {len(staff_df)} staff members and {len(benefits_df)} benefit options")
        
    except Exception as e:
        st.error(f"❌ Error loading configuration: {str(e)}")
        st.stop()

# Create lookup dictionary for benefits
benefits_lookup = {}
for _, row in benefits_df.iterrows():
    benefits_lookup[row['Code']] = {
        'description': row['Description'],
        'is_formula': row.get('Is_Formula_Based', False),
        'total_cost': row.get('Total_Monthly_Cost', 0),
        'ee_cost': row.get('EE_Monthly_Cost', 0),
        'firm_cost': row.get('Firm_Monthly_Cost', 0),
        'coverage_pct': row.get('Coverage_Percentage'),
        'max_weekly': row.get('Max_Weekly_Benefit'),
        'max_monthly': row.get('Max_Monthly_Benefit'),
        'rate': row.get('Rate_Per_Unit')
    }

def calculate_std_cost(salary):
    """Calculate STD monthly cost based on salary"""
    weekly_salary = salary / 52
    weekly_benefit = min(weekly_salary * 0.6667, 2100)
    monthly_cost = (weekly_benefit / 10) * 0.18
    return round(monthly_cost, 2)

def calculate_ltd_cost(salary):
    """Calculate LTD monthly cost based on salary"""
    monthly_salary = salary / 12
    monthly_benefit = min(monthly_salary * 0.60, 9000)
    monthly_cost = (monthly_salary / 100) * 0.21
    return round(monthly_cost, 2)

def get_benefit_cost(code, salary, benefit_type):
    """Get benefit cost - either from lookup or calculate if formula-based"""
    
    # Handle None/NaN/blank values - assume declined
    if pd.isna(code) or code == '' or code is None:
        declined_codes = {
            'Medical_Plan': 'MX',
            'Dental_Plan': 'DX',
            'Vision_Plan': 'VX',
            'STD': 'SEX',
            'LTD': 'LEX',
            'Life': 'TEX'
        }
        code = declined_codes.get(benefit_type, 'MX')
        note = f"Unknown {benefit_type} code - assumed declined"
        return 0, 0, 0, note
    
    # Look up benefit
    if code not in benefits_lookup:
        # Unknown code - assume declined
        declined_codes = {
            'Medical_Plan': 'MX',
            'Dental_Plan': 'DX',
            'Vision_Plan': 'VX',
            'STD': 'SEX',
            'LTD': 'LEX',
            'Life': 'TEX'
        }
        declined_code = declined_codes.get(benefit_type, 'MX')
        note = f"Unknown {benefit_type} code: {code} - assumed declined"
        return 0, 0, 0, note
    
    benefit = benefits_lookup[code]
    
    # Check if formula-based
    if benefit['is_formula']:
        # Calculate based on salary
        if code.startswith('SE'):  # STD
            total_cost = calculate_std_cost(salary)
            if code == 'SE1':  # Firm paid
                return total_cost, 0, total_cost, None
            elif code == 'SE2':  # Employee paid
                return total_cost, total_cost, 0, None
        elif code.startswith('LE'):  # LTD
            total_cost = calculate_ltd_cost(salary)
            if code == 'LE1':  # Firm paid
                return total_cost, 0, total_cost, None
            elif code == 'LE2':  # Employee paid
                return total_cost, total_cost, 0, None
    
    # Fixed cost from lookup
    total_cost = benefit['total_cost'] if not pd.isna(benefit['total_cost']) else 0
    ee_cost = benefit['ee_cost'] if not pd.isna(benefit['ee_cost']) else 0
    firm_cost = benefit['firm_cost'] if not pd.isna(benefit['firm_cost']) else 0
    
    return total_cost, ee_cost, firm_cost, None

# Calculate costs for each employee
results = []

for _, employee in staff_df.iterrows():
    name = employee['Staff_Name']
    salary = employee.get('Salary', 0)
    
    # Get each benefit selection
    medical_code = employee.get('Medical_Plan')
    dental_code = employee.get('Dental_Plan')
    vision_code = employee.get('Vision_Plan')
    std_code = employee.get('STD')
    ltd_code = employee.get('LTD')
    life_code = employee.get('Life')
    
    notes = []
    
    # Calculate costs
    med_total, med_ee, med_firm, med_note = get_benefit_cost(medical_code, salary, 'Medical_Plan')
    den_total, den_ee, den_firm, den_note = get_benefit_cost(dental_code, salary, 'Dental_Plan')
    vis_total, vis_ee, vis_firm, vis_note = get_benefit_cost(vision_code, salary, 'Vision_Plan')
    std_total, std_ee, std_firm, std_note = get_benefit_cost(std_code, salary, 'STD')
    ltd_total, ltd_ee, ltd_firm, ltd_note = get_benefit_cost(ltd_code, salary, 'LTD')
    life_total, life_ee, life_firm, life_note = get_benefit_cost(life_code, salary, 'Life')
    
    # Collect notes
    if med_note: notes.append(med_note)
    if den_note: notes.append(den_note)
    if vis_note: notes.append(vis_note)
    if std_note: notes.append(std_note)
    if ltd_note: notes.append(ltd_note)
    if life_note: notes.append(life_note)
    
    # Total monthly costs
    total_monthly = med_total + den_total + vis_total + std_total + ltd_total + life_total
    ee_monthly = med_ee + den_ee + vis_ee + std_ee + ltd_ee + life_ee
    firm_monthly = med_firm + den_firm + vis_firm + std_firm + ltd_firm + life_firm
    
    results.append({
        'Staff_Name': name,
        'Salary': salary,
        'Medical': medical_code or 'MX',
        'Dental': dental_code or 'DX',
        'Vision': vision_code or 'VX',
        'STD': std_code or 'SEX',
        'LTD': ltd_code or 'LEX',
        'Life': life_code or 'TEX',
        'Medical_Cost': med_total,
        'Dental_Cost': den_total,
        'Vision_Cost': vis_total,
        'STD_Cost': std_total,
        'LTD_Cost': ltd_total,
        'Life_Cost': life_total,
        'Total_Monthly': total_monthly,
        'EE_Monthly': ee_monthly,
        'Firm_Monthly': firm_monthly,
        'Total_Yearly': total_monthly * 12,
        'EE_Yearly': ee_monthly * 12,
        'Firm_Yearly': firm_monthly * 12,
        'Notes': '; '.join(notes) if notes else ''
    })

results_df = pd.DataFrame(results)

# Summary metrics
st.header("📊 Summary")

col1, col2, col3 = st.columns(3)

with col1:
    st.metric(
        "Total Monthly Cost",
        f"${results_df['Total_Monthly'].sum():,.2f}",
        f"${results_df['Total_Yearly'].sum():,.2f}/year"
    )

with col2:
    st.metric(
        "Employee Paid (Monthly)",
        f"${results_df['EE_Monthly'].sum():,.2f}",
        f"${results_df['EE_Yearly'].sum():,.2f}/year"
    )

with col3:
    st.metric(
        "Firm Paid (Monthly)",
        f"${results_df['Firm_Monthly'].sum():,.2f}",
        f"${results_df['Firm_Yearly'].sum():,.2f}/year"
    )

st.divider()

# Breakdown by benefit type
st.header("📈 Breakdown by Benefit Type")

breakdown_data = {
    'Medical': results_df['Medical_Cost'].sum(),
    'Dental': results_df['Dental_Cost'].sum(),
    'Vision': results_df['Vision_Cost'].sum(),
    'STD': results_df['STD_Cost'].sum(),
    'LTD': results_df['LTD_Cost'].sum(),
    'Life/AD&D': results_df['Life_Cost'].sum()
}

breakdown_df = pd.DataFrame([
    {
        'Benefit Type': k,
        'Monthly Cost': f"${v:,.2f}",
        'Yearly Cost': f"${v * 12:,.2f}"
    }
    for k, v in breakdown_data.items()
])

st.dataframe(breakdown_df, use_container_width=True, hide_index=True)

st.divider()

# Employee detail table
st.header("👥 Employee Details")

# Display options
show_yearly = st.checkbox("Show yearly costs instead of monthly", value=False)

if show_yearly:
    display_df = results_df[[
        'Staff_Name', 'Salary',
        'Medical', 'Dental', 'Vision', 'STD', 'LTD', 'Life',
        'Total_Yearly', 'EE_Yearly', 'Firm_Yearly', 'Notes'
    ]].copy()
    
    display_df = display_df.rename(columns={
        'Total_Yearly': 'Total Cost (Yearly)',
        'EE_Yearly': 'Employee Paid (Yearly)',
        'Firm_Yearly': 'Firm Paid (Yearly)'
    })
else:
    display_df = results_df[[
        'Staff_Name', 'Salary',
        'Medical', 'Dental', 'Vision', 'STD', 'LTD', 'Life',
        'Total_Monthly', 'EE_Monthly', 'Firm_Monthly', 'Notes'
    ]].copy()
    
    display_df = display_df.rename(columns={
        'Total_Monthly': 'Total Cost (Monthly)',
        'EE_Monthly': 'Employee Paid (Monthly)',
        'Firm_Monthly': 'Firm Paid (Monthly)'
    })

# Format currency columns
cost_cols = [col for col in display_df.columns if 'Cost' in col or 'Paid' in col or col == 'Salary']
for col in cost_cols:
    display_df[col] = display_df[col].apply(lambda x: f"${x:,.2f}")

st.dataframe(display_df, use_container_width=True, hide_index=True)

# Show any notes
if results_df['Notes'].notna().any() and (results_df['Notes'] != '').any():
    st.warning("⚠️ Some employees have notes about benefit selections - see Notes column above")

st.divider()

# Export options
st.header("📥 Export")

col1, col2 = st.columns(2)

with col1:
    # Export to Excel
    from io import BytesIO
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Summary sheet
        summary_df = pd.DataFrame([
            {'Metric': 'Total Monthly Cost', 'Amount': results_df['Total_Monthly'].sum()},
            {'Metric': 'Total Yearly Cost', 'Amount': results_df['Total_Yearly'].sum()},
            {'Metric': 'Employee Paid (Monthly)', 'Amount': results_df['EE_Monthly'].sum()},
            {'Metric': 'Employee Paid (Yearly)', 'Amount': results_df['EE_Yearly'].sum()},
            {'Metric': 'Firm Paid (Monthly)', 'Amount': results_df['Firm_Monthly'].sum()},
            {'Metric': 'Firm Paid (Yearly)', 'Amount': results_df['Firm_Yearly'].sum()},
        ])
        summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        # Breakdown sheet
        breakdown_detail = pd.DataFrame([
            {
                'Benefit Type': k,
                'Monthly Cost': v,
                'Yearly Cost': v * 12
            }
            for k, v in breakdown_data.items()
        ])
        breakdown_detail.to_excel(writer, sheet_name='Breakdown', index=False)
        
        # Employee details
        results_df.to_excel(writer, sheet_name='Employee Details', index=False)
    
    excel_data = output.getvalue()
    
    st.download_button(
        label="📊 Download Excel Report",
        data=excel_data,
        file_name=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

with col2:
    # Export to CSV
    csv_data = results_df.to_csv(index=False)
    
    st.download_button(
        label="📄 Download CSV",
        data=csv_data,
        file_name=f"benefits_calculator_{datetime.now().strftime('%Y%m%d')}.csv",
        mime="text/csv"
    )
