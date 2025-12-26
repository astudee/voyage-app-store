import streamlit as st

st.set_page_config(page_title="Voyage App Store", page_icon="🚀")

# ============================================================
# AUTHENTICATION
# ============================================================

def check_password():
    """Returns True if user is authenticated, False otherwise."""
    
    # Initialize session state
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
    
    # If already authenticated, allow access
    if st.session_state.authenticated:
        return True
    
    # Show login form
    st.title("🔐 Voyage App Store - Login")
    st.markdown("Please enter your credentials to access the application suite.")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        username = st.text_input("Username", key="username_input")
        password = st.text_input("Password", type="password", key="password_input")
        
        if st.button("Login", type="primary", use_container_width=True):
            try:
                # Check credentials against secrets
                if username in st.secrets["passwords"] and st.secrets["passwords"][username] == password:
                    st.session_state.authenticated = True
                    st.success("✅ Login successful!")
                    st.rerun()
                else:
                    st.error("❌ Invalid username or password")
            except Exception as e:
                st.error("❌ Invalid username or password")
    
    st.markdown("---")
    st.caption("Contact andrew@voyageadvisory.com for access")
    
    return False

# Check authentication before showing content
if not check_password():
    st.stop()

# ============================================================
# HOME PAGE (shown after authentication)
# ============================================================

st.title("🚀 Voyage Advisory App Store")

# Show logout button
col1, col2, col3 = st.columns([4, 1, 1])
with col3:
    if st.button("Logout"):
        st.session_state.authenticated = False
        st.rerun()

st.write("Select an app from the sidebar to get started.")

st.markdown("""
### Available Apps:

#### 💰 Commission Calculator
Calculate sales commissions from QuickBooks and BigTime data. Supports:
- Client commissions with date ranges
- Delivery commissions (% of own work)
- Referral commissions (% of referred staff work)
- Automated offsets (salaries, benefits, etc.)
- Excel export with detailed breakdowns

#### 👥 Payroll Calculator
*Coming soon*

#### 🏥 Benefits Tracker
*Coming soon*
""")

st.markdown("---")
st.caption("Voyage Advisory Internal Tools • For authorized users only")
