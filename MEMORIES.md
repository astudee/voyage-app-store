# Voyage App Store - Project Memories

> This file tracks our journey and context so Claude doesn't lose track between sessions.
> **Last updated:** 2026-01-23 (Project Health Monitor fixed, 14/22 apps migrated)

---

## FOR NEW CLAUDE SESSIONS - START HERE

**Current Status:** Phase 2 COMPLETE. Phase 3 IN PROGRESS (14/22 apps migrated).

**What's Done:**
- Snowflake database with all config tables (VC_STAFF, VC_BENEFITS, VC_COMMISSION_RULES, etc.)
- Vercel/Next.js app at https://apps.voyage.xyz with 7 settings pages (full CRUD)
- Pipedrive API integration for booking validation
- All config management tools working
- **Connection Health Checker** (app 99) migrated to `/health/connection`
- **QuickBooks Token Refresh** (app 98) migrated to `/health/quickbooks`
- **BigTime Client Lookup** (app 97) migrated to `/health/bigtime`
- **Snowflake Test** (app 96) migrated to `/health/snowflake`
- **Project Health Monitor** (app 14) migrated to `/apps/project-health`
- **Commission Calculator** (app 01) migrated to `/apps/commission`
- **Billable Hours Report** (app 04) migrated to `/apps/billable-hours`
- **Bonus Calculator** (app 05) migrated to `/apps/bonus`
- **Benefits Calculator** (app 08) migrated to `/apps/benefits-calc`
- **Bookings Tracker** (app 13) migrated to `/apps/bookings`
- **Contract Reviewer** (app 17) migrated to `/apps/contract-review`
- **Document Manager** (app 02/03) migrated to `/apps/document-manager`
- **Expense Reviewer** (app 07) migrated to `/apps/expense-reviewer`
- **Contractor Fee Reviewer** (app 11) migrated to `/apps/contractor-fees`
- **Forecasted Billable Hours** (app 12) migrated to `/apps/forecasted-hours`
- **Payroll Calculator** (app 09) migrated to `/apps/payroll-calc`
- **Payroll Helper** (app 10) migrated to `/apps/payroll-helper`

**What's Next (Phase 3):** Continue migrating Streamlit apps to Vercel. Remaining apps:
1. Time Reviewer - needs BigTime API
2. Payroll Helper - needs BigTime API
3. Revenue Forecaster - uses assignments data

**Key Technical Notes:**
- BigTime API credentials are in `.env` AND Vercel environment variables
- QuickBooks API needs OAuth token refresh mechanism
- Streamlit apps are in `pages/` folder - study them before migrating
- Sister project `voyage-consultant-tools` has working examples

**Quick Commands:**
- Deploy: `npx vercel --prod --token gcsACrDUYSjDtKnf0EQda6f3`
- Test Snowflake: `curl https://apps.voyage.xyz/api/test-snowflake`
- Build: `cd web && npm run build`

---

## Project Overview

**Tech Stack:** Snowflake | Python | Vercel (Next.js)

**Sister Project:** `voyage-consultant-tools` (working reference - has successful Snowflake + Streamlit integration)

---

## The Journey - Three Phases

### Phase 1: Google Sheets → Snowflake Migration [COMPLETED]
- Migrated configuration data from Google Sheets to Snowflake
- Created 7 core tables:
  - `VC_STAFF` - Employee data (25 rows)
  - `VC_BENEFITS` - Benefits plans (43 rows)
  - `VC_COMMISSION_RULES` - Commission calculations (19 rows)
  - `VC_COMMISSION_OFFSETS` - One-time adjustments (9 rows)
  - `VC_CLIENT_NAME_MAPPING` - Client name translations (4 rows)
  - `VC_STAFF_ASSIGNMENTS` - Project allocations
  - `VC_FIXED_FEE_REVENUE` - Fixed-fee project revenue
  - `VC_PROJECTS` - Project data
- Connection tested and working as of 2026-01-22

### Phase 2: Config Tools in Vercel [COMPLETE]
- Built web-based config tools to replace Google Sheets UI
- All 7 settings pages complete with full CRUD
- Pipedrive integration for booking validation
- See "What's Built" section below for full list

### Phase 3: Streamlit → Vercel Migration [FUTURE]
Migrate apps from `pages/` folder (Streamlit) to Vercel. Full inventory below.

**Streamlit Apps Inventory (22 apps):**

| # | App | Purpose | Data Sources |
|---|-----|---------|--------------|
| 01 | Commission Calculator | Calculate sales commissions with offsets | QuickBooks, BigTime, Snowflake |
| 02 | Email to Vault | Archive "Vault" labeled emails to Drive | Gmail API |
| 03 | To File to Vault | AI-classify and file documents | Google Drive, Claude/Gemini |
| 04 | Billable Hours Report | Monthly utilization with capacity analysis | BigTime, Snowflake |
| 05 | Bonus Calculator | Employee bonuses by tier/utilization | BigTime, Snowflake |
| 06 | Time Reviewer | Weekly timesheet compliance checks | BigTime, Snowflake |
| 07 | Expense Reviewer | Expense compliance (receipts, categories) | BigTime |
| 08 | Benefits Calculator | Employee benefits cost breakdown | Snowflake |
| 09 | Payroll Calculator | Full employer cost with burden rate | Snowflake |
| 10 | Payroll Helper | Prep data for Gusto payroll entry | BigTime, Snowflake |
| 11 | Contractor Fee Reviewer | Contractor compliance and rate analysis | BigTime, Snowflake |
| 12 | Forecasted Billable Hours | Forward-looking revenue forecast | Snowflake (Assignments) |
| 13 | Bookings Tracker | Won deals from Pipedrive | Pipedrive API |
| 14 | Project Health Monitor | Bookings vs Plan vs Delivery tracking | Pipedrive, BigTime, Snowflake |
| 15 | Resource Checker | Utilization vs assignment adherence | BigTime, Snowflake |
| 16 | Revenue Forecaster | Actuals + Plan + Pipeline forecast | BigTime, Pipedrive, Snowflake |
| 17 | Contract Reviewer | AI-powered contract analysis | PDF upload, Claude/Gemini |
| 18 | Sales Snapshot | Pipeline by stage with probability | Pipedrive API |
| 96 | Snowflake Test | Connection testing | Snowflake |
| 97 | BigTime Client Lookup | Client search utility | BigTime API |
| 98 | QuickBooks Token Refresh | OAuth token management | QuickBooks API |
| 99 | Connection Health Checker | Multi-system connectivity test | All APIs |

