"""
Sales Snapshot App
Pipeline report showing deals by stage with factoring
"""

import streamlit as st
import pandas as pd
import requests
from datetime import datetime, date, timedelta
from io import BytesIO
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Authentication check
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

st.set_page_config(page_title="Sales Snapshot", page_icon="📈", layout="wide")

st.title("📈 Sales Snapshot")
st.markdown("Pipeline report by deal stage with probability factoring")

# ============================================================
# CONFIGURATION
# ============================================================

try:
    PIPEDRIVE_API_KEY = st.secrets.get("PIPEDRIVE_API_KEY")
except:
    PIPEDRIVE_API_KEY = None

if not PIPEDRIVE_API_KEY:
    st.error("❌ Pipedrive API key not configured. Please add PIPEDRIVE_API_KEY to secrets.")
    st.stop()

PIPEDRIVE_BASE_URL = "https://api.pipedrive.com/v1"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_pipedrive_stages():
    """Fetch all stages from Pipedrive with their probabilities"""
    try:
        url = f"{PIPEDRIVE_BASE_URL}/stages"
        params = {"api_token": PIPEDRIVE_API_KEY}
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("data"):
                stages = {}
                for stage in data["data"]:
                    stage_id = stage.get("id")
                    stage_name = stage.get("name", "Unknown")
                    # Pipedrive stores probability as 0-100
                    probability = stage.get("deal_probability", 0) or 0
                    order = stage.get("order_nr", 0)
                    pipeline_id = stage.get("pipeline_id")
                    
                    stages[stage_id] = {
                        "name": stage_name,
                        "probability": probability / 100,  # Convert to decimal
                        "order": order,
                        "pipeline_id": pipeline_id
                    }
                return stages
        return {}
    except Exception as e:
        st.error(f"Error fetching stages: {e}")
        return {}


def get_pipedrive_users():
    """Fetch all users from Pipedrive"""
    try:
        url = f"{PIPEDRIVE_BASE_URL}/users"
        params = {"api_token": PIPEDRIVE_API_KEY}
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("data"):
                users = {}
                for user in data["data"]:
                    user_id = user.get("id")
                    user_name = user.get("name", "Unknown")
                    users[user_id] = user_name
                return users
        return {}
    except Exception as e:
        st.error(f"Error fetching users: {e}")
        return {}


