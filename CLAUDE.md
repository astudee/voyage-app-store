# Voyage App Store - Project Context

> This file tracks our journey and context so Claude doesn't lose track between sessions.
> **Last updated:** 2026-02-05 (Twilio phone system added)

---

## FOR NEW CLAUDE SESSIONS - START HERE

**Current Status:** Phase 3 COMPLETE. All migrations done. Document Manager active at `/documents`.

### Document Manager Status

**URL:** https://apps.voyage.xyz/documents

**Current document counts (as of 2026-02-02):**
| Tab | Status | Count |
|-----|--------|-------|
| Import | uploaded | 1,000 |
| Review | pending_approval | 105 |
| Archive | archived | 36 |
| **Total** | | **1,141** |

**Recent changes:**
- Renamed from "Document Manager 2.0" (`/documents-v2`) to "Document Manager" (`/documents`)
- Original Document Manager archived to `archived/web/src/app/`
- Google Drive migration complete - migrated 771 contracts + 130 documents to R2

**Migration Endpoint (for future use):**
- Check status: `curl "https://apps.voyage.xyz/api/documents/migrate-from-drive?folder=to-file&compare=true"`
- Migrate files: `curl -X POST "https://apps.voyage.xyz/api/documents/migrate-from-drive?folder=to-file&limit=10"`
- Folders: `to-file`, `archive-docs`, `archive-contracts`

---

**What's Done:**
- Snowflake database with all config tables (VC_STAFF, VC_BENEFITS, VC_COMMISSION_RULES, etc.)
- Vercel/Next.js app at https://apps.voyage.xyz with 7 settings pages (full CRUD)
- Pipedrive API integration for booking validation
- All config management tools working
- **ALL 22 Streamlit apps migrated to Vercel:**
  - Commission Calculator (01) → `/apps/commission`
  - Email to Vault (02) → `/documents` (Document Manager 2.0)
  - To File to Vault (03) → `/documents` (Document Manager 2.0)
  - Billable Hours Report (04) → `/apps/billable-hours`
  - Bonus Calculator (05) → `/apps/bonus`
  - Time Reviewer (06) → `/apps/time-reviewer`
  - Expense Reviewer (07) → `/apps/expense-reviewer`
  - Benefits Calculator (08) → `/apps/benefits-calc`
  - Payroll Calculator (09) → `/apps/payroll-calc`
  - Payroll Helper (10) → `/apps/payroll-helper`
  - Contractor Fee Reviewer (11) → `/apps/contractor-fees`
  - Forecasted Billable Hours (12) → `/apps/forecasted-hours`
  - Bookings Tracker (13) → `/apps/bookings`
  - Project Health Monitor (14) → `/apps/project-health`
  - Resource Checker (15) → `/apps/resource-checker`
  - Revenue Forecaster (16) → `/apps/revenue-forecast`
  - Contract Reviewer (17) → `/apps/contract-review`
  - Sales Snapshot (18) → `/apps/sales-snapshot`
  - Snowflake Test (96) → `/health/snowflake`
  - BigTime Client Lookup (97) → `/health/bigtime`
  - QuickBooks Token Refresh (98) → `/health/quickbooks`
  - Connection Health Checker (99) → `/health/connection`
- **Streamlit completely removed** (Home.py, .streamlit folder, requirements.txt reference all deleted)
- Old Streamlit apps preserved in `archived/pages/` for reference only

**What's Next:** Document Manager enhancements and maintenance

**Key Technical Notes:**
- BigTime API credentials are in `.env` AND Vercel environment variables
- QuickBooks API needs OAuth token refresh mechanism
- Old Streamlit app code is in `archived/pages/` for reference only (not runnable)
- Sister project `voyage-consultant-tools` has working examples

**Quick Commands:**
- Deploy: `npx vercel --prod --token gcsACrDUYSjDtKnf0EQda6f3`
- Test Snowflake: `curl https://apps.voyage.xyz/api/test-snowflake`
- Build: `cd web && npm run build`

---

## Project Overview

**Tech Stack:** Snowflake | Vercel (Next.js) | Cloudflare (R2, Email Workers)

**Sister Project:** `voyage-consultant-tools` (working reference for Snowflake integration)

---

## The Journey - Three Phases

### Phase 1: Google Sheets → Snowflake Migration [COMPLETED]
- Migrated configuration data from Google Sheets to Snowflake
- Created 8 core tables:
  - `VC_STAFF` - Employee data (25 rows)
  - `VC_BENEFITS` - Benefits plans (43 rows)
  - `VC_COMMISSION_RULES` - Commission calculations (19 rows)
  - `VC_COMMISSION_OFFSETS` - One-time adjustments (9 rows)
  - `VC_CLIENT_NAME_MAPPING` - Client name translations (4 rows)
  - `VC_STAFF_ASSIGNMENTS` - Project allocations
  - `VC_FIXED_FEE_REVENUE` - Fixed-fee project revenue
  - `VC_PROJECTS` - Project data
  - `VC_CLIENT_STATE_MAPPING` - Client-to-state associations by year (for revenue apportionment)
- Connection tested and working as of 2026-01-22

### Phase 2: Config Tools in Vercel [COMPLETE]
- Built web-based config tools to replace Google Sheets UI
- All 7 settings pages complete with full CRUD
- Pipedrive integration for booking validation
- See "What's Built" section below for full list

### Phase 3: Streamlit → Vercel Migration [COMPLETE]
All 22 apps migrated. Streamlit has been completely removed from the project.

**Apps Inventory (all now on Vercel):**

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

**Common Infrastructure (Vercel):**
- Authentication via Vercel (middleware-based)
- Config from Snowflake
- Excel export via xlsx library
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
- `web/.env.local` - Next.js env vars (for local development)
- `.env` - Root env for Python scripts

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

**Common BigTime API Endpoints:**
- `POST /report/data/{report_id}` - Fetch report data (requires JSON body with date range)
  - Report 284796 = Standard time report
  - Report 284803 = Contractor report
- Note: Simple GET endpoints like `/staff` or `/picklist/StaffList` return 404 - use report endpoint

**Authentication:** API key in `X-Auth-ApiToken` header, Firm ID in `X-Auth-Realm` header

**Reference Implementation:** See `/functions/bigtime_api.py` for Python examples

---

## Pipedrive API Configuration

**Status:** WORKING (verified 2026-01-22)

**Environment Variable:** `PIPEDRIVE_API_TOKEN` (configured in Vercel Dashboard)

