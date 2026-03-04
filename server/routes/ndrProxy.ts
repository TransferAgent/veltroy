import { Router } from "express";
import { authenticateJWT, generateToken } from "../middleware/jwtAuth";
import { requireRole, NDR_ROLES } from "../ndrRoles";
import { proxyToFlask } from "../middleware/tenantProxy";

const router = Router();

router.get(
  "/api/ndr/health",
  authenticateJWT,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN, NDR_ROLES.BILLING_ADMIN, NDR_ROLES.SOC_ANALYST, NDR_ROLES.TENANT_VIEWER),
  async (req, res) => {
    const result = await proxyToFlask("GET", "/health", null, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.get(
  "/api/ndr/dlq/health",
  authenticateJWT,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN, NDR_ROLES.SOC_ANALYST, NDR_ROLES.TENANT_VIEWER),
  async (req, res) => {
    const result = await proxyToFlask("GET", "/dlq/health", null, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.post(
  "/api/ndr/run",
  authenticateJWT,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN),
  async (req, res) => {
    const result = await proxyToFlask("POST", "/run", req.body, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.get(
  "/api/ndr/tickets",
  authenticateJWT,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN, NDR_ROLES.BILLING_ADMIN, NDR_ROLES.SOC_ANALYST, NDR_ROLES.TENANT_VIEWER),
  async (req, res) => {
    let tenantParam = req.user!.ndr_tenant_id;

    if (req.user!.role === NDR_ROLES.PLATFORM_OWNER) {
      tenantParam = (req.query.tenant_id as string) || "all";
    }

    const result = await proxyToFlask("GET", `/v1/tickets?tenant_id=${encodeURIComponent(tenantParam)}`, null, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.get("/api/ndr/token/lab", (_req, res) => {
  const deploymentStage = process.env.DEPLOYMENT_STAGE || "LAB";
  if (deploymentStage === "PRODUCTION") {
    return res.status(403).json({ error: "LAB token endpoint disabled in PRODUCTION" });
  }

  const roles = ["owner", "super_admin", "billing_admin", "support", "customer"];
  const tokens: Record<string, string> = {};

  for (const role of roles) {
    tokens[role] = generateToken({
      user_id: `lab-${role}`,
      role,
      ndr_tenant_id: "default",
      email: `${role}@ndr-lab.local`,
    });
  }

  res.json({
    message: "LAB tokens generated — do not use in production",
    tokens,
    blueprint_version: "v1.2",
  });
});

export default router;
