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
    
    note_lower = note_text.lower().strip()
    
    # FIRST: Check for billable notes that should be internal/non-billable
    # These are EGREGIOUS errors that should always be flagged
    internal_work_patterns = [
        ('voyage team meeting', 'Internal Voyage meetings should not be included in billing notes'),
        ('internal meeting', 'Internal meetings should not be included in billing notes'),
        ('voyage meeting', 'Internal Voyage meetings should not be included in billing notes'),
        ('all-hands', 'Internal all-hands meetings should not be included in billing notes'),
        ('all hands', 'Internal all-hands meetings should not be included in billing notes'),
        ('interview', 'Candidate interviews should not be included in billing notes'),
        ('interviewing', 'Candidate interviews should not be included in billing notes'),
        ('recruiting', 'Recruiting work should not be included in billing notes'),
        ('team outing', 'Social/team events should not be included in billing notes'),
        ('happy hour', 'Social events should not be included in billing notes'),
        ('social event', 'Social events should not be included in billing notes'),
        ('1:1', 'Internal 1:1s should not be included in billing notes'),
        ('one-on-one', 'Internal 1:1s should not be included in billing notes'),
        ('1-on-1', 'Internal 1:1s should not be included in billing notes'),
        ('travel time', 'Travel time should not be included in billing notes'),
        ('traveling to', 'Travel time should not be included in billing notes'),
        ('commute', 'Commute time should not be included in billing notes'),
        ('timesheet', 'Timesheet admin should not be included in billing notes'),
        ('time sheet', 'Timesheet admin should not be included in billing notes'),
        ('admin work', 'Administrative work should not be included in billing notes'),
        ('administrative', 'Administrative work should not be included in billing notes'),
        ('training', 'Training should not be included in billing notes unless client-provided'),
        ('voyage training', 'Internal training should not be included in billing notes'),
        ('internal training', 'Internal training should not be included in billing notes'),
        ('onboarding', 'Onboarding should not be included in billing notes'),
    ]
    
    for pattern, reason in internal_work_patterns:
        if pattern in note_lower:
            return True, f"BILLABLE ERROR - {reason}"
    
    # SECOND: Use AI for general quality review (be lenient)
    # Create detailed prompt based on Voyage guidelines
    prompt = f"""You are reviewing a billing note for Voyage Advisory, a consulting firm.

IMPORTANT: Only flag EGREGIOUS violations. Be lenient - most notes should pass.

VOYAGE BILLING NOTE GUIDELINES:
- Use clear, specific, and action-oriented language
- Avoid vague words: ensure, comprehensive, align, alignment, strategy, key priorities
- Prefer specific alternatives: requirements, plan, quantify, accuracy, verify, collaborate
- Limit to 1-2 sentences (except PayIt client)
- Emphasize value of work, not just activity
- Use client-friendly wording (no internal jargon or acronyms)

BILLING NOTE TO REVIEW:
Client: {client_name}
Note: "{note_text}"

EVALUATE: Is this note SEVERELY deficient?

Respond with ONLY:
- "ACCEPTABLE" (if note is reasonable, even if not perfect)
- "POOR - [specific issue]" (ONLY if note is truly bad)

Only flag notes that are:
- Extremely vague (e.g., "stuff", "things", one word like "meeting")
- Completely unprofessional (e.g., "lol", "whatever")
- Missing all context (e.g., "worked", "research" with no detail)

DO NOT flag notes for:
- Minor wording preferences
- Using "ensured" or "aligned" if note otherwise has substance
- Being slightly informal but still clear
- Missing a period at the end
- Being 3 sentences instead of 2 if detailed

Examples of notes to ACCEPT (even if not perfect):
- "Meeting with client to discuss project status"
- "Reviewed and updated the requirements document"
- "Ensured alignment with client on deliverables for next week"
- "Research on compliance requirements for the project"
- "Drafted email to stakeholder regarding timeline"

Examples of notes to FLAG as POOR:
- "stuff" → POOR - Extremely vague
- "worked on things" → POOR - No context
- "lol fixed it" → POOR - Unprofessional
- "meeting" → POOR - Single word, no context

YOUR EVALUATION:"""
    
    # Try Gemini first
    try:
        gemini_key = st.secrets.get("GEMINI_API_KEY")
        if gemini_key:
            url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={gemini_key}'
            
            payload = {
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 100}
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
    
    # Fallback to rule-based heuristics - BE LENIENT
    note_lower = note_text.lower().strip()
    
    # Only flag EXTREMELY short notes
    if len(note_text) < 15:
        return True, "Note extremely short"
    
    # Only flag single words
    if len(note_text.split()) <= 1:
        return True, "Single word note"
    
    # Only flag the most egregious vague patterns
    egregious_patterns = ['stuff', 'things', 'lol', 'haha', 'whatever']
    for pattern in egregious_patterns:
        if pattern in note_lower:
            return True, f"Extremely vague: contains '{pattern}'"
    
    # If note is at least 2 words and 15+ chars, accept it
    return False, ""




