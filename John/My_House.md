# My House — Evolution & Current State

## Where We Started (Phase Gate 0 — Initial Build)

When the platform first launched, there was only one view: **City View**. This was the Apex NDR Sandbox — a global dashboard populated with seeded demo data representing network events, threat correlations, and identity logs. Every user who logged in saw the same data. There was no concept of tenant-scoped views.

The platform had multi-tenant authentication (Super User, Parent/Child tenants), 2FA OTP, and role-based access. But once authenticated, every user landed on the same City View with the same global seeded data. There was no "My House" — no way for a tenant to see data specific to their organization.

---

## How My House Evolved (Sprint Work — T001 through T007)

The need became clear: tenants needed their own space. A place where they could eventually see their own network events, their own threats, their own identity logs — scoped to their organization and isolated from every other tenant.

### What Was Built

1. **Tenant Data Layer**: Added `tenant_id` columns to `ndr-network`, `ndr-identity`, and `ndr-correlated` tables. Built `server/db/tenantData.ts` as the query layer that filters everything by `tenant_id`.

2. **Four My House Pages**:
   - **My Dashboard** (`my-dashboard.tsx`) — High-level stats: event counts, threat counts, identity log counts, severity breakdown, recent activity lists
   - **My Threats** (`my-threats.tsx`) — Card-based grid of threat correlations scoped to the tenant
   - **My Events** (`my-events.tsx`) — Table of network events scoped to the tenant
   - **My Identity** (`my-identity.tsx`) — Table of identity/access logs scoped to the tenant

3. **Five API Endpoints**: `/api/my/stats`, `/api/my/threats`, `/api/my/events`, `/api/my/identity`, `/api/my/dashboard` — all filtered by the authenticated user's `tenant_id`.

4. **Sidebar Navigation**: Added "My Organization" section to the sidebar with links to all four My House pages.

5. **OrgDropdown**: A view-switching dropdown that lets users toggle between:
   - **Apex NDR (Sandbox)** — the City View, the model home
   - **Their Organization** — their My House, their Command Center

6. **Seed Scripts**: `seed_tenant_starter_data.py` was created to populate a tenant's house with fabricated starter data at registration time — fake network events, threats, and identity logs stamped with their `tenant_id`.

### The Problem with Starter Seed Data

The seed scripts gave new tenants a house that appeared furnished from day one. But this was dishonest — the data was fabricated, not real. It didn't reflect anything the tenant had actually connected or monitored. It was fake furniture in a real house.

---

## Where We Are Now (Current State)

### The Corrected Mental Model

**City View = The Model Home (Showroom)**
- Apex NDR Sandbox
- Fully furnished with seeded demo data
- Shows what a monitored environment looks like when everything is connected
- Subtitle: "Seeded Data (Read Only)"
- Same view for ALL users — Super User, existing tenants, new trial signups
- This is the default landing page for everyone after login

**My House = The Tenant's Empty House**
- Created when a user clicks "+ Organization"
- Starts completely empty — no data, no events, no threats, no identity logs
- All four pages show clean empty states:
  - Dashboard: zero counts, "No threats/events detected" messages
  - Threats: "No threats detected for your organization. Your network is clean."
  - Events: "No network events for your organization yet."
  - Identity: "No identity logs for your organization yet."
- Subtitle: "Command Center"
- Data only appears when real integrations are plugged in

### The User Journey

1. **Any user logs in** (Super User, existing tenant, new trial) → lands on **City View** (model home, fully furnished)
2. **User clicks "+ Organization"** → creates their house
3. **OrgDropdown now shows two entries**:
   - Apex NDR (Sandbox) — the showroom
   - Their Organization — their empty house
4. **User switches to their organization** → sees empty dashboards, clean empty states
5. **Future: integrations get plugged in** → real data flows into their house

### The Furniture Arrives via Integrations (Future Gates)

The house stays empty until something is plugged in. Examples of future power sources:

| Device / Source | How It Connects | What Data Flows In |
|---|---|---|
| Laptop / Workstation | Zeek sensor or Wazuh agent | Network events, lateral movement detection |
| Cell Phone / Mobile | MDM enrollment | Mobile device logs |
| OneDrive / Google Drive | OAuth API connection | Cloud file monitoring |
| AWS / Azure | API keys or role assumption | Cloud infrastructure events |
| Firewall / Switch | Syslog or SNMP | Network perimeter data |
| Email (M365 / Gmail) | OAuth API connection | Phishing detection, email logs |

Every device gets stamped with the tenant's `tenant_id` at ingestion. The AI agents work inside that house only. No tenant can see another tenant's data.

### Phase 1 Reality (Now — Next 30-60 Days)

For the first 3-5 pilot tenants, the platform operator (you) personally helps plug in their integrations. You run the connection scripts, verify tenant isolation, and learn real-world edge cases. This is intentional — it makes the onboarding bulletproof before it becomes self-serve.

---

## Key Architecture Notes

- **Tenant isolation**: Every query in `tenantData.ts` filters by `tenant_id`. No cross-tenant data leakage is possible.
- **City View data**: Stored with `tenant_id = 'global'` in SQLite. Never modified by tenant operations.
- **My House data**: Stored with the tenant's unique `tenant_id`. Only accessible to users belonging to that tenant.
- **Empty state handling**: All four My House pages already have graceful empty state UI — icons, messages, and clean layouts when data arrays are empty.
- **Seed scripts remain in codebase**: `seed_trial_data.py` and `seed_tenant_starter_data.py` are not deleted. They are simply no longer called during registration for new tenants. The tenant starter seed script will no longer run at registration — My House starts empty by design.

---

## Files Involved

| File | Role |
|---|---|
| `server/db/tenantData.ts` | Query layer — all My House data access, filtered by tenant_id |
| `server/routes/tenantDashboard.ts` | API routes for /api/my/* endpoints |
| `client/src/pages/my-dashboard.tsx` | My House overview page |
| `client/src/pages/my-threats.tsx` | My House threats page |
| `client/src/pages/my-events.tsx` | My House events page |
| `client/src/pages/my-identity.tsx` | My House identity page |
| `client/src/components/OrgDropdown.tsx` | View switcher between City View and My House |
| `scripts/seed_trial_data.py` | Seeds global demo data (City View) — runs at startup |
| `scripts/seed_tenant_starter_data.py` | Was seeding tenant starter data — no longer called at registration |
| `server/routes/auth.ts` | Registration flow — tenant/user creation, OTP, seed script calls |
