"""
Scheduled Time Reviewer Report
Runs automatically via GitHub Actions to generate and email the Time Review report.

Schedule:
- Mondays at 7 AM CT
- Tuesdays at 7 AM CT

Emails to: astudee@voyageadvisory.com
"""

import os
import sys
import json
import requests
import pandas as pd
from datetime import datetime, date, timedelta
from io import BytesIO
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders

# ============================================================
# CONFIGURATION - Set via GitHub Secrets
# ============================================================

BIGTIME_API_KEY = os.environ.get("BIGTIME_API_KEY")
BIGTIME_FIRM_ID = os.environ.get("BIGTIME_FIRM_ID")
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY")
SHEET_CONFIG_ID = os.environ.get("SHEET_CONFIG_ID")

EMAIL_TO = "astudee@voyageadvisory.com"
EMAIL_FROM = "astudee@voyageadvisory.com"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_bigtime_report(report_id, start_date, end_date):
    """Fetch data from BigTime report API"""
    url = f"https://iq.bigtime.net/BigtimeData/api/v2/report/data/{report_id}"

    headers = {
        "X-Auth-ApiToken": BIGTIME_API_KEY,
        "X-Auth-Realm": BIGTIME_FIRM_ID,
        "Accept": "application/json"
    }

    payload = {
        "DT_BEGIN": start_date.strftime("%Y-%m-%d"),
        "DT_END": end_date.strftime("%Y-%m-%d")
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        if response.status_code == 200:
            report_data = response.json()
            data_rows = report_data.get('Data', [])
            field_list = report_data.get('FieldList', [])

            if not data_rows:
                return pd.DataFrame()

            column_names = [field.get('FieldNm') for field in field_list]
            df = pd.DataFrame(data_rows, columns=column_names)
            return df
        else:
            print(f"BigTime API Error {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"BigTime API Exception: {str(e)}")
        return None


def read_google_sheet(sheet_id, tab_name):
    """Read data from Google Sheet"""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account

    service_account_info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)

    creds = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
    )

    service = build('sheets', 'v4', credentials=creds)

    result = service.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range=f"{tab_name}!A:ZZ"
    ).execute()

    values = result.get('values', [])

    if not values:
        return pd.DataFrame()

    headers = values[0]
    data = values[1:]

    # Pad rows to match header length
    max_cols = len(headers)
    padded_data = [row + [''] * (max_cols - len(row)) for row in data]

    return pd.DataFrame(padded_data, columns=headers)


def snap_to_friday(selected_date):
    """Snap a date to the nearest Friday"""
    weekday = selected_date.weekday()
    if weekday == 4:  # Already Friday
        return selected_date
    elif weekday < 4:  # Mon-Thu: go back to previous Friday
        days_since_friday = weekday + 3
        return selected_date - timedelta(days=days_since_friday)
    else:  # Sat-Sun: go back to previous Friday
        days_since_friday = weekday - 4
        return selected_date - timedelta(days=days_since_friday)


