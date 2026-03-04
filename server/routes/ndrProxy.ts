import { Router } from "express";
import { authenticateJWT, isTrialExpired } from "../middleware/jwtAuth";
import { requireRole, NDR_ROLES } from "../ndrRoles";
import { proxyToFlask, checkTrialWriteBlock } from "../middleware/tenantProxy";

const router = Router();

router.get(
  "/api/ndr/health",
  authenticateJWT,
  isTrialExpired,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN, NDR_ROLES.BILLING_ADMIN, NDR_ROLES.SOC_ANALYST, NDR_ROLES.TENANT_VIEWER),
  async (req, res) => {
    const result = await proxyToFlask("GET", "/health", null, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.get(
  "/api/ndr/dlq/health",
  authenticateJWT,
  isTrialExpired,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN, NDR_ROLES.SOC_ANALYST, NDR_ROLES.TENANT_VIEWER),
  async (req, res) => {
    const result = await proxyToFlask("GET", "/dlq/health", null, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.post(
  "/api/ndr/run",
  authenticateJWT,
  isTrialExpired,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN),
  async (req, res) => {
    const trialCheck = checkTrialWriteBlock(req);
    if (trialCheck.blocked && trialCheck.response) {
      return res.status(trialCheck.response.http_status).json(trialCheck.response);
    }
    const result = await proxyToFlask("POST", "/run", req.body, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

router.get(
  "/api/ndr/tickets",
  authenticateJWT,
  isTrialExpired,
  requireRole(NDR_ROLES.PLATFORM_OWNER, NDR_ROLES.NDR_ADMIN, NDR_ROLES.BILLING_ADMIN, NDR_ROLES.SOC_ANALYST, NDR_ROLES.TENANT_VIEWER),
  async (req, res) => {
    let tenantParam = req.user!.ndr_tenant_id;

    if (req.user!.role === NDR_ROLES.PLATFORM_OWNER && !req.user!.is_trial) {
      tenantParam = (req.query.tenant_id as string) || "all";
    }

    const result = await proxyToFlask("GET", `/v1/tickets?tenant_id=${encodeURIComponent(tenantParam)}`, null, req.user!.ndr_tenant_id);
    res.status(result.status).json(result.data);
  }
);

export default router;