# ============================================
# MAIN UI
# ============================================

# Date selector - Fridays only
st.sidebar.header("Report Configuration")

# Use date_input with validation instead of hardcoded list
selected_date = st.sidebar.date_input(
    "Week Ending Date",
    value=datetime.now().date(),
    help="Select a Friday (week ending date)"
)

# Validate it's a Friday
if selected_date.weekday() != 4:  # Friday is 4
    st.sidebar.error("⚠️ Please select a Friday")
    st.sidebar.info(f"You selected {selected_date.strftime('%A, %B %d, %Y')}")
    
    # Find nearest Friday
    days_until_friday = (4 - selected_date.weekday()) % 7
    if days_until_friday == 0:
        days_until_friday = 7
    nearest_friday = selected_date + timedelta(days=days_until_friday)
    
    st.sidebar.info(f"💡 Next Friday: {nearest_friday.strftime('%B %d, %Y')}")
    st.stop()

week_ending = selected_date
week_starting = week_ending - timedelta(days=6)

st.sidebar.write(f"**Report Period:**")
st.sidebar.write(f"{week_starting.strftime('%A, %B %d, %Y')}")
st.sidebar.write(f"through")
st.sidebar.write(f"{week_ending.strftime('%A, %B %d, %Y')}")

st.sidebar.markdown("---")
st.sidebar.subheader("Review Options")

review_notes = st.sidebar.checkbox(
    "Review Billing Notes with AI",
    value=False,
    help="Uses Gemini/Claude to check note quality. Can be slow for large datasets."
)