**Common Infrastructure:**
- Authentication via Streamlit session state
- Config from Snowflake (migrated from Google Sheets)
- Excel export via pandas/openpyxl
- Email via Gmail API (service account delegation)

---

## Snowflake Configuration

**Account:** `sf18359.us-central1.gcp`
**Database:** `VOYAGE_APP_STORE`
**Schema:** `PUBLIC`
**Warehouse:** `COMPUTE_WH`
**User:** `VOYAGE_APP_STORE_USER`
**Role:** `VOYAGE_APP_STORE_ROLE`

**Connection Status:** WORKING (verified 2026-01-22)
- All grants correct (SELECT, INSERT, UPDATE, DELETE, CREATE TABLE)
- Password-based auth (switched from JWT/key-pair for Vercel simplicity)

**Config Files:**
- `web/.env.local` - Next.js env vars
- `.env` - Root env for Python scripts
- `.streamlit/secrets.toml` - Streamlit secrets

---

## BigTime API Configuration

**API Key:** `fh1g37HpUbLxcRSzVENmNrkMMx1Zm0QdNt0+MuL4GmcaAJWc63LFhCU1/gBKnYH2`
**Firm ID:** `pvnq-stx-htoh`
**Base URL:** `https://iq.bigtime.net/BigtimeData/api/v2`

**Environment Variables (in .env AND Vercel):**
- `BIGTIME_API_KEY` - API key above
- `BIGTIME_FIRM_ID` - Firm ID above

**Staff ID URL pattern:** `https://iq.bigtime.net/Bigtime/Staff2#/detail/{BIGTIME_STAFF_ID}`

**Note:** David Woods (STAFF_ID 104) has no BigTime account - BIGTIME_STAFF_ID is NULL.

**Common BigTime API Endpoints (used by Streamlit apps):**
- `POST /report/data/{report_id}` - Fetch report data (requires JSON body with date range)
  - Report 284796 = Standard time report
  - Report 284803 = Contractor report
- Note: Simple GET endpoints like `/staff` or `/picklist/StaffList` return 404 - use report endpoint

**Authentication:** API key in `X-Auth-ApiToken` header, Firm ID in `X-Auth-Realm` header

**Reference Implementation:** See `/functions/bigtime_api.py` for Python examples

---

## Pipedrive API Configuration

**Status:** WORKING in Streamlit AND Vercel (verified 2026-01-22)

**Environment Variable:** `PIPEDRIVE_API_TOKEN`
- Streamlit: `.streamlit/secrets.toml`
- Vercel: Already configured in Vercel Dashboard

**Custom Fields in Pipedrive Deals:**
- BigTime Client ID
- BigTime Project ID (links Pipedrive deal to BigTime project) **IMPORTANT: Must be populated for Project Health Monitor to link deals to projects**
- Bill Rate
- Budget Hours
- Project Duration (months)
- Project Start Date

**Note:** Project Health Monitor matches Pipedrive deals to BigTime projects using the "BigTime Project ID" custom field. Projects without this field populated will show as "No Pipedrive Link" in the app.

**API Endpoints:**
- Streamlit: `pages/13_📊_Bookings_Tracker.py` - fetches won deals
- Vercel: `/api/pipedrive/booking?projectId=X` - finds deal by BigTime Project ID

**Confirmed Working:** Tested with Navitus Health Solutions project - shows $138,000 booking amount from Pipedrive

---

## Uploads Folder

**Location:** `/workspaces/voyage-app-store/uploads/`

This is where reference files are uploaded for Claude to review:
- Excel exports from Google Sheets
- Brand identity assets
- Any other reference materials

**Current Files:**
- `Voyage_Global_Config 2026.01.21.xlsx` - Original Google Sheets config (7 tabs: Rules, Offsets, Staff, Benefits, Mapping, Assignments, FixedFee)
- `voyage-identity/` - Brand assets and logo files

---

## Vercel Configuration

**Status:** WORKING (verified 2026-01-22)

**Project:** `voyage-app-store-vercel`
**Production URL:** https://voyage-app-store-vercel.vercel.app
**Custom Domain:** https://apps.voyage.xyz
**Test Endpoint:** https://apps.voyage.xyz/api/test-snowflake

**Vercel Token:** `gcsACrDUYSjDtKnf0EQda6f3` (for CLI deployments)
**Deploy Command:** `npx vercel --prod --token gcsACrDUYSjDtKnf0EQda6f3`

**Environment Variables on Vercel:** All Snowflake vars configured (SNOWFLAKE_ACCOUNT, USER, PASSWORD, WAREHOUSE, DATABASE, SCHEMA)

**Next.js App Location:** `/workspaces/voyage-app-store/web/`

---

## Voyage Advisory Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Dark Charcoal | #333333 | Text, headers |
| Dark Blue | #336699 | Active nav items, links |
| Medium Blue | #6699cc | Secondary accents |
| Teal | #669999 | Sidebar background |
| Gray | #999999 | Muted text |
| Navy | #0D3B66 | Primary buttons |

