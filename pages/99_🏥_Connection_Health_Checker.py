"""
Connection Health Checker
Test connections to all external APIs and services
"""

import streamlit as st
import requests
import sys
from datetime import datetime
import pandas as pd

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')

import quickbooks
import bigtime
import sheets

st.set_page_config(page_title="Connection Health", page_icon="🏥", layout="wide")

st.title("🏥 Connection Health Checker")
st.markdown("Test all API connections and services")

# Store results
if 'health_results' not in st.session_state:
    st.session_state.health_results = None

def check_bigtime():
    """Test BigTime API connection"""
    try:
        # Try to fetch a simple report for current year
        current_year = datetime.now().year
        df = bigtime.get_time_report(current_year)
        
        if df is None:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'API returned None',
                'details': 'Check API credentials in secrets'
            }
        elif df.empty:
            return {
                'status': 'warning',
                'icon': '⚠️',
                'message': f'Connected but no data for {current_year}',
                'details': 'Connection works, but no time entries found'
            }
        else:
            return {
                'status': 'success',
                'icon': '✅',
                'message': f'Connected successfully',
                'details': f'Found {len(df)} time entries for {current_year}'
            }
    except Exception as e:
        return {
            'status': 'error',
            'icon': '❌',
            'message': f'Connection failed: {type(e).__name__}',
            'details': str(e)
        }

def check_quickbooks():
    """Test QuickBooks API connection"""
    try:
        # Try to fetch consulting income for current year
        current_year = datetime.now().year
        df = quickbooks.get_consulting_income(current_year)
        
        if df is None:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'API returned None',
                'details': 'Likely authentication failure - token may be expired'
            }
        elif df.empty:
            return {
                'status': 'warning',
                'icon': '⚠️',
                'message': f'Connected but no data for {current_year}',
                'details': 'Connection works, but no transactions found'
            }
        else:
            total_amount = df['TotalAmount'].astype(float).sum()
            return {
                'status': 'success',
                'icon': '✅',
                'message': f'Connected successfully',
                'details': f'Found {len(df)} transactions (${total_amount:,.2f}) for {current_year}'
            }
    except Exception as e:
        error_msg = str(e).lower()
        if 'token' in error_msg or 'auth' in error_msg or '401' in error_msg:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'Authentication failed',
                'details': 'Token likely expired. Use QuickBooks Token Refresh utility.'
            }
        else:
            return {
                'status': 'error',
                'icon': '❌',
                'message': f'Connection failed: {type(e).__name__}',
                'details': str(e)
            }

def check_google_drive():
    """Test Google Drive access to configured folders"""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        
        # Get credentials from secrets
        service_account_info = st.secrets.get("SERVICE_ACCOUNT_KEY")
        if not service_account_info:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'SERVICE_ACCOUNT_KEY not found in secrets',
                'details': 'Missing service account credentials'
            }
        
        # Get folder IDs from secrets
        folder_configs = {
            'To-File Inbox': st.secrets.get("FOLDER_TO_FILE"),
            'Archive - Contracts': st.secrets.get("FOLDER_ARCHIVE_CONTRACTS"),
            'Archive - Docs': st.secrets.get("FOLDER_ARCHIVE_DOCS"),
            'Programs Root': st.secrets.get("FOLDER_PROGRAMS_ROOT"),
            'Reports': st.secrets.get("REPORTS_FOLDER_ID"),
        }
        
        # Filter out None values
        folder_configs = {k: v for k, v in folder_configs.items() if v}
        
        if not folder_configs:
            return {
                'status': 'warning',
                'icon': '⚠️',
                'message': 'No folder IDs configured',
                'details': 'No FOLDER_* settings found in secrets'
            }
        
        # Create credentials with Drive scope
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        
        # Build Drive service
        service = build('drive', 'v3', credentials=credentials)
        
        # Test access to each folder
        accessible = []
        inaccessible = []
        
        for folder_name, folder_id in folder_configs.items():
            try:
                # Try to get folder metadata
                folder = service.files().get(
                    fileId=folder_id,
                    fields='id,name,mimeType'
                ).execute()
                
                accessible.append(f"{folder_name} ({folder.get('name', 'unknown')})")
            except Exception as e:
                error_msg = str(e)
                if '404' in error_msg:
                    inaccessible.append(f"{folder_name}: Not found (ID may be wrong)")
                elif '403' in error_msg or 'permission' in error_msg.lower():
                    inaccessible.append(f"{folder_name}: Permission denied")
                else:
                    inaccessible.append(f"{folder_name}: {str(e)[:50]}")
        
        # Determine overall status
        if inaccessible:
            return {
                'status': 'error',
                'icon': '❌',
                'message': f'Cannot access {len(inaccessible)} folder(s)',
                'details': f"Accessible ({len(accessible)}): {', '.join(accessible) if accessible else 'None'}\n\nInaccessible ({len(inaccessible)}): {', '.join(inaccessible)}"
            }
        else:
            return {
                'status': 'success',
                'icon': '✅',
                'message': 'Connected successfully',
                'details': f'Can access all {len(accessible)} configured folders: {", ".join(accessible)}'
            }
    
    except Exception as e:
        return {
            'status': 'error',
            'icon': '❌',
            'message': f'Connection failed: {type(e).__name__}',
            'details': str(e)
        }

