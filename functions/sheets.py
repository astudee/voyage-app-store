import os
import sys
import pandas as pd
import gspread
from google.oauth2 import service_account
from googleapiclient.discovery import build

# Detect environment and load credentials accordingly
try:
    import streamlit as st
    IN_STREAMLIT = True
except ImportError:
    IN_STREAMLIT = False
    # Only import credentials if not in Streamlit
    sys.path.append('./functions')
    import credentials


# =============================================================================
# Snowflake Configuration
# =============================================================================

# Sheet name to Snowflake table mapping
SNOWFLAKE_TABLE_MAP = {
    'Staff': 'VC_STAFF',
    'Benefits': 'VC_BENEFITS',
    'Rules': 'VC_COMMISSION_RULES',
    'Offsets': 'VC_COMMISSION_OFFSETS',
    'Mapping': 'VC_CLIENT_NAME_MAPPING',
    'Assignments': 'VC_STAFF_ASSIGNMENTS',
    'FixedFee': 'VC_FIXED_FEE_REVENUE',
}

# Column mapping: Snowflake (snake_case) -> Google Sheets (Title_Case)
SNOWFLAKE_COLUMN_MAP = {
    'VC_STAFF': {
        'STAFF_NAME': 'Staff_Name',
        'START_DATE': 'Start_Date',
        'SALARY': 'Salary',
        'UTILIZATION_BONUS_TARGET': 'Utilization_Bonus_Target',
        'OTHER_BONUS_TARGET': 'Other_Bonus_Target',
        'MEDICAL_PLAN_CODE': 'Medical_Plan',
        'DENTAL_PLAN_CODE': 'Dental_Plan',
        'VISION_PLAN_CODE': 'Vision_Plan',
        'STD_CODE': 'STD',
        'LTD_CODE': 'LTD',
        'LIFE_CODE': 'Life',
        'ADDL_LIFE_CODE': 'Addl Life',
        'PHONE_ALLOWANCE': 'Phone_Allowance',
        'STAFF_TYPE': 'Type',
        'NOTES': 'Notes',
    },
    'VC_BENEFITS': {
        'DESCRIPTION': 'Description',
        'CODE': 'Code',
        'BENEFIT_TYPE': 'Benefit_Type',
        'IS_FORMULA_BASED': 'Is_Formula_Based',
        'TOTAL_MONTHLY_COST': 'Total_Monthly_Cost',
        'EE_MONTHLY_COST': 'EE_Monthly_Cost',
        'FIRM_MONTHLY_COST': 'Firm_Monthly_Cost',
        'COVERAGE_PERCENTAGE': 'Coverage_Percentage',
        'MAX_WEEKLY_BENEFIT': 'Max_Weekly_Benefit',
        'MAX_MONTHLY_BENEFIT': 'Max_Monthly_Benefit',
        'RATE_PER_UNIT': 'Rate_Per_Unit',
    },
    'VC_COMMISSION_RULES': {
        'RULE_SCOPE': 'Rule_Scope',
        'CLIENT_OR_RESOURCE': 'Client_or_Resource',
        'SALESPERSON': 'Salesperson',
        'CATEGORY': 'Category',
        'RATE': 'Rate',
        'START_DATE': 'Start_Date',
        'END_DATE': 'End_Date',
        'NOTE': 'Note',
    },
    'VC_COMMISSION_OFFSETS': {
        'EFFECTIVE_DATE': 'Effective_Date',
        'SALESPERSON': 'Salesperson',
        'CATEGORY': 'Category',
        'AMOUNT': 'Amount',
        'NOTE': 'Note',
    },
    'VC_CLIENT_NAME_MAPPING': {
        'BEFORE_NAME': 'Before_Name',
        'AFTER_NAME': 'After_Name',
        'SOURCE_SYSTEM': 'Source_System',
    },
}

def get_config(key):
    """Get configuration value from Streamlit secrets or credentials.py"""
    if IN_STREAMLIT:
        return st.secrets[key]
    else:
        return credentials.get(key)

