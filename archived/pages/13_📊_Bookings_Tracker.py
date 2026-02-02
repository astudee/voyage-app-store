import streamlit as st
import pandas as pd
import sys
from datetime import datetime, timedelta
from io import BytesIO
import requests

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

st.set_page_config(page_title="Bookings Tracker", page_icon="📊", layout="wide")

st.title("📊 Bookings Tracker")
st.markdown("Track won deals and bookings from Pipedrive")

# ============================================================
# PIPEDRIVE API HELPER FUNCTIONS
# ============================================================

def get_pipedrive_api_token():
    """Get Pipedrive API token from secrets"""
    try:
        return st.secrets["PIPEDRIVE_API_TOKEN"]
    except:
        st.error("❌ PIPEDRIVE_API_TOKEN not found in secrets. Please add it to continue.")
        st.stop()

def fetch_won_deals(start_date, end_date):
    """Fetch won deals from Pipedrive within date range"""
    api_token = get_pipedrive_api_token()
    base_url = "https://api.pipedrive.com/v1"
    
    # Get all won deals (status = won)
    url = f"{base_url}/deals"
    params = {
        'api_token': api_token,
        'status': 'won',
        'start': 0,
        'limit': 500  # Adjust if you have more than 500 won deals
    }
    
    all_deals = []
    
    try:
        with st.spinner("📡 Fetching won deals from Pipedrive..."):
            while True:
                response = requests.get(url, params=params, timeout=30)
                
                if response.status_code != 200:
                    st.error(f"❌ Pipedrive API error: {response.status_code}")
                    return None
                
                data = response.json()
                
                if not data.get('success'):
                    st.error(f"❌ Pipedrive API returned error: {data.get('error', 'Unknown')}")
                    return None
                
                deals = data.get('data', [])
                if not deals:
                    break
                
                all_deals.extend(deals)
                
                # Check if there are more pages
                additional_data = data.get('additional_data', {})
                pagination = additional_data.get('pagination', {})
                if not pagination.get('more_items_in_collection'):
                    break
                
                # Move to next page
                params['start'] = pagination.get('next_start', 0)
        
        st.success(f"✅ Fetched {len(all_deals)} won deals from Pipedrive")
        
        # Filter by close date range
        filtered_deals = []
        for deal in all_deals:
            won_time = deal.get('won_time')
            if won_time:
                # Parse won_time (format: "2024-12-15 14:30:45")
                try:
                    won_date = datetime.strptime(won_time, "%Y-%m-%d %H:%M:%S").date()
                    if start_date <= won_date <= end_date:
                        filtered_deals.append(deal)
                except:
                    pass
        
        st.info(f"📅 {len(filtered_deals)} deals closed between {start_date} and {end_date}")
        
        return filtered_deals
    
    except requests.exceptions.RequestException as e:
        st.error(f"❌ Connection error: {e}")
        return None
    except Exception as e:
        st.error(f"❌ Unexpected error: {e}")
        import traceback
        st.code(traceback.format_exc())
        return None

def get_custom_field_keys():
    """Fetch custom field definitions to find our field keys"""
    api_token = get_pipedrive_api_token()
    base_url = "https://api.pipedrive.com/v1"
    
    url = f"{base_url}/dealFields"
    params = {'api_token': api_token}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                fields = data.get('data', [])
                
                # Build a mapping of field names to their keys
                field_map = {}
                for field in fields:
                    name = field.get('name', '').lower()
                    key = field.get('key')
                    
                    # Look for our custom fields
                    if 'bigtime client id' in name:
                        field_map['bigtime_client_id'] = key
                    elif 'bill rate' in name:
                        field_map['bill_rate'] = key
                    elif 'total budget hours' in name or 'budget hours' in name:
                        field_map['budget_hours'] = key
                    elif 'project duration' in name or 'duration' in name:
                        field_map['project_duration'] = key
                    elif 'bigtime project id' in name or 'project id' in name:
                        field_map['bigtime_project_id'] = key
                    elif 'project start date' in name or 'start date' in name:
                        field_map['project_start_date'] = key
                
                return field_map
        
        return {}
    
    except Exception as e:
        st.warning(f"⚠️ Could not fetch custom field keys: {e}")
        return {}

