# Multi-Tenant Build Card

**Platform:** NDR Phase Gate 0
**Version:** v1.2
**Sprint:** 5 (S5-01 + S5-02)
**Date:** 2026-03-04
**Status:** COMPLETE

---

## 1. Super User Account

| Field | Value |
|-------|-------|
| Email | `super@ndr-platform.io` |
| Password | `SuperNdr1!` |
| Role | `super_admin` |
| Tenant | `ndr-platform-core` |
| Tier | Enterprise |
| Trial | No (full access, no expiry) |
| Seeded | Automatically on every app startup |

---

## 2. Demo Admin Account

| Field | Value |
|-------|-------|
| Email | `admin@ndr-demo.io` |
| Password | `NdrAdmin1!` |
| Role | `owner` (parent) |
| Tenant | `ndr-demo-admin` |
| Tier | Trial |
| Trial Expiry | 30 days from seed date |
| Seeded Data | 14 tickets, 8 correlated, 50 network, 20 identity, 12 kinetic |

---

## 3. Super Admin — Platform Tenants Page

**Route:** `/tenants`
**Sidebar:** Management > Tenants (bottom of left pane)
**Visibility:** `super_admin` role only sees this view

### Features

| Feature | Description |
|---------|-------------|
| Tenant List | All organizations displayed as expandable cards |
| Tenant Card | Shows org name, tier badge, status badge, user count, trial expiry |
| Expand Tenant | Click to reveal nested user table with email, role, parent flag, status, created date |
| Edit Tenant | Popup dialog: modify org name, tier (trial/starter/professional/enterprise), status (active/suspended) |
| Delete Tenant | Confirmation dialog; removes tenant and all its users |
| Extend Trial | Popup dialog: choose number of days to extend; calculates new expiry from current date or existing expiry |
| Edit User | Popup dialog: modify email, role (owner/super_admin/support/billing_admin/customer), status |
| Delete User | Confirmation dialog; removes user from platform |

### Security Guardrails

| Rule | Enforcement |
|------|-------------|
| Platform-core tenant users cannot be edited | Server returns 403 |
| Platform-core tenant cannot be modified or deleted | Server returns 403 |
| Super admin accounts cannot be deleted | Server returns 403 |
| Email format validated on edit | Regex check, 400 on invalid |
| Role values validated against allowlist | 400 on invalid role |
| Status values validated against allowlist | 400 on invalid status |
| Tier values validated against allowlist | 400 on invalid tier |
| All endpoints require `super_admin` JWT | 403 for any other role |

---

## 4. Parent Owner — Team Management Page

**Route:** `/tenants`
**Sidebar:** Management > Tenants (bottom of left pane)
**Visibility:** Any user with `role=owner` AND `is_parent=true`

### Features

| Feature | Description |
|---------|-------------|
| Team Member List | Table of child accounts within the parent's tenant only |
| Seat Counter | Shows X of 5 seats used, remaining count |
| Add Member | Popup dialog: email, role selector (SOC Analyst / Billing Admin / Viewer), optional temp password |
| Edit Member | Popup dialog: modify email, role, status |
| Delete Member | Confirmation dialog with member email displayed |
| Auto-generated Password | If no password provided, system generates a 12-character random password |

### Child Account Limits

| Rule | Value |
|------|-------|
| Max children per tenant | 5 |
| Allowed child roles | `support` (SOC Analyst), `billing_admin` (Billing Admin), `customer` (Viewer) |
| Cannot grant `owner` or `super_admin` | Enforced server-side |

### Tenant Isolation

| Rule | Enforcement |
|------|-------------|
| Parent can only see own tenant's children | Server filters by `ndr_tenant_id` from JWT |
| Edit child — tenant check | Server verifies `user.tenant_id === req.user.ndr_tenant_id`; 403 otherwise |
| Delete child — tenant check | Same tenant verification; 403 on mismatch |
| Cannot modify parent account via children endpoint | Server returns 403 |
| No cross-tenant data leakage | Children endpoint never returns users from other tenants |

---

## 5. Authentication Flow

