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
    code = row['Code']
    benefits_lookup[code] = {
        'description': row['Description'],
        'is_formula': row.get('Is_Formula_Based', False),
        'total_cost': float(row.get('Total_Monthly_Cost', 0)) if pd.notna(row.get('Total_Monthly_Cost')) else 0,
        'ee_cost': float(row.get('EE_Monthly_Cost', 0)) if pd.notna(row.get('EE_Monthly_Cost')) else 0,
        'firm_cost': float(row.get('Firm_Monthly_Cost', 0)) if pd.notna(row.get('Firm_Monthly_Cost')) else 0,
        'coverage_pct': row.get('Coverage_Percentage'),
        'max_weekly': row.get('Max_Weekly_Benefit'),
        'max_monthly': row.get('Max_Monthly_Benefit'),
        'rate': row.get('Rate_Per_Unit')
    }

# Debug: Show a sample lookup
if 'ME1' in benefits_lookup:
    st.sidebar.write("DEBUG - ME1 lookup:", benefits_lookup['ME1'])

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
    total_monthly = results_df['Total_Monthly'].sum()
    total_yearly = results_df['Total_Yearly'].sum()
    st.markdown(f"""
    <div style='padding: 1rem; background-color: #FFF4E6; border-radius: 0.5rem; border-left: 4px solid #FF9800;'>
        <h3 style='margin: 0; color: #666;'>Total Monthly Cost</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${total_monthly:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${total_yearly:,.2f}/year</p>
    </div>
    """, unsafe_allow_html=True)

with col2:
    ee_monthly = results_df['EE_Monthly'].sum()
    ee_yearly = results_df['EE_Yearly'].sum()
    st.markdown(f"""
    <div style='padding: 1rem; background-color: #FFF4E6; border-radius: 0.5rem; border-left: 4px solid #FF9800;'>
        <h3 style='margin: 0; color: #666;'>Employee Paid (Monthly)</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${ee_monthly:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${ee_yearly:,.2f}/year</p>
    </div>
    """, unsafe_allow_html=True)

with col3:
    firm_monthly = results_df['Firm_Monthly'].sum()
    firm_yearly = results_df['Firm_Yearly'].sum()
    st.markdown(f"""
    <div style='padding: 1rem; background-color: #FFF4E6; border-radius: 0.5rem; border-left: 4px solid #FF9800;'>
        <h3 style='margin: 0; color: #666;'>Firm Paid (Monthly)</h3>
        <h2 style='margin: 0.5rem 0 0 0; color: #333;'>${firm_monthly:,.2f}</h2>
        <p style='margin: 0.5rem 0 0 0; color: #666; font-size: 0.9rem;'>${firm_yearly:,.2f}/year</p>
    </div>
    """, unsafe_allow_html=True)

st.divider()

# Breakdown by benefit type
st.header("📈 Breakdown by Benefit Type")

# Calculate breakdown with employee/firm split from results_df
breakdown_rows = []

# Map benefit names to their cost columns and selection columns
benefit_mapping = {
    'Medical': ('Medical_Cost', 'Medical'),
    'Dental': ('Dental_Cost', 'Dental'),
    'Vision': ('Vision_Cost', 'Vision'),
    'STD': ('STD_Cost', 'STD'),
    'LTD': ('LTD_Cost', 'LTD'),
    'Life/AD&D': ('Life_Cost', 'Life')
}

for benefit_name, (cost_col, selection_col) in benefit_mapping.items():
    ee_monthly = 0
    firm_monthly = 0
    
    # Calculate EE and Firm portions by looking up each employee's selection
    for _, emp in results_df.iterrows():
        benefit_code = emp[selection_col]
        salary = emp['Salary']
        emp_cost = emp[cost_col]
        
        if pd.isna(benefit_code) or benefit_code == '' or benefit_code not in benefits_lookup:
            continue
        
        benefit = benefits_lookup[benefit_code]
        
        # Determine EE vs Firm split
        if benefit['is_formula']:
            # Formula-based (STD/LTD)
            if benefit_code == 'SE1' or benefit_code == 'LE1':  # Firm paid
                firm_monthly += emp_cost
            elif benefit_code == 'SE2' or benefit_code == 'LE2':  # Employee paid
                ee_monthly += emp_cost
        else:
            # Fixed cost - use the lookup values
            ee_cost = benefit['ee_cost'] if not pd.isna(benefit['ee_cost']) else 0
            firm_cost = benefit['firm_cost'] if not pd.isna(benefit['firm_cost']) else 0
            ee_monthly += ee_cost
            firm_monthly += firm_cost
    
    total_monthly = ee_monthly + firm_monthly
    
    breakdown_rows.append({
        'Benefit Type': benefit_name,
        'Employee Monthly Cost': ee_monthly,
        'Firm Monthly Cost': firm_monthly,
        'Total Monthly Cost': total_monthly,
        'Employee Annual Cost': ee_monthly * 12,
        'Firm Annual Cost': firm_monthly * 12,
        'Total Annual Cost': total_monthly * 12
    })

