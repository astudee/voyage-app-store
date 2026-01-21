#!/usr/bin/env python3
"""
CLI test script to validate Snowflake integration with the shared sheets module.
Run with: python test_snowflake_cli.py
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Check if running in Streamlit context (needed for secrets)
try:
    import streamlit as st
    # Try to access secrets to verify we're in proper context
    CONFIG_SHEET_ID = st.secrets.get("SHEET_CONFIG_ID")
    if not CONFIG_SHEET_ID:
        print("ERROR: SHEET_CONFIG_ID not found in Streamlit secrets")
        print("This script must be run with: streamlit run test_snowflake_cli.py")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: Could not access Streamlit secrets: {e}")
    print("")
    print("This script requires Streamlit secrets. Run with:")
    print("  streamlit run test_snowflake_cli.py")
    print("")
    print("Or set environment variables for direct testing:")
    print("  SHEET_CONFIG_ID, GOOGLE_SERVICE_ACCOUNT_KEY")
    print("  SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD, etc.")
    sys.exit(1)

from functions import sheets

def main():
    print("=" * 60)
    print("Snowflake Integration Test")
    print("=" * 60)
    print(f"Config Sheet ID: {CONFIG_SHEET_ID[:20]}...")
    print("")

    # Check Snowflake configuration
    try:
        sf_config = st.secrets.get("snowflake", None)
        if sf_config:
            print("✅ Snowflake secrets configured")
            snowflake_configured = True
        else:
            print("⚠️  Snowflake secrets NOT configured - will only test Google Sheets")
            snowflake_configured = False
    except Exception:
        print("⚠️  Snowflake secrets NOT configured - will only test Google Sheets")
        snowflake_configured = False

    print("")

    tabs_to_test = ["Staff", "Benefits", "Rules", "Offsets", "Mapping", "Assignments", "FixedFee"]
    results = []

    for tab in tabs_to_test:
        print(f"\n{'=' * 50}")
        print(f"Testing: {tab}")
        print('=' * 50)

        result = {
            "tab": tab,
            "sheets_rows": None,
            "sheets_cols": None,
            "snow_rows": None,
            "snow_cols": None,
            "match": None,
            "error": None
        }

        try:
            # Google Sheets
            print(f"  Reading from Google Sheets...")
            df_sheets = sheets.read_config(CONFIG_SHEET_ID, tab, use_snowflake=False)

            if df_sheets is not None:
                result["sheets_rows"] = len(df_sheets)
                result["sheets_cols"] = len(df_sheets.columns)
                print(f"  Google Sheets: {len(df_sheets)} rows, {len(df_sheets.columns)} cols")
                print(f"  Columns: {df_sheets.columns.tolist()[:5]}...")
            else:
                print(f"  ❌ Google Sheets returned None")
                result["error"] = "Google Sheets returned None"
                results.append(result)
                continue

            # Snowflake (if configured)
            if snowflake_configured:
                print(f"  Reading from Snowflake...")
                df_snow = sheets.read_config(CONFIG_SHEET_ID, tab, use_snowflake=True)

                if df_snow is not None:
                    result["snow_rows"] = len(df_snow)
                    result["snow_cols"] = len(df_snow.columns)
                    print(f"  Snowflake: {len(df_snow)} rows, {len(df_snow.columns)} cols")
                    print(f"  Columns: {df_snow.columns.tolist()[:5]}...")

                    # Compare row counts
                    if len(df_sheets) == len(df_snow):
                        print(f"  ✅ Row counts match: {len(df_sheets)}")
                        result["match"] = True
                    else:
                        print(f"  ❌ Row count mismatch: Sheets={len(df_sheets)}, Snowflake={len(df_snow)}")
                        result["match"] = False

                    # Compare columns
                    sheets_cols = set(df_sheets.columns)
                    snow_cols = set(df_snow.columns)
                    if sheets_cols == snow_cols:
                        print(f"  ✅ Column names match")
                    else:
                        missing = sheets_cols - snow_cols
                        extra = snow_cols - sheets_cols
                        if missing:
                            print(f"  ⚠️  Missing in Snowflake: {missing}")
                        if extra:
                            print(f"  ℹ️  Extra in Snowflake: {extra}")
                else:
                    print(f"  ❌ Snowflake returned None")
                    result["error"] = "Snowflake returned None"

        except Exception as e:
            print(f"  ❌ Error: {e}")
            result["error"] = str(e)

        results.append(result)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"{'Tab':<15} {'Sheets':<12} {'Snowflake':<12} {'Status':<10}")
    print("-" * 60)

    all_passed = True
    for r in results:
        sheets_info = f"{r['sheets_rows']} rows" if r['sheets_rows'] else "N/A"
        snow_info = f"{r['snow_rows']} rows" if r['snow_rows'] else "N/A"

        if r["match"] is True:
            status = "✅ Match"
        elif r["match"] is False:
            status = "❌ Mismatch"
            all_passed = False
        elif r["error"]:
            status = "❌ Error"
            all_passed = False
        else:
            status = "⚠️  N/A"

        print(f"{r['tab']:<15} {sheets_info:<12} {snow_info:<12} {status:<10}")

    print("=" * 60)

    if snowflake_configured and all_passed:
        print("\n🎉 All tests passed! Ready to enable Snowflake globally.")
        return 0
    elif not snowflake_configured:
        print("\nℹ️  Add Snowflake secrets to test the full integration.")
        return 0
    else:
        print("\n❌ Some tests failed. Review errors above.")
        return 1


if __name__ == "__main__":
    # For Streamlit, we need to run the main function
    sys.exit(main())
