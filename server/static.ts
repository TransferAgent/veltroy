import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.warn(`[static] Build directory not found: ${distPath} — serving health-only fallback`);
    app.use("/{*path}", (_req, res) => {
      res.status(200).send("<!DOCTYPE html><html><body>NDR Platform v1.2</body></html>");
    });
    return;
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
