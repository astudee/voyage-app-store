#!/usr/bin/env python3
"""
Migration script to load Voyage Global Config from Excel to Snowflake.
Tables are created with VC_ prefix in PUBLIC schema.
"""

import pandas as pd
import snowflake.connector
from datetime import datetime
import numpy as np

# Snowflake connection config
SNOWFLAKE_CONFIG = {
    'account': 'sf18359.us-central1.gcp',
    'user': 'VOYAGE_APP_STORE_USER',
    'password': 'VoyageAppStore2026!',
    'warehouse': 'COMPUTE_WH',
    'database': 'VOYAGE_APP_STORE',
    'schema': 'PUBLIC'
}

EXCEL_FILE = 'uploads/Voyage_Global_Config 2026.01.21.xlsx'


def get_connection():
    """Get Snowflake connection."""
    return snowflake.connector.connect(**SNOWFLAKE_CONFIG)


def convert_date(val):
    """Convert various date formats to date string."""
    if pd.isna(val):
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    if isinstance(val, str):
        return val
    return str(val)


def convert_decimal(val):
    """Convert value to decimal, handling NaN."""
    if pd.isna(val):
        return None
    return float(val)


def convert_bool(val):
    """Convert value to boolean."""
    if pd.isna(val):
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ('true', 'yes', '1', 'y')
    return bool(val)


def derive_benefit_type(code):
    """Derive benefit type from code prefix."""
    if pd.isna(code) or not code:
        return None
    code = str(code).upper()
    if code.startswith('M'):
        return 'Medical'
    elif code.startswith('D'):
        return 'Dental'
    elif code.startswith('V'):
        return 'Vision'
    elif code.startswith('S'):
        return 'STD'
    elif code.startswith('L'):
        return 'LTD'
    elif code.startswith('T'):
        return 'Life'
    return None


def month_end_to_start(date_val):
    """Convert end-of-month date to first-of-month."""
    if pd.isna(date_val):
        return None
    if isinstance(date_val, datetime):
        return date_val.replace(day=1).strftime('%Y-%m-%d')
    return None


def load_staff(conn, xlsx):
    """Load Staff table."""
    print("\nLoading VC_STAFF...")
    df = pd.read_excel(xlsx, sheet_name='Staff')

    cur = conn.cursor()
    cur.execute("DELETE FROM VC_STAFF")

    insert_sql = """
    INSERT INTO VC_STAFF (staff_name, start_date, salary, utilization_bonus_target,
        other_bonus_target, medical_plan_code, dental_plan_code, vision_plan_code,
        std_code, ltd_code, life_code, addl_life_code, phone_allowance, staff_type, notes)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    rows = []
    for _, row in df.iterrows():
        rows.append((
            row['Staff_Name'],
            convert_date(row.get('Start_Date')),
            convert_decimal(row.get('Salary')),
            convert_decimal(row.get('Utilization_Bonus_Target')),
            convert_decimal(row.get('Other_Bonus_Target')),
            row.get('Medical_Plan') if pd.notna(row.get('Medical_Plan')) else None,
            row.get('Dental_Plan') if pd.notna(row.get('Dental_Plan')) else None,
            row.get('Vision_Plan') if pd.notna(row.get('Vision_Plan')) else None,
            row.get('STD') if pd.notna(row.get('STD')) else None,
            row.get('LTD') if pd.notna(row.get('LTD')) else None,
            row.get('Life') if pd.notna(row.get('Life')) else None,
            row.get('Addl Life') if pd.notna(row.get('Addl Life')) else None,
            convert_decimal(row.get('Phone_Allowance')),
            row.get('Type') if pd.notna(row.get('Type')) else None,
            row.get('Notes') if pd.notna(row.get('Notes')) else None,
        ))

    cur.executemany(insert_sql, rows)
    print(f"  Inserted {len(rows)} rows")
    return len(rows)


def load_benefits(conn, xlsx):
    """Load Benefits table."""
    print("\nLoading VC_BENEFITS...")
    df = pd.read_excel(xlsx, sheet_name='Benefits')

    cur = conn.cursor()
    cur.execute("DELETE FROM VC_BENEFITS")

    insert_sql = """
    INSERT INTO VC_BENEFITS (description, code, benefit_type, is_formula_based,
        total_monthly_cost, ee_monthly_cost, firm_monthly_cost, coverage_percentage,
        max_weekly_benefit, max_monthly_benefit, rate_per_unit)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    rows = []
    for _, row in df.iterrows():
        code = row.get('Code')
        rows.append((
            row['Description'],
            code,
            derive_benefit_type(code),
            convert_bool(row.get('Is_Formula_Based')),
            convert_decimal(row.get('Total_Monthly_Cost')),
            convert_decimal(row.get('EE_Monthly_Cost')),
            convert_decimal(row.get('Firm_Monthly_Cost')),
            convert_decimal(row.get('Coverage_Percentage')),
            convert_decimal(row.get('Max_Weekly_Benefit')),
            convert_decimal(row.get('Max_Monthly_Benefit')),
            convert_decimal(row.get('Rate_Per_Unit')),
        ))

    cur.executemany(insert_sql, rows)
    print(f"  Inserted {len(rows)} rows")
    return len(rows)