def generate_report():
    """Generate the Time Review report data"""
    print("Starting Time Review report generation...")

    # Determine week ending (most recent Friday)
    today = date.today()
    week_ending = snap_to_friday(today)
    if week_ending > today:
        week_ending = week_ending - timedelta(days=7)
    week_starting = week_ending - timedelta(days=6)

    print(f"Report period: {week_starting} to {week_ending}")

    # Load employee list
    print("Loading employee list from Google Sheets...")
    staff_df = read_google_sheet(SHEET_CONFIG_ID, "Staff")

    if staff_df is None or staff_df.empty:
        raise Exception("Could not load Staff configuration")

    employees = set(staff_df['Staff_Name'].tolist())
    print(f"Loaded {len(employees)} employees")

    # Initialize issues
    issues = {
        'zero_hours': [],
        'not_submitted': [],
        'under_40': [],
        'non_billable_client_work': [],
        'project_overruns': []
    }

    # Fetch BigTime reports
    print("Fetching BigTime reports...")

    zero_hours_df = get_bigtime_report(288578, week_starting, week_ending)
    unsubmitted_df = get_bigtime_report(284828, week_starting, week_ending)
    detailed_df = get_bigtime_report(284796, week_starting, week_ending)

    if zero_hours_df is None or unsubmitted_df is None or detailed_df is None:
        raise Exception("Failed to fetch BigTime reports")

    print(f"Fetched: {len(zero_hours_df)} zero-hour, {len(unsubmitted_df)} unsubmitted, {len(detailed_df)} detailed entries")

    # Analyze Zero Hours
    print("Analyzing zero hours...")
    if not zero_hours_df.empty:
        staff_col = None
        for col in ['Staff', 'Staff Member', 'tmstaffnm', 'Name']:
            if col in zero_hours_df.columns:
                staff_col = col
                break

        if staff_col:
            issues['zero_hours'] = sorted(zero_hours_df[staff_col].unique().tolist())

    # Analyze Unsubmitted
    print("Analyzing unsubmitted timesheets...")
    if not unsubmitted_df.empty:
        staff_col = None
        for col in ['Staff', 'Staff Member', 'tmstaffnm', 'Name']:
            if col in unsubmitted_df.columns:
                staff_col = col
                break

        if staff_col:
            issues['not_submitted'] = sorted(unsubmitted_df[staff_col].unique().tolist())

    # Analyze detailed time entries
    print("Analyzing detailed time entries...")
    if not detailed_df.empty:
        # Map column names
        col_mapping = {}
        for standard_name, possible_names in {
            'Staff': ['Staff Member', 'tmstaffnm'],
            'Client': ['Client', 'tmclientnm'],
            'Project': ['Project', 'tmprojectnm'],
            'Hours': ['tmhrsin', 'Input', 'tmhrs', 'Hours', 'Total Hours', 'TotalHours'],
            'Billable': ['tmhrsbill', 'Billable'],
            'Date': ['tmdt', 'Date'],
            'Notes': ['tmnotes', 'Notes'],
            'Project_ID': ['tmprojectnm_id', 'Code/ID', 'Project_ID', 'ProjectID']
        }.items():
            for possible in possible_names:
                if possible in detailed_df.columns:
                    col_mapping[standard_name] = possible
                    break

        # Rename columns
        detailed_df = detailed_df.rename(columns={v: k for k, v in col_mapping.items()})

        # Convert to numeric
        if 'Hours' in detailed_df.columns:
            detailed_df['Hours'] = pd.to_numeric(detailed_df['Hours'], errors='coerce')
        if 'Billable' in detailed_df.columns:
            detailed_df['Billable'] = pd.to_numeric(detailed_df['Billable'], errors='coerce')

        # Check: Under 40 hours (employees only)
        if 'Staff' in detailed_df.columns and 'Hours' in detailed_df.columns:
            hours_by_staff = detailed_df.groupby('Staff')['Hours'].sum()

            for staff_name, total_hours in hours_by_staff.items():
                if staff_name in employees and total_hours < 40:
                    issues['under_40'].append((staff_name, round(total_hours, 1)))

        # Check: Non-billable client work
        if all(col in detailed_df.columns for col in ['Staff', 'Client', 'Project', 'Hours', 'Billable', 'Date']):
            non_internal = detailed_df[
                (~detailed_df['Client'].str.contains('Internal', case=False, na=False)) &
                (detailed_df['Billable'].fillna(0) == 0) &
                (detailed_df['Hours'] > 0)
            ]

            for _, row in non_internal.iterrows():
                issues['non_billable_client_work'].append({
                    'Staff': row.get('Staff', ''),
                    'Client': row.get('Client', ''),
                    'Project': row.get('Project', ''),
                    'Date': row.get('Date', ''),
                    'Hours': round(row.get('Hours', 0), 1)
                })

    # Check project overruns
    print("Checking project overruns...")
    try:
        assignments_df = read_google_sheet(SHEET_CONFIG_ID, "Assignments")

        if assignments_df is not None and not assignments_df.empty and not detailed_df.empty:
            if 'Client' in detailed_df.columns:
                billable_df = detailed_df[
                    (~detailed_df['Client'].str.contains('Internal', case=False, na=False)) &
                    (detailed_df.get('Hours', detailed_df.get('Billable', pd.Series([0]))).fillna(0) > 0)
                ].copy()

                if not billable_df.empty:
                    hours_col = None
                    for col in ['Hours', 'Billable', 'tmhrsbill']:
                        if col in billable_df.columns:
                            hours_col = col
                            break

                    if hours_col:
                        # Get this week's staff/project combos
                        staff_project_hours = billable_df.groupby(['Staff', 'Client', 'Project'])[hours_col].sum().reset_index()
                        staff_project_hours.rename(columns={hours_col: 'Hours_Used'}, inplace=True)

                        this_week_combos = set()
                        for _, row in staff_project_hours.iterrows():
                            this_week_combos.add((str(row['Staff']).strip(), row['Project']))

                        # Get all-time hours
                        all_time_start = date(2020, 1, 1)
                        all_time_df = get_bigtime_report(284796, all_time_start, week_ending)

                        if all_time_df is not None and not all_time_df.empty:
                            # Apply column mapping
                            for standard_name, possible_names in {
                                'Staff': ['Staff Member', 'tmstaffnm', 'Staff'],
                                'Client': ['Client', 'tmclientnm'],
                                'Project': ['Project', 'tmprojectnm'],
                                'Hours': ['Billable', 'tmhrsbill', 'Hours'],
                                'Project_ID': ['tmprojectnm_id', 'Project_ID', 'ProjectID', 'tmprojectsid']
                            }.items():
                                for possible in possible_names:
                                    if possible in all_time_df.columns and standard_name not in all_time_df.columns:
                                        all_time_df.rename(columns={possible: standard_name}, inplace=True)
                                        break

                            all_time_billable = all_time_df[
                                (~all_time_df['Client'].str.contains('Internal', case=False, na=False))
                            ].copy()

                            if not all_time_billable.empty and 'Hours' in all_time_billable.columns:
                                all_time_billable['Hours'] = pd.to_numeric(all_time_billable['Hours'], errors='coerce')

                                lifetime_hours = all_time_billable.groupby(['Staff', 'Client', 'Project']).agg({
                                    'Hours': 'sum',
                                    'Project_ID': 'first'
                                }).reset_index() if 'Project_ID' in all_time_billable.columns else all_time_billable.groupby(['Staff', 'Client', 'Project'])['Hours'].sum().reset_index()

                                lifetime_hours.rename(columns={'Hours': 'Lifetime_Hours_Used'}, inplace=True)

                                # Build assigned hours lookup
                                def normalize_project_id(pid):
                                    if pd.isna(pid) or pid == '' or pid is None:
                                        return ''
                                    pid_str = str(pid)
                                    if pid_str.endswith('.0'):
                                        pid_str = pid_str[:-2]
                                    if '.' in pid_str:
                                        pid_str = pid_str.split('.')[0]
                                    return pid_str.strip()

                                assigned_lookup = {}

                                staff_col = None
                                for col in ['Staff', 'Staff Member', 'Staff_Name']:
                                    if col in assignments_df.columns:
                                        staff_col = col
                                        break

                                proj_id_col = None
                                for col in ['Project_ID', 'Project ID', 'ProjectID']:
                                    if col in assignments_df.columns:
                                        proj_id_col = col
                                        break

                                total_col = None
                                for col in ['Total', 'total', 'TOTAL']:
                                    if col in assignments_df.columns:
                                        total_col = col
                                        break

                                if staff_col and proj_id_col and total_col:
                                    assignments_df[total_col] = pd.to_numeric(assignments_df[total_col], errors='coerce').fillna(0)

                                    for _, row in assignments_df.iterrows():
                                        staff = str(row.get(staff_col, '')).strip()
                                        project_id = normalize_project_id(row.get(proj_id_col, ''))
                                        total_assigned = row.get(total_col, 0)

                                        if staff and project_id:
                                            key = (staff, project_id)
                                            if key in assigned_lookup:
                                                assigned_lookup[key] += total_assigned
                                            else:
                                                assigned_lookup[key] = total_assigned

                                    # Check for overruns
                                    for _, row in lifetime_hours.iterrows():
                                        staff = str(row['Staff']).strip()
                                        client = row['Client']
                                        project = row['Project']

                                        if (staff, project) not in this_week_combos:
                                            continue

                                        project_id = normalize_project_id(row.get('Project_ID', '')) if 'Project_ID' in row else ''
                                        hours_used = row['Lifetime_Hours_Used']
                                        assigned = assigned_lookup.get((staff, project_id), 0)

                                        if hours_used > 0:
                                            if assigned == 0:
                                                issues['project_overruns'].append({
                                                    'Staff': staff,
                                                    'Client': client,
                                                    'Project': project,
                                                    'Project_ID': project_id,
                                                    'Hours_Used': round(hours_used, 1),
                                                    'Hours_Assigned': 0,
                                                    'Percentage': None,
                                                    'Issue': 'No hours assigned'
                                                })
                                            elif (hours_used / assigned) >= 0.90:
                                                pct = round((hours_used / assigned) * 100, 0)
                                                issues['project_overruns'].append({
                                                    'Staff': staff,
                                                    'Client': client,
                                                    'Project': project,
                                                    'Project_ID': project_id,
                                                    'Hours_Used': round(hours_used, 1),
                                                    'Hours_Assigned': round(assigned, 1),
                                                    'Percentage': pct,
                                                    'Issue': f'{int(pct)}% of assigned hours used'
                                                })
    except Exception as e:
        print(f"Warning: Could not check project overruns: {e}")

    print(f"Analysis complete. Found issues: zero_hours={len(issues['zero_hours'])}, not_submitted={len(issues['not_submitted'])}, under_40={len(issues['under_40'])}, non_billable={len(issues['non_billable_client_work'])}, overruns={len(issues['project_overruns'])}")

    return {
        'week_ending': week_ending,
        'week_starting': week_starting,
        'issues': issues,
        'total_issues': (
            len(issues['zero_hours']) +
            len(issues['not_submitted']) +
            len(issues['under_40']) +
            len(issues['non_billable_client_work']) +
            len(issues['project_overruns'])
        )
    }


