import streamlit as st
import sys
from datetime import datetime
import requests
import base64
import json
import re
from io import BytesIO

# Add functions to path
sys.path.append('./functions')

import sheets

st.set_page_config(page_title="To File to Vault", page_icon="📄", layout="wide")

st.title("📄 To File to Vault")
st.markdown("Automatically classify and file contracts and documents using AI")

# Get config from secrets
try:
    GEMINI_API_KEY = st.secrets["GEMINI_API_KEY"]
    CLAUDE_API_KEY = st.secrets["CLAUDE_API_KEY"]
    FOLDER_TO_FILE = st.secrets["FOLDER_TO_FILE"]
    FOLDER_ARCHIVE_CONTRACTS = st.secrets["FOLDER_ARCHIVE_CONTRACTS"]
    FOLDER_ARCHIVE_DOCS = st.secrets["FOLDER_ARCHIVE_DOCS"]
    NOTIFICATION_EMAIL = st.secrets["NOTIFICATION_EMAIL"]
except:
    st.error("❌ Missing required secrets. Please configure API keys and folder IDs.")
    st.stop()

# AI Model Configuration
GEMINI_MODEL = 'gemini-2.0-flash-exp'
CLAUDE_MODEL = 'claude-sonnet-4-20250514'

# Session state for processing
if 'processing' not in st.session_state:
    st.session_state.processing = False
if 'processed_items' not in st.session_state:
    st.session_state.processed_items = []
if 'errors' not in st.session_state:
    st.session_state.errors = []

# ============================================
# HELPER FUNCTIONS
# ============================================

def sanitize(text):
    """Remove invalid filename characters."""
    if not text:
        return ''
    return text.replace('/', ' ').replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').strip()

def format_date(date_str):
    """Convert YYYY-MM-DD to YYYY.MM.DD."""
    if not date_str:
        today = datetime.now()
        return today.strftime('%Y.%m.%d')
    
    parts = date_str.split('-')
    if len(parts) == 3:
        return f"{parts[0]}.{parts[1]}.{parts[2]}"
    return date_str

def get_unified_prompt():
    """Return the AI prompt for document classification."""
    return """You are a document classification and filing assistant for Voyage Advisory.

STEP 1: DETERMINE IF THIS IS A CONTRACT OR A DOCUMENT

**CONTRACT** = Documents with signatures, commitments, or agreements:
- Signed agreements between Voyage and another party
- Employee documents: offer letters, CNAPs, bonus plans, direct deposit forms, benefits enrollment forms
- Contractor documents: contractor agreements, contractor SOWs
- Company contracts: MSAs, SOWs, NDAs, teaming agreements, referral agreements
- Email PDFs showing approvals or commitments
- Anything on Voyage letterhead with signatures or binding commitments

**DOCUMENT** = Informational correspondence without signatures or commitments:
- Bank statements and credit card statements
- Tax notices and government correspondence
- Utility bills
- Insurance statements
- Government licenses and renewals
- Invoices and bills received
- Any informational letter or notice that does NOT require a signature

STEP 2: EXTRACT APPROPRIATE INFORMATION

If CONTRACT, extract:
{
  "is_contract": true,
  "document_category": "EMPLOYEE" | "CONTRACTOR" | "COMPANY",
  "counterparty": "Company Name or Last, First",
  "executed_date": "YYYY-MM-DD",
  "contract_type": "See codes below",
  "description": "Brief description or empty string",
  "contractor_company": "For contractors: company name",
  "contractor_individual": "For contractors: Last, First format",
  "is_corp_to_corp": true/false or null
}

CONTRACT TYPE CODES:
- COMPANY: CSA, MSA, SOW, NDA, TA, RA, MOD# (modification number)
- CONTRACTOR: SubK (contractor agreement), CSOW (contractor SOW)
- EMPLOYEE: "Offer Letter", "Bonus Plan", "CNAP", "Direct Deposit Form", "Benefits Selection", etc.

If DOCUMENT, extract:
{
  "is_contract": false,
  "issuer_category": "BANK" | "CREDIT_CARD" | "UTILITY" | "INSURER" | "GOVERNMENT_STATE" | "GOVERNMENT_FEDERAL" | "OTHER",
  "issuer_name": "Bank/company name",
  "country": "US or CA or other",
  "state": "Full state name for state docs",
  "agency_name": "Government agency name",
  "document_type": "Short description",
  "period_end_date": "YYYY-MM-DD or empty",
  "letter_date": "YYYY-MM-DD or empty",
  "account_last4": "Last 4 digits if applicable",
  "employee_name": "Last, First if applicable"
}

CRITICAL RULES:
1. Use STRICT "Last, First" format for person names
2. Never use forward slashes (/) anywhere
3. Latest signature date is the executed_date
4. Do NOT duplicate names in fields

Return ONLY valid JSON."""

