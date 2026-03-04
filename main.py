#!/usr/bin/env python3
"""
main.py — Flask Bus (Port 8000)
Blueprint v1.2 | Phase Gate 0

Exposes pipeline and Engineer 3 API endpoints for the NDR platform:
  POST /run                          → Execute full pipeline via correlator
  GET  /stats                        → Query all four tables
  GET  /health                       → Platform health check
  POST /v1/state/kinetic             → Update kinetic execution state on ndr-correlated
  GET  /v1/audit/kinetic/<audit_id>  → Fetch single audit record by correlation/pipeline ID
  POST /v1/audit/kinetic/rollback    → Mark correlated record as ROLLED_BACK

Port 5000 is reserved for the TypeScript dashboard preview.
Flask Bus runs on port 8000.
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from glue.correlator import run_pipeline, get_stats, get_health, _monitor_dlq

app = Flask(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "ndr.db")


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


@app.route("/dlq/health", methods=["GET"])
def dlq_health_endpoint():
    result = _monitor_dlq()
    return jsonify(result), 200


def _fetch_correlated_by_id(lookup_id: str):
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            'SELECT event_json FROM "ndr-correlated" WHERE eng3_correlation_id = ?',
            (lookup_id,)
        ).fetchone()
        if not row:
            row = conn.execute(
                'SELECT event_json FROM "ndr-correlated" WHERE id = ?',
                (lookup_id,)
            ).fetchone()
        if not row:
            rows = conn.execute(
                'SELECT event_json FROM "ndr-correlated"'
            ).fetchall()
            for r in rows:
                doc = json.loads(r[0])
                labels = doc.get("labels", {})
                if labels.get("pipeline_run_id") == lookup_id:
                    return doc
            return None
        return json.loads(row[0])
    finally:
        conn.close()


def _update_correlated_record(eng3_correlation_id: str, updates: dict):
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            'SELECT event_json, eng3_correlation_id FROM "ndr-correlated" WHERE eng3_correlation_id = ?',
            (eng3_correlation_id,)
        ).fetchone()
        if not row:
            row = conn.execute(
                'SELECT event_json, eng3_correlation_id FROM "ndr-correlated" WHERE id = ?',
                (eng3_correlation_id,)
            ).fetchone()
        if not row:
            return None
        doc = json.loads(row[0])
        actual_corr_id = row[1]
        for key, value in updates.items():
            if key in ("labels", "correlation"):
                if key not in doc:
                    doc[key] = {}
                doc[key].update(value)
            else:
                doc[key] = value
        conn.execute(
            'UPDATE "ndr-correlated" SET event_json = ? WHERE eng3_correlation_id = ?',
            (json.dumps(doc), actual_corr_id)
        )
        conn.commit()
        return doc
    finally:
        conn.close()


@app.route("/v1/state/kinetic", methods=["POST"])
def state_kinetic():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body required"}), 400

    eng3_correlation_id = data.get("eng3_correlation_id")
    state = data.get("state")

    if not eng3_correlation_id:
        return jsonify({"error": "eng3_correlation_id is required"}), 400
    if not state:
        return jsonify({"error": "state is required"}), 400

    valid_states = ["PENDING", "IN_PROGRESS", "ACTION_COMPLETE", "COMPLETE", "FAILED", "PARTIAL_FAILURE", "ROLLED_BACK"]
    if state not in valid_states:
        return jsonify({"error": f"state must be one of: {valid_states}"}), 400

    updated = _update_correlated_record(eng3_correlation_id, {
        "execution_state": state,
        "labels": {
            "execution_state": state,
            "state_updated_at": datetime.now(timezone.utc).isoformat(),
        },
    })

    if not updated:
        return jsonify({"error": f"No record found for eng3_correlation_id: {eng3_correlation_id}"}), 404

    return jsonify({
        "status": "updated",
        "eng3_correlation_id": eng3_correlation_id,
        "execution_state": state,
        "document": updated,
    }), 200


@app.route("/v1/audit/kinetic/<audit_id>", methods=["GET"])
def audit_kinetic(audit_id):
    doc = _fetch_correlated_by_id(audit_id)

    if not doc:
        return jsonify({"error": f"No record found for audit_id: {audit_id}"}), 404

    return jsonify({
        "status": "found",
        "audit_id": audit_id,
        "document": doc,
    }), 200


@app.route("/v1/audit/kinetic/rollback", methods=["POST"])
def audit_kinetic_rollback():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body required"}), 400

    eng3_correlation_id = data.get("eng3_correlation_id")
    rollback_token = data.get("rollback_token")

    if not eng3_correlation_id:
        return jsonify({"error": "eng3_correlation_id is required"}), 400
    if not rollback_token:
        return jsonify({"error": "rollback_token is required"}), 400

    updated = _update_correlated_record(eng3_correlation_id, {
        "execution_state": "ROLLED_BACK",
        "labels": {
            "execution_state": "ROLLED_BACK",
            "rollback_token": rollback_token,
            "rolled_back_at": datetime.now(timezone.utc).isoformat(),
        },
    })

    if not updated:
        return jsonify({"error": f"No record found for eng3_correlation_id: {eng3_correlation_id}"}), 404

    return jsonify({
        "status": "rolled_back",
        "eng3_correlation_id": eng3_correlation_id,
        "execution_state": "ROLLED_BACK",
        "rollback_token": rollback_token,
        "document": updated,
    }), 200


@app.route('/v1/tickets', methods=['GET'])
def get_tickets():
    tenant_id = request.args.get('tenant_id', 'default')
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        if tenant_id == 'all':
            rows = conn.execute(
                "SELECT * FROM 'ndr-tickets' ORDER BY timestamp DESC LIMIT 100"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM 'ndr-tickets' WHERE tenant_id=? ORDER BY timestamp DESC LIMIT 100",
                (tenant_id,)
            ).fetchall()
        tickets = [dict(r) for r in rows]
    except Exception:
        tickets = []
    finally:
        conn.close()
    return jsonify({"tickets": tickets, "tenant_id": tenant_id, "count": len(tickets)})


if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", 8000))
    print(f"[main.py] Flask Bus starting on port {port}")
    print(f"[main.py] Endpoints: POST /run | GET /stats | GET /health | GET /dlq/health | GET /v1/tickets")
    print(f"[main.py] Engineer 3 API: POST /v1/state/kinetic | GET /v1/audit/kinetic/<id> | POST /v1/audit/kinetic/rollback")
    app.run(host="0.0.0.0", port=port, debug=False)