# Add totals row
total_ee_monthly = sum(r['Employee Monthly Cost'] for r in breakdown_rows)
total_firm_monthly = sum(r['Firm Monthly Cost'] for r in breakdown_rows)
total_monthly_all = sum(r['Total Monthly Cost'] for r in breakdown_rows)

breakdown_rows.append({
    'Benefit Type': 'TOTAL',
    'Employee Monthly Cost': total_ee_monthly,
    'Firm Monthly Cost': total_firm_monthly,
    'Total Monthly Cost': total_monthly_all,
    'Employee Annual Cost': total_ee_monthly * 12,
    'Firm Annual Cost': total_firm_monthly * 12,
    'Total Annual Cost': total_monthly_all * 12
})

breakdown_df = pd.DataFrame(breakdown_rows)

# Format currency columns
for col in breakdown_df.columns:
    if 'Cost' in col:
        breakdown_df[col] = breakdown_df[col].apply(lambda x: f"${x:,.2f}")

# Style the total row
def highlight_total(row):
    if row['Benefit Type'] == 'TOTAL':
        return ['font-weight: bold; background-color: #f0f0f0'] * len(row)
    return [''] * len(row)

styled_breakdown = breakdown_df.style.apply(highlight_total, axis=1)
st.dataframe(styled_breakdown, use_container_width=True, hide_index=True)

st.divider()

# Legend
st.header("📖 Benefits Legend")

with st.expander("View benefit plan codes and descriptions", expanded=False):
    # Group benefits by type
    legend_data = []
    
    for code, details in sorted(benefits_lookup.items()):
        legend_data.append({
            'Code': code,
            'Description': details['description']
        })
    
    legend_df = pd.DataFrame(legend_data)
    
    # Separate by benefit type
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Medical, Dental, Vision")
        mdv_df = legend_df[legend_df['Code'].str.match(r'^(M|D|V)')].copy()
        st.dataframe(mdv_df, use_container_width=True, hide_index=True)
    
    with col2:
        st.subheader("STD, LTD, Life/AD&D")
        other_df = legend_df[legend_df['Code'].str.match(r'^(SE|LE|TE)')].copy()
        st.dataframe(other_df, use_container_width=True, hide_index=True)
    
    st.info("""
    **Formula-Based Benefits:**
    - **SE1/SE2**: STD cost calculated from salary (66.67% of weekly salary, max $2,100/week benefit)
    - **LE1/LE2**: LTD cost calculated from salary (60% of monthly salary, max $9,000/month benefit)
    - **SE1/LE1**: 100% Firm Paid
    - **SE2/LE2**: 100% Employee Paid
    """)

st.divider()

# Employee detail table
st.header("👥 Employee Details")

# Create expanded display with all cost breakdowns
detail_display = []

