"""
Snowflake database connection utilities for Voyage App Store.
Provides connection management and query execution for Snowflake data sources.
"""

import pandas as pd
import snowflake.connector

# Detect environment
try:
    import streamlit as st
    IN_STREAMLIT = True
except ImportError:
    IN_STREAMLIT = False


def get_snowflake_connection():
    """
    Get a Snowflake connection using Streamlit secrets.

    Expected secrets structure:
        [snowflake]
        account = "sf18359.us-central1.gcp"
        user = "VOYAGE_APP_STORE_USER"
        password = "..."
        warehouse = "COMPUTE_WH"
        database = "VOYAGE_APP_STORE"
        schema = "PUBLIC"

    Returns:
        snowflake.connector.connection.SnowflakeConnection
    """
    if not IN_STREAMLIT:
        raise RuntimeError("Snowflake connection requires Streamlit secrets. Not available outside Streamlit.")

    sf_config = st.secrets["snowflake"]

    return snowflake.connector.connect(
        account=sf_config["account"],
        user=sf_config["user"],
        password=sf_config["password"],
        warehouse=sf_config["warehouse"],
        database=sf_config["database"],
        schema=sf_config["schema"]
    )


def query_snowflake(query, params=None):
    """
    Execute a query and return results as a DataFrame.

    Args:
        query: SQL query string
        params: Optional parameters for parameterized queries

    Returns:
        pandas.DataFrame with query results
    """
    conn = get_snowflake_connection()
    try:
        cursor = conn.cursor()
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)

        # Get column names
        columns = [desc[0] for desc in cursor.description]

        # Fetch all rows
        rows = cursor.fetchall()

        return pd.DataFrame(rows, columns=columns)
    finally:
        conn.close()


def read_table(table_name):
    """
    Read an entire table into a DataFrame.

    Args:
        table_name: Name of the table (with or without VC_ prefix)

    Returns:
        pandas.DataFrame with all rows from the table
    """
    # Ensure table name is uppercase for Snowflake
    table_name = table_name.upper()

    # Add VC_ prefix if not present
    if not table_name.startswith('VC_'):
        table_name = f'VC_{table_name}'

    query = f'SELECT * FROM {table_name}'
    return query_snowflake(query)
