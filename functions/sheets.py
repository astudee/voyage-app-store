import os
import sys
import pandas as pd
import gspread

from google.oauth2 import service_account
from googleapiclient.discovery import build

from functions.credentials import get


def get_client():
    """
    Universal Authentication:
    - Works in Colab
    - Works in Cloud Shell
    - Works in Cloud Run / GCP
    """
    IN_COLAB = 'google.colab' in sys.modules

    if IN_COLAB:
        PROG_PATH = '/content/drive/Shareddrives/Finance and Legal/Programs/functions'
    else:
        PROG_PATH = './functions'

    KEY_FILE = os.path.join(PROG_PATH, 'service_account_key.json')

    if not os.path.exists(KEY_FILE):
        raise FileNotFoundError(
            f"❌ Missing credentials! Ensure '{KEY_FILE}' exists in your functions folder."
        )

    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    creds = service_account.Credentials.from_service_account_file(
        KEY_FILE,
        scopes=SCOPES
    )

    return gspread.authorize(creds)


def get_drive_client():
    """Returns a Google Drive API client using the same credentials as gspread."""
    gc = get_client()
    return build('drive', 'v3', credentials=gc.auth)


def move_file_to_folder(file_id, folder_id):
    """
    Moves a Drive file (e.g., Google Sheet) into a specific folder.
    This is REQUIRED to avoid files landing in the service account's Drive root.
    """
    drive = get_drive_client()

    file = drive.files().get(
        fileId=file_id,
        fields='parents'
    ).execute()

    previous_parents = ",".join(file.get('parents', []))

    drive.files().update(
        fileId=file_id,
        addParents=folder_id,
        removeParents=previous_parents,
        fields='id, parents'
    ).execute()


def create_report_spreadsheet(report_name):
    """
    Creates a Google Sheet and explicitly places it in Programs/reports.
    Returns the gspread Spreadsheet object.
    """
    gc = get_client()
    sh = gc.create(report_name)

    move_file_to_folder(
        file_id=sh.id,
        folder_id=get("REPORTS_FOLDER_ID")
    )

    print(f"✅ Report created in Programs/reports: {sh.url}")
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
            f"❌ Error: Robot cannot see spreadsheet {spreadsheet_id}. "
            f"Did you share it with the service account email?"
        )
        return None

    except Exception as e:
        print(f"❌ Error reading sheet '{sheet_name}': {e}")
        return None


def write_report(df, spreadsheet_id, sheet_name):
    """
    Writes a DataFrame to a worksheet:
    - Creates the tab if missing
    - Clears old data
    - Pushes headers + rows in a single update
    """
    gc = get_client()
    try:
        sh = gc.open_by_key(spreadsheet_id)

        try:
            worksheet = sh.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            worksheet = sh.add_worksheet(
                title=sheet_name,
                rows="1000",
                cols="20"
            )

        worksheet.clear()

        df_clean = df.fillna("")
        data_to_push = [df_clean.columns.values.tolist()] + df_clean.values.tolist()

        worksheet.update(data_to_push)

        print(f"✅ Data successfully pushed to sheet: {sheet_name}")

    except Exception as e:
        print(f"❌ Error writing to sheet '{sheet_name}': {e}")
