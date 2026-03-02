import type { Express } from "express";
import { createServer, type Server } from "http";
import { pipeline } from "./pipeline";
import { updateThreatStatusSchema } from "@shared/schema";
import { getInterfaceContractSchema } from "./engines/kinetic-eng";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  pipeline.start();

  app.get("/api/dashboard/stats", (_req, res) => {
    res.json(pipeline.getDashboardStats());
  });

  app.get("/api/events", (_req, res) => {
    const events = [...pipeline.networkEvents].reverse();
    res.json(events);
  });

  app.get("/api/identity", (_req, res) => {
    const events = [...pipeline.identityEvents].reverse();
    res.json(events);
  });

  app.get("/api/threats", (_req, res) => {
    const threats = [...pipeline.correlations].reverse();
    res.json(threats);
  });

  app.patch("/api/threats/:id", (req, res) => {
    const { id } = req.params;
    const parsed = updateThreatStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid status value", errors: parsed.error.flatten() });
    }
    const threat = pipeline.correlations.find((c) => c.id === id);
    if (!threat) {
      return res.status(404).json({ message: "Threat not found" });
    }
    threat.status = parsed.data.status;
    res.json(threat);
  });

  app.get("/api/attack-patterns", (_req, res) => {
    res.json(pipeline.attackPatterns);
  });

  app.get("/api/responses", (_req, res) => {
    const responses = [...pipeline.responseActions].reverse();
    res.json(responses);
  });

  app.get("/api/pipeline/metrics", (_req, res) => {
    res.json(pipeline.pipelineMetrics);
  });

  app.get("/api/pipeline/status", (_req, res) => {
    res.json(pipeline.getStatus());
  });

  app.get("/api/sigma-rules", (_req, res) => {
    res.json(pipeline.sigmaRules);
  });

  app.get("/api/sigma-firings", (_req, res) => {
    const firings = [...pipeline.sigmaFirings].reverse();
    res.json(firings);
  });

  app.get("/api/correlated-docs", (_req, res) => {
    const docs = [...pipeline.correlatedDocs];
    res.json(docs);
  });

  app.get("/api/host-cardinality", (_req, res) => {
    res.json(pipeline.hostCardinality);
  });

  app.get("/api/dispatch-surface", (_req, res) => {
    res.json(pipeline.dispatchSurface);
  });

  app.get("/api/kinetic-executions", (_req, res) => {
    const executions = [...pipeline.kineticExecutions].reverse();
    res.json(executions);
  });

  app.get("/api/kl002-executions", (_req, res) => {
    const executions = [...pipeline.kl002Executions].reverse();
    res.json(executions);
  });

  app.get("/api/kinetic-contract", (_req, res) => {
    res.json(getInterfaceContractSchema());
  });

  app.get("/api/rollback-executions", (_req, res) => {
    const executions = [...pipeline.rollbackExecutions].reverse();
    res.json(executions);
  });

  app.post("/api/rollback", (req, res) => {
    const { original_execution_id, authorized_by, dry_run } = req.body;
    if (!original_execution_id || typeof original_execution_id !== "string") {
      return res.status(400).json({ error: "original_execution_id is required" });
    }
    if (!authorized_by || typeof authorized_by !== "string" || authorized_by.length < 2) {
      return res.status(400).json({ error: "authorized_by is required (min 2 chars)" });
    }
    const isDryRun = dry_run !== false;
    const result = pipeline.triggerRollback(original_execution_id, authorized_by, isDryRun);
    res.json(result);
  });

  return httpServer;
}