**Logo Files in `/web/public/`:**
- `voyage-logo.png` - Full color (for light backgrounds)
- `voyage-logo-white.png` - White/reversed (for teal sidebar)

**Brand Identity Source:** `/uploads/voyage-identity/Voyage Advisory Identity/`

---

## Version Alignment with Sister Project

| Package | This Project | voyage-consultant-tools |
|---------|-------------|------------------------|
| Next.js | 16.1.4 | 16.1.4 |
| React | 19.2.3 | 19.2.3 |
| snowflake-sdk | 2.3.3 | 2.3.3 |
| TypeScript | 5 | 5 |

**Note:** Both projects now use identical versions (upgraded 2026-01-22).

---

## Current State (2026-01-22)

### What's Working
- Snowflake connection from Python (tested)
- Snowflake connection from Next.js lib (`web/src/lib/snowflake.ts`)
- All 7 data tables populated and accessible (10 tables total including test tables)
- Test table `CONNECTION_TEST` created for verification
- **Vercel deployment working** - deploys from root directory
- **Snowflake test endpoint live:** `/api/test-snowflake` (unauthenticated, for testing)

### What's Built (Phase 2) - COMPLETE
- **Staff Settings** (`/settings/staff`) - Full CRUD with BigTime ID integration
- **Benefits Settings** (`/settings/benefits`) - Full CRUD with type filtering
- **Commission Rules** (`/settings/rules`) - Full CRUD with salesperson filtering
- **Offsets** (`/settings/offsets`) - Full CRUD with salesperson filtering, shows totals
- **Client Name Mapping** (`/settings/mapping`) - Full CRUD with source system filtering
- **Fixed Fee Revenue** (`/settings/fixed-fee`) - Full CRUD for fixed-fee project revenue
- **Staff Assignments** (`/settings/assignments`) - Spreadsheet-like grid UI with staff × month hours, per-staff bill rates, totals and revenue calculations

**Note:** Projects don't need a separate settings page - they come from BigTime and the Assignments page. The Fixed Fee page handles revenue overrides for fixed-fee projects.

### Existing API Routes (working on Vercel, require auth)
- `GET/POST /api/staff` - List/create staff
- `GET/PUT/DELETE /api/staff/[id]` - Individual staff operations
- `GET/POST /api/benefits` - List/create benefits
- `GET/PUT/DELETE /api/benefits/[id]` - Individual benefit operations
- `GET/POST /api/commission-rules` - List/create commission rules
- `GET/PUT/DELETE /api/commission-rules/[id]` - Individual rule operations
- `GET/POST /api/offsets` - List/create offsets
- `GET/PUT/DELETE /api/offsets/[id]` - Individual offset operations (hard delete)
- `GET/POST /api/mapping` - List/create client name mappings
- `GET/PUT/DELETE /api/mapping/[id]` - Individual mapping operations
- `GET/POST /api/fixed-fee` - List/create fixed-fee revenue entries
- `GET/PUT/DELETE /api/fixed-fee/[id]` - Individual fixed-fee operations
- `GET/POST /api/assignments` - List assignments (filter by projectId), create assignment
- `GET/PUT/DELETE /api/assignments/[id]` - Individual assignment operations
- `POST/DELETE /api/assignments/bulk` - Bulk create/update/delete assignments
- `GET /api/projects` - List projects (for dropdowns)
- `GET /api/test-snowflake` - Unauthenticated test endpoint
- `GET /api/quickbooks/token` - Get QuickBooks OAuth authorization URL
- `POST /api/quickbooks/token` - Exchange authorization code for refresh token
- `GET /api/health` - Run all health checks (add `?sendTestEmail=true` to send Gmail test)
- `POST /api/vercel/env` - Update Vercel environment variable (requires VERCEL_TOKEN)
- `POST /api/vercel/deploy` - Trigger production redeploy (requires VERCEL_TOKEN)
- `GET /api/bigtime/clients?years=N` - Fetch BigTime clients and projects (N years of history)
- `GET /api/project-health?status=X` - Fetch project health data (combines Pipedrive, Snowflake, BigTime)

---

## Key Files Reference

| Purpose | File |
|---------|------|
| TypeScript Snowflake connector | `web/src/lib/snowflake.ts` |
| Python Snowflake connector | `functions/snowflake_db.py` |
| Python test script | `scripts/test_snowflake_env.py` |
| Streamlit test page | `pages/96_❄️_Snowflake_Test.py` |
| Benefits API | `web/src/app/api/benefits/route.ts` |
| Staff API | `web/src/app/api/staff/route.ts` |

---

## Session Log

### 2026-01-22 - Initial Setup Session
- Diagnosed Snowflake connection issue (env vars not loaded, not a grants problem)
- Created `.streamlit/secrets.toml` for Streamlit apps
- Created `.env` at root for Python scripts
- Verified full read/write connectivity to Snowflake
- Created this MEMORIES.md file
- Set up Vercel CLI with token authentication
- Linked project to existing `voyage-app-store-vercel` Vercel project
- Created `/api/test-snowflake` endpoint (unauthenticated) for connectivity testing
- Updated middleware to allow unauthenticated access to test endpoint
- Successfully deployed to production - **Snowflake + Vercel working!**
- Upgraded Next.js 14→16.1.4 and React 18→19.2.3 to match sister project
- Updated next.config.mjs (`serverComponentsExternalPackages` → `serverExternalPackages`)
- Redeployed and verified working
- Added BIGTIME_STAFF_ID column to VC_STAFF table
- Pulled BigTime staff IDs via API and populated 24/25 staff (David Woods has no BigTime account)
- Added BigTime credentials to .env and .streamlit/secrets.toml
- Built Staff CRUD interface with BigTime ID integration
  - List page shows BigTime ID as clickable link
  - Edit form includes BigTime Staff ID field with "View" button
  - API routes support BIGTIME_STAFF_ID field