**Custom Fields in Pipedrive Deals:**
- BigTime Client ID
- BigTime Project ID (links Pipedrive deal to BigTime project) **IMPORTANT: Must be populated for Project Health Monitor to link deals to projects**
- Bill Rate
- Budget Hours
- Project Duration (months)
- Project Start Date

**Note:** Project Health Monitor matches Pipedrive deals to BigTime projects using the "BigTime Project ID" custom field. Projects without this field populated will show as "No Pipedrive Link" in the app.

**API Endpoint:** `/api/pipedrive/booking?projectId=X` - finds deal by BigTime Project ID

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

**Environment Variables in Codespace:** The following are also set as GitHub Codespace secrets:
- `VERCEL_TOKEN` - For CLI deployments and API access
- `EMAIL_WEBHOOK_SECRET` - Shared secret for Cloudflare email worker webhook
- `CLOUDFLARE_API_TOKEN` - For Wrangler CLI (same token used for multiple Cloudflare services)

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
- `GET/POST /api/client-states` - Client-to-state mappings (for revenue apportionment)
- `GET /api/reports/revenue-by-client?year=YYYY` - Revenue by client report from QuickBooks

---

## Key Files Reference

| Purpose | File |
|---------|------|
| TypeScript Snowflake connector | `web/src/lib/snowflake.ts` |
| Python Snowflake connector | `functions/snowflake_db.py` |
| Python test script | `scripts/test_snowflake_env.py` |
| Benefits API | `web/src/app/api/benefits/route.ts` |
| Staff API | `web/src/app/api/staff/route.ts` |
| Document upload API | `web/src/app/api/documents/upload/route.ts` |

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

### 2026-01-23 - Resource Checker, Revenue Forecaster, Sales Snapshot, Time Reviewer Migration
- **Migrated 4 additional Streamlit apps to Vercel:**

- **Resource Checker (app 15)** to `/apps/resource-checker`:
  - Created `/api/resource-checker` - API that:
    - Fetches BigTime time entries for a date range
    - Loads staff assignments from Snowflake
    - Compares assigned hours vs actual hours by staff/project
    - Calculates utilization status (Overrun, On Target, At Risk, Under Target, Severely Under)
    - Calculates schedule pace ratio
    - Identifies unassigned work (actuals without assignments)
  - Created `/apps/resource-checker` page with:
    - Date range selector (defaults to current year)
    - Summary cards (Overruns, Severely Under, Late, Unassigned)
    - Multi-select filters (Staff, Client, Utilization Status, Schedule Status)
    - Sortable results table with color-coded status badges
    - Excel export
    - Status legend explaining utilization and schedule thresholds

- **Revenue Forecaster (app 16)** to `/apps/revenue-forecast`:
  - Created `/api/revenue-forecast` - API that:
    - Fetches BigTime actuals for historical months
    - Loads staff assignments (plan) from Snowflake
    - Loads fixed fee revenue from Snowflake
    - Fetches open pipeline deals from Pipedrive
    - Builds 5 sections:
      - Section 1: Hours-Based (all projects use Hours x Rate)
      - Section 2: Fixed Fee Reflected (uses scheduled revenue for FF projects)
      - Section 3: Pipeline Deals (unfactored)
      - Section 4: Pipeline Deals (factored by stage probability)
      - Section 5: Unified Forecast (Won at 100% + Factored Pipeline)
    - Supports configurable probability overrides for Qualified/Proposal/Forecast stages
  - Created `/apps/revenue-forecast` page with:
    - Month range selector
    - Hours vs Revenue toggle
    - Probability override sliders (Qualified, Proposal, Forecast)
    - Collapsible section tables with grand totals
    - Excel export (one sheet per section)

- **Sales Snapshot (app 18)** to `/apps/sales-snapshot`:
  - Created `/api/sales-snapshot` - API that:
    - Fetches Pipedrive stages with probabilities
    - Fetches Pipedrive users
    - Fetches deals with optional date filtering
    - Groups deals by stage, calculates factored values
    - Builds summary by All Deals, Qualified Pipeline, Booked Deals
    - Aggregates by owner
  - Created `/apps/sales-snapshot` page with:
    - Date range selector (This Quarter, Last Quarter, Next Quarter, This Year, Last Year, All Dates, Custom)
    - Summary cards (All Deals, Qualified Pipeline, Booked Deals)
    - CSS-based bar chart showing pipeline by stage
    - Summary by Stage table
    - Deal Details table (pivot style with stages as columns)
    - Owner Details table
    - Excel export

- **Time Reviewer (app 06)** to `/apps/time-reviewer`:
  - Created `/api/time-reviewer` - API that:
    - Fetches 3 BigTime reports: Zero Hours (288578), Unsubmitted (284828), Detailed Time (284796)
    - Loads active staff from Snowflake
    - Loads assignments for project overrun checks
    - Performs 6 checks:
      1. Zero Hours - staff with no time reported
      2. Unsubmitted - timesheets not submitted or rejected
      3. Under 40 Hours - employees with less than 40 hours
      4. Non-Billable Client Work - client work marked as non-billable
      5. Project Overruns - staff/projects at 90%+ of assigned hours
      6. Poor Quality Notes - heuristic-based note quality check
    - Snaps selected date to nearest Friday
    - Optional note quality review
  - Created `/apps/time-reviewer` page with:
    - Date selector (auto-snaps to Friday)
    - Optional "Review billing notes" checkbox
    - Summary showing total issues found
    - Collapsible sections for each issue type
    - Color-coded sections (red, yellow, blue, orange, purple)
    - Excel export

- Updated MEMORIES.md to reflect 18/22 apps migrated

