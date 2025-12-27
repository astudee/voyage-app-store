"""
QuickBooks Token Refresh
Re-authorize QuickBooks access and get new refresh token
"""

import streamlit as st
import requests
import base64

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

st.set_page_config(page_title="QB Token Refresh", page_icon="🔑", layout="wide")

st.title("🔑 QuickBooks Token Refresh")
st.markdown("Re-authorize Voyage App Store access to QuickBooks")

# Get credentials from secrets
try:
    CLIENT_ID = st.secrets["QB_CLIENT_ID"]
    CLIENT_SECRET = st.secrets["QB_CLIENT_SECRET"]
except Exception as e:
    st.error(f"❌ Missing QuickBooks credentials in secrets: {str(e)}")
    st.stop()

REDIRECT_URI = "https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl"

# ============================================================
# STEP 1: GENERATE AUTHORIZATION URL
# ============================================================

st.header("Step 1: Authorize Access")

auth_url = (
    "https://appcenter.intuit.com/connect/oauth2"
    f"?client_id={CLIENT_ID}"
    "&response_type=code"
    "&scope=com.intuit.quickbooks.accounting"
    f"&redirect_uri={REDIRECT_URI}"
    "&state=voyage_auth"
)

st.markdown(f"""
1. Click the link below to authorize access:
   
   **[🔗 Authorize Voyage App Store]({auth_url})**

2. Sign in to QuickBooks and select **Voyage Advisory**

3. You'll be redirected to a blank page with a URL that looks like:
   ```
   https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl?code=XXXXX&state=voyage_auth&realmId=YYYY
   ```

4. Copy **everything after `code=`** and **before `&state`** (this is your authorization code)
""")

st.divider()

# ============================================================
# STEP 2: EXCHANGE CODE FOR TOKEN
# ============================================================

st.header("Step 2: Get Refresh Token")

auth_code = st.text_input(
    "Paste the authorization code here:",
    placeholder="e.g., AB11731076529rK8H4zmKqL2pBv1ZcmcPbN...",
    help="Paste the code from the URL (between code= and &state)"
)

if st.button("🔄 Get Refresh Token", type="primary", disabled=not auth_code):
    with st.spinner("Exchanging code for token..."):
        try:
            # Exchange code for tokens
            url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
            
            auth_str = f"{CLIENT_ID}:{CLIENT_SECRET}"
            auth_b64 = base64.b64encode(auth_str.encode()).decode()
            
            headers = {
                'Authorization': f'Basic {auth_b64}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            
            payload = {
                'grant_type': 'authorization_code',
                'code': auth_code.strip(),
                'redirect_uri': REDIRECT_URI
            }
            
            response = requests.post(url, data=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                refresh_token = data.get('refresh_token')
                access_token = data.get('access_token')
                expires_in = data.get('expires_in')
                
                st.success("🎉 Success! Token retrieved")
                
                st.markdown("### New Refresh Token:")
                st.code(refresh_token, language=None)
                
                st.markdown("### Next Steps:")
                st.info("""
                **To update the token in Streamlit:**
                
                1. Copy the refresh token above (click the copy button in the code box)
                2. Go to your Streamlit app settings
                3. Navigate to **Secrets**
                4. Find `QB_REFRESH_TOKEN` and update it with the new value
                5. Click **Save**
                6. The app will restart automatically
                
                **Token expires in:** ~100 days from now
                """)
                
                # Store in session state for reference
                st.session_state.qb_refresh_token = refresh_token
                
                # Show additional info
                with st.expander("🔍 Token Details"):
                    st.write(f"**Access Token (1 hour):** {access_token[:20]}...")
                    st.write(f"**Refresh Token (100 days):** {refresh_token[:20]}...")
                    st.write(f"**Access token expires in:** {expires_in} seconds (~1 hour)")
                    st.write(f"**Refresh token expires in:** ~100 days")
                
            else:
                st.error(f"❌ Token exchange failed: {response.status_code}")
                st.code(response.text)
                
                if response.status_code == 400:
                    st.warning("""
                    **Common causes:**
                    - Authorization code already used (they expire after one use)
                    - Code expired (they expire after 10 minutes)
                    - Incorrect code format
                    
                    **Solution:** Go back to Step 1 and get a new code
                    """)
                    
        except Exception as e:
            st.error(f"❌ Error: {type(e).__name__}")
            st.code(str(e))

st.divider()

# ============================================================
# TROUBLESHOOTING
# ============================================================

with st.expander("❓ Troubleshooting"):
    st.markdown("""
    **"Invalid grant" error:**
    - The authorization code has already been used
    - The code has expired (10 minute limit)
    - Solution: Go back to Step 1 and get a fresh code
    
    **"Invalid client" error:**
    - QB_CLIENT_ID or QB_CLIENT_SECRET in secrets is incorrect
    - Contact Andrew to verify credentials
    
    **Can't find the code in the URL:**
    - After authorizing, look at the browser address bar
    - The URL will contain `?code=XXXXX&state=voyage_auth`
    - Copy only the part between `code=` and `&state`
    
    **Token still not working after update:**
    - Make sure you saved the secrets in Streamlit
    - Wait for the app to restart (automatic)
    - Try running the Commission Calculator again
    
    **How often do I need to do this?**
    - QuickBooks refresh tokens expire every ~100 days
    - You'll know when the Commission Calculator fails with auth errors
    - Set a calendar reminder for 90 days from now
    """)

# Show current token status if available
if 'qb_refresh_token' in st.session_state:
    st.divider()
    st.success("✅ New refresh token ready to copy!")
    st.info("👆 Scroll up to copy the token and update your Streamlit secrets")
