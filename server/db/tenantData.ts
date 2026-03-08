import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "ndr.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

export interface TenantEvent {
  id: string;
  timestamp: string;
  event_kind: string;
  event_dataset: string;
  source_ip: string | null;
  destination_ip: string | null;
  severity: number | null;
  created_at: string;
}

export interface TenantIdentityLog {
  id: string;
  timestamp: string;
  event_kind: string;
  event_dataset: string;
  event_action: string | null;
  user_name: string | null;
  source_ip: string | null;
  severity: number;
  created_at: string;
}

export interface TenantCorrelation {
  id: string;
  timestamp: string;
  alert_type: string | null;
  severity: string | null;
  sigma_rule_id: string | null;
  source_ip: string | null;
  host_ip: string | null;
  iam_user: string | null;
  dispatched: number;
  created_at: string;
}

export interface TenantStats {
  total_events: number;
  total_identity: number;
  total_correlations: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  latest_event_at: string | null;
}

export function getMyEvents(tenantId: string, limit = 50): TenantEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, timestamp, event_kind, event_dataset, source_ip, destination_ip,
           severity, created_at
    FROM "ndr-network"
    WHERE tenant_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(tenantId, limit) as TenantEvent[];
}

export function getMyIdentityLogs(tenantId: string, limit = 50): TenantIdentityLog[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, timestamp, event_kind, event_dataset, event_action, user_name, source_ip,
           severity, created_at
    FROM "ndr-identity"
    WHERE tenant_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(tenantId, limit) as TenantIdentityLog[];
}

export function getMyThreats(tenantId: string, limit = 50): TenantCorrelation[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, timestamp, alert_type, severity, sigma_rule_id, source_ip,
           host_ip, iam_user, dispatched, timestamp as created_at
    FROM "ndr-correlated"
    WHERE tenant_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(tenantId, limit) as TenantCorrelation[];
}

export function getMyCorrelations(tenantId: string, limit = 50): TenantCorrelation[] {
  return getMyThreats(tenantId, limit);
}

export function getMyStats(tenantId: string): TenantStats {
  const db = getDb();

  const events = db.prepare(
    'SELECT COUNT(*) as cnt FROM "ndr-network" WHERE tenant_id = ?'
  ).get(tenantId) as { cnt: number };

  const identity = db.prepare(
    'SELECT COUNT(*) as cnt FROM "ndr-identity" WHERE tenant_id = ?'
  ).get(tenantId) as { cnt: number };

  const correlations = db.prepare(
    'SELECT COUNT(*) as cnt FROM "ndr-correlated" WHERE tenant_id = ?'
  ).get(tenantId) as { cnt: number };

  const critical = db.prepare(
    `SELECT COUNT(*) as cnt FROM "ndr-correlated" WHERE tenant_id = ? AND severity = 'critical'`
  ).get(tenantId) as { cnt: number };

  const high = db.prepare(
    `SELECT COUNT(*) as cnt FROM "ndr-correlated" WHERE tenant_id = ? AND severity = 'high'`
  ).get(tenantId) as { cnt: number };

  const medium = db.prepare(
    `SELECT COUNT(*) as cnt FROM "ndr-correlated" WHERE tenant_id = ? AND severity = 'medium'`
  ).get(tenantId) as { cnt: number };

  const low = db.prepare(
    `SELECT COUNT(*) as cnt FROM "ndr-correlated" WHERE tenant_id = ? AND severity = 'low'`
  ).get(tenantId) as { cnt: number };

  const latest = db.prepare(
    'SELECT MAX(timestamp) as latest FROM "ndr-network" WHERE tenant_id = ?'
  ).get(tenantId) as { latest: string | null };

  return {
    total_events: events.cnt,
    total_identity: identity.cnt,
    total_correlations: correlations.cnt,
    critical_count: critical.cnt,
    high_count: high.cnt,
    medium_count: medium.cnt,
    low_count: low.cnt,
    latest_event_at: latest.latest,
  };
}
