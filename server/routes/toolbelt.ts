import { Router, type Request, type Response } from "express";
import { authenticateJWT } from "../middleware/jwtAuth";
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const router = Router();

const DB_PATH = path.join(process.cwd(), "data", "ndr.db");

function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

function ensureAuditLogTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS "ndr-audit-log" (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.close();
}

ensureAuditLogTable();

router.post("/api/toolbelt/install", authenticateJWT, (req: Request, res: Response) => {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Only super_admin can install integrations" });
  }

  const { tenant_id, integration_type, integration_label } = req.body;

  if (!tenant_id || !integration_type || !integration_label) {
    return res.status(400).json({ error: "tenant_id, integration_type, and integration_label are required" });
  }

  const allowedTypes = ["onedrive_m365", "aws_account", "endpoint_agent", "cloud_racks"];
  if (!allowedTypes.includes(integration_type)) {
    return res.status(400).json({ error: `Invalid integration_type. Allowed: ${allowedTypes.join(", ")}` });
  }

  if (typeof integration_label !== "string" || integration_label.length > 100) {
    return res.status(400).json({ error: "integration_label must be a string under 100 characters" });
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const details = JSON.stringify({
    integration_type,
    integration_label,
    installed_by: req.user.email,
    status: "registered",
  });

  db.prepare(`
    INSERT INTO "ndr-audit-log" (id, actor_email, actor_role, tenant_id, action, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.email, req.user.role, tenant_id, `install_${integration_type}`, details);

  db.close();

  console.log(`[toolbelt] ${req.user.email} installed ${integration_label} (${integration_type}) for tenant ${tenant_id}`);

  return res.status(201).json({
    id,
    tenant_id,
    integration_type,
    integration_label,
    status: "registered",
    message: `Cable box installed – ${integration_label} registered for tenant ${tenant_id}`,
  });
});

router.get("/api/toolbelt/audit", authenticateJWT, (req: Request, res: Response) => {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Only super_admin can view audit log" });
  }

  const tenantId = req.query.tenant_id as string;
  const db = getDb();

  let rows;
  if (tenantId) {
    rows = db.prepare('SELECT * FROM "ndr-audit-log" WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50').all(tenantId);
  } else {
    rows = db.prepare('SELECT * FROM "ndr-audit-log" ORDER BY created_at DESC LIMIT 100').all();
  }

  db.close();
  return res.json({ audit_log: rows });
});

export default router;
