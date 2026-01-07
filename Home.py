"""
Voyage Advisory Internal Tools
Home page with dynamic app listing
"""

import streamlit as st
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

# Page config
st.set_page_config(
    page_title="Voyage Advisory Tools",
    page_icon="⛵",
    layout="wide"
)

# Simple authentication check
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False

if not st.session_state.authenticated:
    st.title("🔐 Voyage Advisory Login")
    st.markdown("Please enter your credentials to access the internal tools.")
    
    with st.form("login_form"):
        username = st.text_input("Username")
        password = st.text_input("Password", type="password")
        submit = st.form_submit_button("Login", type="primary", use_container_width=True)
        
        if submit:
            # Check against passwords dictionary in secrets
            try:
                passwords = st.secrets.get("passwords", {})
                correct_password = passwords.get(username)
                
                if correct_password and password == correct_password:
                    st.session_state.authenticated = True
                    st.session_state.username = username
                    st.success(f"✅ Welcome, {username}!")
                    st.rerun()
                else:
                    st.error("❌ Invalid username or password")
            except Exception as e:
                st.error(f"Authentication error: {str(e)}")
    st.stop()

# Header
st.title("⛵ Voyage Advisory Internal Tools")
st.markdown("---")

# Introduction
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("Welcome to the Voyage App Store")
    st.markdown("""
    This portal provides access to internal business tools and reporting systems.
    Select an app from the sidebar to get started.
    """)

with col2:
    st.info("👈 **Select an app from the sidebar**")

# App catalog
st.markdown("## 📱 Available Apps")

