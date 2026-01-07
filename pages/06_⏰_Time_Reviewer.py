"""
Time Reviewer App
Reviews timesheets for completeness and quality
"""

import streamlit as st
import pandas as pd
import sys
from datetime import datetime, timedelta
import requests
from io import BytesIO

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')

import sheets

st.set_page_config(page_title="Time Reviewer", page_icon="⏰", layout="wide")

st.title("⏰ Time Reviewer")
st.markdown("Review timesheets for completeness and quality")

# ============================================
# HELPER FUNCTIONS
# ============================================

def get_bigtime_report(report_id, start_date, end_date):
    """Fetch data from BigTime report API"""
    try:
        api_key = st.secrets["BIGTIME_API_KEY"]
        firm_id = st.secrets["BIGTIME_FIRM_ID"]
    except Exception as e:
        st.error(f"Missing BigTime credentials: {str(e)}")
        return None
    
    url = f"https://iq.bigtime.net/BigtimeData/api/v2/report/data/{report_id}"
    
    headers = {
        "X-Auth-ApiToken": api_key,
        "X-Auth-Realm": firm_id,
        "Accept": "application/json"
    }
    
    payload = {
        "DT_BEGIN": start_date.strftime("%Y-%m-%d"),
        "DT_END": end_date.strftime("%Y-%m-%d")
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
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
            st.error(f"BigTime API Error {response.status_code}")
            return None
    except Exception as e:
        st.error(f"BigTime API Exception: {str(e)}")
        return None


def check_note_quality_with_ai(note_text, client_name='', max_retries=2):
    """
    Use AI to check if billing note meets Voyage quality standards
    Tries Gemini first, then Claude as fallback
    Returns: (is_poor_quality: bool, reason: str)
    """
    if not note_text or len(note_text.strip()) < 10:
        return True, "Note too short (less than 10 characters)"
    
    # Create detailed prompt based on Voyage guidelines
    prompt = f"""You are reviewing a billing note for Voyage Advisory, a consulting firm.

VOYAGE BILLING NOTE GUIDELINES:
- Use clear, specific, and action-oriented language
- Avoid vague words: ensure, comprehensive, align, alignment, strategy, key priorities
- Prefer specific alternatives: requirements, plan, quantify, accuracy, verify, collaborate
- Limit to 1-2 sentences (except PayIt client)
- Emphasize value of work, not just activity
- Use client-friendly wording (no internal jargon or acronyms)
- Similar to what a top-tier law firm would write

BILLING NOTE TO REVIEW:
Client: {client_name}
Note: "{note_text}"

EVALUATE: Does this note meet Voyage's professional standards?

Respond with ONLY one of these formats:
- "ACCEPTABLE" (if note meets standards)
- "POOR - [specific issue]" (if note fails)

Common issues to flag:
- Too vague (e.g., "worked on stuff", "meeting", "research")
- Uses discouraged words (ensure, comprehensive, align, strategy)
- Too short/no context
- Unprofessional tone
- Internal jargon
- Multiple sentences when not needed

Examples of POOR notes:
- "worked on stuff" → POOR - Too vague, no context
- "ensured alignment with key priorities" → POOR - Uses vague/discouraged words
- "meeting" → POOR - Too short, no context
- "research" → POOR - Too vague

Examples of ACCEPTABLE notes:
- "Reviewed contract terms and drafted redline comments for client review."
- "Analyzed requirements and prepared project plan for stakeholder meeting."
- "Collaborated with team to verify accuracy of financial model."

YOUR EVALUATION:"""
    
    # Try Gemini first
    try:
        gemini_key = st.secrets.get("GEMINI_API_KEY")
        if gemini_key:
            url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={gemini_key}'
            
            payload = {
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 100}
            }
            
            response = requests.post(url, json=payload, timeout=15)
            if response.status_code == 200:
                data = response.json()
                result = data['candidates'][0]['content']['parts'][0]['text'].strip()
                
                if result.startswith('POOR'):
                    reason = result.replace('POOR - ', '').replace('POOR-', '').strip()
                    return True, f"(Gemini) {reason}"
                elif 'ACCEPTABLE' in result:
                    return False, ""
    except Exception as e:
        # Gemini failed, continue to Claude
        pass
    
    # Try Claude as fallback
    try:
        claude_key = st.secrets.get("CLAUDE_API_KEY")
        if claude_key:
            url = 'https://api.anthropic.com/v1/messages'
            
            payload = {
                'model': 'claude-sonnet-4-20250514',
                'max_tokens': 100,
                'messages': [{
                    'role': 'user',
                    'content': prompt
                }]
            }
            
            headers = {
                'x-api-key': claude_key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            if response.status_code == 200:
                data = response.json()
                result = data['content'][0]['text'].strip()
                
                if result.startswith('POOR'):
                    reason = result.replace('POOR - ', '').replace('POOR-', '').strip()
                    return True, f"(Claude) {reason}"
                elif 'ACCEPTABLE' in result:
                    return False, ""
    except Exception as e:
        # Claude failed too, fall back to heuristics
        pass
    
    # Fallback to rule-based heuristics if both AI calls fail
    note_lower = note_text.lower().strip()
    
    # Check for very short notes
    if len(note_text) < 20:
        return True, "Note too short"
    
    # Check for single words or very brief
    if len(note_text.split()) <= 3:
        return True, "Note too brief (3 words or less)"
    
    # Check for vague/discouraged words from guidelines
    discouraged_words = [
        'ensure', 'ensured', 'ensuring',
        'comprehensive', 'comprehensively',
        'align', 'aligned', 'alignment',
        'strategy', 'strategic',
        'key priorities'
    ]
    for word in discouraged_words:
        if word in note_lower:
            return True, f"Uses discouraged word: '{word}'"
    
    # Check for common vague patterns
    vague_patterns = [
        'worked on', 'stuff', 'things', 'misc', 'various',
        'lol', 'haha', 'meeting' if len(note_text.split()) <= 5 else '',
        'research' if len(note_text.split()) <= 5 else ''
    ]
    for pattern in vague_patterns:
        if pattern and pattern in note_lower:
            return True, f"Too vague: contains '{pattern}'"
    
    # Check for missing periods (professional notes should end with period)
    if not note_text.strip().endswith('.'):
        return True, "Missing period at end"
    
    return False, ""


# ============================================
# MAIN UI
# ============================================

# Date selector - centered at top of page
st.markdown("---")

def snap_to_friday(selected_date):
    """Snap a date to the nearest Friday"""
    weekday = selected_date.weekday()
    if weekday == 4:  # Already Friday
        return selected_date
    elif weekday < 4:  # Mon-Thu: go forward to Friday
        days_until_friday = 4 - weekday
        return selected_date + timedelta(days=days_until_friday)
    else:  # Sat-Sun: go back to previous Friday
        days_since_friday = weekday - 4
        return selected_date - timedelta(days=days_since_friday)

# Center the date selection
col_left, col_center, col_right = st.columns([1, 2, 1])

with col_center:
    # Default to most recent Friday
    today = datetime.now().date()
    default_friday = snap_to_friday(today)
    if default_friday > today:
        default_friday = default_friday - timedelta(days=7)
    
    selected_date = st.date_input(
        "📅 Select a date (will snap to nearest Friday)",
        value=default_friday,
        help="Pick any date - it will automatically adjust to the nearest Friday"
    )
    
    week_ending = snap_to_friday(selected_date)
    week_starting = week_ending - timedelta(days=6)
    
    if selected_date != week_ending:
        st.caption(f"📌 Adjusted to Friday: **{week_ending.strftime('%B %d, %Y')}**")
    
    st.caption(f"**Report Period:** {week_starting.strftime('%A, %B %d, %Y')} through {week_ending.strftime('%A, %B %d, %Y')}")
    
    # AI review checkbox
    review_notes_with_ai = st.checkbox(
        "🤖 Have AI review billing notes (takes a few minutes)",
        value=False,
        help="Uses Gemini/Claude AI to check if billing notes meet Voyage professional standards"
    )
    
    run_review = st.button("🔍 Review Timesheets", type="primary", use_container_width=True)

st.markdown("---")

if run_review:
    
    # ============================================================
    # PHASE 1: LOAD CONFIGURATION
    # ============================================================
    
    with st.spinner("📋 Loading employee list..."):
        try:
            config_sheet_id = st.secrets["SHEET_CONFIG_ID"]
            staff_df = sheets.read_config(config_sheet_id, "Staff")
            
            if staff_df is None:
                st.error("❌ Could not load Staff configuration")
                st.stop()
            
            # Get list of full-time employees
            employees = set(staff_df['Staff_Name'].tolist())
            st.success(f"✅ Loaded {len(employees)} employees from config")
            
        except Exception as e:
            st.error(f"❌ Error loading config: {str(e)}")
            st.stop()
    
    # ============================================================
    # PHASE 2: FETCH BIGTIME REPORTS
    # ============================================================
    
    issues = {
        'zero_hours': [],
        'not_submitted': [],
        'under_40': [],
        'non_billable_client_work': [],
        'poor_notes': [],
        'project_overruns': []
    }
    
    with st.spinner("📡 Fetching timesheet data from BigTime..."):
        
        # Report 1: Zero Hours (288578)
        zero_hours_df = get_bigtime_report(288578, week_starting, week_ending)
        
        # Report 2: Unsubmitted Status (284828)
        unsubmitted_df = get_bigtime_report(284828, week_starting, week_ending)
        
        # Report 3: Detailed Time Report (284796)
        detailed_df = get_bigtime_report(284796, week_starting, week_ending)
        
        if zero_hours_df is None or unsubmitted_df is None or detailed_df is None:
            st.error("❌ Failed to fetch BigTime reports")
            st.stop()
        
        st.success(f"✅ Fetched reports: {len(zero_hours_df)} zero-hour entries, {len(unsubmitted_df)} unsubmitted, {len(detailed_df)} time entries")
    
    # ============================================================
    # PHASE 3: ANALYZE ZERO HOURS
    # ============================================================
    
    with st.spinner("🔍 Checking for zero hours..."):
        if not zero_hours_df.empty:
            # Find staff name column
            staff_col = None
            for col in ['Staff', 'Staff Member', 'tmstaffnm', 'Name']:
                if col in zero_hours_df.columns:
                    staff_col = col
                    break
            
            if staff_col:
                issues['zero_hours'] = sorted(zero_hours_df[staff_col].unique().tolist())
    
    # ============================================================
    # PHASE 4: ANALYZE UNSUBMITTED TIMESHEETS
    # ============================================================
    
    with st.spinner("🔍 Checking for unsubmitted timesheets..."):
        if not unsubmitted_df.empty:
            # Find staff name column
            staff_col = None
            for col in ['Staff', 'Staff Member', 'tmstaffnm', 'Name']:
                if col in unsubmitted_df.columns:
                    staff_col = col
                    break
            
            if staff_col:
                issues['not_submitted'] = sorted(unsubmitted_df[staff_col].unique().tolist())
    
    # ============================================================
    # PHASE 5: ANALYZE DETAILED TIME ENTRIES
    # ============================================================
    
    with st.spinner("🔍 Analyzing time entries..."):
        if not detailed_df.empty:
            # Map column names
            col_mapping = {}
            for standard_name, possible_names in {
                'Staff': ['Staff Member', 'tmstaffnm'],
                'Client': ['Client', 'tmclientnm'],
                'Project': ['Project', 'tmprojectnm'],
                'Hours': ['Billable', 'tmhrsbill', 'Hours'],
                'Billable': ['Billable ($)', 'tmchgbillbase'],
                'Date': ['Date', 'tmdt'],
                'Notes': ['Notes', 'tmnotes']
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
            
            # Check 1: Under 40 hours (employees only)
            if 'Staff' in detailed_df.columns and 'Hours' in detailed_df.columns:
                hours_by_staff = detailed_df.groupby('Staff')['Hours'].sum()
                
                for staff_name, total_hours in hours_by_staff.items():
                    if staff_name in employees and total_hours < 40:
                        issues['under_40'].append((staff_name, round(total_hours, 1)))
            
            # Check 2: Non-billable client work
            if all(col in detailed_df.columns for col in ['Staff', 'Client', 'Project', 'Hours', 'Billable', 'Date']):
                # Filter for non-Internal clients
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
    
    # ============================================================
    # PHASE 5B: CHECK PROJECT OVERRUNS
    # ============================================================
    
    with st.spinner("🔍 Checking for potential project overruns..."):
        try:
            # Load Assignments data
            assignments_df = sheets.read_config(config_sheet_id, "Assignments")
            
            if assignments_df is not None and not assignments_df.empty:
                # Get all billable hours from BigTime by staff/project
                # Filter out Internal clients
                if not detailed_df.empty and 'Client' in detailed_df.columns:
                    billable_df = detailed_df[
                        (~detailed_df['Client'].str.contains('Internal', case=False, na=False)) &
                        (detailed_df.get('Hours', detailed_df.get('Billable', pd.Series([0]))).fillna(0) > 0)
                    ].copy()
                    
                    if not billable_df.empty:
                        # Get column for hours - try different possible names
                        hours_col = None
                        for col in ['Hours', 'Billable', 'tmhrsbill']:
                            if col in billable_df.columns:
                                hours_col = col
                                break
                        
                        # Get column for project ID
                        project_id_col = None
                        for col in ['Project_ID', 'ProjectID', 'tmprojectsid', 'Project ID']:
                            if col in billable_df.columns:
                                project_id_col = col
                                break
                        
                        if hours_col:
                            # Aggregate total hours by Staff + Project
                            agg_cols = ['Staff', 'Client', 'Project']
                            if project_id_col:
                                agg_cols.append(project_id_col)
                            
                            # Group by staff and project to get total hours used
                            staff_project_hours = billable_df.groupby(agg_cols)[hours_col].sum().reset_index()
                            staff_project_hours.rename(columns={hours_col: 'Hours_Used'}, inplace=True)
                            
                            # Now get ALL-TIME hours from BigTime for these staff/project combos
                            # We need to fetch a broader date range to get lifetime hours
                            from datetime import date
                            all_time_start = date(2020, 1, 1)  # Far enough back
                            all_time_end = week_ending
                            
                            all_time_df = get_bigtime_report(284796, all_time_start, all_time_end)
                            
                            if all_time_df is not None and not all_time_df.empty:
                                # Apply same column mapping
                                for standard_name, possible_names in {
                                    'Staff': ['Staff Member', 'tmstaffnm'],
                                    'Client': ['Client', 'tmclientnm'],
                                    'Project': ['Project', 'tmprojectnm'],
                                    'Hours': ['Billable', 'tmhrsbill', 'Hours'],
                                    'Project_ID': ['Project_ID', 'ProjectID', 'tmprojectsid', 'Project ID']
                                }.items():
                                    for possible in possible_names:
                                        if possible in all_time_df.columns and standard_name not in all_time_df.columns:
                                            all_time_df.rename(columns={possible: standard_name}, inplace=True)
                                            break
                                
                                # Filter to billable (non-Internal) only
                                all_time_billable = all_time_df[
                                    (~all_time_df['Client'].str.contains('Internal', case=False, na=False))
                                ].copy()
                                
                                if not all_time_billable.empty and 'Hours' in all_time_billable.columns:
                                    # Aggregate all-time hours by Staff + Project
                                    lifetime_hours = all_time_billable.groupby(['Staff', 'Client', 'Project']).agg({
                                        'Hours': 'sum',
                                        'Project_ID': 'first'
                                    }).reset_index() if 'Project_ID' in all_time_billable.columns else all_time_billable.groupby(['Staff', 'Client', 'Project'])['Hours'].sum().reset_index()
                                    
                                    lifetime_hours.rename(columns={'Hours': 'Lifetime_Hours_Used'}, inplace=True)
                                    
                                    # Get assigned hours from Assignments
                                    # Assignments has columns: Client, Project Name, Project ID, Staff Member, Bill Rate, Project Status, Total, ...
                                    # Use the Total column for assigned hours
                                    
                                    # Create lookup for assigned hours using Total column
                                    assigned_lookup = {}
                                    
                                    # Find the staff column name
                                    staff_col = None
                                    for col in ['Staff', 'Staff Member', 'Staff_Name']:
                                        if col in assignments_df.columns:
                                            staff_col = col
                                            break
                                    
                                    # Find the project ID column name
                                    proj_id_col = None
                                    for col in ['Project_ID', 'Project ID', 'ProjectID']:
                                        if col in assignments_df.columns:
                                            proj_id_col = col
                                            break
                                    
                                    # Find the total column
                                    total_col = None
                                    for col in ['Total', 'total', 'TOTAL']:
                                        if col in assignments_df.columns:
                                            total_col = col
                                            break
                                    
                                    if staff_col and proj_id_col and total_col:
                                        # Convert Total to numeric
                                        assignments_df[total_col] = pd.to_numeric(assignments_df[total_col], errors='coerce').fillna(0)
                                        
                                        for _, row in assignments_df.iterrows():
                                            staff = row.get(staff_col, '')
                                            project_id = str(row.get(proj_id_col, ''))
                                            total_assigned = row.get(total_col, 0)
                                            
                                            if staff and project_id:
                                                key = (staff, project_id)
                                                if key in assigned_lookup:
                                                    assigned_lookup[key] += total_assigned
                                                else:
                                                    assigned_lookup[key] = total_assigned
                                        
                                        # Build set of staff/project combos that had activity THIS WEEK
                                        this_week_combos = set()
                                        for _, row in staff_project_hours.iterrows():
                                            staff = row['Staff']
                                            project = row['Project']
                                            this_week_combos.add((staff, project))
                                        
                                        # Check ONLY staff/project combos that had activity this week
                                        for _, row in lifetime_hours.iterrows():
                                            staff = row['Staff']
                                            client = row['Client']
                                            project = row['Project']
                                            
                                            # Skip if this combo didn't have activity this week
                                            if (staff, project) not in this_week_combos:
                                                continue
                                            
                                            project_id = str(row.get('Project_ID', '')) if 'Project_ID' in row else ''
                                            hours_used = row['Lifetime_Hours_Used']
                                            
                                            # Look up assigned hours
                                            assigned = assigned_lookup.get((staff, project_id), 0)
                                            
                                            # Check conditions:
                                            # (a) No hours assigned (and has used hours)
                                            # (b) Used more than 90% of assigned hours
                                            
                                            if hours_used > 0:
                                                if assigned == 0:
                                                    # No hours assigned
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
                                                    # Over 90% used
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
                
                st.success(f"✅ Checked {len(issues['project_overruns'])} potential project overruns")
            
        except Exception as e:
            st.warning(f"⚠️ Could not check project overruns: {str(e)}")
    
    # ============================================================
    # PHASE 5C: AI NOTE REVIEW (OPTIONAL)
    # ============================================================
    
    if review_notes_with_ai:
        with st.spinner("🤖 AI reviewing billing notes (this takes a few minutes)..."):
            if not detailed_df.empty:
                if all(col in detailed_df.columns for col in ['Staff', 'Client', 'Project', 'Notes', 'Hours', 'Billable', 'Date']):
                    billable_entries = detailed_df[
                        (detailed_df['Billable'].fillna(0) > 0) &
                        (detailed_df['Hours'] > 0)
                    ]
                    
                    # Check all billable entries
                    progress_text = st.empty()
                    for idx, (_, row) in enumerate(billable_entries.iterrows()):
                        if idx % 5 == 0:  # Update progress every 5 entries
                            progress_text.text(f"Reviewing note {idx + 1} of {len(billable_entries)}...")
                        
                        note = row.get('Notes', '')
                        client = row.get('Client', '')
                        is_poor, reason = check_note_quality_with_ai(note, client)
                        
                        if is_poor:
                            issues['poor_notes'].append({
                                'Staff': row.get('Staff', ''),
                                'Client': client,
                                'Project': row.get('Project', ''),
                                'Date': row.get('Date', ''),
                                'Hours': round(row.get('Hours', 0), 1),
                                'Note': note,
                                'Reason': reason
                            })
                    
                    progress_text.empty()
                    st.success(f"✅ AI reviewed {len(billable_entries)} billing notes, found {len(issues['poor_notes'])} issues")
    
    # ============================================================
    # PHASE 6: GENERATE REPORT
    # ============================================================
    
    st.success("✅ Analysis complete!")
    
    st.header(f"📊 Hours Reviewer Report")
    st.subheader(f"Week Ending {week_ending.strftime('%A, %B %d, %Y')}")
    st.caption(f"Period: {week_starting.strftime('%b %d')} - {week_ending.strftime('%b %d, %Y')}")
    
    # Summary metrics
    total_issues = (
        len(issues['zero_hours']) +
        len(issues['not_submitted']) +
        len(issues['under_40']) +
        len(issues['non_billable_client_work']) +
        len(issues['poor_notes'])
    )
    
    if total_issues == 0:
        st.success("🎉 No issues found! All timesheets look good.")
    else:
        st.warning(f"⚠️ Found {total_issues} total issues")
    
    # Issue sections
    st.divider()
    
    # 1. Zero Hours
    with st.expander(f"❌ Zero Hours Reported ({len(issues['zero_hours'])})", expanded=len(issues['zero_hours']) > 0):
        if issues['zero_hours']:
            st.write("The following people have zero hours reported:")
            for name in issues['zero_hours']:
                st.write(f"- {name}")
        else:
            st.success("✅ Everyone has reported hours")
    
    # 2. Not Submitted
    with st.expander(f"⏳ Unsubmitted or Rejected Timesheets ({len(issues['not_submitted'])})", expanded=len(issues['not_submitted']) > 0):
        if issues['not_submitted']:
            st.write("The following people have not submitted their timesheets or have rejected timesheets:")
            for name in issues['not_submitted']:
                st.write(f"- {name}")
        else:
            st.success("✅ All timesheets submitted")
    
    # 3. Under 40 Hours
    with st.expander(f"⚠️ Employees Under 40 Hours ({len(issues['under_40'])})", expanded=len(issues['under_40']) > 0):
        if issues['under_40']:
            st.write("The following people are employees who submitted less than 40 hours:")
            for name, hours in sorted(issues['under_40'], key=lambda x: x[1]):
                st.write(f"- {name}: {hours} hours")
        else:
            st.success("✅ All employees reported 40+ hours")
    
    # 4. Non-Billable Client Work
    with st.expander(f"💼 Non-Billable Client Work ({len(issues['non_billable_client_work'])})", expanded=len(issues['non_billable_client_work']) > 0):
        if issues['non_billable_client_work']:
            st.write("The following people performed work for a client that does not appear to be billable:")
            for issue in issues['non_billable_client_work']:
                st.write(f"- {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Hours']} hours")
        else:
            st.success("✅ All client work is billable")
    
    # 5. Potential Project Overruns
    with st.expander(f"🚨 Potential Project Overruns ({len(issues['project_overruns'])})", expanded=len(issues['project_overruns']) > 0):
        if issues['project_overruns']:
            st.write("The following staff/project combinations have used 90%+ of assigned hours or have no hours assigned:")
            for issue in sorted(issues['project_overruns'], key=lambda x: (x['Staff'], x['Client'])):
                if issue['Hours_Assigned'] == 0:
                    st.write(f"- **{issue['Staff']}** - {issue['Client']} - {issue['Project']} - {issue['Project_ID']} - {issue['Hours_Used']} hours used, 0 hours assigned")
                else:
                    st.write(f"- **{issue['Staff']}** - {issue['Client']} - {issue['Project']} - {issue['Project_ID']} - {issue['Hours_Used']} hours out of {issue['Hours_Assigned']} assigned used ({int(issue['Percentage'])}%)")
        else:
            st.success("✅ No potential project overruns detected")
    
    # 6. Poor Quality Notes (only if AI review was enabled)
    if review_notes_with_ai:
        with st.expander(f"📝 Poor Quality Notes ({len(issues['poor_notes'])})", expanded=len(issues['poor_notes']) > 0):
            if issues['poor_notes']:
                st.write("The following billable notes do not appear to meet Voyage guidelines:")
                for issue in issues['poor_notes']:
                    st.write(f"**{issue['Staff']}** - {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Hours']} hours")
                    st.write(f"  - Note: \"{issue['Note']}\"")
                    st.write(f"  - Issue: {issue['Reason']}")
                    st.write("")
            else:
                st.success("✅ All notes meet quality standards")
    else:
        st.info("💡 AI note review was not enabled. Check the box above and re-run to review billing notes.")
    
    # ============================================================
    # PHASE 7: EXPORT OPTIONS
    # ============================================================
    
    # Store report data for export
    st.session_state.time_review_data = {
        'week_ending': week_ending,
        'week_starting': week_starting,
        'issues': issues,
        'total_issues': total_issues
    }
    
    st.divider()
    st.subheader("📥 Export Report")
    
    # Create report text
    report_text = f"""HOURS REVIEWER REPORT
Week Ending {week_ending.strftime('%A, %B %d, %Y')}
Period: {week_starting.strftime('%B %d')} - {week_ending.strftime('%B %d, %Y')}

Total Issues Found: {total_issues}

1. ZERO HOURS REPORTED ({len(issues['zero_hours'])})
"""
    if issues['zero_hours']:
        for name in issues['zero_hours']:
            report_text += f"   - {name}\n"
    else:
        report_text += "   ✓ None\n"
    
    report_text += f"\n2. UNSUBMITTED OR REJECTED TIMESHEETS ({len(issues['not_submitted'])})\n"
    if issues['not_submitted']:
        for name in issues['not_submitted']:
            report_text += f"   - {name}\n"
    else:
        report_text += "   ✓ None\n"
    
    report_text += f"\n3. EMPLOYEES UNDER 40 HOURS ({len(issues['under_40'])})\n"
    if issues['under_40']:
        for name, hours in sorted(issues['under_40'], key=lambda x: x[1]):
            report_text += f"   - {name}: {hours} hours\n"
    else:
        report_text += "   ✓ None\n"
    
    report_text += f"\n4. NON-BILLABLE CLIENT WORK ({len(issues['non_billable_client_work'])})\n"
    if issues['non_billable_client_work']:
        for issue in issues['non_billable_client_work']:
            report_text += f"   - {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Hours']} hours\n"
    else:
        report_text += "   ✓ None\n"
    
    report_text += f"\n5. POOR QUALITY NOTES ({len(issues['poor_notes'])})\n"
    if issues['poor_notes']:
        for issue in issues['poor_notes']:
            report_text += f"   - {issue['Staff']}, {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Hours']} hours\n"
            report_text += f"     Note: \"{issue['Note']}\"\n"
            report_text += f"     Issue: {issue['Reason']}\n"
    else:
        report_text += "   ✓ None\n"
    
    report_text += f"\n6. POTENTIAL PROJECT OVERRUNS ({len(issues['project_overruns'])})\n"
    if issues['project_overruns']:
        for issue in sorted(issues['project_overruns'], key=lambda x: (x['Staff'], x['Client'])):
            if issue['Hours_Assigned'] == 0:
                report_text += f"   - {issue['Staff']} - {issue['Client']} - {issue['Project']} - {issue['Project_ID']} - {issue['Hours_Used']} hours used, 0 hours assigned\n"
            else:
                report_text += f"   - {issue['Staff']} - {issue['Client']} - {issue['Project']} - {issue['Project_ID']} - {issue['Hours_Used']} hours out of {issue['Hours_Assigned']} assigned used ({int(issue['Percentage'])}%)\n"
    else:
        report_text += "   ✓ None\n"
    
    report_text += f"\n---\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
    
    # Store for email
    st.session_state.time_review_data['report_text'] = report_text
    
    col1, col2 = st.columns(2)
    
    with col1:
        # Download as text file
        st.download_button(
            label="📥 Download Report (TXT)",
            data=report_text,
            file_name=f"time_review_{week_ending.strftime('%Y%m%d')}.txt",
            mime="text/plain",
            use_container_width=True
        )
    
    with col2:
        # Excel export
        try:
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # Summary sheet
                summary_data = {
                    'Category': [
                        'Zero Hours',
                        'Not Submitted',
                        'Under 40 Hours',
                        'Non-Billable Client Work',
                        'Poor Quality Notes',
                        'Potential Project Overruns'
                    ],
                    'Count': [
                        len(issues['zero_hours']),
                        len(issues['not_submitted']),
                        len(issues['under_40']),
                        len(issues['non_billable_client_work']),
                        len(issues['poor_notes']),
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
                
                if issues['poor_notes']:
                    pd.DataFrame(issues['poor_notes']).to_excel(writer, sheet_name='Poor_Notes', index=False)
                
                if issues['project_overruns']:
                    pd.DataFrame(issues['project_overruns']).to_excel(writer, sheet_name='Project_Overruns', index=False)
            
            excel_data = output.getvalue()
            st.session_state.time_review_data['excel_file'] = excel_data
            
            st.download_button(
                label="📥 Download Report (Excel)",
                data=excel_data,
                file_name=f"time_review_{week_ending.strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
        except Exception as e:
            st.error(f"Excel export error: {str(e)}")
    
    st.info("📧 To email this report, use the 'Email Report' section in the sidebar →")

else:
    st.info("☝️ Select a week ending date above and click 'Review Timesheets'")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app reviews timesheets for quality and completeness:
        
        **Checks performed:**
        1. **Zero Hours** - Staff who reported no time
        2. **Unsubmitted** - Timesheets not yet submitted or rejected
        3. **Under 40 Hours** - Full-time employees with less than 40 hours
        4. **Non-Billable Client Work** - Client work marked as non-billable
        5. **Project Overruns** - Staff/projects with 90%+ hours used or no hours assigned
        6. **Poor Notes** (optional) - Billing notes that don't meet professional standards
        
        **Data Sources:**
        - BigTime Report 284828 (Unsubmitted Status)
        - BigTime Report 284796 (Detailed Time Report)
        - BigTime Report 288578 (Zero Hours Audit)
        - Voyage_Global_Config (Employee list, Assignments)
        
        **AI Note Review (Optional):**
        Check the box to enable AI-powered review of billing notes. Uses Gemini/Claude AI to check if notes meet Voyage professional standards. This takes a few minutes to run.
        """)

# Email functionality
if 'time_review_data' in st.session_state:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📧 Email Report")
    
    email_to = st.sidebar.text_input(
        "Send to:",
        placeholder="email@example.com",
        key="time_review_email"
    )
    
    send_clicked = st.sidebar.button("Send Email", type="primary", use_container_width=True, key="send_time_review")
    
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
                
                rd = st.session_state.time_review_data
                
                creds = service_account.Credentials.from_service_account_info(
                    st.secrets["SERVICE_ACCOUNT_KEY"],
                    scopes=['https://www.googleapis.com/auth/gmail.send'],
                    subject='astudee@voyageadvisory.com'
                )
                
                gmail = build('gmail', 'v1', credentials=creds)
                
                msg = MIMEMultipart()
                msg['From'] = 'astudee@voyageadvisory.com'
                msg['To'] = email_to
                msg['Subject'] = f"Time Review - Week Ending {rd['week_ending'].strftime('%b %d, %Y')}"
                
                body = f"""Hours Reviewer Report

Week Ending: {rd['week_ending'].strftime('%A, %B %d, %Y')}
Period: {rd['week_starting'].strftime('%B %d')} - {rd['week_ending'].strftime('%B %d, %Y')}

Total Issues Found: {rd['total_issues']}

Summary:
- Zero Hours: {len(rd['issues']['zero_hours'])}
- Not Submitted: {len(rd['issues']['not_submitted'])}
- Under 40 Hours: {len(rd['issues']['under_40'])}
- Non-Billable Client Work: {len(rd['issues']['non_billable_client_work'])}
- Poor Quality Notes: {len(rd['issues']['poor_notes'])}

See attached file for full details.

Best regards,
Voyage Advisory
"""
                
                msg.attach(MIMEText(body, 'plain'))
                
                # Attach Excel if available, otherwise text
                if 'excel_file' in rd:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(rd['excel_file'])
                    encoders.encode_base64(part)
                    filename = f"time_review_{rd['week_ending'].strftime('%Y%m%d')}.xlsx"
                    part.add_header('Content-Disposition', f'attachment; filename={filename}')
                else:
                    part = MIMEBase('text', 'plain')
                    part.set_payload(rd['report_text'].encode('utf-8'))
                    encoders.encode_base64(part)
                    filename = f"time_review_{rd['week_ending'].strftime('%Y%m%d')}.txt"
                    part.add_header('Content-Disposition', f'attachment; filename={filename}')
                
                msg.attach(part)
                
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
                result = gmail.users().messages().send(userId='me', body={'raw': raw}).execute()
                
                st.sidebar.success(f"✅ Sent to {email_to}!")
                
            except Exception as e:
                st.sidebar.error(f"❌ {type(e).__name__}")
                st.sidebar.code(str(e))