def get_client():
    """
    Universal Authentication for Google Sheets:
    - Works in Streamlit (uses secrets)
    - Works in Colab (uses service account file)
    - Works locally (uses service account file)
    """
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    if IN_STREAMLIT:
        # Use service account from Streamlit secrets
        service_account_info = st.secrets["SERVICE_ACCOUNT_KEY"]
        creds = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=SCOPES
        )
    else:
        # Use service account file from filesystem
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
        
        creds = service_account.Credentials.from_service_account_file(
            KEY_FILE,
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
    Works with Shared Drives.
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
    reports_folder_id = get_config("REPORTS_FOLDER_ID")
    move_file_to_folder(file_id=sh.id, folder_id=reports_folder_id)
    
    print(f"✅ Report created in reports folder: {sh.url}")
    return sh

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

# =============================================================================
# Snowflake Read Functions
# =============================================================================

def _get_snowflake_enabled():
    """Check if Snowflake is enabled via secrets."""
    if not IN_STREAMLIT:
        return False
    try:
        return st.secrets.get("use_snowflake", False)
    except Exception:
        return False


def should_use_snowflake():
    """
    Public function to check if Snowflake is the active data source.
    Use this to display data source indicators in apps.

    Returns:
        bool: True if Snowflake is enabled, False if using Google Sheets
    """
    return _get_snowflake_enabled()


def _rename_snowflake_columns(df, table_name):
    """Rename Snowflake columns to match Google Sheets format."""
    if table_name in SNOWFLAKE_COLUMN_MAP:
        column_map = SNOWFLAKE_COLUMN_MAP[table_name]
        # Only rename columns that exist in the DataFrame
        rename_dict = {k: v for k, v in column_map.items() if k in df.columns}
        df = df.rename(columns=rename_dict)
    return df


def _pivot_assignments_from_snowflake():
    """
    Pivot VC_STAFF_ASSIGNMENTS from normalized to wide format.

    Snowflake has: project_id, staff_name, month_date, allocated_hours, bill_rate, notes
    Apps expect: Project ID, Client, Project Name, Project Status, Staff Member, Bill Rate, Notes, Jan-25, Feb-25, ...
    """
    from functions.snowflake_db import query_snowflake

    query = """
    SELECT
        a.PROJECT_ID,
        p.CLIENT_NAME,
        p.PROJECT_NAME,
        p.PROJECT_STATUS,
        a.STAFF_NAME,
        a.BILL_RATE,
        a.NOTES,
        a.MONTH_DATE,
        a.ALLOCATED_HOURS
    FROM VC_STAFF_ASSIGNMENTS a
    JOIN VC_PROJECTS p ON a.PROJECT_ID = p.PROJECT_ID
    ORDER BY a.PROJECT_ID, a.STAFF_NAME, a.MONTH_DATE
    """

    df = query_snowflake(query)

    if df.empty:
        return df

    # Get the static columns (everything except month_date and allocated_hours)
    static_cols = ['PROJECT_ID', 'CLIENT_NAME', 'PROJECT_NAME', 'PROJECT_STATUS',
                   'STAFF_NAME', 'BILL_RATE', 'NOTES']

    # Create pivot table
    pivot_df = df.pivot_table(
        index=static_cols,
        columns='MONTH_DATE',
        values='ALLOCATED_HOURS',
        aggfunc='sum',
        fill_value=0
    ).reset_index()

    # Flatten column names and format date columns as "Mon-YY"
    new_columns = []
    for col in pivot_df.columns:
        if isinstance(col, (pd.Timestamp, str)) and col not in static_cols:
            try:
                date_val = pd.to_datetime(col)
                new_columns.append(date_val.strftime('%b-%y'))
            except Exception:
                new_columns.append(str(col))
        else:
            new_columns.append(col)
    pivot_df.columns = new_columns

    # Rename to match Google Sheets format
    rename_map = {
        'PROJECT_ID': 'Project ID',
        'CLIENT_NAME': 'Client',
        'PROJECT_NAME': 'Project Name',
        'PROJECT_STATUS': 'Project Status',
        'STAFF_NAME': 'Staff Member',
        'BILL_RATE': 'Bill Rate',
        'NOTES': 'Notes',
    }
    pivot_df = pivot_df.rename(columns=rename_map)

    return pivot_df


def _pivot_fixedfee_from_snowflake():
    """
    Pivot VC_FIXED_FEE_REVENUE from normalized to wide format.

    Snowflake has: project_id, month_date, revenue_amount
    Apps expect: Project ID, Client, Project Name, Project Status, Jan-25, Feb-25, ...
    """
    from functions.snowflake_db import query_snowflake

    query = """
    SELECT
        f.PROJECT_ID,
        p.CLIENT_NAME,
        p.PROJECT_NAME,
        p.PROJECT_STATUS,
        f.MONTH_DATE,
        f.REVENUE_AMOUNT
    FROM VC_FIXED_FEE_REVENUE f
    JOIN VC_PROJECTS p ON f.PROJECT_ID = p.PROJECT_ID
    ORDER BY f.PROJECT_ID, f.MONTH_DATE
    """

    df = query_snowflake(query)

    if df.empty:
        return df

    # Get the static columns
    static_cols = ['PROJECT_ID', 'CLIENT_NAME', 'PROJECT_NAME', 'PROJECT_STATUS']

    # Create pivot table
    pivot_df = df.pivot_table(
        index=static_cols,
        columns='MONTH_DATE',
        values='REVENUE_AMOUNT',
        aggfunc='sum',
        fill_value=0
    ).reset_index()

    # Flatten column names and format date columns as "Mon-YY"
    new_columns = []
    for col in pivot_df.columns:
        if isinstance(col, (pd.Timestamp, str)) and col not in static_cols:
            try:
                date_val = pd.to_datetime(col)
                new_columns.append(date_val.strftime('%b-%y'))
            except Exception:
                new_columns.append(str(col))
        else:
            new_columns.append(col)
    pivot_df.columns = new_columns

    # Rename to match Google Sheets format
    rename_map = {
        'PROJECT_ID': 'Project ID',
        'CLIENT_NAME': 'Client',
        'PROJECT_NAME': 'Project Name',
        'PROJECT_STATUS': 'Project Status',
    }
    pivot_df = pivot_df.rename(columns=rename_map)

    return pivot_df


def read_config_from_snowflake(sheet_name):
    """
    Read configuration data from Snowflake instead of Google Sheets.

    Args:
        sheet_name: The Google Sheets tab name (e.g., 'Staff', 'Benefits', 'Rules')

    Returns:
        pandas.DataFrame with data matching the Google Sheets column format
    """
    from functions.snowflake_db import read_table

    # Handle special cases that need pivoting
    if sheet_name == 'Assignments':
        return _pivot_assignments_from_snowflake()
    elif sheet_name == 'FixedFee':
        return _pivot_fixedfee_from_snowflake()

    # Get the Snowflake table name
    table_name = SNOWFLAKE_TABLE_MAP.get(sheet_name)
    if not table_name:
        raise ValueError(f"Unknown sheet name: {sheet_name}. Valid options: {list(SNOWFLAKE_TABLE_MAP.keys())}")

    # Read the table
    df = read_table(table_name)

    # Rename columns to match Google Sheets format
    df = _rename_snowflake_columns(df, table_name)

    return df


# =============================================================================
# Original Google Sheets Functions (updated for dual mode)
# =============================================================================

def read_config(spreadsheet_id, sheet_name, use_snowflake=None):
    """
    Reads a configuration tab into a DataFrame.

    Supports dual mode:
    - When use_snowflake=True (or st.secrets['use_snowflake']=True), reads from Snowflake
    - Otherwise, reads from Google Sheets (default)

    Args:
        spreadsheet_id: Google Sheets spreadsheet ID (ignored when using Snowflake)
        sheet_name: Name of the sheet/tab to read
        use_snowflake: Override for Snowflake mode (default: uses st.secrets['use_snowflake'])

    Returns:
        pandas.DataFrame with the configuration data
    """
    # Determine if Snowflake should be used
    if use_snowflake is None:
        use_snowflake = _get_snowflake_enabled()

    if use_snowflake:
        try:
            return read_config_from_snowflake(sheet_name)
        except Exception as e:
            print(f"⚠️ Snowflake read failed for '{sheet_name}', falling back to Google Sheets: {e}")
            # Fall through to Google Sheets

    # Original Google Sheets logic
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


# Alias for compatibility
def get_data(spreadsheet_id, sheet_name, use_snowflake=None):
    """Alias for read_config for backward compatibility."""
    return read_config(spreadsheet_id, sheet_name, use_snowflake=use_snowflake)