def generate_report_text(rd):
    """Generate plain text report"""
    issues = rd['issues']

    report_text = f"""HOURS REVIEWER REPORT
Week Ending {rd['week_ending'].strftime('%A, %B %d, %Y')}
Period: {rd['week_starting'].strftime('%B %d')} - {rd['week_ending'].strftime('%B %d, %Y')}

Total Issues Found: {rd['total_issues']}

1. ZERO HOURS REPORTED ({len(issues['zero_hours'])})
"""
    if issues['zero_hours']:
        for name in issues['zero_hours']:
            report_text += f"   - {name}\n"
    else:
        report_text += "   None\n"

    report_text += f"\n2. UNSUBMITTED OR REJECTED TIMESHEETS ({len(issues['not_submitted'])})\n"
    if issues['not_submitted']:
        for name in issues['not_submitted']:
            report_text += f"   - {name}\n"
    else:
        report_text += "   None\n"

    report_text += f"\n3. EMPLOYEES UNDER 40 HOURS ({len(issues['under_40'])})\n"
    if issues['under_40']:
        for name, hours in sorted(issues['under_40'], key=lambda x: x[1]):
            report_text += f"   - {name}: {hours} hours\n"
    else:
        report_text += "   None\n"

    report_text += f"\n4. NON-BILLABLE CLIENT WORK ({len(issues['non_billable_client_work'])})\n"
    if issues['non_billable_client_work']:
        for issue in issues['non_billable_client_work']:
            report_text += f"   - {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Hours']} hours\n"
    else:
        report_text += "   None\n"

    report_text += f"\n5. POTENTIAL PROJECT OVERRUNS ({len(issues['project_overruns'])})\n"
    if issues['project_overruns']:
        for issue in sorted(issues['project_overruns'], key=lambda x: (x['Staff'], x['Client'])):
            if issue['Hours_Assigned'] == 0:
                report_text += f"   - {issue['Staff']} - {issue['Client']} - {issue['Project']} - {issue['Hours_Used']} hours used, 0 hours assigned\n"
            else:
                report_text += f"   - {issue['Staff']} - {issue['Client']} - {issue['Project']} - {issue['Hours_Used']} hours out of {issue['Hours_Assigned']} assigned ({int(issue['Percentage'])}%)\n"
    else:
        report_text += "   None\n"

    report_text += f"\n---\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"

    return report_text


