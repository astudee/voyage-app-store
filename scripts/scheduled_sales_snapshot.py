"""
Scheduled Sales Snapshot Report
Runs automatically via GitHub Actions to generate and email the Sales Snapshot report.

Schedule:
- Fridays at 9 AM CT
- Fridays at 2 PM CT  
- 1st of every month

Emails to: sales@voyageadvisory.com
"""

import os
import sys
import requests
import pandas as pd
from datetime import datetime, date, timedelta
from io import BytesIO
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email import encoders

# ============================================================
# CONFIGURATION - Set via GitHub Secrets
# ============================================================

PIPEDRIVE_API_KEY = os.environ.get("PIPEDRIVE_API_TOKEN")
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY")
EMAIL_TO = "sales@voyageadvisory.com"
EMAIL_CC = "astudee@voyageadvisory.com"  # CC the sender so they receive it too
EMAIL_FROM = "astudee@voyageadvisory.com"

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
                    probability = stage.get("deal_probability", 0) or 0
                    order = stage.get("order_nr", 0)
                    pipeline_id = stage.get("pipeline_id")
                    
                    stages[stage_id] = {
                        "name": stage_name,
                        "probability": probability / 100,
                        "order": order,
                        "pipeline_id": pipeline_id
                    }
                return stages
        return {}
    except Exception as e:
        print(f"Error fetching stages: {e}")
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
                    users[str(user_id)] = user_name
                return users
        return {}
    except Exception as e:
        print(f"Error fetching users: {e}")
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
                "status": "all_not_deleted"
            }
            
            response = requests.get(url, params=params, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("data"):
                    deals = data["data"]
                    all_deals.extend(deals)
                    
                    pagination = data.get("additional_data", {}).get("pagination", {})
                    if pagination.get("more_items_in_collection"):
                        start += limit
                    else:
                        break
                else:
                    break
            else:
                print(f"Error fetching deals: HTTP {response.status_code}")
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
            return filtered_deals
        
        return all_deals
        
    except Exception as e:
        print(f"Error fetching deals: {e}")
        return []


def get_current_quarter_dates():
    """Get start and end dates for current quarter"""
    today = date.today()
    current_quarter = (today.month - 1) // 3 + 1
    year = today.year
    
    quarter_starts = {1: (1, 1), 2: (4, 1), 3: (7, 1), 4: (10, 1)}
    quarter_ends = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}
    
    start_month, start_day = quarter_starts[current_quarter]
    end_month, end_day = quarter_ends[current_quarter]
    
    return date(year, start_month, start_day), date(year, end_month, end_day)


