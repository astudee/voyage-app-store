# Voyage App Store - Project Memories

> This file tracks our journey and context so Claude doesn't lose track between sessions.
> **Last updated:** 2026-01-22 (Added Pipedrive booking validation to assignments)

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

### Phase 2: Config Tools in Vercel [CURRENT]
- Build web-based config tools to replace Google Sheets UI
- Start with basic Snowflake connectivity proof
- Goal: CRUD interface for the config tables above

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

**Staff ID URL pattern:** `https://iq.bigtime.net/Bigtime/Staff2#/detail/{BIGTIME_STAFF_ID}`

**Note:** David Woods (STAFF_ID 104) has no BigTime account - BIGTIME_STAFF_ID is NULL.

---

## Pipedrive API Configuration

**Status:** Working in Streamlit AND Vercel

**Environment Variable:** `PIPEDRIVE_API_TOKEN`
- Streamlit: `.streamlit/secrets.toml`
- Vercel: Add via Vercel Dashboard > Settings > Environment Variables

**To add to Vercel:**
1. Go to https://vercel.com/astudees-projects/web/settings/environment-variables
2. Add: `PIPEDRIVE_API_TOKEN` = (value from .streamlit/secrets.toml)
3. Redeploy for changes to take effect

**Custom Fields in Pipedrive Deals:**
- BigTime Client ID
- BigTime Project ID (links Pipedrive deal to BigTime project)
- Bill Rate
- Budget Hours
- Project Duration (months)
- Project Start Date

**API Endpoints:**
- Streamlit: `pages/13_📊_Bookings_Tracker.py` - fetches won deals
- Vercel: `/api/pipedrive/booking?projectId=X` - finds deal by BigTime Project ID

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

---

## Notes for Future Sessions

- When testing Python scripts: `export $(grep -v '^#' .env | xargs) && PYTHONPATH=/workspaces/voyage-app-store python3 <script>`
- The sister project `voyage-consultant-tools` has working examples if stuck
- User prefers simple, working solutions over complex ones
- **Claude Code** auto-installs on codespace creation via `.devcontainer/devcontainer.json` postCreateCommand

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

**Future: Validation panel (after Pipedrive integration)**
```
Booking Amount: $65,000 (from Pipedrive)
Calculated:     $62,400
Variance:       -$2,600 (under-allocated)
```

### Pipedrive Integration (Future Enhancement)
- Add PIPEDRIVE_API_TOKEN to Vercel environment variables
- Fetch booking amounts via Pipedrive API (match by BigTime Project ID)
- Auto-validate assignment totals against deal values
- Show warning if variance > 5%
