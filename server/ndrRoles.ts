import type { Request, Response, NextFunction } from "express";

export const NDR_ROLES = {
  PLATFORM_OWNER: "owner",
  NDR_ADMIN: "super_admin",
  BILLING_ADMIN: "billing_admin",
  SOC_ANALYST: "support",
  TENANT_VIEWER: "customer",
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["read", "write", "admin", "rollback", "cross_tenant"],
  super_admin: ["read", "write", "admin", "rollback"],
  billing_admin: ["read", "billing"],
  support: ["read", "rollback"],
  customer: ["read"],
};

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Role '${req.user.role}' does not have access. Required: ${roles.join(", ")}`,
      });
    }

    next();
  };
}
