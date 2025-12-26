#!/usr/bin/env python3
"""
Email Vault Automation - Standalone Script
Processes emails with 'Vault' label and saves to Google Drive
"""

import os
import sys
import json
import base64
import re
from datetime import datetime
from io import BytesIO

# Add functions to path
sys.path.append('./functions')

# Configuration from environment variables
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
CLAUDE_API_KEY = os.environ.get('CLAUDE_API_KEY')
FOLDER_TO_FILE = os.environ.get('FOLDER_TO_FILE')
NOTIFICATION_EMAIL = os.environ.get('NOTIFICATION_EMAIL')
SERVICE_ACCOUNT_JSON = os.environ.get('SERVICE_ACCOUNT_KEY')

LABEL_NAME = "Vault"
MAX_EMAILS_PER_RUN = 50

def sanitize_filename(text):
    """Clean text for use in filename."""
    if not text:
        return "No_Subject"
    clean = re.sub(r'[^\w\-]+', '_', text)
    return clean[:100]

def get_gmail_service():
    """Get Gmail API service using service account."""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    
    service_account_info = json.loads(SERVICE_ACCOUNT_JSON)
    
    SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
    ]
    
    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=SCOPES
    )
    
    # Delegate to astudee@voyageadvisory.com
    delegated_credentials = credentials.with_subject('astudee@voyageadvisory.com')
    
    return build('gmail', 'v1', credentials=delegated_credentials)

def get_drive_service():
    """Get Drive service."""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    
    service_account_info = json.loads(SERVICE_ACCOUNT_JSON)
    
    SCOPES = ['https://www.googleapis.com/auth/drive']
    
    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=SCOPES
    )
    
    return build('drive', 'v3', credentials=credentials)

def get_vault_messages(gmail_service):
    """Get messages with Vault label."""
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

def get_message_details(gmail_service, msg_id):
    """Get full message details."""
    message = gmail_service.users().messages().get(
        userId='me',
        id=msg_id,
        format='full'
    ).execute()
    return message

def get_header(headers, name):
    """Extract header value by name."""
    for header in headers:
        if header['name'].lower() == name.lower():
            return header['value']
    return ''

def decode_base64(data):
    """Decode base64 with URL-safe handling."""
    missing_padding = len(data) % 4
    if missing_padding:
        data += '=' * (4 - missing_padding)
    data = data.replace('-', '+').replace('_', '/')
    return base64.b64decode(data)

def fetch_attachment(gmail_service, msg_id, attachment_id):
    """Fetch attachment data by ID."""
    attachment = gmail_service.users().messages().attachments().get(
        userId='me',
        messageId=msg_id,
        id=attachment_id
    ).execute()
    return attachment['data']

def get_attachments(message, gmail_service, msg_id):
    """Extract real attachments (not inline images)."""
    attachments = []
    
    if 'parts' not in message['payload']:
        return attachments
    
    for part in message['payload']['parts']:
        if 'filename' in part and part['filename']:
            content_type = part.get('mimeType', '')
            if content_type.startswith('image/'):
                continue
            
            if 'data' in part['body']:
                data = part['body']['data']
            elif 'attachmentId' in part['body']:
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

def get_message_body(message):
    """Extract plain text body from message."""
    if 'parts' in message['payload']:
        for part in message['payload']['parts']:
            if part['mimeType'] == 'text/plain':
                if 'data' in part['body']:
                    return decode_base64(part['body']['data']).decode('utf-8')
    
    if 'body' in message['payload'] and 'data' in message['payload']['body']:
        return decode_base64(message['payload']['body']['data']).decode('utf-8')
    
    return ''