- Custom domain: https://apps.voyage.xyz

### 2026-01-22 - Benefits Settings & Staff Form Fixes
- Fixed Radix UI Select empty string issue in staff-form.tsx (was causing client-side errors)
- Added "Hourly" to staff type options
- Changed Additional Life Insurance from text input to Yes/No dropdown
- Built complete Benefits CRUD interface:
  - List page with type filtering (Medical, Dental, Vision, STD, LTD, Life)
  - Create/Edit forms with monthly costs and formula settings
  - API routes for all CRUD operations
- Updated all 43 benefit descriptions to include "2026" prefix for year tracking
- Added Annual Benefits Renewal Process documentation to MEMORIES.md
- Next: Build remaining Settings pages (Rules, Offsets, Mapping, Assignments, FixedFee)

### 2026-01-22 - Staff Assignments Page Complete
- Added Pipedrive API configuration section to MEMORIES.md
- Added Uploads folder documentation
- Documented full Streamlit apps inventory (22 apps for Phase 3 migration)
- Built Staff Assignments page with:
  - Project selector dropdown
  - Spreadsheet-like grid (staff rows × month columns)
  - Per-staff bill rates (editable)
  - Per-month hours (editable, auto-saves on blur)
  - Summary row with totals and revenue
  - Add Staff / Add Month buttons
  - Delete staff from project
- Created assignments API routes:
  - `/api/assignments` - GET (with projectId filter), POST
  - `/api/assignments/[id]` - GET, PUT, DELETE
  - `/api/assignments/bulk` - POST (bulk create/update), DELETE (bulk delete)
- Updated `.devcontainer/devcontainer.json` to auto-install Claude Code
- **Phase 2 Config Tools: COMPLETE**

### 2026-01-22 - Pipedrive Integration & Enhancements
- Added Pipedrive booking validation to assignments page
  - Created `/api/pipedrive/booking` API route
  - Fetches won deals from Pipedrive, matches by BigTime Project ID
  - Shows booking amount, calculated revenue, and variance
- Improved Add Month dialog:
  - Now allows selecting any year/month (past or future)
  - Months are sorted chronologically after adding
- Added PIPEDRIVE_API_TOKEN to Vercel environment variables
- Confirmed working: Navitus Health Solutions shows $138,000 booking

### 2026-01-22 - Final Session Fixes
- Fixed column alignment in assignments grid:
  - Added consistent `w-[Xpx] min-w-[Xpx]` classes to all table cells
  - Staff Member: 180px, Bill Rate: 90px, Month columns: 85px, Total Hrs: 90px, Revenue: 100px
  - Added `border-r` to sticky Staff Member column for visual separation
  - Set all inputs to `w-full h-8` for consistent sizing
- Changed year selector from dropdown to text input:
  - Removed yearOptions array (was limiting to 5 years)
  - Added text input with validation (2001-2098 range)
  - Shows error message when year is out of range
  - Add Month button disabled when validation fails
- Committed and pushed: `ed16832`
- **PHASE 2 COMPLETE** - All config tools working

### 2026-01-22 - Phase 3 Started (Streamlit Migration)
- Started migrating Streamlit apps to Vercel
- **First app migrated: Connection Health Checker (app 99)**
  - Created `/api/health` - tests all API connections in parallel
  - Created `/settings/health` page with status cards and detailed results
  - Tests: Snowflake, Pipedrive, BigTime, QuickBooks, Claude, Gemini, Google APIs
  - Shows success/warning/error/not_configured status for each service
- Simplified sidebar Health section (removed placeholder links)
- Fixed `.gitignore` to exclude `.env` file (was accidentally committed briefly)
- Deleted accidentally created "web" project from Vercel via API

### 2026-01-22 - Health Check Fixes
- Fixed BigTime health check (multiple attempts):
  - Changed header from `X-Auth-Token` to `X-Auth-ApiToken` (correct BigTime API header)
  - Changed from GET `/firm` to GET `/picklist/StaffList` - still got 404
  - **Final fix:** Changed to POST `/report/data/284796` with date range (same as Python bigtime.py)
  - BigTime API doesn't have simple GET endpoints - must use POST to report endpoint
- Fixed Google Drive health check:
  - Changed from error to warning when some (but not all) folders are inaccessible
  - Removed FOLDER_PROGRAMS_ROOT from check (not used by any actual apps)
  - Now only checks 4 folders: To-File Inbox, Archive-Contracts, Archive-Docs, Reports
- Updated MEMORIES.md corrections:
  - BigTime credentials ARE in Vercel (was incorrectly noted as "not yet")
  - Fixed BigTime auth header documentation
- Moved "Send Test Email" button from header into the Gmail card itself (better UX)
- **Synced Assignments data** from `Voyage_Global_Config_20260122_1429.xlsx` to Snowflake:
  - Deleted 6 rows, Inserted 10 rows, Updated 35 rows (51 total changes)
  - Final count: 131 assignment rows in VC_STAFF_ASSIGNMENTS
- **Migrated QuickBooks Token Refresh (app 98)** to Vercel:
  - Created `/api/quickbooks/token` - GET returns auth URL, POST exchanges code for token
  - Created `/health/quickbooks` page with step-by-step OAuth flow
  - **Added "Push to Vercel & Redeploy" button** - updates QB_REFRESH_TOKEN AND triggers redeploy
  - Created `/api/vercel/env` - updates Vercel environment variables via API
  - Created `/api/vercel/deploy` - triggers production redeploy via Vercel API
  - Added VERCEL_TOKEN to Vercel env vars for API access
  - Full workflow: Get token → Push to Vercel → Auto-redeploy → New token active in ~1 min