def generate_excel(rd):
    """Generate Excel file"""
    issues = rd['issues']
    output = BytesIO()

    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Summary sheet
        summary_data = {
            'Category': [
                'Zero Hours',
                'Not Submitted',
                'Under 40 Hours',
                'Non-Billable Client Work',
                'Potential Project Overruns'
            ],
            'Count': [
                len(issues['zero_hours']),
                len(issues['not_submitted']),
                len(issues['under_40']),
                len(issues['non_billable_client_work']),
                len(issues['project_overruns'])
            ]
        }
        pd.DataFrame(summary_data).to_excel(writer, sheet_name='Summary', index=False)

        # Individual sheets
        if issues['zero_hours']:
            pd.DataFrame({'Staff': issues['zero_hours']}).to_excel(writer, sheet_name='Zero_Hours', index=False)

        if issues['not_submitted']:
            pd.DataFrame({'Staff': issues['not_submitted']}).to_excel(writer, sheet_name='Not_Submitted', index=False)

        if issues['under_40']:
            pd.DataFrame(issues['under_40'], columns=['Staff', 'Hours']).to_excel(writer, sheet_name='Under_40_Hours', index=False)

        if issues['non_billable_client_work']:
            pd.DataFrame(issues['non_billable_client_work']).to_excel(writer, sheet_name='Non_Billable', index=False)

        if issues['project_overruns']:
            pd.DataFrame(issues['project_overruns']).to_excel(writer, sheet_name='Project_Overruns', index=False)

    return output.getvalue()