### 2026-01-23 - January 2025 Assignments Data Import
- **Imported 24 assignment records for January 2025** from `Voyage_Global_Config_20260122_1429.xlsx`:
  - Read the "2025" column (column I) from the Assignments sheet
  - Inserted all non-zero values as January 2025 (MONTH_DATE = '2025-01-01')
  - Records span 9 projects across 17 unique staff members
  - Total hours imported: ~9,500+ hours of historical assignment data
  - Includes notes where present (e.g., Peter Croswell's SOW note)

### 2026-01-23 - Staff Page Salary Privacy Toggle
- **Added show/hide toggle for salaries** on Settings > Staff page:
  - Salaries hidden by default, showing "••••••" placeholder
  - Click eye icon in Salary column header to toggle visibility
  - Eye icon changes between open (visible) and slashed (hidden) states
  - Hover effect on toggle button for better UX

### 2026-01-25 - Revenue by Client Report with State Apportionment
- **Created ad-hoc Revenue by Client report** at `/reports/revenue-by-client`:
  - Fetches QuickBooks Consulting Income for a given year
  - Groups transactions by client with name mapping applied
  - Created new Snowflake table `VC_CLIENT_STATE_MAPPING` to store client-state associations:
    - Columns: CLIENT_NAME, YEAR, STATE_CODE (2-letter), CREATED_AT, UPDATED_AT
    - Primary key on CLIENT_NAME + YEAR (so same client can be in different states different years)
  - Created `/api/client-states` endpoint (GET/POST) for managing state mappings
  - Created `/api/reports/revenue-by-client` endpoint
  - UI features:
    - Summary cards: Total Revenue, Clients, Transactions, Avg per Client, Unassigned States
    - **Revenue by State summary table** showing apportioned revenue with % breakdown
    - **Client table with State dropdown** - select state for each client, auto-saves
    - Unassigned clients highlighted in orange
    - Expandable rows to see transaction details
    - CSV download includes both client data and state summary
    - **Sortable columns** - click column headers to sort (default: by revenue desc)
    - Sort indicators (arrows) show current sort column and direction
    - "Unassigned" always stays at bottom of state table regardless of sort
- Added to Apps section in sidebar as "Revenue Apportionment"
- Fixed sidebar missing from reports page (wrapped with AppLayout component)

### 2026-01-23 - Sales Snapshot Chart Enhancement
- **Added Recharts pipeline chart** to Sales Snapshot app:
  - Installed `recharts` library for data visualization
  - Replaced CSS-based horizontal bars with proper ComposedChart
  - Chart features match the scheduled script's matplotlib output:
    - Blue bars for $ Pipeline (unfactored)
    - Green bars for $ Pipeline (Factored)
    - Orange line with markers for # Deals
    - Dual Y-axes ($ Value on left, # Deals on right)
    - Data labels on bars and line points
    - X-axis labels angled for readability
    - Legend in top right
    - Title with current date
  - Fixed TypeScript type issues with Recharts formatters

### 2026-01-28 - Document Manager 2.0 Phase 1 Implementation
- **Infrastructure Setup:**
  - Created R2 utility at `src/lib/r2.ts` with upload, download, list, delete, and signed URL functions
  - Uses AWS SDK S3 client (R2 is S3-compatible)
  - Installed `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` packages

- **API Routes Created:**
  - `GET/POST /api/documents` - List documents with filtering, create document records
  - `GET/PUT/DELETE /api/documents/[id]` - Get, update, soft/hard delete documents
  - `POST /api/documents/upload` - Upload file to R2, create Snowflake record with SHA-256 hash

- **Pages Created:**
  - `/documents` - Redirects to queue
  - `/documents/queue` - Lists documents with status 'pending_review', shows summary cards
  - `/documents/upload` - Drag-drop file upload with duplicate detection
  - `/documents/archive` - Placeholder for future archive browsing

- **Key Features:**
  - Duplicate detection via SHA-256 file hash
  - Files stored in R2 at `to-file/{uuid}.{ext}`
  - Soft delete with 30-day retention before permanent deletion
  - Document records stored in Snowflake DOCUMENTS table

- **Environment Variables Required:**
  - R2_ACCOUNT_ID
  - R2_ACCESS_KEY_ID
  - R2_SECRET_ACCESS_KEY
  - R2_BUCKET_NAME
  - EMAIL_WEBHOOK_SECRET - Shared secret for Cloudflare email worker webhook (in Vercel + Codespace)

- Added Badge component via shadcn/ui

- **Phase 2: AI Processing & Review Workflow:**
  - Created `/api/documents/[id]/process` - AI processing endpoint:
    - Downloads PDF from R2
    - Sends to Gemini (primary) with classification prompt
    - Falls back to Claude if Gemini fails (429 quota)
    - Updates document record with extracted attributes
    - Supports both CONTRACT and DOCUMENT classification
  - Created `/api/documents/[id]/view-url` - Generates signed R2 URLs for PDF viewing
  - Created `/documents/review/[id]` - Review page with:
    - Split-screen layout: PDF preview (left) + edit form (right)
    - Editable fields for all AI-extracted attributes
    - Contract fields: category, type, counterparty, sub_entity, executed_date, etc.
    - Document fields: issuer_category, issuer_name, document_type, amount, etc.
    - Approve & Archive button (sets status to 'archived')
    - Delete button (soft delete)
    - AI confidence score and model used displayed
  - Updated queue page with:
    - "Process" button for individual documents
    - "Process All" button for batch processing
    - AI Status column showing Contract/Document classification
    - Confidence percentage display
    - Review link to new review page
  - **AI Classification Field Naming Conventions:**
    - CONTRACTOR: `counterparty` = company name, `sub_entity` = individual name (Last, First)
    - COMPANY: `counterparty` = client name, `sub_entity` = department/division
    - EMPLOYEE: `counterparty` = employee name (Last, First), `sub_entity` = not used
    - DOCUMENT: `issuer_name` = top-level entity, `sub_entity` = agency/department
    - Invoice types: VENDOR (bill received), CLIENT (invoice sent), CONTRACTOR
  - **Automatic AI Processing on Upload:**
    - PDF files are automatically processed by AI during upload
    - Gemini (primary) or Claude (fallback) classifies the document
    - Document record is updated with AI-extracted attributes before returning
    - Non-PDF files skip AI processing (upload still succeeds)
    - AI processing failures are non-fatal (document still uploads)

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

### 2026-01-30 - Payroll Helper Decimal Fix
- **Fixed decimal precision in Payroll Helper app:**
  - Changed all hour values from `.toFixed(1)` to `.toFixed(2)`
  - Now shows 2 decimal places to match BigTime and Gusto payroll system
  - Affects: Regular hours, Paid Leave, Sick Leave, Holiday, Unpaid Leave columns
  - Both Hourly/TFT/PTE and Full-Time employee tables updated
- Deployed to production

### 2026-01-30 - Assignments Page Save Error Fix
- **Investigated "Failed to save changes" error on assignments page:**
  - User reported changes not storing and getting error messages
  - Added proper `response.ok` check to `handleRateChange` (was missing)
  - Improved error messages in both frontend and API to show actual Snowflake errors
  - API now returns detailed error messages (e.g., "Failed to update assignment: [Snowflake error]")
  - Frontend now shows server error message in toast instead of generic "Failed to save"
  - Added validation for assignment ID to catch invalid values early
- **Root cause found: Snowflake doesn't support `RETURNING` clause**
  - Error: `SQL compilation error: syntax error line 5 at position 6 unexpected 'RETURNING'`
  - Fixed all 6 API routes that used `RETURNING`:
    - `/api/assignments/route.ts` - now queries back using PROJECT_ID + STAFF_NAME + MONTH_DATE
    - `/api/assignments/bulk/route.ts` - same fix
    - `/api/commission-rules/route.ts` - now uses `SELECT MAX(RULE_ID)`
    - `/api/benefits/route.ts` - now queries back using CODE field
    - `/api/offsets/route.ts` - now uses `SELECT MAX(OFFSET_ID)`
    - `/api/mapping/route.ts` - now uses `SELECT MAX(MAPPING_ID)`
    - `/api/fixed-fee/route.ts` - now queries back using PROJECT_ID + MONTH_DATE
- **Deployed fix to production** - assignments page should now save correctly

### 2026-02-02 - Streamlit Removal & Workflow Cleanup
- **Removed Streamlit completely from the project:**
  - Deleted `Home.py` (Streamlit entry point)
  - Deleted `.streamlit/` folder (secrets now only in `.env`)
  - Removed `streamlit>=1.32.0` from `requirements.txt`
  - Killed running Streamlit process
- **Deleted Email Vault Processor GitHub workflow:**
  - Removed `.github/workflows/email_vault.yml` (ran every 15 minutes)
  - Deleted `scripts/email_vault_cron.py` (the script it ran)
  - This was the old document manager - now replaced by Document Manager on Vercel
- **Updated CLAUDE.md:**
  - Removed all Streamlit references from active documentation
  - Updated tech stack to reflect current architecture
  - Cleaned up Phase 3 migration planning (now complete)
  - Historical session logs preserved for reference

### 2026-02-03 - Contract Reviewer API Key Fix
- **Fixed Contract Reviewer 401 authentication error:**
  - Issue: Contract Reviewer was getting "invalid x-api-key" 401 errors
  - Root cause: Two different env vars exist (`ANTHROPIC_API_KEY` and `CLAUDE_API_KEY`)
  - Fix: Updated all Claude-using code to try `ANTHROPIC_API_KEY` first, fall back to `CLAUDE_API_KEY`

### 2026-02-04 - Standardized on CLAUDE_API_KEY
- **Removed all ANTHROPIC_API_KEY references** to simplify configuration:
  - All Claude-using code now uses only `CLAUDE_API_KEY`
  - Files updated:
    - `web/src/app/api/contract-review/route.ts` - Contract Reviewer
    - `web/src/app/api/documents/process/route.ts` - Document Manager AI (batch processing)
    - `web/src/app/api/documents/[id]/process/route.ts` - Document Manager AI (single doc)
    - `web/src/app/api/documents/test-ai/route.ts` - AI test endpoint
    - `web/src/app/api/health/route.ts` - Connection Health Checker
  - User can now delete `ANTHROPIC_API_KEY` from Vercel to avoid confusion
  - Only `CLAUDE_API_KEY` is needed going forward

### 2026-02-04 - Document Manager UX Improvements
- **Improved AI notes for SOWs/CSOWs:**
  - Added NOTE RULES to AI prompt so SOW notes describe the client engagement
  - Example: "SOW for State of North Dakota, Retirement Investment Office engagement"
  - Instead of unhelpful: "Contractor Agreement dated June 28, 2025"
- **Simplified document detail page buttons:**
  - For pending documents (Review tab): Shows "Save & Archive" button (saves edits and archives)
  - For archived documents (Archive tab): Shows "Save" button (just saves edits)
  - Removed redundant separate "Save" button for pending documents
  - Cancel button now returns to appropriate tab based on document status

### 2026-02-05 - Twilio Phone System Setup
- **Added Twilio IVR phone system** to the project:
  - 9 API route handlers under `/api/voice/`
  - Lightweight TwiML XML helper (`web/src/lib/twiml.ts`) — no Twilio SDK needed
  - Phone config with directory entries (`web/src/lib/phone-config.ts`)
  - Documentation at `docs/phone-system.md`
- **Call flow:** Greeting → IVR menu (services/directory/operator) → simultaneous ring → voicemail
- **Twilio number:** +1 (844) 790-5332
- **Operators:** Andrew (+13122120815) and Emma (+12404401901) ring simultaneously
- **Voicemail email:** hello@voyageadvisory.com
- **Middleware updated:** `api/voice` routes excluded from auth (Twilio webhooks need unauthenticated access)
- **Vercel env vars created:** TWILIO_PHONE_NUMBER, OPERATOR_PHONE_1/2, PHONE_SYSTEM_BASE_URL, VOICEMAIL_EMAIL
- **Still needed:** Andrew must update TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN with real values in Vercel Dashboard
- **Build verified:** No TypeScript errors
- **Endpoints tested:** All return valid TwiML XML

### 2026-02-06 - SMS-to-Email Forwarding & Twilio Setup Endpoint
- **Added SMS forwarding** to the phone system:
  - New endpoint: `POST /api/voice/sms-incoming` — Twilio webhook for incoming texts
  - Forwards SMS (and MMS attachments) as emails to hello@voyageadvisory.com via Gmail API
  - Includes sender number, recipient number, message body, and media attachment links
  - Returns empty TwiML `<Response>` (no auto-reply)
- **Extracted shared Gmail helper** (`web/src/lib/gmail.ts`):
  - `sendGmailNotification({ to, subject, htmlBody })` — used by voicemail + SMS handlers
  - Refactored voicemail-transcription to use shared helper (reduced duplication)
- **Added Twilio setup endpoint** (`/api/voice/setup`):
  - `GET` — shows current webhook config for all phone numbers on the account
  - `POST` — configures voice + SMS webhooks on all numbers (or a specific one via `{ phoneNumber: "+1..." }`)
  - Runs on Vercel where Twilio credentials are available at runtime
  - Designed for multiple numbers — re-run after adding a new Twilio number to configure it
- **To activate:** Deploy to Vercel, then `curl -X POST https://apps.voyage.xyz/api/voice/setup`

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

**VC_STAFF_ASSIGNMENTS** (155 rows - normalized, one row per staff/project/month):
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

## API Integrations Status

| API | Status | Used By |
|-----|--------|---------|
| Snowflake | WORKING | All apps |
| Pipedrive | WORKING | Bookings, Revenue Forecaster, Project Health |
| BigTime | WORKING | Time entries, expenses |
| QuickBooks | WORKING | Commission Calculator |
| Gmail | WORKING | Email reports |
| Cloudflare R2 | WORKING | Document Manager |
| Claude/Gemini | WORKING | Document Manager AI, Contract Reviewer |
| Twilio | WORKING | Phone System IVR + SMS forwarding |

**Claude API Key Configuration:**
- Use `CLAUDE_API_KEY` in Vercel (ANTHROPIC_API_KEY has been removed)
- All Claude-using code references only `CLAUDE_API_KEY`
- If Contract Reviewer or Document Manager AI returns 401 errors, verify CLAUDE_API_KEY in Vercel Dashboard

---

## Twilio Phone System (IVR)

**Status:** LIVE (voice + SMS webhooks configured)
**Twilio Number:** +1 (844) 790-5332
**Documentation:** `docs/phone-system.md`

### Call Flow
```
Caller dials +1 (844) 790-5332
  → POST /api/voice/incoming → Greeting + IVR menu
  → Press 1 (services) → Brief overview → Transfer to operator
  → Press 2 (directory) → Andrew (ext 1), Emma (ext 2)
  → Press 0 (operator) → Rings Andrew + Emma simultaneously
    → No answer → Voicemail → Transcribed → Logged
```

### API Routes (all unauthenticated — Twilio webhooks)
| Route | Purpose |
|-------|---------|
| `POST /api/voice/incoming` | Main greeting + IVR menu |
| `POST /api/voice/menu` | Routes keypress/speech selection |
| `POST /api/voice/operator` | Simultaneous ring (Andrew + Emma) |
| `POST /api/voice/operator-status` | No answer → voicemail |
| `POST /api/voice/directory` | Company directory menu |
| `POST /api/voice/directory-route` | Connects to selected person |
| `POST /api/voice/voicemail` | Records voicemail |
| `POST /api/voice/voicemail-complete` | Thanks caller, hangs up |
| `POST /api/voice/voicemail-transcription` | Receives transcription, emails to hello@ |
| `POST /api/voice/sms-incoming` | Incoming SMS → emails to hello@ (with MMS attachments) |
| `GET /api/voice/setup` | Show current Twilio webhook config for all numbers |
| `POST /api/voice/setup` | Configure voice + SMS webhooks on all Twilio numbers |

### Key Files
| File | Purpose |
|------|---------|
| `web/src/lib/twiml.ts` | Lightweight TwiML XML helper (no Twilio SDK needed) |
| `web/src/lib/phone-config.ts` | Phone numbers, directory entries, settings |
| `web/src/lib/gmail.ts` | Shared Gmail API helper (used by voicemail + SMS notifications) |
| `web/src/app/api/voice/*/route.ts` | 11 API route handlers |
| `docs/phone-system.md` | Full documentation |

### Environment Variables (Vercel)
| Variable | Value | Status |
|----------|-------|--------|
| `TWILIO_ACCOUNT_SID` | AC... | Set |
| `TWILIO_AUTH_TOKEN` | (secret) | Set |
| `TWILIO_PHONE_NUMBER` | +18447905332 | Set |
| `OPERATOR_PHONE_1` | +13122120815 (Andrew) | Set |
| `OPERATOR_PHONE_2` | +12404401901 (Emma) | Set |
| `PHONE_SYSTEM_BASE_URL` | https://apps.voyage.xyz | Set |
| `VOICEMAIL_EMAIL` | hello@voyageadvisory.com | Set |

### To Go Live
1. Andrew updates `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in Vercel Dashboard
2. Deploy to production: `npx vercel --prod --token gcsACrDUYSjDtKnf0EQda6f3`
3. Configure webhooks (choose one):
   - **Auto (recommended):** `curl -X POST https://apps.voyage.xyz/api/voice/setup` — configures all numbers
   - **Manual:** In Twilio Console → Phone Numbers → your number:
     - Voice → A Call Comes In: `https://apps.voyage.xyz/api/voice/incoming` (HTTP POST)
     - Messaging → A Message Comes In: `https://apps.voyage.xyz/api/voice/sms-incoming` (HTTP POST)
4. Verify: `curl https://apps.voyage.xyz/api/voice/setup` — shows current webhook config
5. Call and text the number to test

### Phase 2 (Future): AI Receptionist
Path 1 ("learn more") will connect to a ConversationRelay-powered AI using Claude to have natural conversations about Voyage services.

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

---

## Document Manager 2.0 - Major Refactor (2026-02-01)

### Overview of Changes

This refactor modernized Document Manager 2.0 with the following changes:

| Before | After |
|--------|-------|
| UUID (36 chars) | NanoID (10 chars alphanumeric) |
| counterparty | party |
| sub_entity | sub_party |
| description | notes |
| AI on upload | AI via "Process Selected" button |
| 2 tabs (Queue, Archive) | 3 tabs (Import, Review, Archive) |
| status: pending_review | status: uploaded → pending_approval → archived |
| One-at-a-time approval | Batch approval with checkboxes |
| No delete before processing | Delete available in Import tab |

### Database Schema

**Table:** `VOYAGE_APP_STORE.PUBLIC.DOCUMENTS`

```sql
CREATE TABLE DOCUMENTS (
    id VARCHAR(10) PRIMARY KEY,  -- NanoID, 10 chars alphanumeric
    original_filename VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size_bytes NUMBER,
    file_hash VARCHAR(64),

    status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
    -- Values: uploaded (waiting for AI), pending_approval (AI done), archived, deleted

    is_contract BOOLEAN,

    -- Contract fields
    document_category VARCHAR(20),  -- EMPLOYEE, CONTRACTOR, COMPANY
    contract_type VARCHAR(50),
    party VARCHAR(500),           -- Renamed from counterparty
    sub_party VARCHAR(500),       -- Renamed from sub_entity
    executed_date DATE,

    -- Document fields
    issuer_category VARCHAR(30),
    document_type VARCHAR(100),
    period_end_date DATE,
    letter_date DATE,
    account_last4 VARCHAR(10),

    -- Shared
    notes TEXT,                   -- Renamed from description

    -- AI processing
    ai_extracted_text TEXT,
    ai_confidence_score DECIMAL(3,2),
    ai_raw_response VARIANT,
    ai_model_used VARCHAR(50),
    ai_processed_at TIMESTAMP_NTZ,

    -- Duplicate handling, source tracking, audit fields...
);
```

### NanoID Implementation

Created `web/src/lib/nanoid.ts` for generating 10-character alphanumeric IDs:
- Uses customAlphabet: `0-9A-Za-z`
- Collision detection with retry (up to 5 attempts)
- Package: `nanoid` (installed via npm)

### Three Tab Structure

**Routes:**
- `/documents` → redirects to `/documents/import`
- `/documents/import` → Import tab (upload + unprocessed files)
- `/documents/review` → Review tab (pending approval, batch UI)
- `/documents/archive` → Archive tab (approved documents)
- `/documents/review/[id]` → Detail view with embedded PDF

**Status Flow:**
```
uploaded → pending_approval → archived
              ↓
           deleted
```

### Import Tab Features

- Drag-drop upload zone
- Lists documents with status='uploaded' (not yet AI processed)
- Checkboxes to select files
- "Process Selected" button triggers AI processing on selected files
- "Delete" button deletes selected files without processing
- Shows source (upload vs email) and relative time

### Review Tab Features

Gmail-style batch approval:
- Checkboxes for batch selection
- "Select All" checkbox
- "Approve Selected" button → moves all to Archive
- "Delete" button → soft deletes selected
- Party column shows: `party (sub_party)` format
- Type column: contract_type for contracts, document_type for documents
- Date column: executed_date for contracts, letter_date/period_end_date for documents
- Click row to view details
- Dropdown menu per row: View Details, Approve, Delete

### Archive Tab Features

- Read-only list of archived documents
- Search functionality
- Download and view options
- No checkboxes (read-only)

### API Endpoints

**New/Updated:**
- `POST /api/documents/reset-schema` - Drop and recreate DOCUMENTS table
- `POST /api/documents/process` - Process selected documents with AI
  - Body: `{ ids: string[] }`
  - Sets status to 'pending_approval', ai_processed_at to now
- `POST /api/documents/batch` - Batch operations
  - Body: `{ action: 'approve' | 'delete', ids: string[] }`
  - Approve: set status='archived', reviewed_at=now
  - Delete: set status='deleted', deleted_at=now

**Existing (updated):**
- `POST /api/documents/upload` - Uses NanoID, sets status='uploaded', no auto AI
- `GET /api/documents?status=X` - List by status (uploaded|pending_approval|archived)
- `GET/PUT/DELETE /api/documents/[id]` - CRUD with party/sub_party/notes fields

**Email Integration:**
- `POST /api/documents/from-email` - Webhook called by Cloudflare email worker
  - Requires Bearer token matching EMAIL_WEBHOOK_SECRET
  - Creates document record with source='email'
  - Email address: voyagevault@studeesandbox.com
- `GET/POST /api/documents/cleanup` - List/delete orphaned R2 files

### Cloudflare Email Worker

**Location:** `/workers/email-receiver/`

**Worker Name:** `voyage-email-receiver`

**How it works:**
1. Emails sent to `voyagevault@studeesandbox.com` are routed to the worker via Cloudflare Email Routing
2. Worker parses email using `postal-mime` library
3. If email has PDF attachments → uploads each PDF to R2
4. If no PDF attachments → converts email body to simple PDF and uploads
5. Calls `/api/documents/from-email` to create database record for each file

**Worker Bindings:**
- `VOYAGE_DOCUMENTS` - R2 bucket binding to `voyage-documents`
- `API_URL` - `https://apps.voyage.xyz`
- `API_SECRET` - Same value as EMAIL_WEBHOOK_SECRET (set via `wrangler secret put API_SECRET`)

**Deployment:**
```bash
cd workers/email-receiver
export CLOUDFLARE_API_TOKEN="<token>"
npx wrangler deploy
```

**Debugging:**
```bash
export CLOUDFLARE_API_TOKEN="<token>"
npx wrangler tail voyage-email-receiver --format pretty
```

**Key Files:**
- `workers/email-receiver/src/index.ts` - Main worker code
- `workers/email-receiver/wrangler.toml` - Worker configuration

### AI Classification Prompt

Updated to use new field names:

**For CONTRACTS:**
- `party`: Company or person name
- `sub_party`:
  - CONTRACTOR: individual name "Last, First" (e.g., "Alam, Shah")
  - COMPANY with government/large org: department/agency name
  - EMPLOYEE: null
- `notes`: Brief description if helpful

**For DOCUMENTS:**
- `party`: issuer name (bank, government entity, company)
- `sub_party`:
  - GOVERNMENT_STATE/FEDERAL: agency name
  - Large company with division: division name
  - Otherwise: null
- `account_last4`: Put in this field, NOT in notes

Removed `is_corp_to_corp` field entirely.

### Testing Checklist

1. Upload a PDF via drag-drop → should appear in Import tab with status 'uploaded'
2. Select file(s) → click "Process Selected" → AI runs → files move to Review tab
3. Select file(s) in Import → click "Delete" → files disappear
4. Review tab shows AI-extracted party/type/date in columns
5. Click row in Review → opens detail view with embedded PDF and editable form
6. Select multiple in Review → click "Approve Selected" → all move to Archive
7. Archive tab shows approved documents
8. All IDs should be 10-character alphanumeric NanoIDs

---

## Document Manager 2.0 - Phase 2 Updates

### Overview

Phase 2 simplifies the type system and adds AI-powered search capabilities:
1. **Simplified document types**: Contract / Document / Invoice
2. **AI Summary field**: 2-4 sentence descriptions for searchability
3. **AI-powered archive search**: Semantic search using Gemini
4. **Duplicate detection**: Warns before archiving potential duplicates
5. **Three-folder R2 structure**: import/ → review/ → archive/
6. **Sortable columns**: Click column headers to sort on Review and Archive pages
7. **Smart download filenames**: Downloads use meaningful names based on metadata

### Type System

**Top-level `document_type_category`:**
- `contract` - Signatures, commitments, agreements
- `document` - Informational correspondence
- `invoice` - Bills to pay or invoices sent

**For Contracts only, sub-categories (`document_category`):**
- EMPLOYEE (offer letters, bonus plans, CNAPs)
- CONTRACTOR (SubK, CSOW)
- VENDOR (MSAs, NDAs with vendors)
- CLIENT (MSAs, SOWs with clients)
- PARTNER (teaming agreements, joint ventures, referral agreements)

**For Documents:** No sub-categories. Uses:
- `party` (who it's from)
- `sub_party` (agency/department)
- `document_type` (Statement, Notice, Letter, etc.)

**For Invoices:** Uses:
- `party` (vendor or client name)
- `document_type` (Invoice)
- `amount`, `due_date` fields
- `invoice_type` (PAYABLE or RECEIVABLE)

### New Database Fields

```sql
ALTER TABLE DOCUMENTS ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE DOCUMENTS ADD COLUMN IF NOT EXISTS document_type_category VARCHAR(20);
ALTER TABLE DOCUMENTS ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2);
ALTER TABLE DOCUMENTS ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE DOCUMENTS ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20);
```

Run migration: `POST /api/documents/migrate-schema`

### AI Classification Prompt (Phase 2)

**CRITICAL RULE - PARTY IDENTIFICATION:**

The party field should almost NEVER be "Voyage Advisory" or "Voyage Advisory LLC".
Voyage Advisory is the company that owns this document management system.
The party should be the OTHER party in the relationship:

- For contracts: party = the other company or person (client, vendor, contractor, employee)
- For documents: party = the issuer/sender (bank, government, utility)
- For invoices: party = the vendor billing us or the client we're billing

The ONLY exceptions where party = "Voyage Advisory" are internal documents like:
- Operating agreements
- Articles of incorporation
- Standard operating procedures
- Internal policies

**CONTRACTOR PARTY RULES:**
- If the contractor operates through a company (LLC, Inc, Corp, etc.):
  - party = The contractor's company name (e.g., "Jill Hanson Consulting LLC")
  - sub_party = The individual contractor's name in "Last, First" format (e.g., "Hanson, Jill")
- If the contractor is an individual with no company entity:
  - party = The individual's name in "Last, First" format (e.g., "Wise, Marc")
  - sub_party = null
- NEVER set party to "Voyage Advisory" for contractor documents

The AI now returns:
```json
{
  "document_type_category": "contract" | "document" | "invoice",
  "party": "...",
  "sub_party": "..." or null,
  "document_type": "...",
  "document_date": "YYYY-MM-DD",  // Unified date field for all types
  "ai_summary": "2-4 sentence summary for searching...",
  "notes": "Additional context" or null,
  "confidence_score": 0.0-1.0,
  // Contract-specific:
  "document_category": "EMPLOYEE" | "CONTRACTOR" | "VENDOR" | "CLIENT" | "PARTNER",
  "contract_type": "...",
  // Invoice-specific:
  "amount": 5000.00,
  "due_date": "YYYY-MM-DD"
}
```

**Note:** The `document_date` field is the single date field returned by AI for all document types:
- For contracts: the signed/executed date
- For documents: the letter date or statement period date
- For invoices: the invoice date (due_date is a separate field)

### Smart Download Filenames

When downloading a document, the filename follows this convention:
`{party} ({sub_party}) - {YYYY.MM.DD} - {document_type}.pdf`

Rules:
- If sub_party exists: `3TR Advisors LLC (Charwinsky, John) - 2025.09.27 - Contractor Agreement.pdf`
- If no sub_party: `Chase - 2026.01.15 - Statement.pdf`
- If no date: `Smith, John - Offer Letter.pdf`
- Date uses unified `document_date` field (falls back to legacy fields for older documents)
- Notes appended if present and short: `Chase - 2026.01.15 - Statement - xxxx4521.pdf`
- Sanitized: characters not safe for filenames (/ \ : * ? " < > |) replaced with underscore

Use `GET /api/documents/{id}/download` to download with proper Content-Disposition header.

### New API Endpoints (Phase 2)

**Schema Migration:**
- `POST /api/documents/migrate-schema` - Add new columns (non-destructive)
- `GET /api/documents/migrate-schema` - Check current schema

**AI-Powered Search:**
- `POST /api/documents/search` - Semantic search using Gemini
  - Body: `{ q: "search query" }`
  - Searches: filename, party, sub_party, document_type, ai_summary, notes, amounts
  - Falls back to text search if Gemini unavailable

**Duplicate Detection:**
- `POST /api/documents/check-duplicates` - Check for similar documents
  - Body: `{ id: "document_id" }`
  - Returns similar documents with similarity reasons
  - Called automatically before archiving

**Scan Inbox:**
- `POST /api/documents/scan-inbox` - Create DB records for R2 files without records
- `GET /api/documents/scan-inbox` - Preview what would be found (dry run)

### R2 Folder Structure

```
voyage-documents/
├── import/     ← Files land here (upload, email, direct R2)
├── review/     ← After AI processing, renamed to {nanoid}.pdf
└── archive/    ← After approval
```

**File Flow:**
1. Upload/email → `import/{nanoid}.pdf`
2. AI processing → moves to `review/{nanoid}.pdf`
3. Approval → moves to `archive/{nanoid}.pdf`

### UI Changes (Phase 2)

**Review and Archive Grids:**
- No original filename shown in grid rows (only on detail page)
- Sortable columns: Click column header to sort (Party, Type, Date, Notes)
- Click again for descending, click again to remove sort
- Sort indicator (▲/▼) shows current sort column
- Default sort: Date descending (newest first)

**Review Detail Page:**
- Shows original filename in header: "Review: {original_filename}"
- Document Type dropdown: Contract / Document / Invoice
- AI Summary displayed in read-only box
- Contract: shows Category (EMPLOYEE/CONTRACTOR/VENDOR/CLIENT/PARTNER)
- Invoice: shows Amount, Due Date, Invoice Type (PAYABLE/RECEIVABLE)
- Duplicate detection modal before archiving

**Archive Page:**
- Smart Search toggle button
- Local filtering (instant) vs AI search (semantic)
- Notes column shows `notes` field (not ai_summary)
- Type badges: purple (contract), amber (invoice), teal (document)

### Files Modified (Phase 2)

**New Files:**
- `web/src/app/api/documents/migrate-schema/route.ts` - Schema migration
- `web/src/app/api/documents/search/route.ts` - AI-powered search
- `web/src/app/api/documents/check-duplicates/route.ts` - Duplicate detection
- `web/src/app/api/documents/scan-inbox/route.ts` - Scan for R2 orphans

**Updated Files:**
- `web/src/app/api/documents/process/route.ts` - New AI prompt with party identification rules
- `web/src/app/api/documents/[id]/view-url/route.ts` - Smart download filename generation
- `web/src/app/documents/review/page.tsx` - Sortable columns, removed filename from grid
- `web/src/app/documents/review/[id]/page.tsx` - New form fields, duplicate modal
- `web/src/app/documents/archive/page.tsx` - Sortable columns, Notes column, Smart search UI
- `web/src/app/documents/import/page.tsx` - Scan inbox button

---

### Files Modified

**New Files:**
- `web/src/lib/nanoid.ts` - NanoID generator
- `web/src/app/api/documents/reset-schema/route.ts` - Schema reset endpoint
- `web/src/app/api/documents/process/route.ts` - Batch AI processing
- `web/src/app/api/documents/batch/route.ts` - Batch approve/delete
- `web/src/app/documents/import/page.tsx` - Import tab
- `web/src/app/documents/review/page.tsx` - Review tab (list view)

**Updated Files:**
- `web/src/app/api/documents/route.ts` - party/sub_party/notes fields
- `web/src/app/api/documents/[id]/route.ts` - party/sub_party/notes fields
- `web/src/app/api/documents/upload/route.ts` - NanoID, no auto AI
- `web/src/app/api/documents/[id]/process/route.ts` - Updated AI prompt
- `web/src/app/documents/page.tsx` - Redirect to /import
- `web/src/app/documents/archive/page.tsx` - Updated with new UI
- `web/src/app/documents/review/[id]/page.tsx` - party/sub_party/notes form fields

---

## Document Manager 2.0 - Phase 3 Bug Fixes (2026-02-01)

### Bug Fixes Completed

| Bug | Issue | Fix |
|-----|-------|-----|
| Bug 1 | Smart download filename not working | Created dedicated `/api/documents/[id]/download` endpoint with Content-Disposition header |
| Bug 2 | Save changes not persisting on Review tab | Added all new fields to PUT endpoint's allowedFields array |
| Bug 3 | Multiple date fields confusing | Unified to single `document_date` column, AI returns one date |
| Bug 4 | Too many form fields on detail page | Simplified to show only specified fields per document type |
| Bug 5 | Archive tab missing checkboxes/actions | Added checkboxes, bulk Download/Delete actions to match Review tab |
| Bug 6 | Inconsistent labels | Changed all to "Party" and "Sub-Party" |
| Bug 7 | Detail page showed wrong view initially | Form now renders correct fields based on document_type_category immediately |

### New Database Fields

```sql
ALTER TABLE DOCUMENTS ADD COLUMN IF NOT EXISTS document_date DATE;
-- Migration updates existing documents:
UPDATE DOCUMENTS SET document_date = COALESCE(executed_date, letter_date, period_end_date) WHERE document_date IS NULL;
```

### Files Modified (Phase 3)

**New Files:**
- `web/src/app/api/documents/[id]/download/route.ts` - Download endpoint with smart filename

**Updated Files:**
- `web/src/app/api/documents/migrate-schema/route.ts` - Added document_date migration
- `web/src/app/api/documents/[id]/route.ts` - Fixed allowedFields for PUT
- `web/src/app/api/documents/process/route.ts` - Simplified AI prompt with document_date
- `web/src/app/documents/review/[id]/page.tsx` - Simplified form fields
- `web/src/app/documents/review/page.tsx` - Updated to use document_date
- `web/src/app/documents/archive/page.tsx` - Added checkboxes, bulk actions, uses document_date

### Detail Page Form Fields

**All Document Types:**
- Document Type: dropdown (Contract / Document / Invoice)
- Party: text input
- Sub-Party: text input
- Date: date picker (unified `document_date`)
- Notes: textarea
- AI Summary: read-only display

**Contract Only (additional):**
- Category: dropdown (EMPLOYEE / CONTRACTOR / VENDOR / CLIENT / PARTNER)
- Contract Type: text input (e.g., MSA, SOW, NDA, Offer Letter)

**Invoice Only (additional):**
- Amount: currency input
- Due Date: date picker

---

## Document Manager 2.0 - Phase 4 Improvements (2026-02-02)

### Issues Addressed

| # | Issue | Fix |
|---|-------|-----|
| 1 | Archive folder missing in R2 | PUT endpoint now moves files from import/ or review/ to archive/ when status changes to 'archived' |
| 2 | Search didn't support boolean queries | Added support for quoted phrases ("principal insurance"), AND operator, and NOT/-term exclusions |
| 3 | No pagination on Archive tab | Added pagination (100 per page) with Previous/Next controls |
| 4 | AI Summary only showing for some docs | Now always shows AI Summary section with placeholder when missing |
| 5 | Long filenames not wrapping | Changed from truncate to break-words on detail page |
| 6 | Import empty state message | Updated to mention Cloudflare upload and vault@voyageadvisory.com email |

### R2 Folder Structure (Fixed)

Files now correctly move through three folders:
```
voyage-documents/
├── import/     ← Files land here (upload, email, direct R2)
├── review/     ← After AI processing, renamed to {nanoid}.pdf
└── archive/    ← After approval
```

The PUT endpoint (`/api/documents/[id]`) now moves files to archive/ when status is set to 'archived'.

### Search Improvements

**Basic Search (Local Filter):**
- Instant filtering as you type
- Supports quoted phrases: `"principal insurance"`
- Supports AND operator: `principal AND invoice`
- Supports NOT/exclusion: `-invoice` or `NOT invoice`
- Searches: party, sub_party, filename, type, ai_summary, notes, date, amount

**Smart Search (AI-Powered):**
- Natural language queries: "find utility bills from 2024"
- Entity matching: "contracts with ECS" finds "ECS Federal"
- Date filtering: "from 2024", "last year", "this year"
- Amount queries: "invoices over $5000"
- Boolean support same as basic search

### Pagination

Archive tab now shows 100 documents per page with:
- Previous/Next buttons
- Page X of Y indicator
- "Showing 1-100 of 250" count
- Pagination hidden when searching (search returns all matches)

### Files Modified (Phase 4)

**Updated Files:**
- `web/src/app/api/documents/[id]/route.ts` - Added R2 file move on status='archived'
- `web/src/app/api/documents/search/route.ts` - Boolean query parsing, enhanced AI prompt
- `web/src/app/api/documents/process/route.ts` - Made ai_summary required in prompt
- `web/src/app/documents/archive/page.tsx` - Pagination, boolean local filter
- `web/src/app/documents/review/[id]/page.tsx` - Filename wrapping, AI Summary placeholder
- `web/src/app/documents/import/page.tsx` - Updated empty state message
