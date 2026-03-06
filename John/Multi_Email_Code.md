# Multi-Tenant Auth + 6-Digit Email Code — Complete Build Guide

**Source Platform:** NDR Phase Gate 0 (Replit)
**Pattern Name:** Tableicty 2FA Pattern
**Database:** SQLite via better-sqlite3 (lab mode) — swap to PostgreSQL for production
**Auth:** JWT (stateless), bcrypt password hashing, bcrypt OTP hashing
**Email Delivery:** Console log (always) + AWS SES (when configured)

---

## Table of Contents

1. [Database Tables](#1-database-tables)
2. [Table Init Script (Python)](#2-table-init-script)
3. [Database Access Layer (TypeScript)](#3-database-access-layer)
4. [JWT Middleware](#4-jwt-middleware)
5. [Email Verification Service](#5-email-verification-service)
6. [Auth Routes (Login, Register, OTP, Resend)](#6-auth-routes)
7. [Seed Script (Super User + Demo Account)](#7-seed-script)
8. [Admin Routes (Super Admin + Parent Owner)](#8-admin-routes)
9. [Frontend: Login Page + OTP Screen](#9-frontend-login-page--otp-screen)
10. [Frontend: OTP Input Component](#10-frontend-otp-input-component)
11. [Frontend: Auth Helper (Token Storage)](#11-frontend-auth-helper)
12. [Parent/Child Relationship — Full Explanation](#12-parentchild-relationship)
13. [Role Hierarchy and Permissions](#13-role-hierarchy-and-permissions)
14. [AWS SES Activation](#14-aws-ses-activation)
15. [How to Retrieve Your 6-Digit Code](#15-how-to-retrieve-your-6-digit-code)
16. [Security Checklist](#16-security-checklist)

---

## 1. Database Tables

Three tables power the entire multi-tenant auth system. They live in a single SQLite file (`data/ndr.db` in our case) but the schema is database-agnostic.

### ndr-tenants (Organizations)

Every account belongs to a tenant. A tenant is an organization.

```sql
CREATE TABLE IF NOT EXISTS "ndr-tenants" (
    tenant_id         TEXT PRIMARY KEY,          -- slug like "acme-security-a7k2m1"
    name              TEXT NOT NULL,             -- display name "Acme Security Inc."
    tier              TEXT NOT NULL DEFAULT 'trial',  -- trial | starter | professional | enterprise
    status            TEXT NOT NULL DEFAULT 'active', -- active | suspended
    is_trial          INTEGER NOT NULL DEFAULT 1,     -- 1 = trial, 0 = paid
    trial_expires_at  TEXT,                      -- ISO 8601 timestamp or NULL
    parent_tenant_id  TEXT REFERENCES "ndr-tenants"(tenant_id),  -- reserved for future parent-org linking
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Key rules:**
- `tenant_id` is generated at registration time: `slugify(org_name) + "-" + random_6_chars`
- The super user's tenant (`ndr-platform-core`) is seeded on startup and can never be modified or deleted
- Demo accounts get 30-day trials; self-registered accounts get 6-day trials
- `is_trial=1` with a `trial_expires_at` in the past = expired trial (login returns HTTP 402)

### ndr-users (People)

Every user belongs to exactly one tenant. Users are either "parent" (the account creator/owner) or "child" (invited team members).

```sql
CREATE TABLE IF NOT EXISTS "ndr-users" (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT NOT NULL REFERENCES "ndr-tenants"(tenant_id),
    email         TEXT NOT NULL UNIQUE,        -- globally unique across all tenants
    password_hash TEXT NOT NULL,               -- bcrypt hash, cost factor 12
    role          TEXT NOT NULL DEFAULT 'customer',
    is_parent     INTEGER NOT NULL DEFAULT 0,  -- 1 = this user created the tenant (owner)
    mfa_secret    TEXT,                        -- reserved for TOTP (not used yet)
    mfa_verified  INTEGER NOT NULL DEFAULT 0,  -- set to 1 after successful OTP verification
    status        TEXT NOT NULL DEFAULT 'active',  -- active | suspended
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Key rules:**
- `email` is UNIQUE across the entire platform (not per-tenant)
- `is_parent=1` means this user is the account owner who registered the tenant
- `is_parent=0` means this user was invited by the parent
- Passwords are hashed with bcrypt cost factor 12 (not 10 — 12 is more secure)
- The `role` field determines what the user can see and do (see Role Hierarchy section)

### ndr-otp (Verification Codes)

One-time codes for 2FA. The plaintext code is NEVER stored — only the bcrypt hash.

```sql
CREATE TABLE IF NOT EXISTS "ndr-otp" (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,              -- which user this code belongs to
    code_hash   TEXT NOT NULL,              -- bcrypt(6_digit_code, 10)
    expires_at  TEXT NOT NULL,              -- ISO timestamp, 10 minutes from creation
    attempts    INTEGER NOT NULL DEFAULT 0, -- failed validation attempts (max 5)
    used        INTEGER NOT NULL DEFAULT 0, -- 1 = code was successfully consumed
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON "ndr-otp"(email);
CREATE INDEX IF NOT EXISTS idx_users_email ON "ndr-users"(email);
```

**Key rules:**
- `code_hash` is bcrypt(code, 10) — the plaintext 6-digit code is returned to the caller for console logging/email delivery, then discarded
- `expires_at` is always 10 minutes from creation
- `attempts` tracks failed verifications — at 5 attempts, the code is invalidated (set `used=1`)
- `used=1` means the code was either successfully verified or burned by too many attempts
- When a new code is created, all previous unused codes for that email are marked `used=1`

---

## 2. Table Init Script

This Python script runs on every app startup. It creates the three tables if they don't exist. It's safe to run multiple times (all statements use `IF NOT EXISTS`).

**File: `scripts/init_auth_tables.py`**

```python
#!/usr/bin/env python3
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ndr.db")

def init_tables(db_path=DB_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "ndr-tenants" (
            tenant_id         TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            tier              TEXT NOT NULL DEFAULT 'trial',
            status            TEXT NOT NULL DEFAULT 'active',
            is_trial          INTEGER NOT NULL DEFAULT 1,
            trial_expires_at  TEXT,
            parent_tenant_id  TEXT REFERENCES "ndr-tenants"(tenant_id),
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "ndr-users" (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id     TEXT NOT NULL REFERENCES "ndr-tenants"(tenant_id),
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'customer',
            is_parent     INTEGER NOT NULL DEFAULT 0,
            mfa_secret    TEXT,
            mfa_verified  INTEGER NOT NULL DEFAULT 0,
            status        TEXT NOT NULL DEFAULT 'active',
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS "ndr-otp" (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT NOT NULL,
            code_hash   TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            attempts    INTEGER NOT NULL DEFAULT 0,
            used        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_otp_email ON "ndr-otp"(email)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON "ndr-users"(email)')

    conn.commit()
    conn.close()
    print(f"[init_auth_tables] Auth tables initialized in {db_path}")

if __name__ == "__main__":
    init_tables()
```

**Called from server startup (TypeScript):**

```typescript
try {
    const { execSync } = await import("child_process");
    execSync("python3 scripts/init_auth_tables.py", { encoding: "utf-8", timeout: 10000 });
    log("Auth tables initialized", "startup");
} catch (err) {
    log(`Auth table init warning: ${err instanceof Error ? err.message : err}`, "startup");
}
```

If you're in a TypeScript-only environment and don't want Python, you can do the same with better-sqlite3 directly in your startup code. The Python approach just keeps table creation separate from the application code.

---

## 3. Database Access Layer

This is the data access layer. Every database operation goes through these functions. The routes never touch the database directly.

**File: `server/db/authDb.ts`**

### Connection

```typescript
import Database from "better-sqlite3";
import path from "path";
import bcryptOtp from "bcryptjs";

const DB_PATH = path.join(process.cwd(), "data", "ndr.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
    if (!_db) {
        _db = new Database(DB_PATH);
        _db.pragma("journal_mode = WAL");
        _db.pragma("foreign_keys = ON");
    }
    return _db;
}
```

WAL mode improves concurrent read performance. Foreign keys are enforced so you can't create a user pointing to a non-existent tenant.

### TypeScript Interfaces

```typescript
export interface Tenant {
    tenant_id: string;
    name: string;
    tier: string;
    status: string;
    is_trial: number;        // SQLite uses 0/1 for boolean
    trial_expires_at: string | null;
    parent_tenant_id: string | null;
    created_at: string;
}

export interface User {
    id: number;
    tenant_id: string;
    email: string;
    password_hash: string;
    role: string;
    is_parent: number;       // 0 or 1
    mfa_secret: string | null;
    mfa_verified: number;    // 0 or 1
    status: string;
    created_at: string;
}

export interface OtpRecord {
    id: number;
    email: string;
    code_hash: string;
    expires_at: string;
    attempts: number;
    used: number;            // 0 or 1
    created_at: string;
}
```

### Tenant CRUD

```typescript
export function createTenant(tenant: {
    tenant_id: string;
    name: string;
    tier: string;
    is_trial: number;
    trial_expires_at: string;
}): void {
    const db = getDb();
    db.prepare(`
        INSERT INTO "ndr-tenants" (tenant_id, name, tier, is_trial, trial_expires_at)
        VALUES (@tenant_id, @name, @tier, @is_trial, @trial_expires_at)
    `).run(tenant);
}

export function getTenantById(tenantId: string): Tenant | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM "ndr-tenants" WHERE tenant_id = ?')
        .get(tenantId) as Tenant | undefined;
}

export function getAllTenants(): Tenant[] {
    const db = getDb();
    return db.prepare('SELECT * FROM "ndr-tenants" ORDER BY created_at DESC')
        .all() as Tenant[];
}

export function updateTenant(
    tenantId: string,
    fields: {
        name?: string;
        tier?: string;
        status?: string;
        is_trial?: number;
        trial_expires_at?: string | null;
    }
): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
    if (fields.tier !== undefined) { sets.push('tier = ?'); vals.push(fields.tier); }
    if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status); }
    if (fields.is_trial !== undefined) { sets.push('is_trial = ?'); vals.push(fields.is_trial); }
    if (fields.trial_expires_at !== undefined) {
        sets.push('trial_expires_at = ?');
        vals.push(fields.trial_expires_at);
    }
    if (sets.length === 0) return;
    vals.push(tenantId);
    db.prepare(`UPDATE "ndr-tenants" SET ${sets.join(', ')} WHERE tenant_id = ?`).run(...vals);
}

export function deleteTenant(tenantId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM "ndr-users" WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM "ndr-tenants" WHERE tenant_id = ?').run(tenantId);
}
```

**IMPORTANT:** `deleteTenant` deletes all users in the tenant FIRST, then the tenant. Foreign key order matters.

### User CRUD

```typescript
export function createUser(user: {
    tenant_id: string;
    email: string;
    password_hash: string;
    role: string;
    is_parent: number;
}): number {
    const db = getDb();
    const result = db.prepare(`
        INSERT INTO "ndr-users" (tenant_id, email, password_hash, role, is_parent)
        VALUES (@tenant_id, @email, @password_hash, @role, @is_parent)
    `).run(user);
    return Number(result.lastInsertRowid);
}

export function getUserByEmail(email: string): User | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM "ndr-users" WHERE email = ?')
        .get(email) as User | undefined;
}

export function getUserById(id: number): User | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM "ndr-users" WHERE id = ?')
        .get(id) as User | undefined;
}

export function getUsersByTenantId(tenantId: string): User[] {
    const db = getDb();
    return db.prepare('SELECT * FROM "ndr-users" WHERE tenant_id = ? ORDER BY created_at DESC')
        .all(tenantId) as User[];
}

export function getAllUsers(): User[] {
    const db = getDb();
    return db.prepare('SELECT * FROM "ndr-users" ORDER BY created_at DESC')
        .all() as User[];
}

export function updateUser(
    id: number,
    fields: { email?: string; role?: string; status?: string; is_parent?: number }
): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.email !== undefined) { sets.push('email = ?'); vals.push(fields.email); }
    if (fields.role !== undefined) { sets.push('role = ?'); vals.push(fields.role); }
    if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status); }
    if (fields.is_parent !== undefined) { sets.push('is_parent = ?'); vals.push(fields.is_parent); }
    if (sets.length === 0) return;
    vals.push(id);
    db.prepare(`UPDATE "ndr-users" SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteUser(id: number): void {
    const db = getDb();
    db.prepare('DELETE FROM "ndr-users" WHERE id = ?').run(id);
}

export function countUsersByTenantId(tenantId: string): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as cnt FROM "ndr-users" WHERE tenant_id = ?')
        .get(tenantId) as { cnt: number };
    return row.cnt;
}
```

### OTP Operations

```typescript
import { generateVerificationCode } from '../services/emailVerification';

export async function createVerificationCode(userId: string, email: string): Promise<string> {
    const db = getDb();
    const code = generateVerificationCode();
    const codeHash = await bcryptOtp.hash(code, 10);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Invalidate all previous unused codes for this email
    db.prepare('UPDATE "ndr-otp" SET used=1 WHERE email=? AND used=0').run(email);

    // Insert new code (only hash is stored)
    db.prepare(`
        INSERT INTO "ndr-otp" (email, code_hash, expires_at, attempts, used, created_at)
        VALUES (?, ?, ?, 0, 0, datetime('now'))
    `).run(email, codeHash, expires_at);

    return code;  // plaintext code returned for console log / email delivery
}

export async function verifyCode(
    email: string,
    submittedCode: string
): Promise<{ success: boolean; message: string }> {
    const db = getDb();

    // Find most recent unused code for this email
    const row = db.prepare(`
        SELECT * FROM "ndr-otp"
        WHERE email=? AND used=0
        ORDER BY created_at DESC LIMIT 1
    `).get(email) as OtpRecord | undefined;

    if (!row) return { success: false, message: 'No verification code found. Request a new one.' };

    // Check expiry (10-minute window)
    if (new Date(row.expires_at) < new Date())
        return { success: false, message: 'Code expired. Request a new one.' };

    // Check brute-force limit (5 attempts max)
    if (row.attempts >= 5) {
        db.prepare('UPDATE "ndr-otp" SET used=1 WHERE id=?').run(row.id);
        return { success: false, message: 'Too many failed attempts. Request a new code.' };
    }

    // Compare submitted code against stored bcrypt hash
    const isValid = await bcryptOtp.compare(submittedCode, row.code_hash);

    if (!isValid) {
        // Increment attempt counter
        db.prepare('UPDATE "ndr-otp" SET attempts=attempts+1 WHERE id=?').run(row.id);
        return { success: false, message: 'Invalid code.' };
    }

    // SUCCESS: mark code as consumed
    db.prepare('UPDATE "ndr-otp" SET used=1 WHERE id=?').run(row.id);
    db.prepare('UPDATE "ndr-users" SET mfa_verified=1 WHERE email=?').run(email);

    return { success: true, message: 'Verified.' };
}

export function canResendCode(email: string): boolean {
    const db = getDb();
    const row = db.prepare(`
        SELECT created_at FROM "ndr-otp"
        WHERE email=?
        ORDER BY created_at DESC LIMIT 1
    `).get(email) as { created_at: string } | undefined;

    if (!row) return true;
    const timeSince = Date.now() - new Date(row.created_at).getTime();
    return timeSince > 60 * 1000;  // 60-second cooldown
}
```

**Validation chain summary:**

```
Submit code
  -> Find most recent unused code for this email
    -> Check NOT expired (10-minute window)
      -> Check attempts < 5 (brute-force limit)
        -> bcrypt.compare(submitted, stored_hash)
          -> PASS: mark used=1, set mfa_verified=1
          -> FAIL: increment attempts counter
```

---

## 4. JWT Middleware

Every protected route uses this middleware to authenticate the user and populate `req.user`.

**File: `server/middleware/jwtAuth.ts`**

```typescript
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface NdrUser {
    user_id: string;
    role: string;
    ndr_tenant_id: string;
    email: string;
    is_parent?: boolean;
    is_trial?: boolean;
    trial_expires_at?: string;
}

// Extend Express Request type globally
declare global {
    namespace Express {
        interface Request {
            user?: NdrUser;
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-here";

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

        req.user = {
            user_id: decoded.user_id as string,
            role: decoded.role as string,
            ndr_tenant_id: (decoded.ndr_tenant_id as string) || "default",
            email: decoded.email as string,
            is_parent: decoded.is_parent as boolean | undefined,
            is_trial: decoded.is_trial as boolean | undefined,
            trial_expires_at: decoded.trial_expires_at as string | undefined,
        };

        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

export function generateToken(
    payload: Omit<NdrUser, "ndr_tenant_id"> & { ndr_tenant_id?: string }
): string {
    return jwt.sign(
        {
            ...payload,
            ndr_tenant_id: payload.ndr_tenant_id || "default",
        },
        JWT_SECRET,
        { expiresIn: "8h" }
    );
}
```

**JWT Payload Structure:**

```json
{
    "user_id": "3",
    "email": "admin@ndr-demo.io",
    "role": "owner",
    "ndr_tenant_id": "ndr-demo-admin",
    "is_parent": true,
    "is_trial": true,
    "trial_expires_at": "2026-04-05T12:00:00.000Z",
    "iat": 1772697200,
    "exp": 1772725800
}
```

The `ndr_tenant_id` in the JWT is the core tenant isolation mechanism. Every admin query uses this value to scope data to the user's own tenant. It can never be spoofed because the JWT is signed with the server secret.

---

## 5. Email Verification Service

This module handles code generation and delivery. The critical design decision: **console logging is permanent, not temporary**. Even in production with AWS SES fully configured, the code is still logged to the server console.

**File: `server/services/emailVerification.ts`**

```typescript
import crypto from 'crypto';

export function generateVerificationCode(): string {
    // crypto.randomInt produces a cryptographically secure random integer
    // Range 100000-999999 guarantees exactly 6 digits (no leading zeros)
    return crypto.randomInt(100000, 999999).toString();
}

export function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `****${local.slice(-2)}@${domain}`;
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
    // THIS ALWAYS RUNS — development AND production
    console.log(`\n========================================`);
    console.log(`[NDR 2FA] Verification code for ${email}: ${code}`);
    console.log(`========================================\n`);

    // CHECK: Are AWS SES credentials configured?
    const sesRegion = process.env.AWS_SES_REGION;
    const fromEmail = process.env.AWS_SES_FROM_EMAIL;
    const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

    if (sesRegion && fromEmail && hasAwsCreds) {
        // Fire-and-forget: SES runs in a detached async block
        // This prevents SES failures from blocking the login response
        (async () => {
            try {
                const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
                const ses = new SESClient({ region: sesRegion });
                await ses.send(new SendEmailCommand({
                    Source: fromEmail,
                    Destination: { ToAddresses: [email] },
                    Message: {
                        Subject: {
                            Data: 'Your App — Verify Your Login',
                            Charset: 'UTF-8'
                        },
                        Body: {
                            Html: {
                                Charset: 'UTF-8',
                                Data: `
                                    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
                                        <h2>Your App</h2>
                                        <p>Your verification code is:</p>
                                        <div style="font-size:32px;font-weight:bold;letter-spacing:6px;
                                                    text-align:center;padding:16px;background:#f4f6f8;
                                                    border-radius:8px;margin:16px 0;">
                                            ${code}
                                        </div>
                                        <p style="color:#666;font-size:14px;">
                                            This code expires in 10 minutes.
                                            If you didn't request this, ignore this email.
                                        </p>
                                    </div>`
                            },
                            Text: {
                                Charset: 'UTF-8',
                                Data: `Your verification code is: ${code}\n\nExpires in 10 minutes.`
                            }
                        }
                    }
                }));
                console.log(`[2FA] Code delivered to ${email} via AWS SES`);
            } catch (err) {
                // SES failure is non-fatal — user can still get code from console log
                console.error(`[2FA] SES send failed (code was logged above):`, err);
            }
        })();
    }
    // If SES not configured, function returns immediately
    // The code was already logged to console above
}
```

**Why fire-and-forget?** The login API response returns immediately. The user sees the OTP screen without waiting for email delivery. If SES fails (bad credentials, unverified sender, rate limit), the code was already logged to console. The user can always complete login.

**Why dynamic import for SES?** `@aws-sdk/client-ses` is imported inside the function, not at the top of the file. This means:
- The SES SDK only loads when actually needed
- The module doesn't fail to import if the SDK isn't installed
- You don't need `@aws-sdk/client-ses` as a dependency until you're ready for SES

---

## 6. Auth Routes

Four endpoints handle the entire login/registration + 2FA flow.

**File: `server/routes/auth.ts`**

### Pending Token (Critical Concept)

When a user submits correct credentials but hasn't verified their OTP yet, we don't give them a full JWT. Instead, we give them a **pending token** — a short-lived JWT that only contains `{ pending: true, email: "..." }` and no role. This token:
- Cannot access any protected routes (it has no role, no tenant_id)
- Expires in 15 minutes (not 8 hours like a real token)
- Is only accepted by the `/auth/verify-otp` and `/auth/resend-otp` endpoints

```typescript
function generatePendingToken(email: string): string {
    return jwt.sign(
        { pending: true, email },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
}
```

### Helper Functions

```typescript
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30);
}

function nanoid(len: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < len; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/\d/.test(password)) return "Password must contain at least 1 number";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
        return "Password must contain at least 1 special character";
    return null;
}
```

### POST /auth/login

```typescript
router.post("/auth/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ error: "email and password are required" });
        }

        const user = getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Check trial expiry BEFORE allowing login
        const tenant = getTenantById(user.tenant_id);
        if (tenant && tenant.is_trial && tenant.trial_expires_at) {
            const expiry = new Date(tenant.trial_expires_at).getTime();
            if (expiry < Date.now()) {
                return res.status(402).json({
                    message: "Trial expired. Upgrade to continue.",
                    upgrade_url: "/upgrade",
                });
            }
        }

        if (user.status !== "active") {
            return res.status(401).json({ error: "Account is not active" });
        }

        // SKIP_2FA bypass (for development/testing only)
        const SKIP_2FA = process.env.SKIP_2FA === 'true';
        if (SKIP_2FA) {
            const token = generateToken({
                user_id: String(user.id),
                email: user.email,
                role: user.role,
                ndr_tenant_id: user.tenant_id,
                is_parent: user.is_parent === 1,
                is_trial: tenant?.is_trial === 1,
                trial_expires_at: tenant?.trial_expires_at || undefined,
            });
            return res.status(200).json({ token, user: { /* user fields */ } });
        }

        // Generate 2FA code, log to console, send email if SES configured
        const code = await createVerificationCode(String(user.id), user.email);
        await sendVerificationCode(user.email, code);

        // Return pending token (NOT a full auth token)
        const pendingToken = generatePendingToken(user.email);

        return res.status(200).json({
            requiresMfa: true,
            maskedEmail: maskEmail(user.email),
            pendingToken,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Login failed";
        return res.status(500).json({ error: message });
    }
});
```

**Response when 2FA is active:**
```json
{
    "requiresMfa": true,
    "maskedEmail": "****io@ndr-platform.io",
    "pendingToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### POST /auth/register

```typescript
router.post("/auth/register", async (req: Request, res: Response) => {
    try {
        const { email, password, org_name, tier } = req.body || {};

        if (!email || !password || !org_name) {
            return res.status(400).json({ error: "email, password, and org_name are required" });
        }

        if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email format" });
        const passwordError = validatePassword(password);
        if (passwordError) return res.status(400).json({ error: passwordError });

        const existing = getUserByEmail(email);
        if (existing) return res.status(409).json({ error: "Email already registered" });

        // Hash password and create tenant
        const passwordHash = await bcrypt.hash(password, 12);
        const tenantId = `${slugify(org_name)}-${nanoid(6)}`;
        const trialExpiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

        createTenant({
            tenant_id: tenantId,
            name: org_name,
            tier: tier || "trial",
            is_trial: 1,
            trial_expires_at: trialExpiresAt,
        });

        createUser({
            tenant_id: tenantId,
            email,
            password_hash: passwordHash,
            role: "owner",        // registering user is always the owner
            is_parent: 1,          // registering user is always the parent
        });

        // Generate 2FA code (same flow as login)
        const newUser = getUserByEmail(email);
        const code = await createVerificationCode(String(newUser?.id || 'new'), email);
        await sendVerificationCode(email, code);

        const pendingToken = generatePendingToken(email);

        return res.status(201).json({
            tenant_id: tenantId,
            email,
            trial_expires_at: trialExpiresAt,
            requiresMfa: true,
            maskedEmail: maskEmail(email),
            pendingToken,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Registration failed";
        return res.status(500).json({ error: message });
    }
});
```

### POST /auth/verify-otp

This is where the user submits their 6-digit code. If valid, they get their full JWT.

```typescript
router.post("/auth/verify-otp", async (req: Request, res: Response) => {
    try {
        const { pendingToken, otp_code } = req.body || {};

        if (!pendingToken || !otp_code) {
            return res.status(400).json({ error: "pendingToken and otp_code are required" });
        }

        // Verify the pending token is real and not expired
        let pendingPayload: any;
        try {
            pendingPayload = jwt.verify(pendingToken, JWT_SECRET);
            if (!pendingPayload.pending) {
                return res.status(401).json({ error: "Invalid session token" });
            }
        } catch {
            return res.status(401).json({ error: "Session expired. Please log in again." });
        }

        const email = pendingPayload.email;

        // Validate the OTP code against the database
        const result = await verifyCode(email, otp_code);
        if (!result.success) {
            return res.status(401).json({ error: result.message });
        }

        // OTP verified — now issue the REAL token
        const user = getUserByEmail(email);
        if (!user) return res.status(401).json({ error: "User not found" });

        const tenant = getTenantById(user.tenant_id);

        const token = generateToken({
            user_id: String(user.id),
            email: user.email,
            role: user.role,
            ndr_tenant_id: user.tenant_id,
            is_parent: user.is_parent === 1,
            is_trial: tenant?.is_trial === 1,
            trial_expires_at: tenant?.trial_expires_at || undefined,
        });

        return res.status(200).json({
            token,
            user: {
                email: user.email,
                role: user.role,
                tenant_id: user.tenant_id,
                is_trial: tenant?.is_trial === 1,
                is_parent: user.is_parent === 1,
                trial_expires_at: tenant?.trial_expires_at,
            },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "OTP verification failed";
        return res.status(500).json({ error: message });
    }
});
```

### POST /auth/resend-otp

Rate-limited to once per 60 seconds per user.

```typescript
router.post("/auth/resend-otp", async (req: Request, res: Response) => {
    try {
        const { pendingToken } = req.body || {};

        if (!pendingToken) return res.status(400).json({ error: "Missing session token" });

        let pendingPayload: any;
        try {
            pendingPayload = jwt.verify(pendingToken, JWT_SECRET);
            if (!pendingPayload.pending) return res.status(401).json({ error: "Invalid session token" });
        } catch {
            return res.status(401).json({ error: "Session expired. Please log in again." });
        }

        const email = pendingPayload.email;
        const user = getUserByEmail(email);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 60-second rate limit
        if (!canResendCode(email)) {
            return res.status(429).json({
                error: "Please wait before requesting a new code.",
                retry_after: 60,
            });
        }

        const code = await createVerificationCode(String(user.id), email);
        await sendVerificationCode(email, code);

        return res.status(200).json({
            message: "New code sent. Check Replit Logs.",
            maskedEmail: maskEmail(email),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Resend failed";
        return res.status(500).json({ error: message });
    }
});
```

---

## 7. Seed Script

Two accounts are seeded on every app startup. Both use idempotent checks (skip if email already exists).

**File: `server/seedDemo.ts`**

```typescript
import bcrypt from "bcryptjs";
import { getUserByEmail, createTenant, createUser, getTenantById } from "./db/authDb";

const SUPER_EMAIL    = process.env.SUPER_USER_EMAIL    || "super@ndr-platform.io";
const SUPER_PASSWORD = process.env.SUPER_USER_PASSWORD || "SuperNdr1!";
const SUPER_TENANT   = "ndr-platform-core";

const DEMO_EMAIL    = process.env.DEMO_ADMIN_EMAIL    || "admin@ndr-demo.io";
const DEMO_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "NdrAdmin1!";
const DEMO_TENANT   = "ndr-demo-admin";

export async function seedSuperUser(): Promise<void> {
    if (getUserByEmail(SUPER_EMAIL)) return;  // already exists

    if (!getTenantById(SUPER_TENANT)) {
        createTenant({
            tenant_id: SUPER_TENANT,
            name: "NDR Platform",
            tier: "enterprise",
            is_trial: 0,                    // NOT a trial
            trial_expires_at: "",           // no expiry
        });
    }

    const passwordHash = await bcrypt.hash(SUPER_PASSWORD, 12);
    createUser({
        tenant_id: SUPER_TENANT,
        email: SUPER_EMAIL,
        password_hash: passwordHash,
        role: "super_admin",
        is_parent: 1,
    });
}

export async function seedDemoAccount(): Promise<void> {
    if (getUserByEmail(DEMO_EMAIL)) return;

    if (!getTenantById(DEMO_TENANT)) {
        createTenant({
            tenant_id: DEMO_TENANT,
            name: "NDR Demo",
            tier: "trial",
            is_trial: 1,
            trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    createUser({
        tenant_id: DEMO_TENANT,
        email: DEMO_EMAIL,
        password_hash: passwordHash,
        role: "owner",
        is_parent: 1,
    });
}
```

**Called during server startup (in server/index.ts):**

```typescript
try {
    const { seedSuperUser, seedDemoAccount } = await import("./seedDemo");
    await seedSuperUser();
    await seedDemoAccount();
} catch (err) {
    log(`Demo seed warning: ${err instanceof Error ? err.message : err}`, "startup");
}
```

---

## 8. Admin Routes

Two completely separate views share the same `/tenants` URL:
- **Super Admin** sees ALL tenants across the platform
- **Parent Owner** sees only their own tenant's child accounts

**File: `server/routes/admin.ts`**

### Constants

```typescript
const MAX_CHILDREN_PER_TENANT = 5;
const PLATFORM_TENANT_ID = "ndr-platform-core";
const VALID_STATUSES = ["active", "suspended"];
const VALID_TIERS = ["trial", "starter", "professional", "enterprise"];
const SUPER_ADMIN_ROLES = ["owner", "super_admin", "support", "billing_admin", "customer"];
const CHILD_ROLES = ["support", "customer", "billing_admin"];
```

### Role Check Helpers

```typescript
function isSuperAdmin(req: Request): boolean {
    return req.user?.role === "super_admin";
}

function isParentOwner(req: Request): boolean {
    return req.user?.role === "owner" && req.user?.is_parent === true;
}
```

### Super Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/tenants` | List ALL tenants with nested user arrays |
| PATCH | `/api/admin/users/:id` | Edit any user (except platform-core) |
| DELETE | `/api/admin/users/:id` | Delete any user (except super_admin / platform-core) |
| PATCH | `/api/admin/tenants/:id` | Edit tenant (name, tier, status) |
| DELETE | `/api/admin/tenants/:id` | Delete tenant + all its users |
| PATCH | `/api/admin/tenants/:id/extend-trial` | Extend trial by N days |

### Parent Owner Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/children` | List child accounts within own tenant |
| POST | `/api/admin/children` | Create child account (max 5) |
| PATCH | `/api/admin/children/:id` | Edit child (own tenant only) |
| DELETE | `/api/admin/children/:id` | Delete child (own tenant only) |

### Security Guardrails (Server-Side)

| Rule | HTTP | When |
|------|------|------|
| Non-super_admin calls super admin endpoint | 403 | Always |
| Edit/delete user in platform-core tenant | 403 | Always |
| Delete a super_admin user | 403 | Always |
| Delete the platform-core tenant | 403 | Always |
| Parent tries to edit user in different tenant | 403 | tenant_id mismatch |
| Parent tries to edit the parent account | 403 | is_parent=1 |
| Child count exceeds 5 | 400 | POST /children |
| Role not in allowed list | 400 | PATCH/POST |
| Email format invalid | 400 | PATCH/POST |

### GET /api/admin/tenants (Super Admin — Full Platform View)

```typescript
router.get("/api/admin/tenants", authenticateJWT, (req, res) => {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: "Super admin access required" });

    const tenants = getAllTenants();
    const users = getAllUsers();

    const enriched = tenants.map((t) => {
        const tenantUsers = users
            .filter((u) => u.tenant_id === t.tenant_id)
            .map((u) => ({
                id: u.id,
                email: u.email,
                role: u.role,
                is_parent: u.is_parent === 1,
                status: u.status,
                created_at: u.created_at,
            }));
        return { ...t, users: tenantUsers, user_count: tenantUsers.length };
    });

    return res.json({ tenants: enriched });
});
```

### POST /api/admin/children (Parent Owner — Create Child)

```typescript
router.post("/api/admin/children", authenticateJWT, async (req, res) => {
    if (!isParentOwner(req) && !isSuperAdmin(req))
        return res.status(403).json({ error: "Parent owner access required" });

    const tenantId = req.user!.ndr_tenant_id;
    const users = getUsersByTenantId(tenantId);
    const childCount = users.filter((u) => u.is_parent === 0).length;

    if (childCount >= MAX_CHILDREN_PER_TENANT) {
        return res.status(400).json({ error: `Maximum of ${MAX_CHILDREN_PER_TENANT} child accounts reached` });
    }

    const { email, role, password } = req.body || {};

    if (!email || !role) return res.status(400).json({ error: "email and role are required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: "Invalid email format" });

    const allowedRoles = ["support", "customer", "billing_admin"];
    if (!allowedRoles.includes(role))
        return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });

    const existing = getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "Email already registered" });

    // Generate temp password if none provided
    const tempPassword = password || generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const userId = createUser({
        tenant_id: tenantId,     // child ALWAYS gets parent's tenant
        email,
        password_hash: passwordHash,
        role,
        is_parent: 0,           // child account
    });

    return res.status(201).json({
        message: "Child account created",
        user: { id: userId, email, role, tenant_id: tenantId },
        temp_password: tempPassword,
    });
});
```

---

## 9. Frontend: Login Page + OTP Screen

The login page is a single React component with two screens:
1. **Form screen** — Email/password (Sign In tab) or full registration (Get Started tab)
2. **OTP screen** — 6-digit code input with masked email display

**File: `client/src/pages/login.tsx`**

### State Management

```typescript
type Screen = "form" | "otp";
type Mode = "signin" | "register";

const [screen, setScreen] = useState<Screen>("form");
const [mode, setMode] = useState<Mode>("signin");
const [pendingToken, setPendingToken] = useState("");
const [maskedEmail, setMaskedEmail] = useState("");
const [otpError, setOtpError] = useState("");
const [otpLoading, setOtpLoading] = useState(false);
const [otpReset, setOtpReset] = useState(0);  // incrementing this resets the OTP boxes
const [resendMessage, setResendMessage] = useState("");
```

### Login Flow

```
User submits email + password
  -> POST /auth/login
    -> If response has { requiresMfa: true }
      -> Store pendingToken and maskedEmail in state
      -> Switch screen to "otp"
    -> If response has { token }  (SKIP_2FA mode)
      -> Store token + user in localStorage
      -> Redirect to dashboard
```

### OTP Verification Flow

```
User fills all 6 digits
  -> OtpInput component calls onComplete(code)
    -> POST /auth/verify-otp with { pendingToken, otp_code }
      -> If success: store token + user, redirect to dashboard
      -> If failure: show error, reset OTP boxes (increment otpReset)
```

### Resend Flow

```
User clicks "Resend Code"
  -> POST /auth/resend-otp with { pendingToken }
    -> If 429: show "Please wait" error
    -> If success: show "New code sent. Check Replit Logs."
    -> Reset OTP boxes
```

### The OTP Screen Renders:

- Shield icon and "Verify Your Identity" heading
- "A 6-digit code was sent to:" with masked email in blue (e.g., `****io@ndr-platform.io`)
- Six individual input boxes (the OtpInput component)
- Error message area (red text)
- "Verifying..." spinner text
- "New code sent" success message (green text)
- "Didn't receive a code?" + Resend Code button
- "Back to login" link
- "Code expires in 10 minutes. Check Replit Logs for delivery." footer

---

## 10. Frontend: OTP Input Component

Six individual input boxes that auto-advance, handle paste, and auto-submit.

**File: `client/src/components/OtpInput.tsx`**

```typescript
interface OtpInputProps {
    onComplete: (code: string) => void;  // called when all 6 digits filled
    disabled?: boolean;                   // true while verifying
    error?: string;                       // turns borders red
    reset?: number;                       // increment to clear all boxes
}
```

**Behaviors:**
- Typing a digit auto-advances to the next box
- Backspace on empty box goes back to previous box and clears it
- Pasting a 6-digit code fills all boxes and auto-submits
- When the 6th digit is entered, `onComplete` fires automatically
- `reset` prop change clears all boxes and focuses the first one
- `disabled` prevents all input (50% opacity, not-allowed cursor)
- `error` turns all box borders red

**Each box is styled:**
- 48x56px, rounded corners, dark background
- Blue border normally, red border on error
- Blue glow on focus
- Large centered monospace-style digits

---

## 11. Frontend: Auth Helper

**File: `client/src/lib/auth.ts`**

```typescript
const TOKEN_KEY = 'ndr_token';
const USER_KEY  = 'ndr_user';

export function storeAuth(token: string, user: object): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): any | null {
    const u = localStorage.getItem(USER_KEY);
    return u ? JSON.parse(u) : null;
}

export function isAuthenticated(): boolean {
    const token = getToken();
    if (!token) return false;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp > Date.now() / 1000;
    } catch { return false; }
}

export function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = '/login';
}
```

**How auth flows through the app:**
1. User logs in + verifies OTP -> `storeAuth(token, user)` stores both in localStorage
2. Every API call includes `Authorization: Bearer <token>` header
3. Frontend uses `getCurrentUser()` to read role, tenant_id, is_parent, is_trial
4. `isAuthenticated()` decodes the JWT and checks expiry client-side
5. A `RequireAuth` wrapper component redirects to `/login` if `!isAuthenticated()`

---

## 12. Parent/Child Relationship

This is the core multi-tenancy hierarchy. Understanding this is critical.

### What is a Parent?

The **parent** is the person who registered the tenant (organization). They are automatically assigned:
- `role = "owner"`
- `is_parent = 1`
- They own the tenant and can manage team members

### What is a Child?

A **child** is someone invited to the tenant by the parent. They are assigned:
- `is_parent = 0`
- A role chosen by the parent: `support`, `billing_admin`, or `customer`
- A temporary password (auto-generated or manually set by parent)

### How Isolation Works

```
Tenant: acme-security-a7k2m1
  ├── Parent: alice@acme.com (owner, is_parent=1)
  ├── Child:  bob@acme.com   (support, is_parent=0)
  ├── Child:  carol@acme.com (billing_admin, is_parent=0)
  └── Child:  dave@acme.com  (customer, is_parent=0)

Tenant: globex-inc-b3x9p2
  ├── Parent: mallory@globex.com (owner, is_parent=1)
  └── Child:  eve@globex.com     (support, is_parent=0)
```

**Alice CANNOT see or manage Eve.** Alice's JWT contains `ndr_tenant_id: "acme-security-a7k2m1"`. When she calls `GET /api/admin/children`, the server filters by her tenant_id. Eve belongs to `globex-inc-b3x9p2`, so she never appears.

**Mallory CANNOT see or manage Bob.** Same isolation — different tenant_id in the JWT.

**The Super Admin CAN see everyone.** The `GET /api/admin/tenants` endpoint returns ALL tenants and ALL users, but is gated by `role === "super_admin"`.

### What Can Each Role Do?

| Actor | Can See | Can Manage | Limits |
|-------|---------|------------|--------|
| Super Admin | All tenants, all users | Edit/delete any user or tenant (except platform-core) | Cannot delete super_admin users |
| Parent Owner | Own tenant's children only | Add/edit/delete children in own tenant | Max 5 children, cannot grant owner/super_admin |
| Child (support) | Own tenant's data | Nothing — no management access | Read + specific actions based on app logic |
| Child (billing_admin) | Own tenant's data | Nothing — no management access | Read + billing actions based on app logic |
| Child (customer) | Own tenant's data | Nothing — no management access | Read-only |

### Child Account Limits

| Rule | Value |
|------|-------|
| Max children per tenant | 5 |
| Allowed child roles | `support`, `customer`, `billing_admin` |
| Cannot grant via child creation | `owner`, `super_admin` |
| Child can log in normally | Yes (email + password + OTP) |
| Child has own JWT | Yes (with their role and same tenant_id as parent) |

### Creating a Child Account (Step by Step)

1. Parent clicks "Add Member" on the team management page
2. Parent enters: email, role (dropdown), optional password
3. Frontend calls `POST /api/admin/children` with Bearer token
4. Server validates:
   - Caller is parent owner (role=owner, is_parent=true)
   - Child count < 5 for this tenant
   - Email is valid and not already registered
   - Role is in allowed list (support/customer/billing_admin)
5. Server creates user with:
   - `tenant_id` = parent's tenant_id (from JWT)
   - `is_parent = 0`
   - `password_hash` = bcrypt of temp password
6. Server returns the temp password in the response
7. Parent shares temp password with the child (manually or via invite email)
8. Child logs in with email + temp password + OTP

### Tenant Isolation Enforcement Points

The tenant boundary is enforced at EVERY admin endpoint:

**GET /api/admin/children:**
```typescript
const tenantId = req.user!.ndr_tenant_id;  // from JWT — cannot be spoofed
const users = getUsersByTenantId(tenantId);
const children = users.filter((u) => u.is_parent === 0);
```

**PATCH /api/admin/children/:id:**
```typescript
const user = getUserById(userId);
if (user.tenant_id !== req.user!.ndr_tenant_id) {
    return res.status(403).json({ error: "Cannot modify users outside your organization" });
}
if (user.is_parent === 1) {
    return res.status(403).json({ error: "Cannot modify the parent account via this endpoint" });
}
```

**DELETE /api/admin/children/:id:**
```typescript
if (user.tenant_id !== req.user!.ndr_tenant_id) {
    return res.status(403).json({ error: "Cannot delete users outside your organization" });
}
if (user.is_parent === 1) {
    return res.status(403).json({ error: "Cannot delete the parent account" });
}
```

---

## 13. Role Hierarchy and Permissions

```
super_admin   -> Full platform access, all tenants, all users, God Mode
owner         -> Full access within own tenant, can manage children (is_parent=1)
support       -> Read + operational actions within own tenant (SOC Analyst)
billing_admin -> Read + billing actions within own tenant
customer      -> Read-only within own tenant (Viewer)
```

### How the Frontend Uses Roles

The frontend reads `getCurrentUser().role` and `getCurrentUser().is_parent` from localStorage to conditionally render:

```typescript
const user = getCurrentUser();

// Super admin sees platform-wide tenant management
if (user.role === "super_admin") {
    return <SuperAdminView />;
}

// Parent owner sees own team management
if (user.role === "owner" && user.is_parent) {
    return <ParentOwnerView />;
}

// Everyone else sees their role-appropriate dashboard
return <StandardDashboard />;
```

### How the Backend Enforces Roles

Every admin endpoint checks the role from the JWT:

```typescript
function isSuperAdmin(req: Request): boolean {
    return req.user?.role === "super_admin";
}

function isParentOwner(req: Request): boolean {
    return req.user?.role === "owner" && req.user?.is_parent === true;
}
```

These checks happen BEFORE any database operation. The JWT is signed by the server, so the role and tenant_id cannot be tampered with by the client.

---

## 14. AWS SES Activation

To switch from console-only codes to actual email delivery, set these four environment variables (Replit Secrets):

| Variable | Purpose | Example |
|----------|---------|---------|
| `AWS_ACCESS_KEY_ID` | IAM user access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | `wJal...` |
| `AWS_SES_REGION` | SES region | `us-east-1` |
| `AWS_SES_FROM_EMAIL` | Verified sender address | `noreply@yourdomain.com` |

**No code changes needed.** The `sendVerificationCode` function automatically checks for these variables. If all four are present, it fires the SES email. If any are missing, it skips SES silently.

**The console log ALWAYS fires regardless.** SES is additive, not a replacement.

### AWS Setup Checklist

1. Create an IAM user with `AmazonSESFullAccess` policy
2. Verify the sender email address in the SES console (or verify the entire domain)
3. If sending to addresses you don't own, request production access (move out of SES sandbox)
4. Set the four environment variables in Replit Secrets
5. Restart the app — SES will activate automatically

### Install the SES SDK

```bash
npm install @aws-sdk/client-ses
```

The dynamic import in `sendVerificationCode` means the app won't crash if the SDK isn't installed — it just won't attempt SES delivery.

---

## 15. How to Retrieve Your 6-Digit Code

### During Development (Replit Workflow Logs)

1. Submit login credentials on the frontend
2. Open the "Start application" workflow panel in Replit
3. Look for the bordered console block:

```
========================================
[NDR 2FA] Verification code for user@example.com: 847291
========================================
```

4. Copy the 6-digit number and enter it on the OTP screen

### In Production (Deployment Logs)

1. Submit login credentials on the published app
2. Open Replit > Deployments > Logs
3. Search for `[NDR 2FA]`
4. The code appears in the same bordered format

### With AWS SES Configured

1. Submit login credentials
2. Check your email inbox (arrives within seconds)
3. The code is in a styled HTML email with large centered digits
4. The code is ALSO in the deployment logs as a backup

---

## 16. Security Checklist

| Item | Status | Detail |
|------|--------|--------|
| Passwords hashed with bcrypt (cost 12) | Required | Never store plaintext passwords |
| OTP codes hashed with bcrypt (cost 10) | Required | Plaintext code only exists in memory during generation |
| OTP expires after 10 minutes | Required | Server checks `expires_at` before accepting |
| OTP brute-force limit (5 attempts) | Required | Code invalidated on 5th failed attempt |
| OTP resend rate limit (60 seconds) | Required | Prevents spamming the console/email |
| Previous OTP codes invalidated on new request | Required | `UPDATE SET used=1 WHERE email=? AND used=0` |
| Pending token has no role/tenant | Required | Cannot access any protected routes |
| Pending token expires in 15 minutes | Required | Shorter than real token (8 hours) |
| JWT signed with server secret | Required | Client cannot forge role or tenant_id |
| Tenant isolation on every admin endpoint | Required | Always filter by `req.user.ndr_tenant_id` |
| Parent cannot be deleted via children endpoint | Required | Server returns 403 |
| Platform-core tenant is immutable | Required | Cannot edit or delete |
| Super admin accounts cannot be deleted | Required | Server returns 403 |
| Email globally unique | Required | No duplicate emails across tenants |
| Password validation (8 chars, 1 number, 1 special) | Required | Enforced on register |
| SKIP_2FA defaults to false | Required | Only set to true for emergency bypass |

---

## Complete Login Sequence Diagram

```
CLIENT                              SERVER                           DATABASE

1. POST /auth/login
   { email, password }
                                    2. getUserByEmail(email)
                                                                     -> SELECT * FROM ndr-users
                                    3. bcrypt.compare(password, hash)
                                    4. Check trial expiry
                                    5. Check user.status === "active"
                                    6. generateVerificationCode()
                                       -> crypto.randomInt(100000, 999999)
                                    7. bcrypt.hash(code, 10) -> codeHash
                                    8. Invalidate old codes
                                                                     -> UPDATE ndr-otp SET used=1
                                    9. Store new code hash
                                                                     -> INSERT INTO ndr-otp
                                    10. console.log the plaintext code
                                    11. SES send (if configured)
                                    12. generatePendingToken(email)
   <- { requiresMfa, maskedEmail,
        pendingToken }

13. User reads code from logs/email
14. User enters 6 digits

15. POST /auth/verify-otp
    { pendingToken, otp_code }
                                    16. jwt.verify(pendingToken)
                                    17. Extract email from pending token
                                    18. Find latest unused code
                                                                     -> SELECT * FROM ndr-otp
                                    19. Check not expired
                                    20. Check attempts < 5
                                    21. bcrypt.compare(otp_code, codeHash)
                                    22. If valid: mark used=1
                                                                     -> UPDATE ndr-otp SET used=1
                                    23. Set mfa_verified=1
                                                                     -> UPDATE ndr-users
                                    24. generateToken(full payload)
   <- { token, user }

25. storeAuth(token, user)
    -> localStorage
26. Redirect to dashboard
```

---

## File Summary

| File | Purpose |
|------|---------|
| `scripts/init_auth_tables.py` | Creates 3 SQLite tables on startup |
| `server/db/authDb.ts` | All database operations (tenant/user/OTP CRUD) |
| `server/middleware/jwtAuth.ts` | JWT verification middleware + token generation |
| `server/services/emailVerification.ts` | Code generation, email masking, console log + SES delivery |
| `server/routes/auth.ts` | Login, register, verify-otp, resend-otp, invite |
| `server/routes/admin.ts` | Super admin tenant management + parent owner child management |
| `server/seedDemo.ts` | Seeds super user + demo account on startup |
| `client/src/pages/login.tsx` | Login/register form + OTP verification screen |
| `client/src/components/OtpInput.tsx` | 6-box OTP input with auto-advance and paste |
| `client/src/lib/auth.ts` | Token storage, retrieval, expiry check, logout |

---

**Built on NDR Phase Gate 0 | PLATFORM_VERSION v1.2**
