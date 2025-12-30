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

if st.button("📡 Fetch Client & Project List", type="primary"):
    with st.spinner("Fetching data from BigTime..."):
        # Get time report for current year (contains client and project info)
        current_year = datetime.now().year
        df = bigtime.get_time_report(current_year)
        
        if df is None or df.empty:
            st.error("❌ Could not fetch BigTime data")
            st.stop()
        
        st.success(f"✅ Fetched {len(df)} time entries from BigTime")
        
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
        
        # Find project columns
        project_col = None
        project_id_col = None
        
        for col in ['Project', 'tmprojectnm', 'exprojectnm']:
            if col in df.columns:
                project_col = col
                break
        
        for col in ['tmprojectnm_id', 'Project_ID', 'exprojectnm_id']:
            if col in df.columns:
                project_id_col = col
                break
        
        # ============================================================
        # SECTION 1: CLIENTS
        # ============================================================
        
        if client_col and client_id_col:
            # Get unique clients
            clients = df[[client_col, client_id_col]].drop_duplicates()
            clients = clients.rename(columns={
                client_col: 'Client Name',
                client_id_col: 'BigTime Client ID'
            })
            clients = clients.sort_values('Client Name')
            
            st.subheader("1️⃣ Clients")
            st.caption(f"Found {len(clients)} unique clients")
            
            st.dataframe(
                clients,
                hide_index=True,
                use_container_width=True
            )
            
            # Export clients
            st.download_button(
                label="📥 Download Clients CSV",
                data=clients.to_csv(index=False),
                file_name="bigtime_client_ids.csv",
                mime="text/csv",
                use_container_width=True
            )
        else:
            st.error(f"❌ Could not find client columns. Available: {df.columns.tolist()}")
        
        st.divider()
        
        # ============================================================
        # SECTION 2: PROJECTS
        # ============================================================
        
        if client_col and project_col and project_id_col:
            # Get unique projects
            projects = df[[client_col, project_col, project_id_col]].drop_duplicates()
            projects = projects.rename(columns={
                client_col: 'Client Name',
                project_col: 'Project Name',
                project_id_col: 'BigTime Project ID'
            })
            projects = projects.sort_values(['Client Name', 'Project Name'])
            
            st.subheader("2️⃣ Projects")
            st.caption(f"Found {len(projects)} unique projects")
            
            # Add search/filter
            search = st.text_input("🔍 Search by client or project name", "")
            if search:
                mask = (
                    projects['Client Name'].str.contains(search, case=False, na=False) |
                    projects['Project Name'].str.contains(search, case=False, na=False)
                )
                projects_display = projects[mask]
                st.info(f"Showing {len(projects_display)} of {len(projects)} projects")
            else:
                projects_display = projects
            
            st.dataframe(
                projects_display,
                hide_index=True,
                use_container_width=True
            )
            
            # Export projects
            st.download_button(
                label="📥 Download Projects CSV",
                data=projects.to_csv(index=False),
                file_name="bigtime_project_ids.csv",
                mime="text/csv",
                use_container_width=True
            )
        else:
            st.warning(f"⚠️ Could not find all project columns. Available: {df.columns.tolist()}")

else:
    st.info("👆 Click the button to fetch all BigTime clients and projects with their IDs")
    
    st.markdown("""
    ### What This Shows:
    
    **Section 1: Clients**
    - **Client Name** - Organization name in BigTime
    - **BigTime Client ID** - Numeric ID to use in Pipedrive
    
    **Section 2: Projects**
    - **Client Name** - Which client the project belongs to
    - **Project Name** - Full project name
    - **BigTime Project ID** - Numeric ID to use in Pipedrive
    - **Search** - Filter by client or project name
    
    ### How to Use:
    
    1. Click "Fetch Client & Project List"
    2. Find your client/project in the tables
    3. Copy the BigTime Client ID or Project ID
    4. Paste it into the corresponding Pipedrive custom field
    
    ### Note:
    
    **Client ID vs Project ID:**
    - **Client ID** - Links to the organization (one per client)
    - **Project ID** - Links to specific projects (multiple per client)
    
    Both IDs are numbers that BigTime assigns internally. Use these for accurate linking between Pipedrive and BigTime.
    """)