- **Reorganized Health section URLs:**
  - Moved `/settings/health` → `/health/connection`
  - Moved `/settings/quickbooks` → `/health/quickbooks`
- **Migrated BigTime Client Lookup (app 97)** to Vercel:
  - Created `/api/bigtime/clients` - fetches clients and projects from BigTime time reports
  - Created `/health/bigtime` page with client/project lookup, search, CSV download
  - Supports fetching historical data (1-5 years back) for inactive clients/projects
- **Fixed Project Health Monitor (app 14)** Streamlit app:
  - Issue: After Snowflake migration, `_pivot_assignments_from_snowflake()` was returning date columns as 'Mon-yy' strings
  - Project Health Monitor expected datetime columns it could parse with `pd.to_datetime()`
  - Also missing 'Total' column that the app used
  - **Fix:** Updated both `_pivot_assignments_from_snowflake()` and `_pivot_fixedfee_from_snowflake()` in `functions/sheets.py`:
    - Date columns now returned as end-of-month Timestamp objects (e.g., `Timestamp('2026-01-31')`)
    - Added 'Total' column (sum of all date columns)
  - This maintains backwards compatibility with apps expecting the original Google Sheets format
- **Migrated Project Health Monitor (app 14)** to Vercel:
  - Created `/api/project-health` - fetches and combines data from 3 sources:
    - Pipedrive: Won deals (bookings)
    - Snowflake: Staff assignments (plan)
    - BigTime: Time entries (actuals)
  - Created `/apps/project-health` page with:
    - Status filter (All/Active/Completed/Not Started)
    - Summary metrics (Scoping Errors, Over-Billed, Under-Billed, Total Bookings, No Pipedrive Link)
    - Project details table with Plan/Booked % and Fees/Booked %
    - Color-coded status indicators
    - CSV download export
    - Legend explaining color meanings
    - Shows ALL projects from assignments (not just those with Pipedrive matches)
    - Projects without Pipedrive links shown with "No PD" badge and orange highlight
  - Added to sidebar navigation at top of Apps section
- **Fixed pivot functions returning only 1 row:**
  - Root cause: Snowflake returns `Decimal` objects, pandas couldn't aggregate them
  - Fixed `_pivot_assignments_from_snowflake()`: Convert ALLOCATED_HOURS and BILL_RATE to numeric
  - Fixed `_pivot_fixedfee_from_snowflake()`: Convert REVENUE_AMOUNT to numeric
  - Also fixed NOTES field handling (None vs empty string was causing grouping issues)
  - Now correctly returns all 28 staff assignments across 14 projects

### 2026-01-23 - Project Health Monitor Fixes & Additional Apps
- **Fixed Project Health Monitor BigTime integration:**
  - Issue: Fees to Date showing $0 and Fees/Booked at 0%
  - Root cause 1: BigTime report data was being returned as raw arrays but accessed as objects
  - Root cause 2: Wrong column name used (`tmprojectsid` instead of `tmprojectnm_id`)
  - Fix: Properly parse BigTime report using FieldList to map column indices
  - Fix: Use correct column names (`tmprojectnm_id`, `tmclientnm_id`) matching original Streamlit code
  - Fix: Expanded date range from 2 years to 5 years to capture all historical hours
  - Added debugging metadata (BigTime years, projects with actuals, matched deals)
- **Fixed Pipedrive custom field lookup:**
  - Updated pattern matching to match original Streamlit: `'bigtime project id' in name or 'project id' in name`
- **Migrated additional apps:**
  - Document Manager (`/apps/document-manager`)
  - Expense Reviewer (`/apps/expense-reviewer`)
  - Contractor Fee Reviewer (`/apps/contractor-fees`)
  - Forecasted Billable Hours (`/apps/forecasted-hours`)
  - Payroll Calculator (`/apps/payroll-calc`)
  - Payroll Helper (`/apps/payroll-helper`)
- **Fixed various bugs during migration:**
  - Expense Reviewer: Friday date validation using UTC instead of local time - fixed with `T00:00:00` suffix
  - Payroll Helper: Wrong column name `EMPLOYEE_TYPE` - fixed to `STAFF_TYPE`
  - Forecasted Hours: Snowflake returns Date objects not strings - added `string | Date` union type handling
  - Sidebar link typo: `/apps/forecast-hours` → `/apps/forecasted-hours`

### 2026-01-23 - Snowflake Test & Commission Calculator Migration
- **Migrated Snowflake Test (app 96)** to Vercel:
  - Created `/api/snowflake-test` - API to read/write test records to TEST_INPUT table
  - Created `/health/snowflake` page with:
    - Text input form to write test records
    - Display of recent records with timestamp
    - Refresh and Clear All buttons
    - Auto-creates TEST_INPUT table if it doesn't exist
  - Added to sidebar navigation in Health section
