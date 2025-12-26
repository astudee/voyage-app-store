import requests
import pandas as pd
import base64
import json
import os
import sys

# Detect environment and load credentials accordingly
try:
    import streamlit as st
    IN_STREAMLIT = True
except ImportError:
    IN_STREAMLIT = False
    # Only import credentials if not in Streamlit
    sys.path.append('./functions')
    import credentials

# Token vault path - different for each environment
if IN_STREAMLIT:
    VAULT_PATH = '/tmp/qb_token_vault.json'
else:
    IN_COLAB = 'google.colab' in sys.modules
    PROG_PATH = '/content/drive/Shareddrives/Finance and Legal/Programs/functions' if IN_COLAB else './functions'
    VAULT_PATH = os.path.join(PROG_PATH, 'token_vault.json')

def get_config(key):
    """Get configuration value from Streamlit secrets or credentials.py"""
    if IN_STREAMLIT:
        return st.secrets[key].strip()
    else:
        return credentials.get(key).strip()

def get_vault_token():
    """Reads the current Refresh Token from the vault file or falls back to config."""
    if not os.path.exists(VAULT_PATH):
        # Fallback to config if vault doesn't exist yet
        return get_config("QB_REFRESH_TOKEN")
    
    with open(VAULT_PATH, 'r') as f:
        vault = json.load(f)
    return vault.get("QB_REFRESH_TOKEN", "").strip()

def save_vault_token(new_token):
    """Saves the newly rotated Refresh Token so the chain doesn't break."""
    vault_data = {"QB_REFRESH_TOKEN": new_token}
    
    # Create directory if it doesn't exist (for Colab)
    os.makedirs(os.path.dirname(VAULT_PATH), exist_ok=True)
    
    with open(VAULT_PATH, 'w') as f:
        json.dump(vault_data, f, indent=4)
    print(f"✅ Token Vault updated with new Refresh Token.")

def get_access_token():
    """Uses the Vaulted Refresh Token to get a new temporary Access Token."""
    url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    
    client_id = get_config("QB_CLIENT_ID")
    client_secret = get_config("QB_CLIENT_SECRET")
    
    # Get the latest token from the vault (computer managed)
    refresh_token = get_vault_token()
    
    auth_str = f"{client_id}:{client_secret}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        'Authorization': f'Basic {auth_b64}',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }
    
    payload = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token
    }
    
    print(f"📡 Attempting to refresh QB token for Client ID: {client_id[:5]}...")
    response = requests.post(url, data=payload, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        
        # Save the new refresh token QuickBooks sent back
        new_refresh_token = data.get('refresh_token')
        if new_refresh_token:
            save_vault_token(new_refresh_token)
            
        return data['access_token']
    else:
        print(f"❌ QB Auth Error: {response.status_code} - {response.text}")
        return None

def get_consulting_income(year):
    """Pull P&L Detail report for Consulting Income (cash basis)"""
    token = get_access_token()
    realm_id = get_config("QB_REALM_ID")
    
    if not token: 
        return pd.DataFrame()
    
    url = f"https://quickbooks.api.intuit.com/v3/company/{realm_id}/reports/ProfitAndLossDetail"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json'
    }
    
    params = {
        'start_date': f'{year}-01-01',
        'end_date': f'{year}-12-31',
        'accounting_method': 'Cash',
        'minorversion': '65'
    }
    
    print(f"📡 Pulling P&L Detail Report (Cash Basis) for {year}...")
    response = requests.get(url, headers=headers, params=params)
    
    if response.status_code == 200:
        report_data = response.json()
        
        def find_consulting_income(rows):
            for row in rows:
                if 'Header' in row:
                    col_data = row['Header'].get('ColData', [])
                    if col_data and 'Consulting Income' in col_data[0].get('value', ''):
                        return row
                
                if 'Rows' in row and 'Row' in row['Rows']:
                    result = find_consulting_income(row['Rows']['Row'])
                    if result:
                        return result
            return None
        
        rows = report_data.get('Rows', {}).get('Row', [])
        consulting_section = find_consulting_income(rows)
        
        if not consulting_section:
            print("   ⚠️  Could not find 'Consulting Income' account in report")
            return pd.DataFrame()
        
        detail_rows = consulting_section.get('Rows', {}).get('Row', [])
        transactions = []
        for row in detail_rows:
            if row.get('type') == 'Data':
                cols = row.get('ColData', [])
                if len(cols) >= 7:
                    transactions.append({
                        'TransactionDate': cols[0].get('value', ''),
                        'TransactionType': cols[1].get('value', ''),
                        'TransactionNumber': cols[2].get('value', ''),
                        'Customer': cols[3].get('value', ''),
                        'Memo': cols[4].get('value', ''),
                        'Split': cols[5].get('value', ''),
                        'Amount': cols[6].get('value', '0'),
                        'Balance': cols[7].get('value', '0') if len(cols) > 7 else '0'
                    })
        
        if transactions:
            df = pd.DataFrame(transactions)
            df['TotalAmount'] = pd.to_numeric(df['Amount'], errors='coerce')
            df['TransactionDate'] = pd.to_datetime(df['TransactionDate'])
            total = df['TotalAmount'].sum()
            
            print(f"✅ QuickBooks: Found {len(df)} consulting income transactions")
            print(f"   Total consulting income: ${total:,.2f}")
            return df
        else:
            print("   ⚠️  No transactions found for Consulting Income")
            return pd.DataFrame()
    
    print(f"❌ QB Report Error: {response.status_code}")
    return pd.DataFrame()
