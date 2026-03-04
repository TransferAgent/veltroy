import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { authenticateJWT } from "../middleware/jwtAuth";
import {
  getAllTenants,
  getAllUsers,
  getUsersByTenantId,
  getUserById,
  updateUser,
  deleteUser,
  updateTenant,
  deleteTenant,
  countUsersByTenantId,
  createUser,
  getUserByEmail,
  getTenantById,
} from "../db/authDb";

const router = Router();

const MAX_CHILDREN_PER_TENANT = 5;
const PLATFORM_TENANT_ID = "ndr-platform-core";
const VALID_STATUSES = ["active", "suspended"];
const VALID_TIERS = ["trial", "starter", "professional", "enterprise"];
const SUPER_ADMIN_ROLES = ["owner", "super_admin", "support", "billing_admin", "customer"];
const CHILD_ROLES = ["support", "customer", "billing_admin"];

function isSuperAdmin(req: Request): boolean {
  return req.user?.role === "super_admin";
}

function isParentOwner(req: Request): boolean {
  return req.user?.role === "owner" && req.user?.is_parent === true;
}

function isTrialUser(req: Request): boolean {
  return req.user?.is_trial === true;
}

router.get("/api/admin/tenants", authenticateJWT, (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "Super admin access required" });
  }

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

router.patch("/api/admin/users/:id", authenticateJWT, (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "Super admin access required" });
  }

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.tenant_id === PLATFORM_TENANT_ID) {
    return res.status(403).json({ error: "Cannot modify platform core tenant users" });
  }

  const { email, role, status } = req.body || {};
  const fields: any = {};
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    fields.email = email;
  }
  if (role) {
    if (!SUPER_ADMIN_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${SUPER_ADMIN_ROLES.join(", ")}` });
    }
    fields.role = role;
  }
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    fields.status = status;
  }

  updateUser(userId, fields);
  return res.json({ message: "User updated", user_id: userId });
});

router.delete("/api/admin/users/:id", authenticateJWT, (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "Super admin access required" });
  }

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.role === "super_admin") {
    return res.status(403).json({ error: "Cannot delete super admin accounts" });
  }

  if (user.tenant_id === PLATFORM_TENANT_ID) {
    return res.status(403).json({ error: "Cannot delete platform core tenant users" });
  }

  deleteUser(userId);
  return res.json({ message: "User deleted", user_id: userId });
});

router.patch("/api/admin/tenants/:id/extend-trial", authenticateJWT, (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "Super admin access required" });
  }

  const tenantId = req.params.id;
  const tenant = getTenantById(tenantId);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const { days } = req.body || {};
  const extendDays = parseInt(days, 10) || 30;

  const baseDate = tenant.trial_expires_at ? new Date(tenant.trial_expires_at) : new Date();
  const newExpiry = new Date(Math.max(baseDate.getTime(), Date.now()) + extendDays * 24 * 60 * 60 * 1000).toISOString();

  updateTenant(tenantId, { is_trial: 1, trial_expires_at: newExpiry });
  return res.json({ message: `Trial extended by ${extendDays} days`, tenant_id: tenantId, trial_expires_at: newExpiry });
});

router.patch("/api/admin/tenants/:id", authenticateJWT, (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "Super admin access required" });
  }

  const tenantId = req.params.id;
  const tenant = getTenantById(tenantId);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  if (tenantId === "ndr-platform-core") {
    return res.status(403).json({ error: "Cannot modify the platform core tenant" });
  }

  const { name, tier, status } = req.body || {};
  const fields: any = {};
  if (name) fields.name = name;
  if (tier) {
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: `Tier must be one of: ${VALID_TIERS.join(", ")}` });
    }
    fields.tier = tier;
  }
  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    fields.status = status;
  }

  updateTenant(tenantId, fields);
  return res.json({ message: "Tenant updated", tenant_id: tenantId });
});

router.delete("/api/admin/tenants/:id", authenticateJWT, (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "Super admin access required" });
  }

  const tenantId = req.params.id;
  if (tenantId === "ndr-platform-core") {
    return res.status(403).json({ error: "Cannot delete the platform core tenant" });
  }

  const tenant = getTenantById(tenantId);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  deleteTenant(tenantId);
  return res.json({ message: "Tenant and all its users deleted", tenant_id: tenantId });
});

router.get("/api/admin/children", authenticateJWT, (req: Request, res: Response) => {
  if (!isParentOwner(req) && !isSuperAdmin(req)) {
    return res.status(403).json({ error: "Parent owner access required" });
  }

  const tenantId = req.user!.ndr_tenant_id;
  const users = getUsersByTenantId(tenantId);

  const children = users
    .filter((u) => u.is_parent === 0)
    .map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      is_parent: false,
      status: u.status,
      created_at: u.created_at,
    }));

  const tenant = getTenantById(tenantId);

  return res.json({
    children,
    max_children: MAX_CHILDREN_PER_TENANT,
    remaining: MAX_CHILDREN_PER_TENANT - children.length,
    tenant_name: tenant?.name || tenantId,
  });
});

router.post("/api/admin/children", authenticateJWT, async (req: Request, res: Response) => {
  if (!isParentOwner(req) && !isSuperAdmin(req)) {
    return res.status(403).json({ error: "Parent owner access required" });
  }

  const tenantId = req.user!.ndr_tenant_id;
  const users = getUsersByTenantId(tenantId);
  const childCount = users.filter((u) => u.is_parent === 0).length;

  if (childCount >= MAX_CHILDREN_PER_TENANT) {
    return res.status(400).json({ error: `Maximum of ${MAX_CHILDREN_PER_TENANT} child accounts reached` });
  }

  const { email, role, password } = req.body || {};

  if (!email || !role) {
    return res.status(400).json({ error: "email and role are required" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const allowedRoles = ["support", "customer", "billing_admin"];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const tempPassword = password || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const userId = createUser({
    tenant_id: tenantId,
    email,
    password_hash: passwordHash,
    role,
    is_parent: 0,
  });

  return res.status(201).json({
    message: "Child account created",
    user: { id: userId, email, role, tenant_id: tenantId },
    temp_password: tempPassword,
  });
});

router.patch("/api/admin/children/:id", authenticateJWT, (req: Request, res: Response) => {
  if (!isParentOwner(req) && !isSuperAdmin(req)) {
    return res.status(403).json({ error: "Parent owner access required" });
  }

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.tenant_id !== req.user!.ndr_tenant_id) {
    return res.status(403).json({ error: "Cannot modify users outside your organization" });
  }

  if (user.is_parent === 1) {
    return res.status(403).json({ error: "Cannot modify the parent account via this endpoint" });
  }

  const { email, role, status } = req.body || {};
  const fields: any = {};
  if (email) fields.email = email;
  if (role) {
    const allowedRoles = ["support", "customer", "billing_admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(", ")}` });
    }
    fields.role = role;
  }
  if (status) fields.status = status;

  updateUser(userId, fields);
  return res.json({ message: "Child account updated", user_id: userId });
});

router.delete("/api/admin/children/:id", authenticateJWT, (req: Request, res: Response) => {
  if (!isParentOwner(req) && !isSuperAdmin(req)) {
    return res.status(403).json({ error: "Parent owner access required" });
  }

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.tenant_id !== req.user!.ndr_tenant_id) {
    return res.status(403).json({ error: "Cannot delete users outside your organization" });
  }

  if (user.is_parent === 1) {
    return res.status(403).json({ error: "Cannot delete the parent account" });
  }

  deleteUser(userId);
  return res.json({ message: "Child account deleted", user_id: userId });
});

function generateTempPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default router;