| Step | Detail |
|------|--------|
| Login | POST `/auth/login` with email + password |
| 2FA | SKIP_2FA=true (lab mode); returns JWT directly |
| JWT Payload | `user_id`, `email`, `role`, `ndr_tenant_id`, `is_parent`, `is_trial`, `trial_expires_at`, `blueprint_version=v1.2` |
| Token Storage | `localStorage` keys: `ndr_token`, `ndr_user` |
| Session | 8-hour JWT expiry |
| Route Guard | `RequireAuth` component redirects to `/login` if token missing or expired |

---

## 6. Read-Only Mode (Trial Users)

| Feature | Detail |
|---------|--------|
| Visual Indicator | Amber "Read Only" badge with eye icon in header bar |
| PATCH `/api/threats/:id` | Returns 403 for trial tokens |
| POST `/api/rollback` | Returns 403 for trial tokens |
| POST `/api/ndr/run` | Returns 402 for trial tokens |
| All GET endpoints | Fully accessible (dashboard, events, identity, threats, etc.) |
| Team Management | Trial parent-owners CAN manage children (account management is not restricted) |

---

## 7. Sidebar Navigation Structure

```
Navigation
  Dashboard            /
  Network Events       /events
  Identity Logs        /identity
  Threat Correlations  /threats
  Attack Patterns      /attack-patterns
  Sigma Rules          /sigma-rules
  Brain Surface        /correlated
  Kinetic Layer        /kinetic
  Response Actions     /responses
  Pipeline Monitor     /pipeline
  Protected View       /protected

System
  Pipeline status, SLA, Avg Latency

Management (super_admin or parent-owner only)
  Tenants              /tenants
```

---

## 8. API Endpoints — Admin

### Super Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/tenants` | List all tenants with nested users |
| PATCH | `/api/admin/users/:id` | Edit any user (except platform-core) |
| DELETE | `/api/admin/users/:id` | Delete any user (except super_admin / platform-core) |
| PATCH | `/api/admin/tenants/:id` | Edit tenant details |
| DELETE | `/api/admin/tenants/:id` | Delete tenant and all users |
| PATCH | `/api/admin/tenants/:id/extend-trial` | Extend trial by N days |

### Parent Owner Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/children` | List own tenant's child accounts |
| POST | `/api/admin/children` | Add child account (max 5) |
| PATCH | `/api/admin/children/:id` | Edit child (own tenant only) |
| DELETE | `/api/admin/children/:id` | Delete child (own tenant only) |

---

## 9. Files Modified / Created

| File | Action | Purpose |
|------|--------|---------|
| `server/routes/admin.ts` | Created | All admin API endpoints with validation |
| `server/db/authDb.ts` | Extended | getAllTenants, getAllUsers, getUsersByTenantId, getUserById, updateUser, deleteUser, updateTenant, deleteTenant, countUsersByTenantId |
| `server/seedDemo.ts` | Extended | Added seedSuperUser() alongside seedDemoAccount() |
| `server/index.ts` | Modified | Calls seedSuperUser() on startup |
| `server/routes.ts` | Modified | Registers adminRouter |
| `client/src/pages/tenants.tsx` | Created | Full management page (SuperAdminView + ParentOwnerView) |
| `client/src/pages/admin.tsx` | Replaced | Superseded by tenants.tsx |
| `client/src/components/app-sidebar.tsx` | Modified | Added Management section with Tenants link |
| `client/src/App.tsx` | Modified | Added /tenants route, ReadOnlyBadge, removed /admin |
| `client/src/lib/auth.ts` | Created (S5-01) | Token storage, getCurrentUser, isAuthenticated, logout |
| `client/src/pages/login.tsx` | Created (S5-01) | Sign In / Get Started card |
| `client/src/components/OrgDropdown.tsx` | Created (S5-01) | Org dropdown with sign out |
| `client/src/components/AuthBackground.tsx` | Created (S5-01) | Blurred tiles behind login card |

---

## 10. Role Hierarchy

```
super_admin   → Full platform access, all tenants, all users
owner         → Full access within own tenant, can manage children
support       → Read + rollback within own tenant (SOC Analyst)
billing_admin → Read + billing within own tenant
customer      → Read-only within own tenant (Viewer)
```

---

**Build Status:** VERIFIED
**E2E Tests:** PASSED (Super admin login, tenant expansion, user edit dialog, parent-owner login, child creation, seat count)
**Architect Review:** PASSED (with security hardening applied)
