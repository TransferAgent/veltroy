# S5-03 POWER GRID BUILD CARD — 2026-03-04

## Delivery Summary

Three-part build completed: Flask endpoints, TypeScript proxies, and two role-conditional frontend views.

## What Was Built

### Part A — Flask Bus (main.py)

**GET /v1/grid/overview**
- Queries all tenants from ndr-tenants table
- For each tenant: ticket count, last ticket alert, last kinetic playbook
- Status classification: PROTECTED (tickets <48h), MONITORING (>48h), PENDING (no tickets)
- Returns: tenant array, total_tenants, total_tickets, online_count, blueprint_version

**GET /v1/grid/feed?limit=N**
- Joins ndr-tickets with ndr-tenants for tenant name resolution
- Extracts kl_response_seconds from ticket_json
- Returns chronological feed of AI actions

### Part B — TypeScript Proxy (server/routes/ndrProxy.ts)

- GET /api/ndr/grid/overview — super_admin only, isTrialExpired guard
- GET /api/ndr/grid/feed — super_admin only, isTrialExpired guard
- GET /api/ndr/tickets — extended to allow super_admin cross-tenant queries

### Part C — Frontend Components

**GridOperatorView (client/src/components/GridOperatorView.tsx)**
- Renders on Dashboard (/) when role === super_admin
- City Header: transformers online count, threats auto-contained, 0 to triage
- Transformer Table: expandable rows with last 5 tickets per tenant
- Live Feed: real-time AI actions with alert type, source IP, SLA
- God-Mode Controls: Force Rollback, Sigma Rules, SOC 2 Export (Sprint 6), DLQ Health
- All queries use JWT auth headers, refresh every 30s

**TransformerOwnerView (client/src/components/TransformerOwnerView.tsx)**
- Renders on Protected (/protected) when role !== super_admin
- "YOUR BLOCK IS PROTECTED" header with org name, online status, trial info
- Three cards: Threats Stopped, Lateral Moves Blocked, AI Crew Status
- Plain-English feed: translates alert_type to human-friendly descriptions
- Footer: View Technical Report + Upgrade (trial users only)

**Upgrade Page (client/src/pages/upgrade.tsx)**
- Stub page: "Stripe integration coming Sprint 6"

## RBAC Enforcement

| Endpoint | Role Required | Trial Guard |
|----------|--------------|-------------|
| GET /api/ndr/grid/overview | super_admin | isTrialExpired |
| GET /api/ndr/grid/feed | super_admin | isTrialExpired |
| GET /api/ndr/tickets (cross-tenant) | super_admin OR owner | isTrialExpired |

- super_admin now has cross_tenant permission in ROLE_PERMISSIONS
- Demo admin (owner) gets 403 on grid endpoints
- Flask endpoints only accessible via proxy — no direct external access

## Architect Review — Resolved

1. Added cross_tenant to super_admin ROLE_PERMISSIONS
2. Added isTrialExpired guard to grid proxy routes
3. Fixed GridOperatorView to pass tenant_id for ticket expansion
4. Removed unused getToken import
5. Fixed auth header propagation in all grid queries

## E2E Tests — PASSED

- Super admin login → Dashboard → Grid Operator View visible → Transformer table with data → Expandable rows → God-Mode controls
- Demo admin login → Dashboard → No grid view → /protected → TransformerOwnerView with "YOUR BLOCK IS PROTECTED", threats stopped count, AI Crew Active

## Files Modified

| File | Change |
|------|--------|
| main.py | +2 endpoints (grid/overview, grid/feed) |
| server/routes/ndrProxy.ts | +2 proxy routes, extended tickets cross-tenant |
| server/ndrRoles.ts | Added cross_tenant to super_admin |
| client/src/components/GridOperatorView.tsx | NEW — 520 lines |
| client/src/components/TransformerOwnerView.tsx | NEW — 270 lines |
| client/src/pages/upgrade.tsx | NEW — 35 lines |
| client/src/pages/dashboard.tsx | Imports GridOperatorView |
| client/src/pages/protected.tsx | Imports TransformerOwnerView, fixed auth storage |
| client/src/App.tsx | Registered /upgrade route |
| replit.md | Updated with S5-03 documentation |