def send_email(rd, report_text, excel_data):
    """Send the report via email using Gmail API"""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account

    service_account_info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)

    creds = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=['https://www.googleapis.com/auth/gmail.send'],
        subject=EMAIL_FROM
    )

    gmail = build('gmail', 'v1', credentials=creds)

    msg = MIMEMultipart()
    msg['From'] = EMAIL_FROM
    msg['To'] = EMAIL_TO
    msg['Subject'] = f"Time Review Report - Week Ending {rd['week_ending'].strftime('%b %d, %Y')}"

    body = f"""Hours Reviewer Report

Week Ending: {rd['week_ending'].strftime('%A, %B %d, %Y')}
Period: {rd['week_starting'].strftime('%B %d')} - {rd['week_ending'].strftime('%B %d, %Y')}

Total Issues Found: {rd['total_issues']}

Summary:
- Zero Hours: {len(rd['issues']['zero_hours'])}
- Not Submitted: {len(rd['issues']['not_submitted'])}
- Under 40 Hours: {len(rd['issues']['under_40'])}
- Non-Billable Client Work: {len(rd['issues']['non_billable_client_work'])}
- Potential Project Overruns: {len(rd['issues']['project_overruns'])}

See attached files for full details.

Best regards,
Voyage Advisory
"""

    msg.attach(MIMEText(body, 'plain'))

    # Attach text report
    txt_part = MIMEBase('text', 'plain')
    txt_part.set_payload(report_text.encode('utf-8'))
    encoders.encode_base64(txt_part)
    txt_filename = f"time_review_{rd['week_ending'].strftime('%Y%m%d')}.txt"
    txt_part.add_header('Content-Disposition', f'attachment; filename={txt_filename}')
    msg.attach(txt_part)

    # Attach Excel
    if excel_data:
        xlsx_part = MIMEBase('application', 'octet-stream')
        xlsx_part.set_payload(excel_data)
        encoders.encode_base64(xlsx_part)
        xlsx_filename = f"time_review_{rd['week_ending'].strftime('%Y%m%d')}.xlsx"
        xlsx_part.add_header('Content-Disposition', f'attachment; filename={xlsx_filename}')
        msg.attach(xlsx_part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
    result = gmail.users().messages().send(userId='me', body={'raw': raw}).execute()

    return result


def main():
    """Main function to generate and send the report"""
    print(f"Starting Time Review Report - {datetime.now()}")

    # Validate environment variables
    if not BIGTIME_API_KEY:
        print("ERROR: BIGTIME_API_KEY not set")
        sys.exit(1)

    if not BIGTIME_FIRM_ID:
        print("ERROR: BIGTIME_FIRM_ID not set")
        sys.exit(1)

    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        print("ERROR: GOOGLE_SERVICE_ACCOUNT_KEY not set")
        sys.exit(1)

    if not SHEET_CONFIG_ID:
        print("ERROR: SHEET_CONFIG_ID not set")
        sys.exit(1)

    try:
        # Generate report
        rd = generate_report()
        print(f"Report generated: {rd['total_issues']} total issues found")

        # Generate text report
        report_text = generate_report_text(rd)
        print("Text report generated")

        # Generate Excel
        excel_data = generate_excel(rd)
        print("Excel file generated")

        # Send email
        result = send_email(rd, report_text, excel_data)
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