for _, emp in results_df.iterrows():
    # Get individual benefit costs
    medical_code = emp['Medical']
    dental_code = emp['Dental']
    vision_code = emp['Vision']
    std_code = emp['STD']
    ltd_code = emp['LTD']
    life_code = emp['Life']
    
    salary = emp['Salary']
    
    # Calculate individual EE/Firm splits by looking up from Benefits tab
    def get_costs_from_benefits_tab(code):
        """Look up costs directly from Benefits tab"""
        if pd.isna(code) or code == '' or code not in benefits_lookup:
            return 0, 0, 0  # total, ee, firm
        
        benefit = benefits_lookup[code]
        
        if benefit['is_formula']:
            # For formula-based (STD/LTD), calculate the total cost
            if code.startswith('SE'):  # STD
                total = calculate_std_cost(salary)
            elif code.startswith('LE'):  # LTD
                total = calculate_ltd_cost(salary)
            else:
                total = 0
            
            # Determine EE vs Firm split for formula-based
            if code in ['SE1', 'LE1']:  # Firm paid 100%
                return total, 0, total
            elif code in ['SE2', 'LE2']:  # Employee paid 100%
                return total, total, 0
            else:  # Declined
                return 0, 0, 0
        else:
            # Fixed cost - get directly from Benefits tab columns D, E, F
            total = benefit['total_cost'] if not pd.isna(benefit['total_cost']) else 0
            ee = benefit['ee_cost'] if not pd.isna(benefit['ee_cost']) else 0
            firm = benefit['firm_cost'] if not pd.isna(benefit['firm_cost']) else 0
            return total, ee, firm
    
    # Get costs for each benefit by looking them up
    med_total, med_ee, med_firm = get_costs_from_benefits_tab(medical_code)
    den_total, den_ee, den_firm = get_costs_from_benefits_tab(dental_code)
    vis_total, vis_ee, vis_firm = get_costs_from_benefits_tab(vision_code)
    std_total, std_ee, std_firm = get_costs_from_benefits_tab(std_code)
    ltd_total, ltd_ee, ltd_firm = get_costs_from_benefits_tab(ltd_code)
    life_total, life_ee, life_firm = get_costs_from_benefits_tab(life_code)
    
    detail_display.append({
        'Staff Member': emp['Staff_Name'],
        # Selections
        'Medical': medical_code,
        'Dental': dental_code,
        'Vision': vision_code,
        'STD': std_code,
        'LTD': ltd_code,
        'Life AD&D': life_code,
        # Total Costs (monthly)
        'Medical Cost': emp['Medical_Cost'],
        'Dental Cost': emp['Dental_Cost'],
        'Vision Cost': emp['Vision_Cost'],
        'STD Cost': emp['STD_Cost'],
        'LTD Cost': emp['LTD_Cost'],
        'Life AD&D Cost': emp['Life_Cost'],
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
        'Firm $/year': emp['Firm_Yearly']
    })

detail_df = pd.DataFrame(detail_display)

# Format currency columns
cost_columns = [col for col in detail_df.columns if 'Cost' in col or '$/mo' in col or '$/year' in col or col.startswith('EE ') or col.startswith('Firm ')]
for col in cost_columns:
    if col in detail_df.columns:
        detail_df[col] = detail_df[col].apply(lambda x: f"${x:,.2f}" if pd.notna(x) else "$0.00")

st.dataframe(detail_df, use_container_width=True, hide_index=True)

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
        
        # Breakdown sheet (save the unformatted data for Excel)
        breakdown_export = pd.DataFrame(breakdown_rows)
        breakdown_export.to_excel(writer, sheet_name='Breakdown', index=False)
        
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
    # Email report
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
                    scopes=['https://www.googleapis.com/auth/gmail.send'],
                    subject='astudee@voyageadvisory.com'
                )
                
                gmail_service = build('gmail', 'v1', credentials=credentials)
                
                # Create email with attachment
                msg = EmailMessage()
                msg['To'] = email_to
                msg['From'] = 'astudee@voyageadvisory.com'
                msg['Subject'] = f"Benefits Calculator Report - {datetime.now().strftime('%B %d, %Y')}"
                
                # Email body
                total_monthly = results_df['Total_Monthly'].sum()
                ee_monthly = results_df['EE_Monthly'].sum()
                firm_monthly = results_df['Firm_Monthly'].sum()
                
                msg.set_content(f"""Benefits Calculator Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Summary:
- Total Monthly Cost: ${total_monthly:,.2f}
- Employee Paid: ${ee_monthly:,.2f}
- Firm Paid: ${firm_monthly:,.2f}

Total Annual Cost: ${total_monthly * 12:,.2f}
- Employee: ${ee_monthly * 12:,.2f}
- Firm: ${firm_monthly * 12:,.2f}

Detailed breakdown attached in Excel file.

--
Voyage Advisory Benefits Calculator
""")
                
                # Attach Excel file
                msg.add_attachment(
                    excel_data,
                    maintype='application',
                    subtype='vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    filename=f'benefits_calculator_{datetime.now().strftime("%Y%m%d")}.xlsx'
                )
                
                # Send email
                encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode()
                gmail_service.users().messages().send(
                    userId='me',
                    body={'raw': encoded}
                ).execute()
                
                st.success(f"✅ Email sent to {email_to}")
                
            except Exception as e:
                st.error(f"❌ Failed to send email: {str(e)}")
        else:
            st.warning("Please enter an email address")
