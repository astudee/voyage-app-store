import streamlit as st
import sys
from datetime import datetime
import base64
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from io import BytesIO

# Authentication check - shared session state from Home page
if 'authenticated' not in st.session_state or not st.session_state.authenticated:
    st.error("🔐 Please log in through the Home page")
    st.stop()

# Add functions to path
sys.path.append('./functions')

import sheets

st.set_page_config(page_title="Email Vault", page_icon="📧", layout="wide")

st.title("📧 Email Vault Processor")
st.markdown("Archive emails labeled 'Vault' to Google Drive")

# Get config from secrets
try:
    VAULT_FOLDER_ID = st.secrets["FOLDER_TO_FILE"]  # Same as document vault "to file" folder
    SERVICE_ACCOUNT_EMAIL = st.secrets["SERVICE_ACCOUNT_KEY"]["client_email"]
except:
    st.error("❌ Missing required secrets")
    st.stop()

LABEL_NAME = "Vault"
MAX_EMAILS_PER_RUN = 50

# Session state
if 'processing' not in st.session_state:
    st.session_state.processing = False
if 'processed_items' not in st.session_state:
    st.session_state.processed_items = []
if 'errors' not in st.session_state:
    st.session_state.errors = []

# ============================================
# HELPER FUNCTIONS
# ============================================

def sanitize_filename(text):
    """Clean text for use in filename."""
    if not text:
        return "No_Subject"
    # Replace non-alphanumeric characters with underscore
    clean = re.sub(r'[^\w\-]+', '_', text)
    return clean[:100]  # Limit length

def get_gmail_service():
    """Get Gmail API service using service account."""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        
        # Get credentials from Streamlit secrets
        service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
        
        SCOPES = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify'
        ]
        
        # Create delegated credentials for vault@voyageadvisory.com
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
        
        # Delegate to your actual email account (vault@ is just an alias)
        delegated_credentials = credentials.with_subject('astudee@voyageadvisory.com')
        
        return build('gmail', 'v1', credentials=delegated_credentials)
    except Exception as e:
        st.error(f"Error creating Gmail service: {e}")
        return None

def get_drive_service():
    """Get Drive service."""
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        
        # Get credentials from Streamlit secrets
        service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
        
        SCOPES = [
            'https://www.googleapis.com/auth/drive'
        ]
        
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
        
        return build('drive', 'v3', credentials=credentials)
    except Exception as e:
        st.error(f"Error creating Drive service: {e}")
        return None

def get_vault_messages(gmail_service):
    """Get messages with Vault label."""
    try:
        # Get Vault label ID
        labels = gmail_service.users().labels().list(userId='me').execute()
        vault_label = None
        for label in labels.get('labels', []):
            if label['name'] == LABEL_NAME:
                vault_label = label['id']
                break
        
        if not vault_label:
            return [], None
        
        # Get messages with this label
        results = gmail_service.users().messages().list(
            userId='me',
            labelIds=[vault_label],
            maxResults=MAX_EMAILS_PER_RUN
        ).execute()
        
        messages = results.get('messages', [])
        return messages, vault_label
        
    except Exception as e:
        st.error(f"Error getting messages: {e}")
        return [], None

def get_message_details(gmail_service, msg_id):
    """Get full message details."""
    try:
        message = gmail_service.users().messages().get(
            userId='me',
            id=msg_id,
            format='full'
        ).execute()
        return message
    except Exception as e:
        st.error(f"Error getting message details: {e}")
        return None

def get_header(headers, name):
    """Extract header value by name."""
    for header in headers:
        if header['name'].lower() == name.lower():
            return header['value']
    return ''

def decode_base64(data):
    """Decode base64 with URL-safe handling."""
    # Add padding if needed
    missing_padding = len(data) % 4
    if missing_padding:
        data += '=' * (4 - missing_padding)
    
    # Replace URL-safe characters
    data = data.replace('-', '+').replace('_', '/')
    
    return base64.b64decode(data)

def get_attachments(message, gmail_service, msg_id):
    """Extract real attachments (not inline images)."""
    attachments = []
    
    if 'parts' not in message['payload']:
        return attachments
    
    for part in message['payload']['parts']:
        # Skip inline images and non-attachment parts
        if 'filename' in part and part['filename']:
            # Check if it's a real file (not inline image)
            content_type = part.get('mimeType', '')
            if content_type.startswith('image/'):
                # Skip inline images
                continue
            
            # Get attachment data
            if 'data' in part['body']:
                data = part['body']['data']
            elif 'attachmentId' in part['body']:
                # Fetch attachment by ID
                attachment_id = part['body']['attachmentId']
                data = fetch_attachment(gmail_service, msg_id, attachment_id)
                if not data:
                    continue
            else:
                continue
            
            attachments.append({
                'filename': part['filename'],
                'data': data,
                'mimeType': content_type
            })
    
    return attachments