def get_pipedrive_deals(start_date=None, end_date=None):
    """Fetch all deals from Pipedrive with optional date filter"""
    try:
        all_deals = []
        start = 0
        limit = 500
        
        while True:
            url = f"{PIPEDRIVE_BASE_URL}/deals"
            params = {
                "api_token": PIPEDRIVE_API_KEY,
                "start": start,
                "limit": limit,
                "status": "all_not_deleted"  # Get open, won, and lost deals
            }
            
            response = requests.get(url, params=params, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("data"):
                    deals = data["data"]
                    all_deals.extend(deals)
                    
                    # Check for more pages
                    pagination = data.get("additional_data", {}).get("pagination", {})
                    if pagination.get("more_items_in_collection"):
                        start += limit
                    else:
                        break
                else:
                    break
            else:
                st.error(f"Error fetching deals: HTTP {response.status_code}")
                break
        
        # Filter by expected close date if specified
        if start_date or end_date:
            filtered_deals = []
            for deal in all_deals:
                expected_close = deal.get("expected_close_date")
                if expected_close:
                    try:
                        close_date = datetime.strptime(expected_close, "%Y-%m-%d").date()
                        if start_date and close_date < start_date:
                            continue
                        if end_date and close_date > end_date:
                            continue
                        filtered_deals.append(deal)
                    except:
                        pass
                elif not start_date and not end_date:
                    # Include deals without expected close date only if no date filter
                    filtered_deals.append(deal)
            return filtered_deals
        
        return all_deals
        
    except Exception as e:
        st.error(f"Error fetching deals: {e}")
        return []


def get_quarter_dates(year, quarter):
    """Get start and end dates for a quarter"""
    quarter_starts = {
        1: (1, 1),
        2: (4, 1),
        3: (7, 1),
        4: (10, 1)
    }
    quarter_ends = {
        1: (3, 31),
        2: (6, 30),
        3: (9, 30),
        4: (12, 31)
    }
    
    start_month, start_day = quarter_starts[quarter]
    end_month, end_day = quarter_ends[quarter]
    
    return date(year, start_month, start_day), date(year, end_month, end_day)


def get_current_quarter():
    """Get current quarter number (1-4)"""
    month = datetime.now().month
    return (month - 1) // 3 + 1


# ============================================================
# MAIN UI
# ============================================================

st.markdown("---")

# Date range selector - centered
col_left, col_center, col_right = st.columns([1, 2, 1])

with col_center:
    date_option = st.selectbox(
        "📅 Expected Close Date Range",
        ["This Quarter", "Next Quarter", "This Year", "Last Year", "All Dates", "Custom"],
        index=0
    )
    
    today = date.today()
    current_year = today.year
    current_quarter = get_current_quarter()
    
    if date_option == "This Quarter":
        start_date, end_date = get_quarter_dates(current_year, current_quarter)
    elif date_option == "Next Quarter":
        next_quarter = current_quarter + 1
        next_year = current_year
        if next_quarter > 4:
            next_quarter = 1
            next_year += 1
        start_date, end_date = get_quarter_dates(next_year, next_quarter)
    elif date_option == "This Year":
        start_date = date(current_year, 1, 1)
        end_date = date(current_year, 12, 31)
    elif date_option == "Last Year":
        start_date = date(current_year - 1, 1, 1)
        end_date = date(current_year - 1, 12, 31)
    elif date_option == "All Dates":
        start_date = None
        end_date = None
    else:  # Custom
        col1, col2 = st.columns(2)
        with col1:
            start_date = st.date_input("Start Date", value=date(current_year, 1, 1))
        with col2:
            end_date = st.date_input("End Date", value=date(current_year, 12, 31))
    
    if start_date and end_date:
        st.caption(f"**Date Range:** {start_date.strftime('%B %d, %Y')} through {end_date.strftime('%B %d, %Y')}")
    elif date_option == "All Dates":
        st.caption("**Date Range:** All dates (no filter)")
    
    run_report = st.button("📊 Generate Report", type="primary", use_container_width=True)

st.markdown("---")

if run_report:
    
    # ============================================================
    # FETCH DATA
    # ============================================================
    
    with st.spinner("📡 Fetching data from Pipedrive..."):
        stages = get_pipedrive_stages()
        users = get_pipedrive_users()
        deals = get_pipedrive_deals(start_date, end_date)
        
        if not stages:
            st.error("❌ Could not fetch pipeline stages from Pipedrive")
            st.stop()
        
        st.success(f"✅ Loaded {len(deals)} deals, {len(stages)} stages")
    
    # ============================================================
    # PROCESS DATA
    # ============================================================
    
    # Define stage order for display (we want Lost last)
    # Sort stages by their order, but put "Lost" and lost status deals at the end
    stage_order = sorted(stages.items(), key=lambda x: x[1]["order"])
    
    # Build ordered list of stage names, excluding any "Lost" stage for now
    ordered_stages = []
    lost_stage_id = None
    for stage_id, stage_info in stage_order:
        if "lost" in stage_info["name"].lower():
            lost_stage_id = stage_id
        else:
            ordered_stages.append((stage_id, stage_info))
    
    # Add Lost at the end
    if lost_stage_id:
        ordered_stages.append((lost_stage_id, stages[lost_stage_id]))
    
    # Process deals into rows
    deal_rows = []
    stage_totals = {stage_id: {"count": 0, "value": 0, "factored": 0} for stage_id, _ in ordered_stages}
    
    for deal in deals:
        deal_id = deal.get("id")
        title = deal.get("title", "Untitled")
        value = deal.get("value", 0) or 0
        status = deal.get("status", "open")  # open, won, lost
        stage_id = deal.get("stage_id")
        owner_id = deal.get("owner_id", {})
        if isinstance(owner_id, dict):
            owner_id = owner_id.get("id")
        owner_name = users.get(owner_id, "Unknown")
        
        # Get organization/client name
        org = deal.get("org_id", {})
        if isinstance(org, dict):
            client_name = org.get("name", "")
        else:
            client_name = ""
        
        # Determine which column this deal goes in
        # Lost deals (by status) go to Lost column regardless of stage
        if status == "lost":
            # Find or create lost column
            display_stage = "Lost"
            probability = 0
            # Find lost stage id
            for sid, sinfo in ordered_stages:
                if "lost" in sinfo["name"].lower():
                    stage_id = sid
                    break
        elif status == "won":
            display_stage = "Won"
            probability = 1.0
            # Find won stage
            for sid, sinfo in ordered_stages:
                if "won" in sinfo["name"].lower():
                    stage_id = sid
                    break
        else:
            # Open deal - use its current stage
            stage_info = stages.get(stage_id, {})
            display_stage = stage_info.get("name", "Unknown")
            probability = stage_info.get("probability", 0)
        
        factored_value = value * probability
        
        deal_rows.append({
            "Client": client_name,
            "Deal": title,
            "Owner": owner_name,
            "Stage": display_stage,
            "Stage_ID": stage_id,
            "Value": value,
            "Factored_Value": factored_value,
            "Probability": probability,
            "Status": status
        })
        
        # Update stage totals
        if stage_id in stage_totals:
            stage_totals[stage_id]["count"] += 1
            stage_totals[stage_id]["value"] += value
            stage_totals[stage_id]["factored"] += factored_value
    
    # Sort deals: by stage order, then by value descending, with Lost deals last
    def deal_sort_key(row):
        # Get stage order
        stage_order_num = 999
        for idx, (sid, sinfo) in enumerate(ordered_stages):
            if sid == row["Stage_ID"]:
                stage_order_num = idx
                break
        
        # Lost deals go last (status == 'lost')
        is_lost = 1 if row["Status"] == "lost" else 0
        
        return (is_lost, stage_order_num, -row["Value"])
    
    deal_rows.sort(key=deal_sort_key)
    
    # ============================================================
    # CALCULATE SUMMARY METRICS
    # ============================================================
    
    # All Deals
    all_deals_count = len(deal_rows)
    all_deals_value = sum(d["Value"] for d in deal_rows)
    all_deals_factored = sum(d["Factored_Value"] for d in deal_rows)
    
    # Qualified or Later Pipeline (Qualified, Proposal/SOW/Resourcing, Forecast - NOT Won, NOT Lost)
    qualified_stages = []
    for stage_id, stage_info in ordered_stages:
        name_lower = stage_info["name"].lower()
        # Include stages that are "qualified" or later but not won/lost
        if any(x in name_lower for x in ["qualified", "proposal", "sow", "resourcing", "forecast"]):
            if "won" not in name_lower and "lost" not in name_lower:
                qualified_stages.append(stage_id)
    
    qualified_deals = [d for d in deal_rows if d["Stage_ID"] in qualified_stages and d["Status"] == "open"]
    qualified_count = len(qualified_deals)
    qualified_value = sum(d["Value"] for d in qualified_deals)
    qualified_factored = sum(d["Factored_Value"] for d in qualified_deals)
    
    # ============================================================
    # CREATE CHART
    # ============================================================
    
    st.subheader(f"Voyage Advisory | Sales Snapshot Report as of {date.today().strftime('%m/%d/%y')}")
    
    # Prepare chart data
    chart_stages = []
    chart_counts = []
    chart_values = []
    chart_factored = []
    chart_probabilities = []
    
    for stage_id, stage_info in ordered_stages:
        stage_name = stage_info["name"]
        totals = stage_totals.get(stage_id, {"count": 0, "value": 0, "factored": 0})
        
        chart_stages.append(stage_name)
        chart_counts.append(totals["count"])
        chart_values.append(totals["value"])
        chart_factored.append(totals["factored"])
        chart_probabilities.append(int(stage_info["probability"] * 100))
    
    # Create subplot with secondary y-axis
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    # Bar chart for $ Pipeline
    fig.add_trace(
        go.Bar(
            name="$ Pipeline",
            x=chart_stages,
            y=chart_values,
            marker_color="#4472C4",
            text=[f"${v:,.0f}" for v in chart_values],
            textposition="outside"
        ),
        secondary_y=False
    )
    
    # Bar chart for $ Pipeline (Factored)
    fig.add_trace(
        go.Bar(
            name="$ Pipeline (Factored)",
            x=chart_stages,
            y=chart_factored,
            marker_color="#70AD47",
            text=[f"${v:,.0f}" for v in chart_factored],
            textposition="outside"
        ),
        secondary_y=False
    )
    
    # Line chart for # Deals
    fig.add_trace(
        go.Scatter(
            name="# Deals",
            x=chart_stages,
            y=chart_counts,
            mode="lines+markers+text",
            line=dict(color="#ED7D31", width=3),
            marker=dict(size=10),
            text=chart_counts,
            textposition="top center"
        ),
        secondary_y=True
    )
    
    # Update layout
    fig.update_layout(
        barmode="group",
        height=400,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin=dict(l=50, r=50, t=50, b=50)
    )
    
    fig.update_yaxes(title_text="$ Value", secondary_y=False, tickformat="$,.0f")
    fig.update_yaxes(title_text="# Deals", secondary_y=True)
    
    st.plotly_chart(fig, use_container_width=True)
    
    # ============================================================
    # SUMMARY METRICS TABLE
    # ============================================================
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("**All Deals**")
        st.metric("Total Deals", all_deals_count)
        st.metric("$ Pipeline", f"${all_deals_value:,.0f}")
        st.metric("$ Pipeline (Factored)", f"${all_deals_factored:,.0f}")
    
    with col2:
        st.markdown("**Qualified or Later Pipeline**")
        st.metric("Deals", qualified_count)
        st.metric("$ Pipeline", f"${qualified_value:,.0f}")
        st.metric("$ Pipeline (Factored)", f"${qualified_factored:,.0f}")
    
    # ============================================================
    # STAGE SUMMARY TABLE
    # ============================================================
    
    st.markdown("---")
    st.subheader("📊 Summary by Stage")
    
    summary_data = []
    for stage_id, stage_info in ordered_stages:
        totals = stage_totals.get(stage_id, {"count": 0, "value": 0, "factored": 0})
        summary_data.append({
            "Stage": stage_info["name"],
            "% Factor": f"{int(stage_info['probability'] * 100)}%",
            "# Deals": totals["count"],
            "$ Pipeline": totals["value"],
            "$ Pipeline (Factored)": totals["factored"]
        })
    
    summary_df = pd.DataFrame(summary_data)
    
    # Format currency columns
    st.dataframe(
        summary_df.style.format({
            "$ Pipeline": "${:,.0f}",
            "$ Pipeline (Factored)": "${:,.0f}"
        }),
        use_container_width=True,
        hide_index=True
    )
    
    # ============================================================
    # DEAL DETAIL TABLE
    # ============================================================
    
    st.markdown("---")
    st.subheader("📋 Deal Details")
    
    # Create pivot-style display
    # For each deal, show which stage column it belongs to
    
    # Build the display dataframe
    display_rows = []
    for deal in deal_rows:
        row = {
            "Client": deal["Client"],
            "Deal": deal["Deal"],
            "Owner": deal["Owner"]
        }
        
        # Add columns for each stage
        for stage_id, stage_info in ordered_stages:
            stage_name = stage_info["name"]
            if deal["Stage_ID"] == stage_id or (deal["Status"] == "lost" and "lost" in stage_name.lower()):
                row[stage_name] = deal["Value"]
            else:
                row[stage_name] = None
        
        row["Total"] = deal["Value"]
        display_rows.append(row)
    
    display_df = pd.DataFrame(display_rows)
    
    # Get stage column names for formatting
    stage_cols = [stage_info["name"] for _, stage_info in ordered_stages]
    
    # Format the dataframe
    format_dict = {col: "${:,.0f}" for col in stage_cols}
    format_dict["Total"] = "${:,.0f}"
    
    st.dataframe(
        display_df.style.format(format_dict, na_rep=""),
        use_container_width=True,
        hide_index=True,
        height=500
    )
    
    # ============================================================
    # EXPORT OPTIONS
    # ============================================================
    
    st.markdown("---")
    st.subheader("📥 Export Report")
    
    # Store data for email
    st.session_state.sales_snapshot_data = {
        "report_date": date.today(),
        "date_range": f"{start_date} to {end_date}" if start_date else "All Dates",
        "all_deals_count": all_deals_count,
        "all_deals_value": all_deals_value,
        "all_deals_factored": all_deals_factored,
        "qualified_count": qualified_count,
        "qualified_value": qualified_value,
        "qualified_factored": qualified_factored,
        "summary_df": summary_df,
        "display_df": display_df
    }
    
    col1, col2 = st.columns(2)
    
    with col1:
        # Excel export
        try:
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # Summary sheet
                summary_df.to_excel(writer, sheet_name='Summary', index=False)
                
                # Details sheet
                display_df.to_excel(writer, sheet_name='Deal_Details', index=False)
                
                # Metrics sheet
                metrics_data = {
                    "Metric": ["Report Date", "Date Range", "All Deals - Count", "All Deals - $ Pipeline", 
                              "All Deals - $ Factored", "Qualified Pipeline - Count", 
                              "Qualified Pipeline - $ Pipeline", "Qualified Pipeline - $ Factored"],
                    "Value": [date.today().strftime("%Y-%m-%d"), 
                             f"{start_date} to {end_date}" if start_date else "All Dates",
                             all_deals_count, all_deals_value, all_deals_factored,
                             qualified_count, qualified_value, qualified_factored]
                }
                pd.DataFrame(metrics_data).to_excel(writer, sheet_name='Metrics', index=False)
            
            excel_data = output.getvalue()
            st.session_state.sales_snapshot_data['excel_file'] = excel_data
            
            st.download_button(
                label="📥 Download Excel",
                data=excel_data,
                file_name=f"sales_snapshot_{date.today().strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
        except Exception as e:
            st.error(f"Excel export error: {e}")
    
    with col2:
        # Text report
        report_text = f"""SALES SNAPSHOT REPORT
Generated: {date.today().strftime('%B %d, %Y')}
Date Range: {start_date} to {end_date if end_date else 'All Dates'}

=== ALL DEALS ===
Total Deals: {all_deals_count}
$ Pipeline: ${all_deals_value:,.0f}
$ Pipeline (Factored): ${all_deals_factored:,.0f}

=== QUALIFIED OR LATER PIPELINE ===
Total Deals: {qualified_count}
$ Pipeline: ${qualified_value:,.0f}
$ Pipeline (Factored): ${qualified_factored:,.0f}

=== SUMMARY BY STAGE ===
"""
        for _, row in summary_df.iterrows():
            report_text += f"\n{row['Stage']} ({row['% Factor']}): {row['# Deals']} deals, ${row['$ Pipeline']:,.0f} (${row['$ Pipeline (Factored)']:,.0f} factored)"
        
        report_text += "\n\n=== DEAL DETAILS ===\n"
        for deal in deal_rows:
            report_text += f"\n{deal['Client']} - {deal['Deal']} ({deal['Owner']}): ${deal['Value']:,.0f} [{deal['Stage']}]"
        
        st.session_state.sales_snapshot_data['report_text'] = report_text
        
        st.download_button(
            label="📥 Download Text",
            data=report_text,
            file_name=f"sales_snapshot_{date.today().strftime('%Y%m%d')}.txt",
            mime="text/plain",
            use_container_width=True
        )

else:
    st.info("☝️ Select a date range and click 'Generate Report'")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This report shows your sales pipeline from Pipedrive:
        
        **Features:**
        - Filter by expected close date (This Quarter, Next Quarter, This Year, etc.)
        - View deals organized by pipeline stage
        - See probability-factored values based on Pipedrive stage settings
        - Summary metrics for all deals and qualified pipeline
        - Chart visualization of pipeline by stage
        
        **Stage Probabilities:**
        - Pulled directly from Pipedrive stage settings
        - Factored values = Deal Value × Stage Probability
        
        **Qualified or Later Pipeline:**
        - Includes deals in Qualified, Proposal/SOW/Resourcing, and Forecast stages
        - Excludes Won and Lost deals
        
        **Data Source:**
        - Pipedrive API (deals, stages, users)
        """)

# ============================================================
# EMAIL FUNCTIONALITY
# ============================================================

if 'sales_snapshot_data' in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")
    
    email_to = st.sidebar.text_input(
        "Send to:",
        placeholder="email@example.com",
        key="sales_snapshot_email"
    )
    
    send_clicked = st.sidebar.button("Send Email", type="primary", use_container_width=True, key="send_sales_snapshot")
    
    if send_clicked:
        if not email_to:
            st.sidebar.error("Enter an email address")
        else:
            try:
                from googleapiclient.discovery import build
                from google.oauth2 import service_account
                import base64
                from email.mime.multipart import MIMEMultipart
                from email.mime.base import MIMEBase
                from email.mime.text import MIMEText
                from email import encoders
                
                rd = st.session_state.sales_snapshot_data
                
                creds = service_account.Credentials.from_service_account_info(
                    st.secrets["SERVICE_ACCOUNT_KEY"],
                    scopes=['https://www.googleapis.com/auth/gmail.send'],
                    subject='astudee@voyageadvisory.com'
                )
                
                gmail = build('gmail', 'v1', credentials=creds)
                
                msg = MIMEMultipart()
                msg['From'] = 'astudee@voyageadvisory.com'
                msg['To'] = email_to
                msg['Subject'] = f"Sales Snapshot Report - {rd['report_date'].strftime('%B %d, %Y')}"
                
                body = f"""Sales Snapshot Report

Generated: {rd['report_date'].strftime('%B %d, %Y')}
Date Range: {rd['date_range']}

ALL DEALS
- Total Deals: {rd['all_deals_count']}
- $ Pipeline: ${rd['all_deals_value']:,.0f}
- $ Pipeline (Factored): ${rd['all_deals_factored']:,.0f}

QUALIFIED OR LATER PIPELINE
- Total Deals: {rd['qualified_count']}
- $ Pipeline: ${rd['qualified_value']:,.0f}
- $ Pipeline (Factored): ${rd['qualified_factored']:,.0f}

See attached file for full details.

Best regards,
Voyage Advisory
"""
                
                msg.attach(MIMEText(body, 'plain'))
                
                # Attach Excel if available
                if 'excel_file' in rd:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(rd['excel_file'])
                    encoders.encode_base64(part)
                    filename = f"sales_snapshot_{rd['report_date'].strftime('%Y%m%d')}.xlsx"
                    part.add_header('Content-Disposition', f'attachment; filename={filename}')
                    msg.attach(part)
                
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
                result = gmail.users().messages().send(userId='me', body={'raw': raw}).execute()
                
                st.sidebar.success(f"✅ Sent to {email_to}!")
                
            except Exception as e:
                st.sidebar.error(f"❌ {type(e).__name__}")
                st.sidebar.code(str(e))
