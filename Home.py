"""
Voyage Advisory Internal Tools
Home page with dynamic app listing
"""

import streamlit as st
import os

# Page config
st.set_page_config(
    page_title="Voyage Advisory Tools",
    page_icon="⛵",
    layout="wide"
)

# Check authentication
def check_auth():
    """Simple password authentication"""
    if 'authenticated' not in st.session_state:
        st.session_state.authenticated = False
    
    if not st.session_state.authenticated:
        st.title("🔐 Login Required")
        password = st.text_input("Enter password:", type="password")
        
        if st.button("Login"):
            correct_password = os.environ.get("APP_PASSWORD", "voyage2024")
            if password == correct_password:
                st.session_state.authenticated = True
                st.rerun()
            else:
                st.error("Incorrect password")
        st.stop()
    
    return True

check_auth()

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
