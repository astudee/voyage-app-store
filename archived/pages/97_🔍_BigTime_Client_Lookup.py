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
st.markdown("Find BigTime Client IDs and Project IDs to add to Pipedrive")

# Options
col1, col2 = st.columns(2)
with col1:
    include_inactive = st.checkbox(
        "Include inactive clients/projects",
        value=False,
        help="By default, only shows clients/projects with activity in the current year. Check this to include historical data."
    )
with col2:
    if include_inactive:
        years_back = st.slider(
            "Years of history",
            min_value=1,
            max_value=5,
            value=3,
            help="How many years back to search for inactive clients/projects"
        )
    else:
        years_back = 0

if st.button("📡 Fetch Client & Project List", type="primary"):
    with st.spinner("Fetching data from BigTime..."):
        # Determine which years to pull
        current_year = datetime.now().year
        if include_inactive and years_back > 0:
            years_to_fetch = list(range(current_year - years_back, current_year + 1))
        else:
            years_to_fetch = [current_year]
        
        # Fetch data for all years
        df_list = []
        for year in years_to_fetch:
            df_year = bigtime.get_time_report(year)
            if df_year is not None and not df_year.empty:
                df_list.append(df_year)
        
        if not df_list:
            st.error("❌ Could not fetch BigTime data")
            st.stop()
        
        df = pd.concat(df_list, ignore_index=True)
        
        st.success(f"✅ Fetched {len(df)} time entries from {len(years_to_fetch)} year(s): {years_to_fetch}")
        
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
    
    ### Options:
    
    **Include inactive clients/projects:**
    - **Unchecked (default):** Only shows clients/projects with time entries in the current year
    - **Checked:** Pulls historical data (1-5 years back) to include inactive clients/projects
    
    This is useful when you need to find IDs for old clients or completed projects.
    
    ### How to Use:
    
    1. Choose whether to include inactive items
    2. Click "Fetch Client & Project List"
    3. Find your client/project in the tables
    4. Copy the BigTime Client ID or Project ID
    5. Paste it into the corresponding Pipedrive custom field
    
    ### Note:
    
    **Client ID vs Project ID:**
    - **Client ID** - Links to the organization (one per client)
    - **Project ID** - Links to specific projects (multiple per client)
    
    Both IDs are numbers that BigTime assigns internally. Use these for accurate linking between Pipedrive and BigTime.
    """)