def analyze_with_gemini(pdf_base64):
    """Analyze PDF with Gemini."""
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}'
    
    payload = {
        'contents': [{
            'parts': [
                {'text': get_unified_prompt()},
                {'inline_data': {'mime_type': 'application/pdf', 'data': pdf_base64}}
            ]
        }],
        'generationConfig': {
            'temperature': 0.1,
            'maxOutputTokens': 1000
        }
    }
    
    try:
        response = requests.post(url, json=payload, timeout=60)
        
        if response.status_code == 429:
            st.warning("⚠️ Gemini quota hit, switching to Claude")
            return None
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        if not data.get('candidates'):
            return None
        
        text_response = data['candidates'][0]['content']['parts'][0]['text']
        match = re.search(r'\{[\s\S]*\}', text_response)
        if not match:
            return None
        
        return json.loads(match.group(0))
        
    except Exception as e:
        st.warning(f"Gemini error: {str(e)}")
        return None

def analyze_with_claude(pdf_base64):
    """Analyze PDF with Claude."""
    url = 'https://api.anthropic.com/v1/messages'
    
    payload = {
        'model': CLAUDE_MODEL,
        'max_tokens': 1000,
        'messages': [{
            'role': 'user',
            'content': [
                {
                    'type': 'document',
                    'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': pdf_base64},
                    'cache_control': {'type': 'ephemeral'}
                },
                {'type': 'text', 'text': get_unified_prompt()}
            ]
        }]
    }
    
    headers = {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        text_response = data['content'][0]['text']
        match = re.search(r'\{[\s\S]*\}', text_response)
        if not match:
            return None
        
        return json.loads(match.group(0))
        
    except Exception as e:
        st.warning(f"Claude error: {str(e)}")
        return None

def analyze_file(pdf_base64):
    """Try Gemini first, fall back to Claude."""
    # Try Gemini
    analysis = analyze_with_gemini(pdf_base64)
    if analysis:
        analysis['_aiUsed'] = 'Gemini'
        return analysis
    
    # Fall back to Claude
    analysis = analyze_with_claude(pdf_base64)
    if analysis:
        analysis['_aiUsed'] = 'Claude'
        return analysis
    
    return None

def build_contract_filename(analysis):
    """Build filename for contracts."""
    counterparty = sanitize(analysis.get('counterparty', ''))
    executed_date = format_date(analysis.get('executed_date'))
    contract_type = sanitize(analysis.get('contract_type', ''))
    description = sanitize(analysis.get('description', ''))
    contractor_company = sanitize(analysis.get('contractor_company', ''))
    contractor_individual = sanitize(analysis.get('contractor_individual', ''))
    
    if contract_type in ['SubK', 'CSOW']:
        if contractor_company and contractor_individual:
            base = f"{contractor_company} ({contractor_individual})"
        elif contractor_company:
            base = contractor_company
        elif contractor_individual:
            base = contractor_individual
        else:
            base = counterparty
        
        if contract_type == 'SubK':
            filename = f"{base} - {executed_date} - Contractor Agreement"
        else:
            filename = f"{base} - {executed_date} - CSOW"
            if description:
                filename += f" - {description}"
    else:
        filename = f"{counterparty} - {executed_date} - {contract_type}"
        if description:
            filename += f" - {description}"
    
    return f"{filename}.pdf"

def build_document_filename(analysis):
    """Build filename for documents."""
    issuer_category = analysis.get('issuer_category', 'OTHER')
    issuer_name = sanitize(analysis.get('issuer_name', ''))
    state = analysis.get('state', '')
    agency_name = sanitize(analysis.get('agency_name', ''))
    doc_type = sanitize(analysis.get('document_type', ''))
    account_last4 = sanitize(analysis.get('account_last4', ''))
    employee_name = sanitize(analysis.get('employee_name', ''))
    
    formatted_date = format_date(analysis.get('period_end_date') or analysis.get('letter_date'))
    
    # Build issuer part
    if issuer_category == 'GOVERNMENT_FEDERAL':
        country = analysis.get('country', 'US')
        agency = agency_name or issuer_name
        issuer_part = f"{country} Government"
        if agency:
            issuer_part += f" - {agency}"
    elif issuer_category == 'GOVERNMENT_STATE':
        if state:
            issuer_part = f"State of {state}"
            if agency_name:
                issuer_part += f" - {agency_name}"
        else:
            issuer_part = issuer_name or 'State Government'
    else:
        issuer_part = issuer_name or 'Document'
    
    # Add account last 4
    if account_last4 and 'ending in' not in doc_type.lower():
        doc_type += f" ending in {account_last4}"
    
    # Add employee name
    if employee_name and employee_name.lower() not in doc_type.lower():
        doc_type += f" for {employee_name}"
    
    filename = f"{issuer_part} - {formatted_date} - {doc_type}"
    return sanitize(filename) + '.pdf'

def get_files_from_drive(folder_id):
    """Get list of PDF files from Google Drive folder."""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        
        # Get credentials
        service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
        SCOPES = ['https://www.googleapis.com/auth/drive']
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
        
        drive_service = build('drive', 'v3', credentials=credentials)
        
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and mimeType='application/pdf' and trashed=false",
            fields='files(id, name)',
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        
        return results.get('files', [])
    except Exception as e:
        st.error(f"Error accessing Drive folder: {e}")
        return []

def get_file_content(file_id):
    """Download file content from Google Drive."""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        
        # Get credentials
        service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
        SCOPES = ['https://www.googleapis.com/auth/drive']
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
        
        drive_service = build('drive', 'v3', credentials=credentials)
        
        request = drive_service.files().get_media(
            fileId=file_id,
            supportsAllDrives=True
        )
        
        content = request.execute()
        return base64.b64encode(content).decode('utf-8')
    except Exception as e:
        st.error(f"Error downloading file: {e}")
        return None

def rename_and_move_file(file_id, new_name, target_folder_id):
    """Rename file and move to target folder."""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        
        # Get credentials
        service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
        SCOPES = ['https://www.googleapis.com/auth/drive']
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
        
        drive_service = build('drive', 'v3', credentials=credentials)
        
        # Get current parents
        file = drive_service.files().get(
            fileId=file_id,
            fields='parents',
            supportsAllDrives=True
        ).execute()
        
        previous_parents = ','.join(file.get('parents', []))
        
        # Update file
        drive_service.files().update(
            fileId=file_id,
            body={'name': new_name},
            addParents=target_folder_id,
            removeParents=previous_parents,
            fields='id, parents',
            supportsAllDrives=True,
            supportsTeamDrives=True
        ).execute()
        
        return True
    except Exception as e:
        st.error(f"Error moving file: {e}")
        return False

# ============================================
# MAIN UI
# ============================================

# Settings expander
with st.expander("⚙️ Configuration"):
    st.write("**Folders:**")
    st.code(f"To File: {FOLDER_TO_FILE}")
    st.code(f"Contracts: {FOLDER_ARCHIVE_CONTRACTS}")
    st.code(f"Documents: {FOLDER_ARCHIVE_DOCS}")
    st.write("**AI Models:**")
    st.code(f"Gemini: {GEMINI_MODEL}")
    st.code(f"Claude: {CLAUDE_MODEL}")

st.divider()

# Process button
if st.button("🚀 Process Documents", type="primary", disabled=st.session_state.processing):
    st.session_state.processing = True
    st.session_state.processed_items = []
    st.session_state.errors = []
    
    start_time = datetime.now()
    
    # Get files
    with st.spinner("📂 Loading files from 'to file' folder..."):
        files = get_files_from_drive(FOLDER_TO_FILE)
    
    if not files:
        st.info("✅ No files to process!")
        st.session_state.processing = False
        st.stop()
    
    st.info(f"Found {len(files)} PDF files to process")
    
    # Progress tracking
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    # Process each file
    for idx, file in enumerate(files):
        file_name = file['name']
        file_id = file['id']
        
        status_text.text(f"Processing {idx + 1}/{len(files)}: {file_name}")
        
        try:
            # Download file
            pdf_base64 = get_file_content(file_id)
            if not pdf_base64:
                st.session_state.errors.append(f"{file_name} - Failed to download")
                continue
            
            # Analyze with AI
            analysis = analyze_file(pdf_base64)
            if not analysis:
                st.session_state.errors.append(f"{file_name} - AI analysis failed")
                continue
            
            # Determine if contract or document
            is_contract = analysis.get('is_contract', False)
            ai_used = analysis.get('_aiUsed', 'Unknown')
            
            if is_contract:
                new_name = build_contract_filename(analysis)
                target_folder = FOLDER_ARCHIVE_CONTRACTS
                kind = 'CONTRACT'
            else:
                new_name = build_document_filename(analysis)
                target_folder = FOLDER_ARCHIVE_DOCS
                kind = 'DOCUMENT'
            
            # Rename and move
            if rename_and_move_file(file_id, new_name, target_folder):
                st.session_state.processed_items.append({
                    'name': new_name,
                    'ai': ai_used,
                    'kind': kind
                })
            else:
                st.session_state.errors.append(f"{file_name} - Failed to move")
        
        except Exception as e:
            st.session_state.errors.append(f"{file_name} - {str(e)}")
        
        # Update progress
        progress_bar.progress((idx + 1) / len(files))
    
    # Calculate timing
    end_time = datetime.now()
    total_seconds = int((end_time - start_time).total_seconds())
    avg_seconds = int(total_seconds / len(st.session_state.processed_items)) if st.session_state.processed_items else 0
    
    st.session_state.processing = False
    st.session_state.total_seconds = total_seconds
    st.session_state.avg_seconds = avg_seconds
    
    status_text.text("✅ Processing complete!")
    progress_bar.empty()

# Display results
if st.session_state.processed_items or st.session_state.errors:
    st.divider()
    st.header("📊 Results")
    
    # Summary metrics
    contracts = [item for item in st.session_state.processed_items if item['kind'] == 'CONTRACT']
    documents = [item for item in st.session_state.processed_items if item['kind'] == 'DOCUMENT']
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Contracts", len(contracts))
    with col2:
        st.metric("Documents", len(documents))
    with col3:
        st.metric("Errors", len(st.session_state.errors))
    with col4:
        if hasattr(st.session_state, 'avg_seconds'):
            st.metric("Avg Time", f"{st.session_state.avg_seconds}s")
    
    # Tabs for details
    tab1, tab2, tab3 = st.tabs(["✅ Contracts", "📄 Documents", "❌ Errors"])
    
    with tab1:
        if contracts:
            for item in contracts:
                st.write(f"- {item['name']} *({item['ai']})*")
        else:
            st.info("No contracts processed")
    
    with tab2:
        if documents:
            for item in documents:
                st.write(f"- {item['name']} *({item['ai']})*")
        else:
            st.info("No documents processed")
    
    with tab3:
        if st.session_state.errors:
            for error in st.session_state.errors:
                st.error(error)
        else:
            st.success("No errors!")

else:
    st.info("👆 Click the button above to process documents from the 'to file' folder")
    
    with st.expander("ℹ️ How it works"):
        st.markdown("""
        This app automatically processes PDFs in your Google Drive "to file" folder:
        
        1. **Classifies** each PDF as either a Contract or Document using AI
        2. **Extracts** key information (parties, dates, types, etc.)
        3. **Renames** files with standardized naming convention
        4. **Moves** to appropriate archive folder
        
        **Contracts** include:
        - Employee documents (offers, agreements, etc.)
        - Contractor agreements and SOWs
        - Company agreements (MSAs, NDAs, etc.)
        
        **Documents** include:
        - Bank/credit card statements
        - Government correspondence
        - Utility bills
        - Insurance documents
        """)