def create_email_pdf(subject, sender, date, body):
    """Convert email to PDF."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.units import inch
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Heading2'],
        fontSize=10,
        textColor='#333333'
    )
    
    story.append(Paragraph(f"<b>From:</b> {sender}", header_style))
    story.append(Paragraph(f"<b>Date:</b> {date}", header_style))
    story.append(Paragraph(f"<b>Subject:</b> {subject}", header_style))
    story.append(Spacer(1, 0.2*inch))
    
    body_clean = body.replace('<', '&lt;').replace('>', '&gt;')
    paragraphs = body_clean.split('\n\n')
    for para in paragraphs:
        if para.strip():
            story.append(Paragraph(para.strip(), styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

def upload_to_drive(drive_service, filename, content, mime_type='application/pdf'):
    """Upload file to Google Drive."""
    from googleapiclient.http import MediaInMemoryUpload
    
    file_metadata = {
        'name': filename,
        'parents': [FOLDER_TO_FILE]
    }
    
    media = MediaInMemoryUpload(content, mimetype=mime_type, resumable=True)
    
    file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id',
        supportsAllDrives=True
    ).execute()
    
    return file.get('id')

def remove_label(gmail_service, msg_id, label_id):
    """Remove label from message."""
    gmail_service.users().messages().modify(
        userId='me',
        id=msg_id,
        body={'removeLabelIds': [label_id]}
    ).execute()

def main():
    """Main execution function."""
    print(f"[{datetime.now()}] Starting Email Vault processing...")
    
    # Get services
    gmail_service = get_gmail_service()
    drive_service = get_drive_service()
    
    # Get messages
    messages, vault_label_id = get_vault_messages(gmail_service)
    
    if not messages:
        print("No emails to process")
        return
    
    print(f"Found {len(messages)} emails to process")
    
    processed = []
    errors = []
    
    for msg in messages:
        msg_id = msg['id']
        
        try:
            # Get full message
            message = get_message_details(gmail_service, msg_id)
            
            # Extract headers
            headers = message['payload']['headers']
            subject = get_header(headers, 'Subject')
            sender = get_header(headers, 'From')
            date_str = get_header(headers, 'Date')
            
            # Create timestamp
            msg_date = datetime.fromtimestamp(int(message['internalDate']) / 1000)
            timestamp = msg_date.strftime('%Y-%m-%d_%H-%M-%S')
            subject_clean = sanitize_filename(subject)
            
            # Get attachments
            attachments = get_attachments(message, gmail_service, msg_id)
            
            if attachments:
                # Save attachments
                for att in attachments:
                    filename = f"ATTACH_{timestamp}_{sanitize_filename(att['filename'])}"
                    file_data = decode_base64(att['data'])
                    
                    file_id = upload_to_drive(drive_service, filename, file_data, att['mimeType'])
                    
                    if file_id:
                        processed.append(f"Attachment: {filename}")
                        print(f"  ✓ Saved attachment: {filename}")
                    else:
                        errors.append(f"Failed to upload: {filename}")
            else:
                # PDF the email
                body = get_message_body(message)
                pdf_content = create_email_pdf(subject, sender, date_str, body)
                
                if pdf_content:
                    filename = f"EMAIL_{timestamp}_{subject_clean}.pdf"
                    file_id = upload_to_drive(drive_service, filename, pdf_content)
                    
                    if file_id:
                        processed.append(f"Email PDF: {filename}")
                        print(f"  ✓ Created email PDF: {filename}")
                    else:
                        errors.append(f"Failed to upload: {filename}")
            
            # Remove label
            if vault_label_id:
                remove_label(gmail_service, msg_id, vault_label_id)
        
        except Exception as e:
            error_msg = f"Error processing {msg_id}: {str(e)}"
            errors.append(error_msg)
            print(f"  ✗ {error_msg}")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"Processed: {len(processed)} items")
    print(f"Errors: {len(errors)}")
    print(f"{'='*60}")
    
    if errors:
        print("\nErrors:")
        for error in errors:
            print(f"  - {error}")

if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""
Email Vault Automation - Standalone Script
Processes emails with 'Vault' label and saves to Google Drive
"""

import os
import sys
import json
import base64
import re
from datetime import datetime
from io import BytesIO

# Add functions to path
sys.path.append('./functions')

# Configuration from environment variables
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
CLAUDE_API_KEY = os.environ.get('CLAUDE_API_KEY')
FOLDER_TO_FILE = os.environ.get('FOLDER_TO_FILE')
NOTIFICATION_EMAIL = os.environ.get('NOTIFICATION_EMAIL')
SERVICE_ACCOUNT_JSON = os.environ.get('SERVICE_ACCOUNT_KEY')

LABEL_NAME = "Vault"
MAX_EMAILS_PER_RUN = 50

def sanitize_filename(text):
    """Clean text for use in filename."""
    if not text:
        return "No_Subject"
    clean = re.sub(r'[^\w\-]+', '_', text)
    return clean[:100]

def get_gmail_service():
    """Get Gmail API service using service account."""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    
    service_account_info = json.loads(SERVICE_ACCOUNT_JSON)
    
    SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
    ]
    
    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=SCOPES
    )
    
    # Delegate to astudee@voyageadvisory.com
    delegated_credentials = credentials.with_subject('astudee@voyageadvisory.com')
    
    return build('gmail', 'v1', credentials=delegated_credentials)

def get_drive_service():
    """Get Drive service."""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    
    service_account_info = json.loads(SERVICE_ACCOUNT_JSON)
    
    SCOPES = ['https://www.googleapis.com/auth/drive']
    
    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=SCOPES
    )
    
    return build('drive', 'v3', credentials=credentials)

def get_vault_messages(gmail_service):
    """Get messages with Vault label."""
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

def get_message_details(gmail_service, msg_id):
    """Get full message details."""
    message = gmail_service.users().messages().get(
        userId='me',
        id=msg_id,
        format='full'
    ).execute()
    return message

def get_header(headers, name):
    """Extract header value by name."""
    for header in headers:
        if header['name'].lower() == name.lower():
            return header['value']
    return ''

def decode_base64(data):
    """Decode base64 with URL-safe handling."""
    missing_padding = len(data) % 4
    if missing_padding:
        data += '=' * (4 - missing_padding)
    data = data.replace('-', '+').replace('_', '/')
    return base64.b64decode(data)

def fetch_attachment(gmail_service, msg_id, attachment_id):
    """Fetch attachment data by ID."""
    attachment = gmail_service.users().messages().attachments().get(
        userId='me',
        messageId=msg_id,
        id=attachment_id
    ).execute()
    return attachment['data']

