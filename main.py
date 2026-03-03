#!/usr/bin/env python3
"""
main.py — Flask Bus (Port 5000)
Blueprint v1.2 | Phase Gate 0

Exposes three endpoints for the NDR platform:
  POST /run    → Execute full pipeline via correlator
  GET  /stats  → Query all four tables
  GET  /health → Platform health check
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from glue.correlator import run_pipeline, get_stats, get_health

app = Flask(__name__)


@app.route("/run", methods=["POST"])
def run_endpoint():
    data = request.get_json(silent=True) or {}
    pipeline_run_id = data.get("pipeline_run_id")
    mode = data.get("mode", "test")

    report = run_pipeline(pipeline_run_id=pipeline_run_id, mode=mode)
    return jsonify(report), 200


@app.route("/stats", methods=["GET"])
def stats_endpoint():
    stats = get_stats()
    return jsonify(stats), 200


@app.route("/health", methods=["GET"])
def health_endpoint():
    health = get_health()
    return jsonify(health), 200


if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", 5000))
    print(f"[main.py] Flask Bus starting on port {port}")
    print(f"[main.py] Endpoints: POST /run | GET /stats | GET /health")
    app.run(host="0.0.0.0", port=port, debug=False)
