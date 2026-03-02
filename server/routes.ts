import type { Express } from "express";
import { createServer, type Server } from "http";
import { pipeline } from "./pipeline";
import { updateThreatStatusSchema } from "@shared/schema";

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

  return httpServer;
}