def get_attachments(message, gmail_service, msg_id):
    """Extract real attachments (not inline images)."""
    attachments = []
    
    if 'parts' not in message['payload']:
        return attachments
    
    for part in message['payload']['parts']:
        if 'filename' in part and part['filename']:
            content_type = part.get('mimeType', '')
            if content_type.startswith('image/'):
                continue
            
            if 'data' in part['body']:
                data = part['body']['data']
            elif 'attachmentId' in part['body']:
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

def get_message_body(message):
    """Extract plain text body from message."""
    if 'parts' in message['payload']:
        for part in message['payload']['parts']:
            if part['mimeType'] == 'text/plain':
                if 'data' in part['body']:
                    return decode_base64(part['body']['data']).decode('utf-8')
    
    if 'body' in message['payload'] and 'data' in message['payload']['body']:
        return decode_base64(message['payload']['body']['data']).decode('utf-8')
    
    return ''

def create_email_pdf(subject, sender, date, body):
    """Convert email to PDF."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.units import inch
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Heading2'],
        fontSize=10,
        textColor='#333333'
    )
    
    story.append(Paragraph(f"<b>From:</b> {sender}", header_style))
    story.append(Paragraph(f"<b>Date:</b> {date}", header_style))
    story.append(Paragraph(f"<b>Subject:</b> {subject}", header_style))
    story.append(Spacer(1, 0.2*inch))
    
    body_clean = body.replace('<', '&lt;').replace('>', '&gt;')
    paragraphs = body_clean.split('\n\n')
    for para in paragraphs:
        if para.strip():
            story.append(Paragraph(para.strip(), styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

def upload_to_drive(drive_service, filename, content, mime_type='application/pdf'):
    """Upload file to Google Drive."""
    from googleapiclient.http import MediaInMemoryUpload
    
    file_metadata = {
        'name': filename,
        'parents': [FOLDER_TO_FILE]
    }
    
    media = MediaInMemoryUpload(content, mimetype=mime_type, resumable=True)
    
    file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id',
        supportsAllDrives=True
    ).execute()
    
    return file.get('id')

def remove_label(gmail_service, msg_id, label_id):
    """Remove label from message."""
    gmail_service.users().messages().modify(
        userId='me',
        id=msg_id,
        body={'removeLabelIds': [label_id]}
    ).execute()

def main():
    """Main execution function."""
    print(f"[{datetime.now()}] Starting Email Vault processing...")
    
    # Get services
    gmail_service = get_gmail_service()
    drive_service = get_drive_service()
    
    # Get messages
    messages, vault_label_id = get_vault_messages(gmail_service)
    
    if not messages:
        print("No emails to process")
        return
    
    print(f"Found {len(messages)} emails to process")
    
    processed = []
    errors = []
    
    for msg in messages:
        msg_id = msg['id']
        
        try:
            # Get full message
            message = get_message_details(gmail_service, msg_id)
            
            # Extract headers
            headers = message['payload']['headers']
            subject = get_header(headers, 'Subject')
            sender = get_header(headers, 'From')
            date_str = get_header(headers, 'Date')
            
            # Create timestamp
            msg_date = datetime.fromtimestamp(int(message['internalDate']) / 1000)
            timestamp = msg_date.strftime('%Y-%m-%d_%H-%M-%S')
            subject_clean = sanitize_filename(subject)
            
            # Get attachments
            attachments = get_attachments(message, gmail_service, msg_id)
            
            if attachments:
                # Save attachments
                for att in attachments:
                    filename = f"ATTACH_{timestamp}_{sanitize_filename(att['filename'])}"
                    file_data = decode_base64(att['data'])
                    
                    file_id = upload_to_drive(drive_service, filename, file_data, att['mimeType'])
                    
                    if file_id:
                        processed.append(f"Attachment: {filename}")
                        print(f"  ✓ Saved attachment: {filename}")
                    else:
                        errors.append(f"Failed to upload: {filename}")
            else:
                # PDF the email
                body = get_message_body(message)
                pdf_content = create_email_pdf(subject, sender, date_str, body)
                
                if pdf_content:
                    filename = f"EMAIL_{timestamp}_{subject_clean}.pdf"
                    file_id = upload_to_drive(drive_service, filename, pdf_content)
                    
                    if file_id:
                        processed.append(f"Email PDF: {filename}")
                        print(f"  ✓ Created email PDF: {filename}")
                    else:
                        errors.append(f"Failed to upload: {filename}")
            
            # Remove label
            if vault_label_id:
                remove_label(gmail_service, msg_id, vault_label_id)
        
        except Exception as e:
            error_msg = f"Error processing {msg_id}: {str(e)}"
            errors.append(error_msg)
            print(f"  ✗ {error_msg}")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"Processed: {len(processed)} items")
    print(f"Errors: {len(errors)}")
    print(f"{'='*60}")
    
    if errors:
        print("\nErrors:")
        for error in errors:
            print(f"  - {error}")

if __name__ == '__main__':
    main()