- **Migrated Commission Calculator (app 01)** to Vercel:
  - Created `/api/commission` - All-in-one API that:
    - Loads commission rules, offsets, and client name mappings from Snowflake
    - Fetches QuickBooks consulting income (P&L Detail report, cash basis)
    - Fetches BigTime time entries (report 284796)
    - Calculates client commissions from QuickBooks transactions
    - Calculates delivery & referral commissions from BigTime entries (monthly aggregated)
    - Applies offsets (salaries, benefits, prior payments)
    - Returns full ledger, summaries by salesperson, and revenue by client
  - Created `/api/commission/email` - Email API with Excel attachment via Gmail
  - Created `/apps/commission` page with:
    - Year text input (2000-2100 range, future-proof)
    - Debug log (expandable) showing API data counts
    - Summary metrics (Total Commission, Total Due, per-salesperson)
    - Tabbed views: Commission Summary, By Category, Revenue by Client, Full Ledger
    - Commission Summary groups by client/category/rate (like original spreadsheet)
    - **Salesperson filter:** View dropdown to filter by individual salesperson
      - Shows only that person's data in all tabs
      - Downloads/emails only contain that person's data (for privacy)
    - **Export options:**
      - Download Excel (.xlsx with multiple sheets using xlsx library)
      - Download PDF (opens print dialog for Save as PDF)
      - Email Report (sends Excel attachment via Gmail API)
      - All exports respect the salesperson filter
    - Explanation of commission types in instructions
  - QuickBooks OAuth token refresh working (rotates automatically on each API call)
  - **Note:** QuickBooks integration requires valid QB_REFRESH_TOKEN in Vercel env vars
- **Updated sidebar navigation:**
  - Section titles (Apps, Settings, Health) now larger and bolder
  - Subsection items now smaller with tighter spacing
  - All items alphabetized within each section
- **Migrated Benefits Calculator (app 08)** to Vercel:
  - Created `/api/benefits-calc` - API that:
    - Loads VC_STAFF (active employees) and VC_BENEFITS (benefit plans) from Snowflake
    - Calculates formula-based costs for STD/LTD based on salary:
      - STD: `min(salary/52 * 0.6667, 2100) / 10 * 0.18`
      - LTD: `(salary/12) / 100 * 0.21`
    - Returns summary, breakdown by benefit type, employee details, and benefits legend
  - Created `/api/benefits-calc/email` - Email API with Excel attachment via Gmail
  - Created `/apps/benefits-calc` page with:
    - Summary cards (Total/Employee/Firm monthly costs)
    - Tabbed views: Breakdown by Type, Employee Details, Benefits Legend
    - Employee Details shows all 6 benefit types (Medical, Dental, Vision, STD, LTD, Life)
    - Legend shows all available benefit codes with descriptions and costs
    - **Export options:** Download Excel, Download PDF, Email Report
  - Added to sidebar navigation in Apps section
- **Migrated Billable Hours Report (app 04)** to Vercel:
  - Created `/api/billable-hours` - API that:
    - Fetches BigTime time report data for a date range (report 284796)
    - Loads active staff from Snowflake VC_STAFF
    - Groups hours by staff and month
    - Classifies staff: Active Employee (in VC_STAFF), Contractor (has recent hours), Inactive
    - Calculates monthly capacity (business days - federal holidays) × 8 hours
    - Federal holidays hardcoded for 2024-2027
  - Created `/api/billable-hours/email` - Email with HTML report and Excel attachment
  - Created `/apps/billable-hours` page with:
    - Date range selector (start/end month and year)
    - Metric toggle: Billable Hours vs Billable Revenue ($)
    - Summary cards (total hours/revenue, employee counts by classification)
    - Separate tables for Active Employees, Contractors, Inactive
    - Color coding: Green (≥100% capacity), Yellow (80-99%), Blue (<80%)
    - Revenue mode: percentile-based coloring (top 25%, 25-50%, bottom 50%)
    - Capacity Reference table (for hours mode)
    - **Export options:** Download Excel, Download PDF, Email Report
- **Migrated Bonus Calculator (app 05)** to Vercel:
  - Created `/api/bonus` - API that:
    - Fetches BigTime billable hours YTD
    - Loads staff config (UTILIZATION_BONUS_TARGET, OTHER_BONUS_TARGET, START_DATE)
    - Separates regular billable hours from pro bono (project name contains "Pro Bono")
    - Calculates tier-based bonuses:
      - Tier 1: ≥1,840 hours → full bonus × (hours / 1,840)
      - Tier 2: 1,350-1,839 hours → 75% × (hours / 1,840)
      - Tier 3: <1,350 hours → no bonus
    - Pro bono hours credit capped at 40 hours
    - Proration for employees who started mid-year
    - Projects year-end based on current run rate
    - Adds employer costs: FICA (7.65%) + 401k match (4%)
  - Created `/api/bonus/email` - Email with HTML report and Excel attachment
  - Created `/apps/bonus` page with:
    - As-of date selector (defaults to today)
    - Summary cards: YTD Total Cost, Projected Year-End Cost, Progress %
    - Employee details table with YTD and Projected columns
    - Tier color coding: Green (Tier 1), Yellow (Tier 2), Blue (Tier 3)
    - **Export options:** Download Excel, Download PDF, Email Report

---

## Notes for Future Sessions

- When testing Python scripts: `export $(grep -v '^#' .env | xargs) && PYTHONPATH=/workspaces/voyage-app-store python3 <script>`
- The sister project `voyage-consultant-tools` has working examples if stuck
- User prefers simple, working solutions over complex ones
- **Claude Code** auto-installs on codespace creation via `.devcontainer/devcontainer.json` postCreateCommand
- **IGNORE THIS BUILD WARNING:** `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` - This is a Next.js 16 warning about our `middleware.ts` file. It still works fine. Migration to "proxy" can be done later if needed but is not urgent.
- **Email reports should include both HTML and Excel:** When emailing reports, always send a nicely formatted HTML email body (matching the PDF styling) along with the Excel attachment. The HTML provides a readable summary while the Excel provides detailed data for analysis. This applies to all calculator/report apps.

---

## Annual Benefits Renewal Process (December)

**When:** December each year, after receiving new rates (usually November)

**Overview:** Benefits are versioned by year in their descriptions (e.g., "2026 Medical UHC HSA1 EE"). Each year, update the costs and change the year prefix in descriptions.

### Step-by-Step Instructions

