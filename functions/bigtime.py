import requests
import pandas as pd
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

def get_config(key):
    """Get configuration value from Streamlit secrets or credentials.py"""
    if IN_STREAMLIT:
        return st.secrets[key].strip()
    else:
        return credentials.get(key).strip()

def get_time_report(year, report_id=284796):
    """Fetch BigTime time report data for a given year."""
    api_key = get_config("BIGTIME_API_KEY")
    firm_id = get_config("BIGTIME_FIRM_ID")
    
    url = f"https://iq.bigtime.net/BigtimeData/api/v2/report/data/{report_id}"
    
    headers = {
        "X-Auth-ApiToken": api_key,
        "X-Auth-Realm": firm_id,
        "Accept": "application/json"
    }
    
    payload = {
        "DT_BEGIN": f"{year}-01-01",
        "DT_END": f"{year}-12-31"
    }
    
    print(f"📡 Requesting BigTime Report {report_id} for {year}...")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            report_data = response.json()
            data_rows = report_data.get('Data', [])
            field_list = report_data.get('FieldList', [])
            
            if not data_rows:
                print(f"⚠️ Report returned 0 rows for {year}")
                return pd.DataFrame()
            
            column_names = [field.get('FieldNm') for field in field_list]
            df = pd.DataFrame(data_rows, columns=column_names)
            
            # Map columns to expected names
            mapping = {
                'tmstaffnm': 'Staff Member',
                'tmchgbillbase': 'Billable ($)',
                'tmclientnm': 'Client'
            }
            df = df.rename(columns={k: v for k, v in mapping.items() if k in df.columns})
            
            print(f"✅ BigTime Success: Found {len(df)} entries.")
            return df
        else:
            print(f"❌ BigTime Error {response.status_code}: {response.text[:200]}")
            return pd.DataFrame()
    except Exception as e:
        print(f"❌ BigTime Exception: {e}")
        return pd.DataFrame()
