# Google Sheets Usage Audit

## Summary

| Metric | Count |
|--------|-------|
| Total apps scanned | 19 |
| Apps using Google Sheets | 10 |
| Apps NOT using Google Sheets | 9 |
| GitHub Workflows | 3 |
| Workflows using Google Sheets | 1 |

---

## GitHub Workflows

| Workflow | File | Script | Uses Google Sheets? | Tabs |
|----------|------|--------|---------------------|------|
| Time Reviewer Report | `.github/workflows/time_reviewer.yml` | `scripts/scheduled_time_reviewer.py` | **Yes** | Staff, Assignments |
| Sales Snapshot Report | `.github/workflows/sales_snapshot.yml` | `scripts/scheduled_sales_snapshot.py` | No | - |
| Email Vault Processor | `.github/workflows/email_vault.yml` | `scripts/email_vault_cron.py` | No | - |

### Workflow: Time Reviewer Report (`time_reviewer.yml`)

**Schedule:** Mondays & Tuesdays at 7 AM CT

**Runs:** `scripts/scheduled_time_reviewer.py`

**Environment Variables:**
- `SHEET_CONFIG_ID` - References `Voyage_Global_Config`

**Google Sheets Usage:**
| Tab | Line | Code |
|-----|------|------|
| Staff | 140 | `read_google_sheet(SHEET_CONFIG_ID, "Staff")` |
| Assignments | 271 | `read_google_sheet(SHEET_CONFIG_ID, "Assignments")` |

**Note:** This script has its own `read_google_sheet()` function and does NOT use the shared `functions/sheets.py` module. Will need separate migration work.

---

### Workflow: Sales Snapshot Report (`sales_snapshot.yml`)

**Schedule:** Fridays at 9 AM & 2 PM CT, 1st of month at 9 AM CT

**Runs:** `scripts/scheduled_sales_snapshot.py`

**Uses:** Pipedrive API only - no Google Sheets dependency

---

### Workflow: Email Vault Processor (`email_vault.yml`)

**Schedule:** Every 15 minutes

**Runs:** `scripts/email_vault_cron.py`

**Uses:** Google Drive API (for file processing) - no Voyage_Global_Config dependency

---

## Shared Module

All Google Sheets access goes through a centralized helper:

**File:** `functions/sheets.py`

**Key Function:**
```python
sheets.read_config(spreadsheet_id, sheet_name) → DataFrame
```

**Used by:** 10 apps + 1 scheduled script

**Migration Impact:** Updating this single module could migrate most apps automatically.

---

## Apps Using Google Sheets

### App 01: Commission Calculator (`01_💰_Commission_Calculator.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Rules | 50 | `sheets.read_config(CONFIG_SHEET_ID, "Rules")` |
| Offsets | 51 | `sheets.read_config(CONFIG_SHEET_ID, "Offsets")` |
| Mapping | 52 | `sheets.read_config(CONFIG_SHEET_ID, "Mapping")` |

**Usage:** Calculates sales commissions based on rules, offsets, and client name mappings.

---

### App 04: Billable Hours Report (`04_📊_Billable_Hours_Report.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 538 | `worksheet = sh.worksheet('Staff')` (direct gspread) |

**Note:** Uses direct gspread calls, not the shared `sheets.read_config()` function. Also has Excel upload fallback.

**Usage:** Identifies active employees for billable hours filtering.

---

### App 05: Bonus Calculator (`05_💰_Bonus_Calculator.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 117-118 | `worksheet = sh.worksheet('Staff')` / `worksheet.get_all_records()` |

**Note:** Uses direct gspread calls, not the shared module.

**Usage:** Loads staff salary and bonus target data.

---

### App 06: Time Reviewer (`06_⏰_Time_Reviewer.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 290 | `sheets.read_config(config_sheet_id, "Staff")` |
| Assignments | 453 | `sheets.read_config(config_sheet_id, "Assignments")` |

**Usage:** Validates time entries against staff list and project assignments.

---

### App 08: Benefits Calculator (`08_💊_Benefits_Calculator.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 43 | `sheets.read_config(config_sheet_id, "Staff")` |
| Benefits | 44 | `sheets.read_config(config_sheet_id, "Benefits")` |

**Usage:** Calculates employee benefits costs.

---

### App 09: Payroll Calculator (`09_💵_Payroll_Calculator.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 37 | `sheets.read_config(config_sheet_id, "Staff")` |
| Benefits | 38 | `sheets.read_config(config_sheet_id, "Benefits")` |

**Usage:** Calculates payroll including benefits.

---

### App 10: Payroll Helper (`10_💵_Payroll_Helper.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 77 | `sheets.read_config(CONFIG_SHEET_ID, "Staff")` |

**Usage:** Assists with payroll processing using staff roster.

---

### App 11: Contractor Fee Reviewer (`11_💼_Contractor_Fee_Reviewer.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 177 | `sheets.read_config(CONFIG_SHEET_ID, "Staff")` |

**Usage:** Identifies contractors from staff list for fee review.

---

### App 12: Forecasted Billable Hours (`12_📈_Forecasted_Billable_Hours.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Assignments | 99 | `sheets.read_config(CONFIG_SHEET_ID, "Assignments")` |
| Staff | 112 | `sheets.read_config(CONFIG_SHEET_ID, "Staff")` |

**Usage:** Forecasts billable hours based on project assignments.

---

### App 14: Project Health Monitor (`14_📊_Project_Health_Monitor.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Assignments | 255 | `sheets.read_config(CONFIG_SHEET_ID, "Assignments")` |