def check_google_sheets():
    """Test Google Sheets access (Voyage_Global_Config)"""
    try:
        config_sheet_id = st.secrets.get("SHEET_CONFIG_ID")
        if not config_sheet_id:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'SHEET_CONFIG_ID not found in secrets',
                'details': 'Missing configuration'
            }
        
        # Try to read Staff tab
        staff_df = sheets.read_config(config_sheet_id, "Staff")
        
        if staff_df is None or staff_df.empty:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'Could not read Staff tab',
                'details': 'Check service account permissions'
            }
        else:
            return {
                'status': 'success',
                'icon': '✅',
                'message': 'Connected successfully',
                'details': f'Found {len(staff_df)} staff members in config'
            }
    except Exception as e:
        return {
            'status': 'error',
            'icon': '❌',
            'message': f'Connection failed: {type(e).__name__}',
            'details': str(e)
        }

def check_gmail():
    """Test Gmail API connection by sending a real test email (gmail.send scope only allows sending)"""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        import base64
        from email.message import EmailMessage
        from datetime import datetime
        
        # Get credentials from secrets
        service_account_info = st.secrets.get("SERVICE_ACCOUNT_KEY")
        if not service_account_info:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'SERVICE_ACCOUNT_KEY not found in secrets',
                'details': 'Missing service account credentials'
            }
        
        # Get notification email from secrets (defaults to astudee if not set)
        notification_email = st.secrets.get("NOTIFICATION_EMAIL", "astudee@voyageadvisory.com")
        
        # Extract service account info for reference
        sa_email = service_account_info.get('client_email', 'unknown')
        
        # Use only gmail.send scope (matches production usage)
        # NOTE: gmail.send can ONLY send emails, cannot create drafts or read
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=['https://www.googleapis.com/auth/gmail.send'],
            subject='astudee@voyageadvisory.com'
        )
        
        # Build Gmail service
        service = build('gmail', 'v1', credentials=credentials)
        
        # Create and send a real test email (to notification address)
        msg = EmailMessage()
        msg['To'] = notification_email
        msg['From'] = 'astudee@voyageadvisory.com'
        msg['Subject'] = '✅ Voyage App Store - Gmail Health Check'
        msg.set_content(f"""This is an automated health check test.

Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Service Account: {sa_email}

If you received this, Gmail API is working correctly!

You can safely delete this email.
""")
        
        encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        
        # Send the email (the ONLY operation gmail.send scope allows)
        service.users().messages().send(
            userId='me',
            body={'raw': encoded}
        ).execute()
        
        return {
            'status': 'success',
            'icon': '✅',
            'message': 'Connected successfully',
            'details': f'Test email sent to {notification_email}. Check inbox to confirm delivery.'
        }
    except Exception as e:
        error_msg = str(e).lower()
        error_full = str(e)
        
        if 'delegat' in error_msg or 'domain-wide' in error_msg or 'insufficient' in error_msg:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'Domain-wide delegation issue',
                'details': f'Verify Client ID {service_account_info.get("client_id", "unknown")} is authorized in Workspace Admin with gmail.send scope. Error: {error_full}'
            }
        else:
            return {
                'status': 'error',
                'icon': '❌',
                'message': f'Connection failed: {type(e).__name__}',
                'details': error_full
            }