def generate_report():
    """Generate the Sales Snapshot report data"""
    print("Fetching data from Pipedrive...")
    
    stages = get_pipedrive_stages()
    users = get_pipedrive_users()
    
    start_date, end_date = get_current_quarter_dates()
    deals = get_pipedrive_deals(start_date, end_date)
    
    print(f"Loaded {len(deals)} deals, {len(stages)} stages")
    
    if not stages:
        raise Exception("Could not fetch pipeline stages from Pipedrive")
    
    # Process stages - sort by order, Lost last
    stage_order = sorted(stages.items(), key=lambda x: x[1]["order"])
    ordered_stages = []
    lost_stage_id = None
    
    for stage_id, stage_info in stage_order:
        if "lost" in stage_info["name"].lower():
            lost_stage_id = stage_id
        else:
            ordered_stages.append((stage_id, stage_info))
    
    if lost_stage_id:
        ordered_stages.append((lost_stage_id, stages[lost_stage_id]))
    
    # Process deals
    deal_rows = []
    stage_totals = {stage_id: {"count": 0, "value": 0, "factored": 0} for stage_id, _ in ordered_stages}
    
    for deal in deals:
        title = deal.get("title", "Untitled")
        value = deal.get("value", 0) or 0
        status = deal.get("status", "open")
        stage_id = deal.get("stage_id")
        
        # Get owner
        owner_data = deal.get("owner_id")
        if isinstance(owner_data, dict):
            owner_name = owner_data.get("name", "Unknown")
        elif owner_data:
            owner_name = users.get(owner_data, users.get(str(owner_data), "Unknown"))
        else:
            owner_name = "Unknown"
        
        if owner_name == "Unknown":
            user_id = deal.get("user_id")
            if isinstance(user_id, dict):
                owner_name = user_id.get("name", "Unknown")
            elif user_id:
                owner_name = users.get(user_id, users.get(str(user_id), "Unknown"))
        
        # Get client
        org = deal.get("org_id", {})
        client_name = org.get("name", "") if isinstance(org, dict) else ""
        
        # Determine stage
        if status == "lost":
            display_stage = "Lost"
            probability = 0
            for sid, sinfo in ordered_stages:
                if "lost" in sinfo["name"].lower():
                    stage_id = sid
                    break
        elif status == "won":
            display_stage = "Won"
            probability = 1.0
            for sid, sinfo in ordered_stages:
                if "won" in sinfo["name"].lower():
                    stage_id = sid
                    break
        else:
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
        
        if stage_id in stage_totals:
            stage_totals[stage_id]["count"] += 1
            stage_totals[stage_id]["value"] += value
            stage_totals[stage_id]["factored"] += factored_value
    
    # Sort deals
    def deal_sort_key(row):
        stage_name = row["Stage"].lower()
        status = row["Status"]
        
        if status == "won" or "won" in stage_name:
            stage_priority = 0
        elif "forecast" in stage_name:
            stage_priority = 1
        elif "proposal" in stage_name or "sow" in stage_name or "resourcing" in stage_name:
            stage_priority = 2
        elif stage_name == "qualified":
            stage_priority = 3
        elif "qualification" in stage_name:
            stage_priority = 4
        elif "early" in stage_name:
            stage_priority = 5
        elif status == "lost" or "lost" in stage_name:
            stage_priority = 99
        else:
            stage_priority = 50
        
        return (stage_priority, -row["Value"])
    
    deal_rows.sort(key=deal_sort_key)
    
    # Calculate metrics
    all_deals_count = len(deal_rows)
    all_deals_value = sum(d["Value"] for d in deal_rows)
    all_deals_factored = sum(d["Factored_Value"] for d in deal_rows)
    
    qualified_stages = []
    for stage_id, stage_info in ordered_stages:
        name_lower = stage_info["name"].lower()
        if any(x in name_lower for x in ["qualified", "proposal", "sow", "resourcing", "forecast"]):
            if "won" not in name_lower and "lost" not in name_lower:
                qualified_stages.append(stage_id)
    
    qualified_deals = [d for d in deal_rows if d["Stage_ID"] in qualified_stages and d["Status"] == "open"]
    qualified_count = len(qualified_deals)
    qualified_value = sum(d["Value"] for d in qualified_deals)
    qualified_factored = sum(d["Factored_Value"] for d in qualified_deals)
    
    # Booked Deals (Won deals)
    booked_deals = [d for d in deal_rows if d["Status"] == "won"]
    booked_count = len(booked_deals)
    booked_value = sum(d["Value"] for d in booked_deals)
    
    # Chart data
    chart_stages = []
    chart_counts = []
    chart_values = []
    chart_factored = []
    
    total_deals = 0
    total_pipeline = 0
    total_factored = 0
    
    for stage_id, stage_info in ordered_stages:
        totals = stage_totals.get(stage_id, {"count": 0, "value": 0, "factored": 0})
        chart_stages.append(stage_info["name"])
        chart_counts.append(totals["count"])
        chart_values.append(totals["value"])
        chart_factored.append(totals["factored"])
        total_deals += totals["count"]
        total_pipeline += totals["value"]
        total_factored += totals["factored"]
    
    return {
        "report_date": date.today(),
        "date_range": f"{start_date} to {end_date}",
        "start_date": start_date,
        "end_date": end_date,
        "all_deals_count": all_deals_count,
        "all_deals_value": all_deals_value,
        "all_deals_factored": all_deals_factored,
        "qualified_count": qualified_count,
        "qualified_value": qualified_value,
        "qualified_factored": qualified_factored,
        "booked_count": booked_count,
        "booked_value": booked_value,
        "chart_stages": chart_stages,
        "chart_counts": chart_counts,
        "chart_values": chart_values,
        "chart_factored": chart_factored,
        "total_deals": total_deals,
        "total_pipeline": total_pipeline,
        "total_factored": total_factored,
        "deal_rows": deal_rows,
        "ordered_stages": ordered_stages,
        "stage_totals": stage_totals
    }


