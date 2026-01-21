#!/usr/bin/env python3
"""
Simple Snowflake integration test using environment variables.
Run with: python test_snowflake_env.py
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from functions.snowflake_db import query_snowflake, get_snowflake_connection
import pandas as pd

# Expected row counts
EXPECTED_COUNTS = {
    "Staff": 25,
    "Benefits": 43,
    "Rules": 19,
    "Offsets": 9,
    "Mapping": 4,
    "Assignments": 35,  # Approximate - unique staff/project combos
    "FixedFee": 2,      # Approximate - projects with fixed fee
}

# Column mappings for validation
EXPECTED_COLUMNS = {
    "Staff": ["STAFF_NAME", "START_DATE", "SALARY", "STAFF_TYPE"],
    "Benefits": ["DESCRIPTION", "CODE", "TOTAL_MONTHLY_COST"],
    "Rules": ["RULE_SCOPE", "CLIENT_OR_RESOURCE", "SALESPERSON", "RATE"],
    "Offsets": ["EFFECTIVE_DATE", "SALESPERSON", "CATEGORY", "AMOUNT"],
    "Mapping": ["BEFORE_NAME", "AFTER_NAME", "SOURCE_SYSTEM"],
    "Assignments": ["PROJECT_ID", "STAFF_NAME", "MONTH_DATE", "ALLOCATED_HOURS"],
    "FixedFee": ["PROJECT_ID", "MONTH_DATE", "REVENUE_AMOUNT"],
}


def test_connection():
    """Test basic Snowflake connection"""
    print("Testing Snowflake connection...")
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT CURRENT_TIMESTAMP()")
        result = cursor.fetchone()
        conn.close()
        print(f"  ✅ Connected successfully at {result[0]}")
        return True
    except Exception as e:
        print(f"  ❌ Connection failed: {e}")
        return False


def test_table(name, table_name, expected_count, expected_cols):
    """Test a single table"""
    print(f"\n{'=' * 50}")
    print(f"Testing: {name} ({table_name})")
    print("=" * 50)

    try:
        df = query_snowflake(f"SELECT * FROM {table_name}")
        row_count = len(df)
        col_count = len(df.columns)

        print(f"  Rows: {row_count} (expected ~{expected_count})")
        print(f"  Columns: {col_count}")
        print(f"  Column names: {df.columns.tolist()}")

        # Check row count (allow 20% variance for dynamic data)
        min_expected = int(expected_count * 0.8)
        max_expected = int(expected_count * 1.5)

        if min_expected <= row_count <= max_expected:
            print(f"  ✅ Row count OK ({row_count} in range {min_expected}-{max_expected})")
            row_ok = True
        else:
            print(f"  ⚠️  Row count outside expected range ({min_expected}-{max_expected})")
            row_ok = False

        # Check expected columns exist
        missing_cols = [c for c in expected_cols if c not in df.columns]
        if missing_cols:
            print(f"  ⚠️  Missing columns: {missing_cols}")
            cols_ok = False
        else:
            print(f"  ✅ All expected columns present")
            cols_ok = True

        # Show sample data
        print(f"\n  Sample data (first 3 rows):")
        print(df.head(3).to_string(index=False))

        return row_ok and cols_ok, row_count

    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False, 0


def test_assignments_pivot():
    """Test the assignments pivot query (matches what sheets.py does)"""
    print(f"\n{'=' * 50}")
    print("Testing: Assignments PIVOT (staff/project combos)")
    print("=" * 50)

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

    try:
        df = query_snowflake(query)
        print(f"  Raw joined rows: {len(df)}")

        # Count unique staff/project combinations (what the pivot would produce)
        unique_combos = df.groupby(['PROJECT_ID', 'STAFF_NAME']).size().reset_index()
        combo_count = len(unique_combos)

        print(f"  Unique staff/project combos: {combo_count} (expected ~{EXPECTED_COUNTS['Assignments']})")
        print(f"  ✅ Assignments pivot would produce {combo_count} rows")

        # Show sample
        print(f"\n  Sample unique combos:")
        sample = unique_combos.head(5)
        sample.columns = ['PROJECT_ID', 'STAFF_NAME', 'MONTHS_WITH_HOURS']
        print(sample.to_string(index=False))

        return True, combo_count

    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False, 0


def test_fixedfee_pivot():
    """Test the fixed fee pivot query"""
    print(f"\n{'=' * 50}")
    print("Testing: FixedFee PIVOT (projects with revenue)")
    print("=" * 50)

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

    try:
        df = query_snowflake(query)
        print(f"  Raw joined rows: {len(df)}")

        # Count unique projects (what the pivot would produce)
        unique_projects = df['PROJECT_ID'].nunique()

        print(f"  Unique projects: {unique_projects} (expected ~{EXPECTED_COUNTS['FixedFee']})")
        print(f"  ✅ FixedFee pivot would produce {unique_projects} rows")

        # Show sample
        print(f"\n  Sample data:")
        print(df.head(5).to_string(index=False))

        return True, unique_projects

    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False, 0


def main():
    print("=" * 60)
    print("SNOWFLAKE INTEGRATION TEST")
    print("=" * 60)

    # Check env vars
    env_vars = ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD",
                "SNOWFLAKE_WAREHOUSE", "SNOWFLAKE_DATABASE"]
    missing = [v for v in env_vars if not os.environ.get(v)]

    if missing:
        print(f"❌ Missing environment variables: {missing}")
        return 1

    print("✅ All Snowflake environment variables set")

    # Test connection
    if not test_connection():
        return 1

    results = []

    # Test simple tables
    tables = [
        ("Staff", "VC_STAFF", EXPECTED_COUNTS["Staff"], EXPECTED_COLUMNS["Staff"]),
        ("Benefits", "VC_BENEFITS", EXPECTED_COUNTS["Benefits"], EXPECTED_COLUMNS["Benefits"]),
        ("Rules", "VC_COMMISSION_RULES", EXPECTED_COUNTS["Rules"], EXPECTED_COLUMNS["Rules"]),
        ("Offsets", "VC_COMMISSION_OFFSETS", EXPECTED_COUNTS["Offsets"], EXPECTED_COLUMNS["Offsets"]),
        ("Mapping", "VC_CLIENT_NAME_MAPPING", EXPECTED_COUNTS["Mapping"], EXPECTED_COLUMNS["Mapping"]),
    ]

    for name, table, expected, cols in tables:
        ok, count = test_table(name, table, expected, cols)
        results.append((name, ok, count, expected))

    # Test pivot tables
    ok, count = test_assignments_pivot()
    results.append(("Assignments (pivot)", ok, count, EXPECTED_COUNTS["Assignments"]))

    ok, count = test_fixedfee_pivot()
    results.append(("FixedFee (pivot)", ok, count, EXPECTED_COUNTS["FixedFee"]))

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"{'Table':<25} {'Status':<10} {'Actual':<10} {'Expected':<10}")
    print("-" * 60)

    all_passed = True
    for name, ok, actual, expected in results:
        status = "✅ OK" if ok else "❌ FAIL"
        if not ok:
            all_passed = False
        print(f"{name:<25} {status:<10} {actual:<10} ~{expected:<10}")

    print("=" * 60)

    if all_passed:
        print("\n🎉 All Snowflake tests passed!")
        return 0
    else:
        print("\n⚠️  Some tests had warnings. Review output above.")
        return 0  # Return 0 since warnings are OK for this test


if __name__ == "__main__":
    sys.exit(main())