def check_claude_api():
    """Test Claude API (for AI note review, etc.)"""
    try:
        api_key = st.secrets.get("CLAUDE_API_KEY")
        if not api_key:
            return {
                'status': 'warning',
                'icon': '⚠️',
                'message': 'CLAUDE_API_KEY not found',
                'details': 'AI features (note review) will not work'
            }
        
        # Simple API test
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        # Test with minimal request
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "Hi"}]
            },
            timeout=10
        )
        
        if response.status_code == 200:
            return {
                'status': 'success',
                'icon': '✅',
                'message': 'Connected successfully',
                'details': 'AI features available'
            }
        elif response.status_code == 401:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'Authentication failed',
                'details': 'API key invalid or expired'
            }
        else:
            return {
                'status': 'error',
                'icon': '❌',
                'message': f'API returned {response.status_code}',
                'details': response.text[:200]
            }
    except Exception as e:
        return {
            'status': 'error',
            'icon': '❌',
            'message': f'Connection failed: {type(e).__name__}',
            'details': str(e)
        }

def check_gemini_api():
    """Test Gemini API by auto-discovering available models"""
    try:
        api_key = st.secrets.get("GEMINI_API_KEY")
        if not api_key:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'GEMINI_API_KEY not found',
                'details': 'Gemini is used for vault processing (cheaper than Claude)'
            }
        
        # STEP 1: Auto-discover which models are available for this API key
        # This avoids hardcoding model names that may not exist
        list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        
        try:
            list_response = requests.get(list_url, timeout=10)
            
            if list_response.status_code != 200:
                return {
                    'status': 'error',
                    'icon': '❌',
                    'message': f'Could not list models ({list_response.status_code})',
                    'details': f'Error: {list_response.text[:200]}'
                }
                
            data = list_response.json()
            models = data.get('models', [])
            
            # Find a model that supports 'generateContent'
            # Prefer flash or pro models for text generation
            target_model = None
            for m in models:
                if 'generateContent' in m.get('supportedGenerationMethods', []):
                    # API returns "models/gemini-pro", we need just "gemini-pro"
                    model_name = m['name'].replace('models/', '')
                    # Prefer flash or pro models
                    if 'flash' in model_name or 'pro' in model_name:
                        target_model = model_name
                        break
                    # Fallback to first available model
                    if not target_model:
                        target_model = model_name
            
            if not target_model:
                return {
                    'status': 'error',
                    'icon': '❌',
                    'message': 'No text generation models found',
                    'details': 'API key works but no models support generateContent'
                }

        except Exception as e:
            return {
                'status': 'error',
                'icon': '❌',
                'message': 'Model discovery failed',
                'details': str(e)
            }

        # STEP 2: Test the discovered model
        test_url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
        
        response = requests.post(
            test_url,
            json={
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": "Say OK"}]
                    }
                ]
            },
            timeout=10
        )
        
        if response.status_code == 200:
            return {
                'status': 'success',
                'icon': '✅',
                'message': 'Connected successfully',
                'details': f'Using model: {target_model}'
            }
        else:
            try:
                error_json = response.json()
                error_msg = error_json.get('error', {}).get('message', response.text[:200])
            except:
                error_msg = response.text[:200]
            
            return {
                'status': 'error',
                'icon': '❌',
                'message': f'Model test failed ({response.status_code})',
                'details': f'{target_model}: {error_msg}'
            }
            
    except Exception as e:
        return {
            'status': 'error',
            'icon': '❌',
            'message': 'Connection test failed',
            'details': str(e)
        }