def generate_excel(rd):
    """Generate Excel file"""
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Summary sheet
        transposed_data = {"Metric": ["% Factor", "# Deals", "$ Pipeline", "$ Pipeline (Factored)"]}
        for stage_id, stage_info in rd['ordered_stages']:
            totals = rd['stage_totals'].get(stage_id, {"count": 0, "value": 0, "factored": 0})
            transposed_data[stage_info["name"]] = [
                f"{int(stage_info['probability'] * 100)}%",
                totals["count"],
                totals["value"],
                totals["factored"]
            ]
        transposed_data["Total"] = ["", rd['total_deals'], rd['total_pipeline'], rd['total_factored']]
        pd.DataFrame(transposed_data).to_excel(writer, sheet_name='Summary', index=False)
        
        # Deal details
        display_rows = []
        for deal in rd['deal_rows']:
            row = {"Client": deal["Client"], "Deal": deal["Deal"], "Owner": deal["Owner"]}
            for stage_id, stage_info in rd['ordered_stages']:
                stage_name = stage_info["name"]
                if deal["Stage_ID"] == stage_id or (deal["Status"] == "lost" and "lost" in stage_name.lower()):
                    row[stage_name] = deal["Value"]
                else:
                    row[stage_name] = ""
            row["Total"] = deal["Value"]
            display_rows.append(row)
        pd.DataFrame(display_rows).to_excel(writer, sheet_name='Deal_Details', index=False)
        
        # Metrics
        metrics_data = {
            "Metric": ["Report Date", "Date Range", "All Deals - Count", "All Deals - $ Pipeline",
                      "All Deals - $ Factored", "Qualified Pipeline - Count",
                      "Qualified Pipeline - $ Pipeline", "Qualified Pipeline - $ Factored"],
            "Value": [rd['report_date'].strftime("%Y-%m-%d"), rd['date_range'],
                     rd['all_deals_count'], rd['all_deals_value'], rd['all_deals_factored'],
                     rd['qualified_count'], rd['qualified_value'], rd['qualified_factored']]
        }
        pd.DataFrame(metrics_data).to_excel(writer, sheet_name='Metrics', index=False)
        
        # Chart data
        chart_data = {
            "Stage": rd['chart_stages'],
            "# Deals": rd['chart_counts'],
            "$ Pipeline": rd['chart_values'],
            "$ Pipeline (Factored)": rd['chart_factored']
        }
        pd.DataFrame(chart_data).to_excel(writer, sheet_name='Chart_Data', index=False)
    
    return output.getvalue()


def generate_chart_image(rd):
    """Generate chart as PNG using matplotlib"""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    
    fig_mpl, ax1 = plt.subplots(figsize=(12, 5))
    
    x = np.arange(len(rd['chart_stages']))
    width = 0.35
    
    bars1 = ax1.bar(x - width/2, rd['chart_values'], width, label='$ Pipeline', color='#4472C4')
    bars2 = ax1.bar(x + width/2, rd['chart_factored'], width, label='$ Pipeline (Factored)', color='#70AD47')
    
    ax1.set_xlabel('Stage')
    ax1.set_ylabel('$ Value')
    ax1.set_xticks(x)
    ax1.set_xticklabels(rd['chart_stages'], rotation=45, ha='right')
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda val, p: f'${val:,.0f}'))
    
    for bar in bars1:
        height = bar.get_height()
        if height > 0:
            ax1.annotate(f'${height:,.0f}',
                xy=(bar.get_x() + bar.get_width() / 2, height),
                xytext=(0, 3), textcoords="offset points",
                ha='center', va='bottom', fontsize=7, rotation=90)
    
    for bar in bars2:
        height = bar.get_height()
        if height > 0:
            ax1.annotate(f'${height:,.0f}',
                xy=(bar.get_x() + bar.get_width() / 2, height),
                xytext=(0, 3), textcoords="offset points",
                ha='center', va='bottom', fontsize=7, rotation=90)
    
    ax2 = ax1.twinx()
    ax2.plot(x, rd['chart_counts'], color='#ED7D31', marker='o', linewidth=2, label='# Deals')
    ax2.set_ylabel('# Deals')
    
    for i, count in enumerate(rd['chart_counts']):
        ax2.annotate(str(count), (x[i], count), textcoords="offset points",
                    xytext=(0, 10), ha='center', fontsize=9, color='#ED7D31')
    
    plt.title(f"Sales Pipeline by Stage - {rd['report_date'].strftime('%B %d, %Y')}", pad=20)
    
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper right')
    
    plt.tight_layout()
    
    img_buffer = BytesIO()
    plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight',
               facecolor='white', edgecolor='none')
    img_buffer.seek(0)
    chart_data = img_buffer.getvalue()
    plt.close(fig_mpl)
    
    return chart_data


