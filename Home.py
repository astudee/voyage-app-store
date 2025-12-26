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
    }
]

# Display apps in a grid
for app in apps:
    with st.expander(f"{app['icon']} **{app['name']}** - {app['status']}"):
        st.markdown(f"_{app['description']}_")
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