#### 1. Export Current Benefits for Reference
```sql
SELECT CODE, DESCRIPTION, BENEFIT_TYPE, TOTAL_MONTHLY_COST, EE_MONTHLY_COST, FIRM_MONTHLY_COST
FROM VC_BENEFITS
WHERE IS_ACTIVE = TRUE
ORDER BY BENEFIT_TYPE, CODE;
```

#### 2. Update Costs via Web UI
Go to https://apps.voyage.xyz/settings/benefits and update each benefit's costs:
- Total Monthly Cost
- Employee Monthly Cost
- Firm Monthly Cost

For formula-based benefits (STD, LTD, Life), also update:
- Coverage Percentage
- Rate Per Unit
- Max Weekly/Monthly Benefit

#### 3. Update Year in Descriptions (SQL)
Run this SQL to change year prefix (e.g., 2026 → 2027):
```sql
UPDATE VC_BENEFITS
SET DESCRIPTION = REPLACE(DESCRIPTION, '2026 ', '2027 '),
    UPDATED_AT = CURRENT_TIMESTAMP()
WHERE DESCRIPTION LIKE '2026 %';
```

#### 4. Verify Changes
```sql
SELECT CODE, DESCRIPTION, TOTAL_MONTHLY_COST, EE_MONTHLY_COST, FIRM_MONTHLY_COST
FROM VC_BENEFITS
WHERE IS_ACTIVE = TRUE
ORDER BY BENEFIT_TYPE, CODE;
```

### Benefit Types & Code Prefixes
| Type | Code Prefix | Example |
|------|-------------|---------|
| Medical | M | ME1, MP1, MC1, MF1 |
| Dental | D | DE1, DP1, DC1, DF1 |
| Vision | V | VE, VP, VC, VF |
| Short-Term Disability | S | S1 |
| Long-Term Disability | L | L1 |
| Life Insurance | T | T1 |

### Coverage Tiers (suffix meanings)
- `E` or `1` = Employee only
- `P` = Employee + Spouse
- `C` = Employee + Child(ren)
- `F` = Employee + Family
- `X` = Declined

### What-If Scenarios (November)
When new rates arrive in November, consider building a temporary "Benefits Calculator" app to:
- Compare current vs proposed costs
- Calculate impact per employee
- Model different plan selections

This could be a simple Streamlit page or a new Vercel app page.

---

## Staff Assignments Feature

### Business Context
When a project is sold, it's marked "won" in Pipedrive and a new project is created in BigTime. Staff are then allocated to the project with estimated hours per month and bill rates. The sum of (hours × rate) across all staff should equal the Pipedrive deal value (booking amount).

### Data Model

**VC_PROJECTS** (14 rows):
| Column | Type | Notes |
|--------|------|-------|
| PROJECT_ID | NUMBER(38,0) | PK, BigTime Project ID |
| CLIENT_NAME | VARCHAR(200) | |
| PROJECT_NAME | VARCHAR(200) | |
| PROJECT_STATUS | VARCHAR(20) | Default 'Active' |
| PROJECT_TYPE | VARCHAR(20) | Default 'T&M' |
| BILL_RATE | NUMBER(10,2) | Default project rate |
| CREATED_AT, UPDATED_AT | TIMESTAMP | |

**VC_STAFF_ASSIGNMENTS** (127 rows - normalized, one row per staff/project/month):
| Column | Type | Notes |
|--------|------|-------|
| ASSIGNMENT_ID | NUMBER(38,0) | PK, auto-increment |
| PROJECT_ID | NUMBER(38,0) | FK to VC_PROJECTS |
| STAFF_NAME | VARCHAR(100) | Staff member name |
| MONTH_DATE | DATE | First of month (e.g., 2026-01-01) |
| ALLOCATED_HOURS | NUMBER(8,2) | Estimated hours for that month |
| BILL_RATE | NUMBER(10,2) | May differ from project default |
| NOTES | VARCHAR(500) | |
| CREATED_AT, UPDATED_AT | TIMESTAMP | |

### Google Sheets Format (for reference)
The original Sheets had a wide format - one row per staff/project with monthly columns:
- Client, Project Name, Project ID, Staff Member, Notes, Bill Rate, Project Status, Total
- Then month columns: Dec 2025, Jan 2026, Feb 2026... (hours per month)

### Validation Logic
**Sum of (staff hours × rate) should equal Pipedrive booking amount**
- Different staff may have different bill rates on the same project
- Pipedrive deal value is the "booking amount" to match against
- Pipedrive has a "BigTime Project ID" custom field to link deals to projects

### Revenue Forecasting
Monthly allocated hours are used by other apps (Revenue Forecaster) to project future revenue.

### UI Design Spec (Approved 2026-01-22)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Project: [Dropdown selector]                    Status: Active  │
│ Client: Acme Corp                                               │
├─────────────────────────────────────────────────────────────────┤
│ Staff Member │ Bill Rate │ Jan │ Feb │ Mar │ Apr │ ... │ Total │
├──────────────┼───────────┼─────┼─────┼─────┼─────┼─────┼───────┤
│ John Smith   │ $150      │ 40  │ 80  │ 80  │ 40  │     │ 240   │
│ Jane Doe     │ $125      │ 60  │ 60  │ 60  │ 60  │     │ 240   │
├──────────────┼───────────┼─────┼─────┼─────┼─────┼─────┼───────┤
│ TOTALS       │           │ 100 │ 140 │ 140 │ 100 │     │ 480   │
│ REVENUE      │           │$13k │$18k │$18k │$13k │     │ $62k  │
└─────────────────────────────────────────────────────────────────┘
│ [+ Add Staff]                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
1. **Project selector** - dropdown at top to pick a project
2. **Project info bar** - shows client name and status (from VC_PROJECTS)
3. **Staff × Month grid**:
   - Staff name column (text, from dropdown when adding)
   - Bill rate column (editable, per staff member)
   - Month columns (editable hours, dynamically generated)
   - Row total (calculated: sum of hours)