def fetch_attachment(gmail_service, msg_id, attachment_id):
    """Fetch attachment data by ID."""
    try:
        attachment = gmail_service.users().messages().attachments().get(
            userId='me',
            messageId=msg_id,
            id=attachment_id
        ).execute()
        return attachment['data']
    except Exception as e:
        st.error(f"Error fetching attachment: {e}")
        return None

def get_message_body(message):
    """Extract plain text body from message."""
    if 'parts' in message['payload']:
        for part in message['payload']['parts']:
            if part['mimeType'] == 'text/plain':
                if 'data' in part['body']:
                    return decode_base64(part['body']['data']).decode('utf-8')
    
    # Fallback to payload body
    if 'body' in message['payload'] and 'data' in message['payload']['body']:
        return decode_base64(message['payload']['body']['data']).decode('utf-8')
    
    return ''

def create_email_pdf(subject, sender, date, body):
    """Convert email to PDF."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.units import inch
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        story = []
        styles = getSampleStyleSheet()
        
        # Header style
        header_style = ParagraphStyle(
            'CustomHeader',
            parent=styles['Heading2'],
            fontSize=10,
            textColor='#333333'
        )
        
        # Add email headers
        story.append(Paragraph(f"<b>From:</b> {sender}", header_style))
        story.append(Paragraph(f"<b>Date:</b> {date}", header_style))
        story.append(Paragraph(f"<b>Subject:</b> {subject}", header_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Add body
        # Clean and format body text
        body_clean = body.replace('<', '&lt;').replace('>', '&gt;')
        # Split into paragraphs
        paragraphs = body_clean.split('\n\n')
        for para in paragraphs:
            if para.strip():
                story.append(Paragraph(para.strip(), styles['Normal']))
                story.append(Spacer(1, 0.1*inch))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
        
    except Exception as e:
        st.error(f"Error creating PDF: {e}")
        return None

def upload_to_drive(drive_service, filename, content, mime_type='application/pdf'):
    """Upload file to Google Drive."""
    try:
        from googleapiclient.http import MediaInMemoryUpload
        
        file_metadata = {
            'name': filename,
            'parents': [VAULT_FOLDER_ID]
        }
        
        media = MediaInMemoryUpload(content, mimetype=mime_type, resumable=True)
        
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id',
            supportsAllDrives=True
        ).execute()
        
        return file.get('id')
        
    except Exception as e:
        st.error(f"Error uploading to Drive: {e}")
        return None

def remove_label(gmail_service, msg_id, label_id):
    """Remove label from message."""
    try:
        gmail_service.users().messages().modify(
            userId='me',
            id=msg_id,
            body={'removeLabelIds': [label_id]}
        ).execute()
        return True
    except Exception as e:
        st.error(f"Error removing label: {e}")
        return False

# ============================================
# MAIN UI
# ============================================

st.info(f"""
**How it works:**
1. Emails sent to `vault@voyageadvisory.com` (alias for astudee@) get the "Vault" label
2. This app processes those emails from your inbox
3. If email has attachments → saves attachments to Drive
4. If email has no attachments → converts email to PDF and saves
5. Removes "Vault" label after processing
""")

with st.expander("⚙️ Configuration"):
    st.write("**Settings:**")
    st.code(f"Target Folder: {VAULT_FOLDER_ID}")
    st.code(f"Email Account: astudee@voyageadvisory.com")
    st.code(f"Email Alias: vault@voyageadvisory.com")
    st.code(f"Label: {LABEL_NAME}")
    st.code(f"Max per run: {MAX_EMAILS_PER_RUN}")
    st.code(f"Service Account: {SERVICE_ACCOUNT_EMAIL}")

st.divider()

# Process button
if st.button("🚀 Process Vault Emails", type="primary", disabled=st.session_state.processing):
    st.session_state.processing = True
    st.session_state.processed_items = []
    st.session_state.errors = []
    
    start_time = datetime.now()
    
    # Get Gmail service
    with st.spinner("🔐 Connecting to Gmail..."):
        gmail_service = get_gmail_service()
        drive_service = get_drive_service()
    
    if not gmail_service or not drive_service:
        st.error("❌ Failed to connect to Google services")
        st.session_state.processing = False
        st.stop()
    
    # Get messages
    with st.spinner("📧 Loading messages with 'Vault' label..."):
        messages, vault_label_id = get_vault_messages(gmail_service)
    
    if not messages:
        st.info("✅ No emails to process!")
        st.session_state.processing = False
        st.stop()
    
    st.info(f"Found {len(messages)} emails to process")
    
    # Progress tracking
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    # Process each message
    for idx, msg in enumerate(messages):
        msg_id = msg['id']
        
        try:
            # Get full message
            message = get_message_details(gmail_service, msg_id)
            if not message:
                st.session_state.errors.append(f"Message {msg_id} - Failed to fetch")
                continue
            
            # Extract headers
            headers = message['payload']['headers']
            subject = get_header(headers, 'Subject')
            sender = get_header(headers, 'From')
            date_str = get_header(headers, 'Date')
            
            status_text.text(f"Processing {idx + 1}/{len(messages)}: {subject[:50]}")
            
            # Create timestamp for filename
            msg_date = datetime.fromtimestamp(int(message['internalDate']) / 1000)
            timestamp = msg_date.strftime('%Y-%m-%d_%H-%M-%S')
            subject_clean = sanitize_filename(subject)
            
            # Get attachments
            attachments = get_attachments(message, gmail_service, msg_id)
            
            # Process based on attachments
            if attachments:
                # CASE 1: Has attachments - save them
                for att in attachments:
                    filename = f"ATTACH_{timestamp}_{sanitize_filename(att['filename'])}"
                    file_data = decode_base64(att['data'])
                    
                    file_id = upload_to_drive(
                        drive_service,
                        filename,
                        file_data,
                        att['mimeType']
                    )
                    
                    if file_id:
                        st.session_state.processed_items.append({
                            'type': 'Attachment',
                            'name': filename,
                            'subject': subject
                        })
                    else:
                        st.session_state.errors.append(f"{filename} - Upload failed")
            
            else:
                # CASE 2: No attachments - PDF the email
                body = get_message_body(message)
                pdf_content = create_email_pdf(subject, sender, date_str, body)
                
                if pdf_content:
                    filename = f"EMAIL_{timestamp}_{subject_clean}.pdf"
                    file_id = upload_to_drive(drive_service, filename, pdf_content)
                    
                    if file_id:
                        st.session_state.processed_items.append({
                            'type': 'Email PDF',
                            'name': filename,
                            'subject': subject
                        })
                    else:
                        st.session_state.errors.append(f"{filename} - Upload failed")
                else:
                    st.session_state.errors.append(f"{subject} - PDF creation failed")
            
            # Remove label
            if vault_label_id:
                remove_label(gmail_service, msg_id, vault_label_id)
        
        except Exception as e:
            st.session_state.errors.append(f"Message {msg_id} - {str(e)}")
        
        # Update progress
        progress_bar.progress((idx + 1) / len(messages))
    
    # Calculate timing
    end_time = datetime.now()
    total_seconds = int((end_time - start_time).total_seconds())
    
    st.session_state.processing = False
    st.session_state.total_seconds = total_seconds
    
    status_text.text("✅ Processing complete!")
    progress_bar.empty()

# Display results
if st.session_state.processed_items or st.session_state.errors:
    st.divider()
    st.header("📊 Results")
    
    # Summary metrics
    attachments = [item for item in st.session_state.processed_items if item['type'] == 'Attachment']
    email_pdfs = [item for item in st.session_state.processed_items if item['type'] == 'Email PDF']
    
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Attachments Saved", len(attachments))
    with col2:
        st.metric("Emails Converted", len(email_pdfs))
    with col3:
        st.metric("Errors", len(st.session_state.errors))
    
    # Tabs for details
    tab1, tab2, tab3 = st.tabs(["📎 Attachments", "📧 Email PDFs", "❌ Errors"])
    
    with tab1:
        if attachments:
            for item in attachments:
                st.write(f"**{item['name']}**")
                st.caption(f"From: {item['subject']}")
        else:
            st.info("No attachments processed")
    
    with tab2:
        if email_pdfs:
            for item in email_pdfs:
                st.write(f"**{item['name']}**")
                st.caption(f"Subject: {item['subject']}")
        else:
            st.info("No emails converted to PDF")
    
    with tab3:
        if st.session_state.errors:
            for error in st.session_state.errors:
                st.error(error)
        else:
            st.success("No errors!")

else:
    st.info("👆 Click the button above to process emails with the 'Vault' label")

# Add requirements note
with st.expander("⚠️ Setup Requirements"):
    st.markdown("""
    **This app requires Gmail API domain-wide delegation:**
    
    1. Your service account needs these scopes:
       - `https://www.googleapis.com/auth/gmail.readonly`
       - `https://www.googleapis.com/auth/gmail.modify`
    
    2. Domain-wide delegation must be enabled for `vault@voyageadvisory.com`
    
    3. Additional Python package needed: `reportlab`
    
    If you see authentication errors, contact your Google Workspace admin to enable domain-wide delegation.
    """)
