import { Router, type Request, type Response } from "express";
import { authenticateJWT } from "../middleware/jwtAuth";
import {
  getMyEvents,
  getMyThreats,
  getMyStats,
  getMyIdentityLogs,
  getMyCorrelations,
} from "../db/tenantData";

const router = Router();

function resolveViewTenantId(req: Request): string {
  const viewAs = req.query.view_as as string;
  if (viewAs && req.user?.role === "super_admin") {
    return viewAs;
  }
  return req.user!.ndr_tenant_id;
}

router.get("/api/my/events", authenticateJWT, (req: Request, res: Response) => {
  const tenantId = resolveViewTenantId(req);
  const limit = parseInt(req.query.limit as string) || 50;
  const events = getMyEvents(tenantId, limit);
  return res.json({ events, tenant_id: tenantId, count: events.length });
});

router.get("/api/my/threats", authenticateJWT, (req: Request, res: Response) => {
  const tenantId = resolveViewTenantId(req);
  const limit = parseInt(req.query.limit as string) || 50;
  const threats = getMyThreats(tenantId, limit);
  return res.json({ threats, tenant_id: tenantId, count: threats.length });
});

router.get("/api/my/stats", authenticateJWT, (req: Request, res: Response) => {
  const tenantId = resolveViewTenantId(req);
  const stats = getMyStats(tenantId);
  return res.json({ stats, tenant_id: tenantId });
});

router.get("/api/my/identity", authenticateJWT, (req: Request, res: Response) => {
  const tenantId = resolveViewTenantId(req);
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = getMyIdentityLogs(tenantId, limit);
  return res.json({ logs, tenant_id: tenantId, count: logs.length });
});

router.get("/api/my/correlations", authenticateJWT, (req: Request, res: Response) => {
  const tenantId = resolveViewTenantId(req);
  const limit = parseInt(req.query.limit as string) || 50;
  const correlations = getMyCorrelations(tenantId, limit);
  return res.json({ correlations, tenant_id: tenantId, count: correlations.length });
});

export default router;
