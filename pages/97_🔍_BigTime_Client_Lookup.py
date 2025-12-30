"""
Quick utility to see BigTime Client IDs
Run this to get a list of all clients and their IDs to populate Pipedrive
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

sys.path.append('./functions')
import bigtime

st.set_page_config(page_title="BigTime Client Lookup", page_icon="🔍", layout="wide")

st.title("🔍 BigTime Client ID Lookup")
st.markdown("Find BigTime Client IDs to add to Pipedrive")

if st.button("📡 Fetch Client List", type="primary"):
    with st.spinner("Fetching data from BigTime..."):
        # Get time report for current year (contains client info)
        current_year = datetime.now().year
        df = bigtime.get_time_report(current_year)
        
        if df is None or df.empty:
            st.error("❌ Could not fetch BigTime data")
            st.stop()
        
        # Find client columns
        client_col = None
        client_id_col = None
        
        for col in ['Client', 'tmclientnm', 'exclientnm']:
            if col in df.columns:
                client_col = col
                break
        
        for col in ['tmclientnm_id', 'Client_ID', 'exclientnm_id']:
            if col in df.columns:
                client_id_col = col
                break
        
        if not client_col or not client_id_col:
            st.error(f"❌ Could not find client columns. Available: {df.columns.tolist()}")
            st.stop()
        
        # Get unique clients
        clients = df[[client_col, client_id_col]].drop_duplicates()
        clients = clients.rename(columns={
            client_col: 'Client Name',
            client_id_col: 'BigTime Client ID'
        })
        clients = clients.sort_values('Client Name')
        
        st.success(f"✅ Found {len(clients)} unique clients")
        
        st.subheader("📋 Client List")
        st.caption("Use these BigTime Client IDs in your Pipedrive custom field")
        
        st.dataframe(
            clients,
            hide_index=True,
            use_container_width=True
        )
        
        # Export option
        st.divider()
        st.subheader("📥 Export")
        
        csv = clients.to_csv(index=False)
        st.download_button(
            label="📥 Download CSV",
            data=csv,
            file_name="bigtime_client_ids.csv",
            mime="text/csv",
            use_container_width=True
        )

else:
    st.info("👆 Click the button to fetch all BigTime clients and their IDs")
    
    st.markdown("""
    ### What This Shows:
    
    - **Client Name** - Organization name in BigTime
    - **BigTime Client ID** - Numeric ID to use in Pipedrive
    
    ### How to Use:
    
    1. Click "Fetch Client List"
    2. Find your client in the list
    3. Copy the BigTime Client ID
    4. Paste it into Pipedrive's "BigTime Client ID" custom field
    
    ### Note:
    
    The Client ID is a number that BigTime assigns internally. This is different from:
    - Client Name (text, can change)
    - Project ID (specific to projects, not clients)
    
    Use this ID to link Pipedrive deals to BigTime clients for accurate reporting.
    """)
