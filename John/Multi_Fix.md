# Multi_Fix — Gap Analysis and Correction Plan

**Platform:** NDR Phase Gate 0
**Version:** v1.2
**Date:** 2026-03-08
**Status:** GAPS IDENTIFIED — CORRECTION REQUIRED
**Prime Directive:** No existing pages, features, look, or feel may be altered. All new features are additive (new pages, new left-pane navigation entries).

---

## 1. What Was Requested

The user requested a multi-tenant platform with two distinct data experiences:

1. **City View (Seeded Data):** A pre-loaded demo dashboard showing synthetic threats, network events, identity logs, sigma firings, kinetic executions, and response actions. Every user can view this data to understand the platform's capabilities. This is the shared, global demonstration layer.

2. **My House (Tenant-Scoped Data):** When a new user registers and creates an organization, they get their own isolated data space. "My House" shows only data that belongs to their tenant. A new user's house starts empty (or with a small seed) and grows as their organization generates real data. This is the private, tenant-isolated layer.

3. **View Toggle:** The user should be able to switch between City View (the demo) and My House (their own organization's data). This toggle should be accessible and intuitive.

4. **Parent/Child Hierarchy:** The parent (account creator) can invite up to 5 child users. All children see the same "My House" data as the parent — they share the same tenant. Children cannot see other tenants' data. The Super User (Conductor) can see every house.

---

## 2. What Was Delivered

### Fully Delivered

| Feature | Status | Detail |
|---------|--------|--------|
| Tenant creation on registration | COMPLETE | Every new user gets a unique tenant_id (slug + random suffix) |
| Parent/Child account model | COMPLETE | is_parent=1 for account creator, is_parent=0 for invitees |
| JWT with tenant_id | COMPLETE | Every token carries ndr_tenant_id, role, is_parent, is_trial |
| Super User (Conductor) | COMPLETE | super@ndr-platform.io sees all tenants, all users, God Mode |
| Platform Tenants management page | COMPLETE | Super admin: expand tenants, edit/delete users, extend trials |
| Parent Owner team management | COMPLETE | Owner: add/edit/delete children, max 5 seats, role restrictions |
| Tenant isolation on admin endpoints | COMPLETE | GET/POST/PATCH/DELETE /api/admin/children all filter by JWT tenant_id |
| Security guardrails | COMPLETE | Platform-core immutable, super_admin undeletable, cross-tenant 403s |
| 2FA OTP flow | COMPLETE | 6-digit code, bcrypt hash, 5-attempt limit, 60s resend cooldown |
| Demo account seeding | COMPLETE | admin@ndr-demo.io with 30-day trial and pre-seeded data |
| Org dropdown in header | COMPLETE | Shows organization name, sign out |
| Role-conditional dashboard views | COMPLETE | GridOperatorView (super_admin), TransformerOwnerView (non-super_admin) |
| Read-only mode for trial users | COMPLETE | 403 on mutations, amber badge in header |

### Not Delivered

| Feature | Status | Detail |
|---------|--------|--------|
| City View / My House toggle | NOT BUILT | No UI or mechanism to switch between demo data and tenant data |
| Tenant-scoped data storage | NOT BUILT | No tenant_id column on events, threats, correlations, or any pipeline data |
| Tenant-scoped API endpoints | NOT BUILT | All /api/events, /api/threats, /api/dashboard/stats serve global pipeline data |
| Empty "My House" for new tenants | NOT BUILT | New tenants see the global City View data as if it were theirs |
| Tenant-specific data ingestion | NOT BUILT | No mechanism for a tenant to generate or import their own data |

---

## 3. What Alpha NDR Actually Sees Today

Alpha NDR (`alpha@ndr-platform.io`) registered and created a new organization. Here is what happens:

1. Alpha NDR logs in with 2FA — works correctly
2. The org dropdown shows "Alpha NDR" — correct
3. The JWT contains `ndr_tenant_id: "alpha-ndr-xxxxxx"` — correct
4. Alpha NDR lands on the dashboard and sees:
   - Threat Correlations: 100+ (from the global pipeline)
   - Network Events: live stream (from the global pipeline)
   - Identity Logs: live stream (from the global pipeline)
   - Sigma Firings: live (from the global pipeline)
   - Pipeline metrics, host cardinality, dispatch surface — all global

**The problem:** None of this data belongs to Alpha NDR. It belongs to the global pipeline (the City View). Alpha NDR has no "My House" — they are standing in the city thinking it is their house.

The left-pane sidebar shows the seeded data count (e.g., "48" next to Threat Correlations) which is the original seed count. The main panel shows the live pipeline count which has grown beyond the seed. This mismatch further confuses the user about what data is "theirs."

---

## 4. Root Cause

The pipeline (`server/pipeline.ts`) operates as a singleton. It generates synthetic network events, correlates threats, fires sigma rules, and executes kinetic responses into in-memory arrays. These arrays have no tenant_id dimension.

Every API endpoint serves from these same arrays:

```
GET /api/events         -> pipeline.networkEvents (global)
GET /api/threats        -> pipeline.correlations (global)
GET /api/identity       -> pipeline.identityEvents (global)
GET /api/dashboard/stats -> pipeline.getDashboardStats() (global)
GET /api/sigma-firings  -> pipeline.sigmaFirings (global)
GET /api/kinetic-executions -> pipeline.kineticExecutions (global)
... (all endpoints are global)
```

The auth system correctly identifies WHO is asking (tenant, role, parent/child). But the data layer does not care who is asking — it returns everything to everyone.

---

## 5. What Needs to Be Corrected

### Prime Directive Constraints

- No existing page may be modified in look, feel, or behavior
- No existing feature may be removed or altered
- All new features are additive: new pages, new left-pane navigation entries
- The current dashboard (City View) remains exactly as it is

### Correction Items

#### C1: Tenant Data Store

Create a tenant-scoped data layer that stores events, threats, and correlations per tenant. This is separate from the global pipeline.

- New database tables (or new columns) with tenant_id on every row
- New tenants start with either empty data or a small starter seed
- This data is completely independent of the global pipeline

#### C2: "My House" Dashboard Pages

Create new pages that display only the authenticated tenant's data. These are NEW pages added to the left-pane navigation — the existing dashboard pages remain untouched.

- My Dashboard (tenant-scoped stats)
- My Threats (tenant-scoped correlations)
- My Events (tenant-scoped network events)
- My Identity (tenant-scoped identity logs)

Each page reads from the tenant data store (C1), filtered by the JWT's ndr_tenant_id.

#### C3: View Toggle or Navigation Separation

Provide a clear way for the user to understand the difference between City View and My House. Options:

**Option A — Separate Navigation Sections:**
Add a new left-pane section called "My Organization" with links to the tenant-scoped pages (C2). The existing navigation section remains labeled as "Platform Overview" or "Demo Data." The user navigates between sections naturally.

**Option B — Toggle Switch:**
Add a toggle in the sidebar or header that switches between "City View" and "My Organization." The toggle controls which data endpoints the dashboard pages call. This modifies existing pages, so it may conflict with the Prime Directive.

**Recommendation:** Option A (separate navigation sections) respects the Prime Directive. No existing pages change. The user gets new pages in a new section.

#### C4: Tenant Data Ingestion

Provide a mechanism for tenants to populate their own data. Options:

- Manual entry forms on the "My House" pages
- CSV/file upload
- API endpoint for programmatic ingestion
- A small auto-seed on registration (e.g., 5 sample threats to avoid an empty house)

#### C5: Sidebar Count Accuracy

The left-pane sidebar shows counts next to navigation items (e.g., "48" next to Threat Correlations). These counts currently come from the seeded data snapshot and do not match the live pipeline numbers. For My House pages, the counts should reflect the tenant's own data. For City View pages, the counts should reflect the current pipeline state.

This is a sidebar modification, not a page modification. The existing page behavior is unchanged.

---

## 6. What the Super User (Conductor) Should See

The Conductor already has full visibility via the Platform Tenants management page. After corrections:

- The Conductor can still see the City View (global demo data) like everyone else
- The Conductor can navigate to any tenant's "My House" data (future enhancement — admin impersonation)
- The Platform Tenants page already shows all tenants, users, and metadata — no changes needed there

---

## 7. Analogy Summary

| Analogy | Technical Reality Today | Target State |
|---------|------------------------|--------------|
| City View | Global pipeline data — visible to all | Unchanged. Existing dashboard pages serve global demo data. |
| My House | Does not exist | New pages showing tenant-scoped data, accessed via new left-pane section |
| Address + Doorbell | Tenant record + JWT + org dropdown | Unchanged. Already works. |
| Furniture | No tenant-specific data | Tenant data store with per-tenant events, threats, correlations |
| Conductor sees all houses | Platform Tenants page | Unchanged. Already works for account management. Data visibility is a future enhancement. |

---

## 8. Priority

This is a **high-priority** correction. Until it is resolved:

- Every new user sees the same data as every other user
- There is no meaningful "multi-tenant data experience" — only multi-tenant account management
- No real customer onboarding can happen because customers cannot distinguish their data from the demo
- The platform is a demo shell, not a production-ready SaaS

---

## 9. Files That Will Be Created (Not Modified)

All corrections are additive. New files only.

| File (Proposed) | Purpose |
|-----------------|---------|
| `server/db/tenantData.ts` | Tenant-scoped data access layer (CRUD for tenant events/threats) |
| `server/routes/tenantDashboard.ts` | New API endpoints: /api/my/events, /api/my/threats, /api/my/stats |
| `client/src/pages/my-dashboard.tsx` | Tenant-scoped dashboard page |
| `client/src/pages/my-threats.tsx` | Tenant-scoped threat correlations page |
| `client/src/pages/my-events.tsx` | Tenant-scoped network events page |
| `client/src/pages/my-identity.tsx` | Tenant-scoped identity logs page |
| `scripts/seed_tenant_starter.py` | Optional starter seed for new tenants |

| File (Modified — Navigation Only) | Change |
|------------------------------------|--------|
| `client/src/components/app-sidebar.tsx` | Add "My Organization" section with links to new pages |
| `client/src/App.tsx` | Register new routes (/my-dashboard, /my-threats, /my-events, /my-identity) |
| `server/routes.ts` | Register tenantDashboard router |

**No existing page component files are modified.**

---

**Document Status:** AWAITING CONDUCTOR APPROVAL
**Safety Protocol:** ACTIVE — No action will be taken until explicitly approved