4. **Summary row** - monthly totals and revenue (hours × rate)
5. **Add Staff button** - adds new row with staff dropdown

**Editing behavior:**
- Click cell to edit (inline editing)
- Auto-save on blur or Enter
- Tab to move between cells
- Bill rate and hours are editable
- Staff name editable only on new rows

**Calculations:**
- Row total = sum of all month hours for that staff
- Column total = sum of all staff hours for that month
- Revenue per month = Σ(staff hours × staff rate) for that month
- Grand total revenue = Σ(all hours × respective rates)

**Validation panel (IMPLEMENTED - Pipedrive integration working)**
```
Calculated Revenue: $90,599
Booking (Pipedrive): $138,000
Variance: -$47,401 (-34.3%)
```

### Pipedrive Integration [COMPLETE]
- PIPEDRIVE_API_TOKEN configured in Vercel environment variables
- `/api/pipedrive/booking?projectId=X` fetches booking amounts
- Matches deals by BigTime Project ID custom field
- Shows variance between calculated revenue and booking amount
- Negative variance (red) = under-allocated, Positive (green) = over-allocated

---

## Current State (as of 2026-01-22 final)

### Phase 2: COMPLETE
All config settings pages are built and working:
- Staff, Benefits, Commission Rules, Offsets, Client Name Mapping, Fixed Fee Revenue, Staff Assignments
- Pipedrive integration for booking validation
- All CRUD operations working

### Assignments Page - COMPLETE
All polish items fixed:
1. **Column alignment** - FIXED. Added fixed widths (`w-[Xpx] min-w-[Xpx]`) to all table cells
2. **Year input** - FIXED. Changed from dropdown to text input with validation (2001-2098 range)

### Known Issues
- None - all functionality working

---

## What's Next (Phase 3 Planning)

### Priority Order for Streamlit → Vercel Migration

**High Priority (used frequently):**
1. Commission Calculator (01) - Monthly commission calculations
2. Billable Hours Report (04) - Monthly utilization tracking
3. Time Reviewer (06) - Weekly timesheet compliance
4. Payroll Helper (10) - Gusto payroll prep

**Medium Priority:**
5. Revenue Forecaster (16) - Uses assignments data
6. Bookings Tracker (13) - Already have Pipedrive API working
7. Project Health Monitor (14) - Combines multiple data sources
8. Resource Checker (15) - Utilization tracking

**Lower Priority (less frequent use):**
9. Bonus Calculator (05) - Annual
10. Benefits Calculator (08) - Periodic
11. Payroll Calculator (09) - Periodic
12. Expense Reviewer (07)
13. Contractor Fee Reviewer (11)

**Future/As Needed:**
- Email to Vault (02) - Gmail integration
- To File to Vault (03) - AI document classification
- Contract Reviewer (17) - AI contract analysis
- Sales Snapshot (18) - Pipedrive pipeline

### Technical Considerations for Phase 3
- Most apps need BigTime API integration (not yet in Vercel)
- Commission Calculator needs QuickBooks API
- Some apps use AI (Claude/Gemini) for analysis
- Excel export functionality needed (use xlsx library)
- Consider batch operations for large data sets

### Streamlit → Vercel Migration Approach

**For each app migration:**
1. **Study the Streamlit app** - Read `pages/XX_*.py` to understand:
   - What data it fetches (BigTime, QuickBooks, Snowflake, etc.)
   - What calculations it performs
   - What outputs it generates (tables, charts, Excel exports)

2. **Create API routes** in `/web/src/app/api/`:
   - One route per external API (e.g., `/api/bigtime/time-entries`)
   - Keep business logic in the route, not the frontend

3. **Create the page** in `/web/src/app/`:
   - Use existing UI patterns from settings pages
   - Use shadcn/ui components (already installed)
   - Add to sidebar navigation in `components/sidebar.tsx`

4. **Handle Excel exports:**
   - Install `xlsx` package: `npm install xlsx`
   - Generate in API route or client-side
   - Return as downloadable blob

**Common Patterns in Streamlit Apps:**
- Date range selectors → Use shadcn DatePicker
- Data tables → Use existing table patterns or install tanstack/react-table
- Charts → Install recharts or chart.js
- File uploads → Use shadcn Input type="file"
- Excel download → Use xlsx library

**Reference Files:**
- Streamlit apps: `/pages/` folder
- Python API helpers: `/functions/` folder
- Working Vercel examples: `/web/src/app/settings/` folder

### API Integrations Needed for Phase 3
| API | Status | Used By |
|-----|--------|---------|
| Snowflake | WORKING | All apps |
| Pipedrive | WORKING | Bookings, Revenue Forecaster, Project Health |
| BigTime | WORKING | Most apps (time entries, expenses) |
| QuickBooks | WORKING | Commission Calculator |
| Gmail | WORKING | Email to Vault |
| Google Drive | WORKING (partial) | To File to Vault |
| Claude/Gemini | WORKING | Contract Reviewer, To File to Vault |

---

## Quick Reference Commands

**Deploy to Vercel:**
```bash
npx vercel --prod --token gcsACrDUYSjDtKnf0EQda6f3
```

**Run Python with env vars:**
```bash
export $(grep -v '^#' .env | xargs) && PYTHONPATH=/workspaces/voyage-app-store python3 <script>
```

**Git commit with co-author:**
```bash
git commit -m "$(cat <<'EOF'
Your commit message here

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Check Snowflake connection:**
```bash
curl https://apps.voyage.xyz/api/test-snowflake
```
