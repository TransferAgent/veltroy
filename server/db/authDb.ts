import Database from "better-sqlite3";
import path from "path";

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

export interface Tenant {
  tenant_id: string;
  name: string;
  tier: string;
  status: string;
  is_trial: number;
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
  is_parent: number;
  mfa_secret: string | null;
  mfa_verified: number;
  status: string;
  created_at: string;
}

export interface OtpRecord {
  id: number;
  email: string;
  otp_code: string;
  expires_at: string;
  used: number;
  created_at: string;
}

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
  return db.prepare('SELECT * FROM "ndr-tenants" WHERE tenant_id = ?').get(tenantId) as Tenant | undefined;
}

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
  return db.prepare('SELECT * FROM "ndr-users" WHERE email = ?').get(email) as User | undefined;
}

export function createOtp(email: string, otpCode: string, expiresAt: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO "ndr-otp" (email, otp_code, expires_at)
    VALUES (?, ?, ?)
  `).run(email, otpCode, expiresAt);
}

export function getLatestUnusedOtp(email: string): OtpRecord | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM "ndr-otp"
    WHERE email = ? AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email) as OtpRecord | undefined;
}

export function markOtpUsed(id: number): void {
  const db = getDb();
  db.prepare('UPDATE "ndr-otp" SET used = 1 WHERE id = ?').run(id);
}

export function updateTenantStatus(tenantId: string, status: string): void {
  const db = getDb();
  db.prepare('UPDATE "ndr-tenants" SET status = ? WHERE tenant_id = ?').run(status, tenantId);
}