if st.sidebar.button("🔍 Review Timesheets", type="primary"):
    
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
        'poor_notes': []
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
            st.info(f"📋 Zero hours report returned {len(zero_hours_df)} rows")
            
            # Debug: Show ALL columns
            all_cols = zero_hours_df.columns.tolist()
            st.info(f"🔍 Zero hours report columns ({len(all_cols)}): {', '.join(all_cols)}")
            
            # CRITICAL: This is a STAFF/RESOURCE report, NOT a time-entry report
            # BigTime uses 'st*' prefix for staff reports (e.g., stname, sttitle, ststatus)
            # Different from 'tm*' prefix for time-entry reports
            # Per ChatGPT and Gemini + actual data
            
            STAFF_NAME_CANDIDATES = [
                'stname',         # ACTUAL column name for staff reports! (st = staff)
                'staffnm',        # Also common
                'resourcenm',     # Resource reports
                'nm',             # Short form
                'displaynm',      # UI-friendly name
                'staffname',      # Occasionally used
                'Name',           # UI label (less likely in API)
                'tmstaffnm',      # Only in time-entry reports (unlikely here)
                'Staff_Name',
                'Staff Member'
            ]
            
            # Find staff column
            staff_col = None
            for col in STAFF_NAME_CANDIDATES:
                if col in zero_hours_df.columns:
                    staff_col = col
                    st.success(f"✓ Found staff column: '{staff_col}'")
                    break
            
            # Fallback: search for any column with 'name' or 'staff' in it
            if not staff_col:
                name_like_cols = [c for c in all_cols if any(x in c.lower() for x in ['name', 'staff', 'nm'])]
                st.info(f"🔍 Name-like columns found: {name_like_cols}")
                if name_like_cols:
                    staff_col = name_like_cols[0]
                    st.warning(f"⚠️ Using fallback column: '{staff_col}'")
            
            if staff_col:
                # Extract and clean names
                zero_hour_staff = (
                    zero_hours_df[staff_col]
                    .dropna()
                    .astype(str)
                    .str.strip()
                    .unique()
                    .tolist()
                )
                # Filter out empty strings
                issues['zero_hours'] = sorted([name for name in zero_hour_staff if name])
                
                st.success(f"📊 Found {len(issues['zero_hours'])} people with zero hours")
                st.write(f"Names: {', '.join(issues['zero_hours'])}")
            else:
                st.error(f"❌ Could not find staff name column in zero hours report")
                st.error(f"Available columns: {', '.join(all_cols)}")
                # Show first few rows for debugging
                st.write("First 3 rows of data:")
                st.dataframe(zero_hours_df.head(3))
        else:
            st.info("✅ Zero hours report returned no data (everyone has hours)")
    
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
            # Debug: Show ALL columns
            all_cols = detailed_df.columns.tolist()
            st.info(f"📊 BigTime report has {len(all_cols)} total columns")
            
            # Show numeric columns (hours are always numeric)
            numeric_cols = detailed_df.select_dtypes(include=['number', 'float64', 'int64']).columns.tolist()
            st.info(f"🔢 Found {len(numeric_cols)} numeric columns: {', '.join(numeric_cols[:20])}")
            
            # CRITICAL: Use tmhrsin for total hours (input hours)
            # This is the actual hours worked, not billable hours or IDs
            
            if 'tmhrsin' not in detailed_df.columns:
                st.error("❌ CRITICAL: 'tmhrsin' (input hours) column not found!")
                st.error(f"📋 Available columns: {', '.join(all_cols)}")
                st.stop()
            
            # Create Total_Hours from tmhrsin only
            detailed_df['Total_Hours'] = pd.to_numeric(detailed_df['tmhrsin'], errors='coerce').fillna(0)
            
            st.success(f"✓ Using 'tmhrsin' for Total Hours")
            st.info(f"📊 Total_Hours stats: min={detailed_df['Total_Hours'].min():.1f}, max={detailed_df['Total_Hours'].max():.1f}, sum={detailed_df['Total_Hours'].sum():.1f}, mean={detailed_df['Total_Hours'].mean():.1f}")
            
            # Map other columns
            col_mapping = {
                'Staff': next((col for col in ['tmstaffnm', 'Staff Member', 'Staff'] if col in detailed_df.columns), None),
                'Client': next((col for col in ['tmclientnm', 'Client'] if col in detailed_df.columns), None),
                'Project': next((col for col in ['tmprojectnm', 'Project'] if col in detailed_df.columns), None),
                'Billable_Amount': next((col for col in ['tmchgbillbase', 'Billable ($)', 'Billable'] if col in detailed_df.columns), None),
                'Date': next((col for col in ['tmdt', 'Date'] if col in detailed_df.columns), None),
                'Notes': next((col for col in ['tmnotes', 'Notes', 'Note'] if col in detailed_df.columns), None)
            }
            
            # Remove None values
            col_mapping = {k: v for k, v in col_mapping.items() if v is not None}
            
            st.success(f"✓ Mapped columns: {col_mapping}")
            
            # Rename columns
            detailed_df = detailed_df.rename(columns=col_mapping)
            
            # Convert billable amount to numeric
            if 'Billable_Amount' in detailed_df.columns:
                detailed_df['Billable_Amount'] = pd.to_numeric(detailed_df['Billable_Amount'], errors='coerce').fillna(0)
            
            # Check 1: Under 40 hours (employees only) - USE TOTAL HOURS
            # BUT first calculate hours for EVERYONE to show in report
            if 'Staff' in detailed_df.columns and 'Total_Hours' in detailed_df.columns:
                hours_by_staff = detailed_df.groupby('Staff')['Total_Hours'].sum()
                
                st.info(f"📈 Total staff with hours: {len(hours_by_staff)}")
                
                # Flag employees with under 40 hours
                for staff_name, total_hours in hours_by_staff.items():
                    # Only flag if they're an employee AND under 40
                    if staff_name in employees and total_hours < 40:
                        issues['under_40'].append((staff_name, round(total_hours, 1)))
            
            # Check 2: Non-billable client work - CHECK EVERYONE not just employees
            if all(col in detailed_df.columns for col in ['Staff', 'Client', 'Project', 'Total_Hours', 'Billable_Amount', 'Date']):
                # Filter for non-Internal clients with $0 billable
                non_internal = detailed_df[
                    (~detailed_df['Client'].str.contains('Internal', case=False, na=False)) &
                    (detailed_df['Billable_Amount'] == 0) &
                    (detailed_df['Total_Hours'] > 0)
                ]
                
                for _, row in non_internal.iterrows():
                    issues['non_billable_client_work'].append({
                        'Staff': row.get('Staff', ''),
                        'Client': row.get('Client', ''),
                        'Project': row.get('Project', ''),
                        'Date': row.get('Date', ''),
                        'Hours': round(row.get('Total_Hours', 0), 1)
                    })
            
            # Check 3: Poor quality notes - CHECK EVERYONE not just employees
            if review_notes and all(col in detailed_df.columns for col in ['Staff', 'Client', 'Project', 'Notes', 'Total_Hours', 'Billable_Amount', 'Date']):
                st.info("🤖 AI note review enabled - this may take a few minutes...")
                billable_entries = detailed_df[
                    (detailed_df['Billable_Amount'] > 0) &
                    (detailed_df['Total_Hours'] > 0)
                ]
                
                # Check all billable entries (AI calls are rate-limited internally)
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
                            'Hours': round(row.get('Total_Hours', 0), 1),
                            'Note': note,
                            'Reason': reason
                        })
                
                progress_text.empty()
            elif not review_notes:
                st.info("ℹ️ AI note review skipped (not enabled)")
    
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
    
    # 5. Poor Quality Notes
    with st.expander(f"📝 Poor Quality Notes ({len(issues['poor_notes'])})", expanded=len(issues['poor_notes']) > 0):
        if not review_notes:
            st.info("ℹ️ AI note review was not enabled for this report. Enable it in the sidebar to check billing notes.")
        elif issues['poor_notes']:
            st.write("The following billable notes do not appear to meet Voyage guidelines:")
            for issue in issues['poor_notes']:
                st.write(f"**{issue['Staff']}** - {issue['Client']}, {issue['Project']}, {issue['Date']}, {issue['Hours']} hours")
                st.write(f"  - Note: \"{issue['Note']}\"")
                st.write(f"  - Issue: {issue['Reason']}")
                st.write("")
        else:
            st.success("✅ All notes meet quality standards")
    
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
                        'Poor Quality Notes'
                    ],
                    'Count': [
                        len(issues['zero_hours']),
                        len(issues['not_submitted']),
                        len(issues['under_40']),
                        len(issues['non_billable_client_work']),
                        len(issues['poor_notes'])
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
    st.info("👈 Select a week ending date and click 'Review Timesheets'")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app reviews timesheets for quality and completeness:
        
        **Checks performed:**
        1. **Zero Hours** - Staff who reported no time
        2. **Unsubmitted** - Timesheets not yet submitted or rejected
        3. **Under 40 Hours** - Full-time employees with less than 40 hours
        4. **Non-Billable Client Work** - Client work marked as non-billable
        5. **Poor Notes** - Billing notes that don't meet professional standards
        
        **Data Sources:**
        - BigTime Report 284828 (Unsubmitted Status)
        - BigTime Report 284796 (Detailed Time Report)
        - BigTime Report 288578 (Zero Hours Audit)
        - Voyage_Global_Config (Employee list)
        
        **AI Note Review:**
        Uses Gemini AI to check if billing notes are professional and clear.
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