# Run all checks
if st.button("🔍 Run Health Check", type="primary"):
    st.session_state.health_results = {}
    
    # Critical services
    with st.spinner("Checking BigTime API..."):
        st.session_state.health_results['BigTime'] = check_bigtime()
    
    with st.spinner("Checking QuickBooks API..."):
        st.session_state.health_results['QuickBooks'] = check_quickbooks()
    
    with st.spinner("Checking Google Sheets (Config)..."):
        st.session_state.health_results['Google Sheets'] = check_google_sheets()
    
    with st.spinner("Checking Google Drive (Folders)..."):
        st.session_state.health_results['Google Drive'] = check_google_drive()
    
    with st.spinner("Checking Gmail API..."):
        st.session_state.health_results['Gmail'] = check_gmail()
    
    # AI services
    with st.spinner("Checking Claude API..."):
        st.session_state.health_results['Claude API'] = check_claude_api()
    
    with st.spinner("Checking Gemini API..."):
        st.session_state.health_results['Gemini API'] = check_gemini_api()
    
    st.rerun()

# Display results
if st.session_state.health_results:
    st.divider()
    st.subheader("📊 Connection Status")
    
    # Count statuses
    total = len(st.session_state.health_results)
    success_count = sum(1 for r in st.session_state.health_results.values() if r['status'] == 'success')
    warning_count = sum(1 for r in st.session_state.health_results.values() if r['status'] == 'warning')
    error_count = sum(1 for r in st.session_state.health_results.values() if r['status'] == 'error')
    
    # Overall status
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Services", total)
    with col2:
        st.metric("✅ Healthy", success_count)
    with col3:
        st.metric("⚠️ Warnings", warning_count)
    with col4:
        st.metric("❌ Errors", error_count)
    
    st.divider()
    
    # Detailed results
    for service_name, result in st.session_state.health_results.items():
        with st.expander(f"{result['icon']} {service_name} - {result['message']}", 
                        expanded=(result['status'] == 'error')):
            
            if result['status'] == 'success':
                st.success(result['message'])
            elif result['status'] == 'warning':
                st.warning(result['message'])
            else:
                st.error(result['message'])
            
            st.info(f"**Details:** {result['details']}")
            
            # Add specific troubleshooting
            if result['status'] == 'error':
                if service_name == 'QuickBooks':
                    st.markdown("""
                    **Fix:**
                    1. Go to **QuickBooks Token Refresh** page
                    2. Follow steps to get new refresh token
                    3. Update `QB_REFRESH_TOKEN` in Streamlit secrets
                    """)
                elif service_name == 'BigTime':
                    st.markdown("""
                    **Fix:**
                    1. Check `BIGTIME_API_KEY` in Streamlit secrets
                    2. Verify `BIGTIME_FIRM_ID` is correct
                    3. Confirm API key hasn't expired
                    """)
                elif service_name == 'Google Sheets':
                    st.markdown("""
                    **Fix:**
                    1. Verify `SHEET_CONFIG_ID` is correct
                    2. Check service account has access to the spreadsheet
                    3. Confirm `SERVICE_ACCOUNT_KEY` is valid
                    """)
                elif service_name == 'Gmail':
                    st.markdown("""
                    **Fix:**
                    1. Verify domain-wide delegation is enabled
                    2. Check service account has Gmail API enabled
                    3. Confirm delegation for gmail.send scope
                    """)
    
    st.divider()
    
    # Summary recommendation
    if error_count == 0 and warning_count == 0:
        st.success("🎉 All systems operational! All apps should work correctly.")
        if 'Gmail' in st.session_state.health_results and st.session_state.health_results['Gmail']['status'] == 'success':
            notification_email = st.secrets.get("NOTIFICATION_EMAIL", "astudee@voyageadvisory.com")
            st.info(f"📬 Check {notification_email} inbox for Gmail health check test email.")
    elif error_count == 0:
        st.warning(f"⚠️ {warning_count} warning(s). Core functionality works but some features may be limited.")
    else:
        st.error(f"❌ {error_count} error(s) detected. Some apps may not work. Please fix the issues above.")

else:
    st.info("👆 Click the button above to check all API connections")
    
    st.markdown("""
    ### What This Checks:
    
    **Critical Services (Required):**
    - ✅ BigTime API - Time tracking data
    - ✅ QuickBooks API - Financial data
    - ✅ Google Sheets - Employee configuration
    - ✅ Google Drive - Vault folder access
    - ✅ Gmail API - Email reports
    
    **AI Services:**
    - ✅ Claude API - Primary AI for analysis
    - ✅ Gemini API - Primary AI for vault processing (cheaper)
    
    **Coming Soon:**
    - 🔜 Pipedrive - CRM integration
    """)
