import pandas as pd
import gspread
import streamlit as st
from google.oauth2 import service_account
from googleapiclient.discovery import build
import json

def get_client():
    """
    Authenticate with Google Sheets using service account from Streamlit secrets.
    """
    # Get service account credentials from Streamlit secrets
    # The service account key should be stored as a JSON string in secrets
    service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
    
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    creds = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=SCOPES
    )
    
    return gspread.authorize(creds)

def get_drive_client():
    """Returns a Google Drive API client using the same credentials."""
    gc = get_client()
    return build('drive', 'v3', credentials=gc.auth)

def move_file_to_folder(file_id, folder_id):
    """
    Moves a Drive file (e.g., Google Sheet) into a specific folder.
    Required for Shared Drives.
    """
    drive = get_drive_client()
    
    file = drive.files().get(
        fileId=file_id,
        fields='parents',
        supportsAllDrives=True
    ).execute()
    
    previous_parents = ",".join(file.get('parents', []))
    
    drive.files().update(
        fileId=file_id,
        addParents=folder_id,
        removeParents=previous_parents,
        fields='id, parents',
        supportsAllDrives=True,
        supportsTeamDrives=True
    ).execute()

def create_report_spreadsheet(report_name):
    """
    Creates a Google Sheet and places it in the reports folder.
    Returns the gspread Spreadsheet object.
    """
    gc = get_client()
    sh = gc.create(report_name)
    
    # Move to reports folder
    reports_folder_id = st.secrets["REPORTS_FOLDER_ID"]
    move_file_to_folder(file_id=sh.id, folder_id=reports_folder_id)
    
    print(f"✅ Report created in reports folder: {sh.url}")
    return sh

def read_config(spreadsheet_id, sheet_name):
    """Reads a configuration tab into a DataFrame."""
    gc = get_client()
    try:
        sh = gc.open_by_key(spreadsheet_id)
        worksheet = sh.worksheet(sheet_name)
        data = worksheet.get_all_records()
        return pd.DataFrame(data)
    except gspread.exceptions.SpreadsheetNotFound:
        print(
            f"❌ Error: Cannot access spreadsheet {spreadsheet_id}. "
            f"Make sure it's shared with the service account."
        )
        return None
    except Exception as e:
        print(f"❌ Error reading sheet '{sheet_name}': {e}")
        return None

def write_report(df, spreadsheet_id, sheet_name):
    """
    Writes a DataFrame to a worksheet.
    Creates the tab if missing, clears old data, and pushes new data.
    """
    gc = get_client()
    try:
        sh = gc.open_by_key(spreadsheet_id)
        
        try:
            worksheet = sh.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            worksheet = sh.add_worksheet(
                title=sheet_name,
                rows=1000,
                cols=20
            )
        
        worksheet.clear()
        
        # Prepare data
        df_clean = df.fillna("")
        data_to_push = [df_clean.columns.values.tolist()] + df_clean.values.tolist()
        
        worksheet.update(values=data_to_push, range_name='A1')
        
        print(f"✅ Data successfully pushed to sheet: {sheet_name}")
    except Exception as e:
        print(f"❌ Error writing to sheet '{sheet_name}': {e}")

# Alias for compatibility
def get_data(spreadsheet_id, sheet_name):
    """Alias for read_config for backward compatibility."""
    return read_config(spreadsheet_id, sheet_name)