# ============================================================
# DATE RANGE SELECTION
# ============================================================

st.subheader("Report Period")

# Default: Last 12 months
today = datetime.now().date()
default_start = today.replace(year=today.year - 1, month=1, day=1)
default_end = today

col1, col2 = st.columns(2)
with col1:
    start_date = st.date_input(
        "Start Date",
        value=default_start,
        help="First date to include in report"
    )
with col2:
    end_date = st.date_input(
        "End Date",
        value=default_end,
        help="Last date to include in report"
    )

# View selector
view_by = st.radio(
    "View By",
    ["Month", "Quarter", "Year"],
    horizontal=True,
    help="Group bookings by time period"
)

if st.button("📊 Generate Report", type="primary"):
    
    # Fetch won deals
    deals = fetch_won_deals(start_date, end_date)
    
    if not deals:
        st.warning("No won deals found for the selected period")
        st.stop()
    
    # Get custom field mappings
    custom_fields = get_custom_field_keys()
    
    # Process deals into dataframe
    bookings_data = []
    
    for deal in deals:
        # Standard fields
        org = deal.get('org_id', {})
        client_name = org.get('name', 'Unknown') if isinstance(org, dict) else 'Unknown'
        
        deal_title = deal.get('title', 'Untitled')
        deal_value = deal.get('value', 0)
        won_time = deal.get('won_time', '')
        
        # Parse close date
        try:
            close_date = datetime.strptime(won_time, "%Y-%m-%d %H:%M:%S").date() if won_time else None
        except:
            close_date = None
        
        # Custom fields - these will be keys like '9a4d5e2b3c1f'
        project_duration = deal.get(custom_fields.get('project_duration'), None) if 'project_duration' in custom_fields else None
        bigtime_client_id = deal.get(custom_fields.get('bigtime_client_id'), None) if 'bigtime_client_id' in custom_fields else None
        bigtime_project_id = deal.get(custom_fields.get('bigtime_project_id'), None) if 'bigtime_project_id' in custom_fields else None
        bill_rate = deal.get(custom_fields.get('bill_rate'), None) if 'bill_rate' in custom_fields else None
        budget_hours = deal.get(custom_fields.get('budget_hours'), None) if 'budget_hours' in custom_fields else None
        project_start_date = deal.get(custom_fields.get('project_start_date'), None) if 'project_start_date' in custom_fields else None
        
        bookings_data.append({
            'Client': client_name,
            'Deal_Name': deal_title,
            'Close_Date': close_date,
            'Deal_Value': deal_value,
            'Project_Duration_Months': project_duration,
            'BigTime_Client_ID': bigtime_client_id,
            'BigTime_Project_ID': bigtime_project_id,
            'Bill_Rate': bill_rate,
            'Budget_Hours': budget_hours,
            'Project_Start_Date': project_start_date
        })
    
    bookings_df = pd.DataFrame(bookings_data)
    
    # Add time period grouping
    bookings_df['Close_Date'] = pd.to_datetime(bookings_df['Close_Date'])
    
    if view_by == "Month":
        bookings_df['Period'] = bookings_df['Close_Date'].dt.strftime('%Y-%m')
    elif view_by == "Quarter":
        bookings_df['Period'] = bookings_df['Close_Date'].dt.to_period('Q').astype(str)
    else:  # Year
        bookings_df['Period'] = bookings_df['Close_Date'].dt.year.astype(str)
    
    # Sort by close date
    bookings_df = bookings_df.sort_values('Close_Date')
    
    # ============================================================
    # DISPLAY RESULTS
    # ============================================================
    
    st.header("📊 Bookings Report")
    st.caption(f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')} | View: {view_by}")
    
    # Section 1: Summary Metrics
    st.subheader("📈 Summary")
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Bookings", len(bookings_df))
    with col2:
        total_value = bookings_df['Deal_Value'].sum()
        st.metric("Total Value", f"${total_value:,.0f}")
    with col3:
        avg_deal = bookings_df['Deal_Value'].mean()
        st.metric("Avg Deal Size", f"${avg_deal:,.0f}")
    with col4:
        unique_clients = bookings_df['Client'].nunique()
        st.metric("Unique Clients", unique_clients)
    
    st.divider()
    
    # Section 2: Bookings by Period
    st.subheader(f"📅 Bookings by {view_by}")
    
    period_summary = bookings_df.groupby('Period').agg({
        'Deal_Name': 'count',
        'Deal_Value': 'sum',
        'Client': 'nunique'
    }).reset_index()
    
    period_summary = period_summary.rename(columns={
        'Period': view_by,
        'Deal_Name': 'Deal Count',
        'Deal_Value': 'Total Value',
        'Client': 'Unique Clients'
    })
    
    st.dataframe(
        period_summary.style.format({
            'Total Value': '${:,.0f}'
        }),
        hide_index=True,
        use_container_width=True
    )
    
    st.divider()
    
    # Section 3: Detailed Bookings
    st.subheader("📋 Detailed Bookings")
    
    # Prepare display dataframe
    display_df = bookings_df[[
        'Period', 'Client', 'Deal_Name', 'Close_Date', 
        'Deal_Value', 'Project_Duration_Months', 
        'BigTime_Client_ID', 'BigTime_Project_ID'
    ]].copy()
    
    display_df = display_df.rename(columns={
        'Period': view_by,
        'Deal_Name': 'Deal Name',
        'Close_Date': 'Close Date',
        'Deal_Value': 'Value',
        'Project_Duration_Months': 'Duration (Mo)',
        'BigTime_Client_ID': 'BT Client ID',
        'BigTime_Project_ID': 'BT Project ID'
    })
    
    # Format dates
    display_df['Close Date'] = display_df['Close Date'].dt.strftime('%Y-%m-%d')
    
    st.dataframe(
        display_df.style.format({
            'Value': '${:,.0f}'
        }),
        hide_index=True,
        use_container_width=True
    )
    
    # ============================================================
    # EXCEL EXPORT
    # ============================================================
    
    st.divider()
    st.subheader("📥 Export Report")
    
    try:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Summary sheet
            period_summary.to_excel(writer, sheet_name=f'By_{view_by}', index=False)
            
            # Detailed sheet
            bookings_df.to_excel(writer, sheet_name='All_Bookings', index=False)
        
        excel_data = output.getvalue()
        filename = f"bookings_report_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.xlsx"
        
        st.download_button(
            label="📥 Download Excel Report",
            data=excel_data,
            file_name=filename,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
        
    except Exception as e:
        st.error(f"❌ Export failed: {e}")
        import traceback
        st.code(traceback.format_exc())

else:
    st.info("👆 Select date range and click the button to generate report")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app tracks bookings (won deals) from Pipedrive CRM.
        
        **Data Source:**
        - **Pipedrive API** - Won deals with close dates in selected range
        
        **Standard Fields:**
        - Client name (from organization)
        - Deal name
        - Close date (won_time)
        - Deal value
        
        **Custom Fields (if configured in Pipedrive):**
        - Project Duration (months)
        - BigTime Client ID
        - BigTime Project ID
        - Bill Rate
        - Budget Hours
        - Project Start Date
        
        **Views:**
        - **Month:** Group by YYYY-MM (e.g., 2025-01, 2025-02)
        - **Quarter:** Group by Q1-Q4 (e.g., 2025Q1, 2025Q2)
        - **Year:** Group by year (e.g., 2025, 2026)
        
        **Requirements:**
        - PIPEDRIVE_API_TOKEN must be configured in secrets
        - Only includes deals with status = "won"
        """)