def load_commission_rules(conn, xlsx):
    """Load Commission Rules table."""
    print("\nLoading VC_COMMISSION_RULES...")
    df = pd.read_excel(xlsx, sheet_name='Rules')

    cur = conn.cursor()
    cur.execute("DELETE FROM VC_COMMISSION_RULES")

    insert_sql = """
    INSERT INTO VC_COMMISSION_RULES (rule_scope, client_or_resource, salesperson,
        category, rate, start_date, end_date, note)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    rows = []
    for _, row in df.iterrows():
        rows.append((
            row['Rule_Scope'],
            row['Client_or_Resource'],
            row['Salesperson'],
            row['Category'],
            convert_decimal(row['Rate']),
            convert_date(row['Start_Date']),
            convert_date(row.get('End_Date')),
            row.get('Note') if pd.notna(row.get('Note')) else None,
        ))

    cur.executemany(insert_sql, rows)
    print(f"  Inserted {len(rows)} rows")
    return len(rows)


def load_commission_offsets(conn, xlsx):
    """Load Commission Offsets table."""
    print("\nLoading VC_COMMISSION_OFFSETS...")
    df = pd.read_excel(xlsx, sheet_name='Offsets')

    cur = conn.cursor()
    cur.execute("DELETE FROM VC_COMMISSION_OFFSETS")

    insert_sql = """
    INSERT INTO VC_COMMISSION_OFFSETS (effective_date, salesperson, category, amount, note)
    VALUES (%s, %s, %s, %s, %s)
    """

    rows = []
    for _, row in df.iterrows():
        rows.append((
            convert_date(row['Effective_Date']),
            row['Salesperson'],
            row['Category'],
            convert_decimal(row['Amount']),
            row.get('Note') if pd.notna(row.get('Note')) else None,
        ))

    cur.executemany(insert_sql, rows)
    print(f"  Inserted {len(rows)} rows")
    return len(rows)


def load_client_name_mapping(conn, xlsx):
    """Load Client Name Mapping table."""
    print("\nLoading VC_CLIENT_NAME_MAPPING...")
    df = pd.read_excel(xlsx, sheet_name='Mapping')

    cur = conn.cursor()
    cur.execute("DELETE FROM VC_CLIENT_NAME_MAPPING")

    insert_sql = """
    INSERT INTO VC_CLIENT_NAME_MAPPING (before_name, after_name, source_system)
    VALUES (%s, %s, %s)
    """

    rows = []
    for _, row in df.iterrows():
        rows.append((
            row['Before_Name'],
            row['After_Name'],
            row['Source_System'],
        ))

    cur.executemany(insert_sql, rows)
    print(f"  Inserted {len(rows)} rows")
    return len(rows)


def load_projects_and_assignments(conn, xlsx):
    """Load Projects, Staff Assignments, and Fixed Fee Revenue tables."""
    print("\nLoading VC_PROJECTS, VC_STAFF_ASSIGNMENTS, VC_FIXED_FEE_REVENUE...")

    # Read both sheets
    assignments_df = pd.read_excel(xlsx, sheet_name='Assignments')
    fixedfee_df = pd.read_excel(xlsx, sheet_name='FixedFee')

    cur = conn.cursor()
    cur.execute("DELETE FROM VC_STAFF_ASSIGNMENTS")
    cur.execute("DELETE FROM VC_FIXED_FEE_REVENUE")
    cur.execute("DELETE FROM VC_PROJECTS")

    # Collect unique projects from both sheets
    projects = {}

    # Projects from Assignments (T&M type)
    for _, row in assignments_df.iterrows():
        project_id = int(row['Project ID'])
        if project_id not in projects:
            projects[project_id] = {
                'client_name': row['Client'],
                'project_name': row['Project Name'],
                'project_status': row.get('Project Status', 'Active'),
                'project_type': 'T&M',
                'bill_rate': convert_decimal(row.get('Bill Rate')),
            }

    # Projects from FixedFee (Fixed Fee type)
    for _, row in fixedfee_df.iterrows():
        project_id = int(row['Project ID'])
        if project_id not in projects:
            projects[project_id] = {
                'client_name': row['Client'],
                'project_name': row['Project Name'],
                'project_status': row.get('Project Status', 'Active'),
                'project_type': 'Fixed Fee',
                'bill_rate': None,
            }
        else:
            # Update existing project to note it has fixed fee component
            projects[project_id]['project_type'] = 'Fixed Fee'

    # Insert projects
    project_sql = """
    INSERT INTO VC_PROJECTS (project_id, client_name, project_name, project_status, project_type, bill_rate)
    VALUES (%s, %s, %s, %s, %s, %s)
    """
    project_rows = []
    for project_id, proj in projects.items():
        project_rows.append((
            project_id,
            proj['client_name'],
            proj['project_name'],
            proj['project_status'] if pd.notna(proj['project_status']) else 'Active',
            proj['project_type'],
            proj['bill_rate'],
        ))

    cur.executemany(project_sql, project_rows)
    print(f"  VC_PROJECTS: Inserted {len(project_rows)} rows")

    # Unpivot Assignments - find monthly columns (datetime objects)
    assignment_rows = []
    monthly_cols = [col for col in assignments_df.columns if isinstance(col, datetime)]

    assignment_sql = """
    INSERT INTO VC_STAFF_ASSIGNMENTS (project_id, staff_name, month_date, allocated_hours, bill_rate, notes)
    VALUES (%s, %s, %s, %s, %s, %s)
    """

    for _, row in assignments_df.iterrows():
        project_id = int(row['Project ID'])
        staff_name = row['Staff Member']
        bill_rate = convert_decimal(row.get('Bill Rate'))
        notes = row.get('Notes') if pd.notna(row.get('Notes')) else None

        for col in monthly_cols:
            hours = row[col]
            if pd.notna(hours) and hours != 0:
                month_date = col.replace(day=1).strftime('%Y-%m-%d')
                assignment_rows.append((
                    project_id,
                    staff_name,
                    month_date,
                    convert_decimal(hours),
                    bill_rate,
                    notes,
                ))

    cur.executemany(assignment_sql, assignment_rows)
    print(f"  VC_STAFF_ASSIGNMENTS: Inserted {len(assignment_rows)} rows")

    # Unpivot FixedFee - find monthly columns
    revenue_rows = []
    ff_monthly_cols = [col for col in fixedfee_df.columns if isinstance(col, datetime)]

    revenue_sql = """
    INSERT INTO VC_FIXED_FEE_REVENUE (project_id, month_date, revenue_amount)
    VALUES (%s, %s, %s)
    """

    for _, row in fixedfee_df.iterrows():
        project_id = int(row['Project ID'])

        for col in ff_monthly_cols:
            amount = row[col]
            if pd.notna(amount) and amount != 0:
                month_date = col.replace(day=1).strftime('%Y-%m-%d')
                revenue_rows.append((
                    project_id,
                    month_date,
                    convert_decimal(amount),
                ))

    cur.executemany(revenue_sql, revenue_rows)
    print(f"  VC_FIXED_FEE_REVENUE: Inserted {len(revenue_rows)} rows")

    return len(project_rows), len(assignment_rows), len(revenue_rows)


def verify_counts(conn):
    """Verify row counts in all tables."""
    print("\n" + "="*50)
    print("VERIFICATION - Row Counts")
    print("="*50)

    cur = conn.cursor()

    tables = [
        'VC_STAFF',
        'VC_BENEFITS',
        'VC_COMMISSION_RULES',
        'VC_COMMISSION_OFFSETS',
        'VC_CLIENT_NAME_MAPPING',
        'VC_PROJECTS',
        'VC_STAFF_ASSIGNMENTS',
        'VC_FIXED_FEE_REVENUE',
    ]

    for table in tables:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        print(f"  {table}: {count} rows")


def main():
    print("="*50)
    print("Voyage Global Config Migration to Snowflake")
    print("="*50)

    # Read Excel file
    print(f"\nReading Excel file: {EXCEL_FILE}")
    xlsx = pd.ExcelFile(EXCEL_FILE)

    # Connect to Snowflake
    print("Connecting to Snowflake...")
    conn = get_connection()

    try:
        # Load each table
        load_staff(conn, xlsx)
        load_benefits(conn, xlsx)
        load_commission_rules(conn, xlsx)
        load_commission_offsets(conn, xlsx)
        load_client_name_mapping(conn, xlsx)
        load_projects_and_assignments(conn, xlsx)

        # Commit all changes
        conn.commit()
        print("\n✓ All data committed successfully!")

        # Verify
        verify_counts(conn)

    finally:
        conn.close()

    print("\n" + "="*50)
    print("Migration Complete!")
    print("="*50)


if __name__ == '__main__':
    main()