def send_email(rd, excel_data, chart_image_data):
    """Send the report via email using Gmail API"""
    import json
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    
    # Parse service account JSON from environment variable
    service_account_info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
    
    creds = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=['https://www.googleapis.com/auth/gmail.send'],
        subject=EMAIL_FROM
    )
    
    gmail = build('gmail', 'v1', credentials=creds)
    
    msg = MIMEMultipart('related')
    msg['From'] = EMAIL_FROM
    msg['To'] = EMAIL_TO
    msg['Cc'] = EMAIL_CC
    msg['Subject'] = f"Sales Snapshot Report - {rd['report_date'].strftime('%B %d, %Y')}"
    
    # HTML body
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #2c3e50;">Sales Snapshot Report</h2>
        <p><strong>Generated:</strong> {rd['report_date'].strftime('%B %d, %Y')}<br>
        <strong>Date Range:</strong> {rd['date_range']} (Current Quarter)</p>
        
        <img src='cid:chart_image' style='max-width: 100%; height: auto; margin: 20px 0;'>
        
        <table style="border-collapse: collapse; margin: 20px 0;">
            <tr>
                <td style="padding: 10px 30px 10px 0; vertical-align: top;">
                    <h3 style="color: #4472C4; margin-bottom: 10px;">All Deals</h3>
                    <p style="margin: 5px 0;"><strong>Total Deals:</strong> {rd['all_deals_count']}</p>
                    <p style="margin: 5px 0;"><strong>$ Pipeline:</strong> ${rd['all_deals_value']:,.0f}</p>
                    <p style="margin: 5px 0;"><strong>$ Pipeline (Factored):</strong> ${rd['all_deals_factored']:,.0f}</p>
                </td>
                <td style="padding: 10px 0 10px 30px; vertical-align: top; border-left: 1px solid #ddd;">
                    <h3 style="color: #70AD47; margin-bottom: 10px;">Qualified or Later Pipeline</h3>
                    <p style="margin: 5px 0;"><strong>Total Deals:</strong> {rd['qualified_count']}</p>
                    <p style="margin: 5px 0;"><strong>$ Pipeline:</strong> ${rd['qualified_value']:,.0f}</p>
                    <p style="margin: 5px 0;"><strong>$ Pipeline (Factored):</strong> ${rd['qualified_factored']:,.0f}</p>
                </td>
                <td style="padding: 10px 0 10px 30px; vertical-align: top; border-left: 1px solid #ddd;">
                    <h3 style="color: #ED7D31; margin-bottom: 10px;">Booked Deals</h3>
                    <p style="margin: 5px 0;"><strong>Total Deals:</strong> {rd['booked_count']}</p>
                    <p style="margin: 5px 0;"><strong>$ Pipeline:</strong> ${rd['booked_value']:,.0f}</p>
                </td>
            </tr>
        </table>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
            See attached Excel file for full deal details.<br><br>
            <em>This is an automated report from Voyage Advisory.</em>
        </p>
    </body>
    </html>
    """
    
    msg_alternative = MIMEMultipart('alternative')
    msg.attach(msg_alternative)
    
    # Plain text
    plain_body = f"""Sales Snapshot Report

Generated: {rd['report_date'].strftime('%B %d, %Y')}
Date Range: {rd['date_range']} (Current Quarter)

ALL DEALS
- Total Deals: {rd['all_deals_count']}
- $ Pipeline: ${rd['all_deals_value']:,.0f}
- $ Pipeline (Factored): ${rd['all_deals_factored']:,.0f}

QUALIFIED OR LATER PIPELINE
- Total Deals: {rd['qualified_count']}
- $ Pipeline: ${rd['qualified_value']:,.0f}
- $ Pipeline (Factored): ${rd['qualified_factored']:,.0f}

BOOKED DEALS
- Total Deals: {rd['booked_count']}
- $ Pipeline: ${rd['booked_value']:,.0f}

See attached file for full details.

This is an automated report from Voyage Advisory.
"""
    
    msg_alternative.attach(MIMEText(plain_body, 'plain'))
    msg_alternative.attach(MIMEText(html_body, 'html'))
    
    # Attach chart image
    if chart_image_data:
        img_part = MIMEImage(chart_image_data)
        img_part.add_header('Content-ID', '<chart_image>')
        img_part.add_header('Content-Disposition', 'inline', filename='chart.png')
        msg.attach(img_part)
    
    # Attach Excel
    if excel_data:
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(excel_data)
        encoders.encode_base64(part)
        filename = f"sales_snapshot_{rd['report_date'].strftime('%Y%m%d')}.xlsx"
        part.add_header('Content-Disposition', f'attachment; filename={filename}')
        msg.attach(part)
    
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
    result = gmail.users().messages().send(userId='me', body={'raw': raw}).execute()
    
    return result


def main():
    """Main function to generate and send the report"""
    print(f"Starting Sales Snapshot Report - {datetime.now()}")
    
    # Validate environment variables
    if not PIPEDRIVE_API_KEY:
        print("ERROR: PIPEDRIVE_API_TOKEN not set")
        sys.exit(1)
    
    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        print("ERROR: GOOGLE_SERVICE_ACCOUNT_KEY not set")
        sys.exit(1)
    
    try:
        # Generate report
        rd = generate_report()
        print(f"Report generated: {rd['all_deals_count']} deals, ${rd['all_deals_value']:,.0f} pipeline")
        
        # Generate Excel
        excel_data = generate_excel(rd)
        print("Excel file generated")
        
        # Generate chart
        chart_image_data = generate_chart_image(rd)
        print("Chart image generated")
        
        # Send email
        result = send_email(rd, excel_data, chart_image_data)
        print(f"Email sent successfully to {EMAIL_TO}")
        print(f"Message ID: {result.get('id')}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print("Done!")


if __name__ == "__main__":
    main()