**Usage:** Monitors project health using assignment data.

---

### App 15: Resource Checker (`15_🎯_Resource_Checker.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Assignments | 88 | `sheets.read_config(CONFIG_SHEET_ID, "Assignments")` |

**Usage:** Checks resource allocation from assignments.

---

### App 16: Revenue Forecaster (`16_📊_Revenue_Forecaster.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Assignments | 309 | `sheets.read_config(CONFIG_SHEET_ID, "Assignments")` |
| FixedFee | 318 | `sheets.read_config(CONFIG_SHEET_ID, "FixedFee")` |

**Usage:** Forecasts revenue from T&M assignments and fixed fee projects.

---

### App 99: Connection Health Checker (`99_🏥_Connection_Health_Checker.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 225 | `sheets.read_config(config_sheet_id, "Staff")` |

**Usage:** Tests Google Sheets connectivity as part of health checks.

---

### Script: Scheduled Time Reviewer (`scripts/scheduled_time_reviewer.py`)

| Tabs Used | Line | Code |
|-----------|------|------|
| Staff | 140 | `read_google_sheet(SHEET_CONFIG_ID, "Staff")` |
| Assignments | 271 | `read_google_sheet(SHEET_CONFIG_ID, "Assignments")` |

**Note:** Has its own `read_google_sheet()` function, doesn't use the shared module.

**Usage:** Automated time review that runs on a schedule.

---

## Apps NOT Using Google Sheets

| App | File | Notes |
|-----|------|-------|
| 02 | `02_📧_Email_to_To_File.py` | Email/file processing only |
| 03 | `03_📁_To_File_to_Vault.py` | File management only |
| 07 | `07_💳_Expense_Reviewer.py` | Uses BigTime/QuickBooks APIs |
| 13 | `13_📊_Bookings_Tracker.py` | Uses Pipedrive API |
| 17 | `17_📝_Contract_Reviewer.py` | Document processing only |
| 18 | `18_📈_Sales_Snapshot.py` | Uses Pipedrive API |
| 96 | `96_❄️_Snowflake_Test.py` | Snowflake testing utility |
| 97 | `97_🔍_BigTime_Client_Lookup.py` | BigTime API only |
| 98 | `98_🔑_QuickBooks_Token_Refresh.py` | QuickBooks auth only |

---

## Tab Usage Summary

| Tab | Apps Using It |
|-----|---------------|
| **Staff** | 01, 04, 05, 06, 08, 09, 10, 11, 12, 99, scheduled_time_reviewer |
| **Benefits** | 08, 09 |
| **Rules** | 01 |
| **Offsets** | 01 |
| **Mapping** | 01 |
| **Assignments** | 06, 12, 14, 15, 16, scheduled_time_reviewer |
| **FixedFee** | 16 |

---

## Recommended Migration Order

### Phase 1: Update Shared Module (Highest Impact)

Update `functions/sheets.py` to read from Snowflake instead of Google Sheets.

**Option A - Dual Mode:** Add a toggle to read from Snowflake or Google Sheets
```python
def read_config(spreadsheet_id, sheet_name, use_snowflake=False):
    if use_snowflake:
        return read_from_snowflake(sheet_name)
    else:
        return read_from_google_sheets(spreadsheet_id, sheet_name)
```

**Option B - Full Migration:** Replace Google Sheets calls with Snowflake queries

**Apps automatically migrated:** 01, 06, 08, 09, 10, 11, 12, 14, 15, 16, 99 (11 apps)

---

### Phase 2: Fix Direct gspread Users

These apps bypass the shared module and need individual updates:

| App | Effort | Notes |
|-----|--------|-------|
| 04 Billable Hours Report | Medium | Has Excel fallback already |
| 05 Bonus Calculator | Low | Simple Staff tab read |

---

### Phase 3: Fix Scheduled Script & Workflow

| Script | Workflow | Effort | Notes |
|--------|----------|--------|-------|
| `scheduled_time_reviewer.py` | `time_reviewer.yml` | Medium | Has its own `read_google_sheet()` function, doesn't use shared module |

**Note:** The workflow will also need `SNOWFLAKE_*` secrets added to GitHub repository settings.

---

## Snowflake Table Mapping

| Google Sheets Tab | Snowflake Table |
|-------------------|-----------------|
| Staff | `VC_STAFF` |
| Benefits | `VC_BENEFITS` |
| Rules | `VC_COMMISSION_RULES` |
| Offsets | `VC_COMMISSION_OFFSETS` |
| Mapping | `VC_CLIENT_NAME_MAPPING` |
| Assignments | `VC_STAFF_ASSIGNMENTS` (normalized) |
| FixedFee | `VC_FIXED_FEE_REVENUE` (normalized) |

**Note:** Assignments and FixedFee are normalized in Snowflake (rows instead of monthly columns). Apps reading these tabs will need query logic to pivot the data back to wide format if needed, or be updated to work with the normalized format.

---

## Migration Complexity Estimate

| Complexity | Apps |
|------------|------|
| **Easy** (uses shared module, simple tabs) | 08, 09, 10, 11, 99 |
| **Medium** (uses shared module, Assignments tab) | 06, 12, 14, 15 |
| **Medium** (uses shared module, multiple tabs) | 01, 16 |
| **Harder** (direct gspread, needs refactor) | 04, 05 |
| **Separate** (scheduled script) | scheduled_time_reviewer.py |