# Define apps with their metadata
apps = [
    {
        'icon': '💰',
        'name': 'Commission Calculator',
        'page': '01_💰_Commission_Calculator',
        'description': 'Calculate sales commissions from QuickBooks and BigTime data',
        'features': [
            'Client commissions with date ranges (Year 1 vs Year 2+)',
            'Delivery commissions (% of own billable work)',
            'Referral commissions (% of referred staff work)',
            'Automated offsets (salaries, benefits, overhead)',
            'Excel export with detailed breakdowns',
            'Google Drive integration for report storage'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📧',
        'name': 'Email to To File',
        'page': '02_📧_Email_to_To_File',
        'description': 'Automated email processing and archiving',
        'features': [
            'Reads emails from vault@voyageadvisory.com',
            'Saves PDF attachments to Google Drive',
            'Converts emails without attachments to PDF',
            'Removes "Vault" label after processing',
            'Runs automatically every 15 minutes via GitHub Actions'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📄',
        'name': 'To File to Vault',
        'page': '03_📄_To_File_to_Vault',
        'description': 'AI-powered document classification and archiving',
        'features': [
            'Uses AI (Claude/Gemini/OpenAI) to classify documents',
            'Automatically renames PDFs with smart naming',
            'Routes contracts vs documents to appropriate folders',
            'Processes files from shared Google Drive folder',
            'Maintains organized document vault structure'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📊',
        'name': 'Billable Hours Report',
        'page': '04_📊_Billable_Hours_Report',
        'description': 'Monthly billable hours analysis with capacity tracking',
        'features': [
            'Pulls data directly from BigTime API',
            'Tracks billable hours by employee and month',
            'Calculates monthly capacity (weekdays - holidays)',
            'Color-coded utilization (green/yellow/blue tiers)',
            'Classifies staff as Active/Contractor/Inactive',
            'Email report with Excel attachment',
            'AI-powered holiday calculation for future years'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '💰',
        'name': 'Bonus Calculator',
        'page': '05_💰_Bonus_Calculator',
        'description': 'Employee bonus calculations based on utilization',
        'features': [
            'Three-tier bonus structure (1840/1350 hour thresholds)',
            'Pro bono hours credit (up to 40 hours)',
            'First-year employee proration',
            'YTD actual vs year-end projections',
            'Employer cost tracking (FICA + 401k match)',
            'Bonus target overrides for historical reports',
            'Email report with detailed breakdowns'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '⏰',
        'name': 'Time Reviewer',
        'page': '06_⏰_Time_Reviewer',
        'description': 'Review timesheets for completeness and quality',
        'features': [
            'Checks for zero hours and unsubmitted timesheets',
            'Identifies employees under 40 hours',
            'Flags non-billable client work',
            'AI-powered billing note quality review (Gemini + Claude)',
            'Enforces Voyage professional standards',
            'Week-ending (Friday) date selector',
            'Excel and text export with email capability'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '💳',
        'name': 'Expense Reviewer',
        'page': '07_💳_Expense_Reviewer',
        'description': 'Review expenses for compliance and quality',
        'features': [
            'Validates contractor fee classification',
            'Checks billable vs non-billable consistency',
            'Identifies missing receipt attachments',
            'Tracks company-paid expenses',
            'Monitors non-reimbursable expenses',
            'Weekly or custom date range filtering',
            'Email report capability'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '💊',
        'name': 'Benefits Calculator',
        'page': '08_💊_Benefits_Calculator',
        'description': 'Calculate employee benefits costs',
        'features': [
            'Reads current benefit selections from Staff tab',
            'Formula-based STD/LTD calculations using salary',
            'Fixed-cost Medical/Dental/Vision/Life calculations',
            'Shows Total, Employee Paid, Firm Paid breakdowns',
            'Monthly and yearly cost views',
            'Breakdown by benefit type',
            'Excel export and email capability'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '💵',
        'name': 'Payroll Calculator',
        'page': '09_💵_Payroll_Calculator',
        'description': 'Calculate total employer payroll costs',
        'features': [
            'Base salary plus bonuses (utilization + other)',
            'Firm-paid benefits from Benefits Calculator',
            'Phone allowances and other compensation',
            '401(k) employer match (4% of included compensation)',
            'FICA tax calculation (7.65% of included compensation)',
            'Toggle to include/exclude utilization bonus',
            'Excel export and email capability'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '💵',
        'name': 'Payroll Helper',
        'page': '10_💵_Payroll_Helper',
        'description': 'Prepare payroll data from BigTime for Gusto entry',
        'features': [
            'Pulls hours from BigTime for payroll period',
            'Separates hourly/TFT/PTE vs full-time employees',
            'Categorizes time: Regular, Paid Leave, Sick Leave, Holiday',
            'Policy violation checks (16hr holiday/month, 40hr sick/year)',
            'Ready-to-enter format for Gusto',
            'Excel export with employee breakdowns'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '💼',
        'name': 'Contractor Fee Reviewer',
        'page': '11_💼_Contractor_Fee_Reviewer',
        'description': 'Review contractor fees and hours for compliance',
        'features': [
            'Flags fees charged on non-Friday dates',
            'Identifies contractors with hours but no invoice',
            'Calculates average hourly billing rates',
            'Weekly analysis grouped by Friday week-ending',
            'Compares time entries to expense submissions',
            'Excel export with detailed breakdowns'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📈',
        'name': 'Forecasted Billable Hours',
        'page': '12_📈_Forecasted_Billable_Hours',
        'description': 'Forward-looking billable hours and revenue forecast',
        'features': [
            'Based on Assignments tab in Voyage_Global_Config',
            'Employee and Contractor sections',
            'Toggle between hours and revenue forecast',
            'Default range: current month + 12 months',
            'Forward-looking only (no historical data)',
            'Excel export with monthly breakdown'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📊',
        'name': 'Bookings Tracker',
        'page': '13_📊_Bookings_Tracker',
        'description': 'Track won deals and bookings from Pipedrive',
        'features': [
            'Shows only won deals from Pipedrive CRM',
            'Filter by close date range',
            'View by Month, Quarter, or Year',
            'Includes custom fields (BigTime IDs, duration, bill rate)',
            'Summary metrics (total bookings, value, avg deal size)',
            'Excel export with summary and detailed tabs'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '🎯',
        'name': 'Resource Checker',
        'page': '15_🎯_Resource_Checker',
        'description': 'Monitor utilization, underruns, and schedule adherence',
        'features': [
            'Tracks authorized hours vs actuals by resource and project',
            'Utilization bands: Overrun, On Target, At Risk, Under, Severely Under',
            'Schedule pace monitoring (ahead/on-time/late)',
            'Detects unassigned work (actuals with no plan)',
            'Month-by-month breakdown with actual vs plan indicators',
            'Multi-dimensional filtering and Excel export'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📊',
        'name': 'Project Health Monitor',
        'page': '14_📊_Project_Health_Monitor',
        'description': 'Track project health across bookings, plan, and delivery',
        'features': [
            '3-way reconciliation: Pipedrive bookings vs Assignments plan vs BigTime delivery',
            'Plan Match: Did we scope correctly? (planned revenue vs deal value)',
            'Progress tracking: Time-based (plan) vs consumption-based (actual)',
            'Variance detection: Running hot (+) or cold (-) compared to timeline',
            'Revenue status: Over/under-billing alerts',
            'Filter by Active, Completed, or All projects'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📊',
        'name': 'Revenue Forecaster',
        'page': '16_📊_Revenue_Forecaster',
        'description': 'Project-level revenue forecast: Actuals (past) + Plan (future)',
        'features': [
            'Combines BigTime actuals (past months) with Assignments plan (future months)',
            'Project-level view: Client, Project Name, Project ID',
            'Toggle between Billable Hours and Revenue ($)',
            'Month indicators: 📊 Actual | 📅 Plan',
            'Monthly totals section',
            'Excel export with multiple sheets'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '📝',
        'name': 'Contract Reviewer',
        'page': '17_📝_Contract_Reviewer',
        'description': 'Upload contracts for AI review against Voyage standards',
        'features': [
            'Upload PDF, DOC, DOCX or paste text',
            'Fetch contracts from Google Docs',
            'Claude AI analyzes against Voyage contract standards',
            'Section-by-section findings with proposed replacement language',
            'Downloadable Word document report',
            'Standards auto-update from Google Docs'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '🔑',
        'name': 'QuickBooks Token Refresh',
        'page': '99_🔑_QuickBooks_Token_Refresh',
        'description': 'Re-authorize QuickBooks API access',
        'features': [
            'Generate QuickBooks authorization URL',
            'Exchange authorization code for refresh token',
            'Display new token for manual secrets update',
            'Step-by-step instructions',
            'Troubleshooting guide',
            'Token expires every ~100 days'
        ],
        'status': '🔧 Utility'
    },
    {
        'icon': '🔍',
        'name': 'BigTime Client Lookup',
        'page': '97_🔍_BigTime_Client_Lookup',
        'description': 'Find BigTime Client IDs for Pipedrive',
        'features': [
            'Lists all clients from BigTime',
            'Shows Client Name and numeric Client ID',
            'Export to CSV',
            'Use IDs to populate Pipedrive custom fields'
        ],
        'status': '✅ Available'
    },
    {
        'icon': '🏥',
        'name': 'Connection Health Checker',
        'page': '98_🏥_Connection_Health_Checker',
        'description': 'Test all API connections and services',
        'features': [
            'Check BigTime API connection',
            'Check QuickBooks API connection',
            'Verify Google Sheets access',
            'Test Gmail sending capability',
            'Test Claude & Gemini AI APIs',
            'Color-coded status indicators',
            'Troubleshooting recommendations'
        ],
        'status': '🔧 Utility'
    }
]

# Display apps in a grid with navigation links
for app in apps:
    with st.expander(f"{app['icon']} **{app['name']}** - {app['status']}"):
        st.markdown(f"_{app['description']}_")
        
        # Add "Open App" button if page is specified
        if 'page' in app:
            if st.button(f"🚀 Open {app['name']}", key=f"open_{app['page']}", use_container_width=True):
                st.switch_page(f"pages/{app['page']}.py")
        
        st.markdown("**Key Features:**")
        for feature in app['features']:
            st.markdown(f"- {feature}")

# Footer
st.markdown("---")
col_a, col_b, col_c = st.columns(3)

with col_a:
    st.markdown("### 🔐 Security")
    st.markdown("""
    - Password-protected access
    - Service account authentication
    - Encrypted credentials
    """)

with col_b:
    st.markdown("### 🔗 Integrations")
    st.markdown("""
    - BigTime API
    - QuickBooks Online
    - Google Workspace (Sheets, Drive, Gmail)
    """)

with col_c:
    st.markdown("### 📧 Support")
    st.markdown("""
    - Questions? Contact Andrew
    - Use 👍👎 buttons to provide feedback
    - Suggestions welcome
    """)

st.markdown("---")
st.caption("Voyage Advisory LLC • Internal Tools Portal • For Authorized Users Only")
