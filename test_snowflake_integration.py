"""
Test script to validate Snowflake integration with the shared sheets module.
Run this as a Streamlit app: streamlit run test_snowflake_integration.py
"""

import streamlit as st
import sys
sys.path.insert(0, '.')

from functions import sheets

st.set_page_config(page_title="Snowflake Integration Test", page_icon="🧪")
st.title("🧪 Snowflake Integration Test")

# Get config sheet ID
try:
    CONFIG_SHEET_ID = st.secrets["SHEET_CONFIG_ID"]
except Exception as e:
    st.error(f"Could not get SHEET_CONFIG_ID from secrets: {e}")
    st.stop()

# Check if Snowflake is configured
snowflake_configured = False
try:
    sf_config = st.secrets.get("snowflake", None)
    if sf_config:
        snowflake_configured = True
        st.success("✅ Snowflake secrets configured")
    else:
        st.warning("⚠️ Snowflake secrets not configured - will only test Google Sheets")
except Exception:
    st.warning("⚠️ Snowflake secrets not configured - will only test Google Sheets")

tabs_to_test = ["Staff", "Benefits", "Rules", "Offsets", "Mapping", "Assignments", "FixedFee"]

if st.button("Run Tests", type="primary"):
    results = []

    for tab in tabs_to_test:
        st.markdown(f"### Testing: {tab}")

        result = {"tab": tab, "sheets_rows": None, "sheets_cols": None,
                  "snow_rows": None, "snow_cols": None, "match": None, "error": None}

        try:
            # Google Sheets
            with st.spinner(f"Reading {tab} from Google Sheets..."):
                df_sheets = sheets.read_config(CONFIG_SHEET_ID, tab, use_snowflake=False)

            if df_sheets is not None:
                result["sheets_rows"] = len(df_sheets)
                result["sheets_cols"] = len(df_sheets.columns)
                st.write(f"**Google Sheets:** {len(df_sheets)} rows, {len(df_sheets.columns)} columns")
                st.write(f"Columns: `{df_sheets.columns.tolist()[:5]}...`")

                with st.expander("Preview Google Sheets data"):
                    st.dataframe(df_sheets.head(5))
            else:
                st.error("Google Sheets returned None")
                result["error"] = "Google Sheets returned None"
                continue

            # Snowflake (if configured)
            if snowflake_configured:
                with st.spinner(f"Reading {tab} from Snowflake..."):
                    df_snow = sheets.read_config(CONFIG_SHEET_ID, tab, use_snowflake=True)

                if df_snow is not None:
                    result["snow_rows"] = len(df_snow)
                    result["snow_cols"] = len(df_snow.columns)
                    st.write(f"**Snowflake:** {len(df_snow)} rows, {len(df_snow.columns)} columns")
                    st.write(f"Columns: `{df_snow.columns.tolist()[:5]}...`")

                    with st.expander("Preview Snowflake data"):
                        st.dataframe(df_snow.head(5))

                    # Compare
                    if len(df_sheets) == len(df_snow):
                        st.success(f"✅ Row counts match: {len(df_sheets)}")
                        result["match"] = True
                    else:
                        st.error(f"❌ Row count mismatch: Sheets={len(df_sheets)}, Snowflake={len(df_snow)}")
                        result["match"] = False

                    # Compare columns
                    sheets_cols = set(df_sheets.columns)
                    snow_cols = set(df_snow.columns)
                    if sheets_cols == snow_cols:
                        st.success("✅ Column names match")
                    else:
                        missing_in_snow = sheets_cols - snow_cols
                        extra_in_snow = snow_cols - sheets_cols
                        if missing_in_snow:
                            st.warning(f"⚠️ Missing in Snowflake: {missing_in_snow}")
                        if extra_in_snow:
                            st.info(f"ℹ️ Extra in Snowflake: {extra_in_snow}")
                else:
                    st.error("Snowflake returned None")
                    result["error"] = "Snowflake returned None"

        except Exception as e:
            st.error(f"❌ Error: {e}")
            result["error"] = str(e)

        results.append(result)
        st.divider()

    # Summary
    st.markdown("## Summary")

    summary_data = []
    for r in results:
        status = "✅" if r["match"] else ("❌" if r["match"] is False else "⚠️")
        summary_data.append({
            "Tab": r["tab"],
            "Sheets Rows": r["sheets_rows"],
            "Snowflake Rows": r["snow_rows"],
            "Match": status,
            "Error": r["error"] or ""
        })

    import pandas as pd
    st.dataframe(pd.DataFrame(summary_data), use_container_width=True)

    all_passed = all(r["match"] is True for r in results if snowflake_configured)
    if snowflake_configured and all_passed:
        st.balloons()
        st.success("🎉 All tests passed! Ready to enable Snowflake.")
    elif not snowflake_configured:
        st.info("ℹ️ Add Snowflake secrets to test the full integration.")
