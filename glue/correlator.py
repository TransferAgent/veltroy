#!/usr/bin/env python3
"""
correlator.py — The Bus Wire (Thin Orchestration Layer)
Blueprint v1.2 | Phase Gate 0

Calls all 4 engineer modules in sequence. Does NOT replicate any logic.
Exposes pipeline execution and reporting. Wired to Flask Bus in main.py.

Sequence:
  Step A → network_eng → ndr-network
  Step B → identity_eng → ndr-identity
  Step C → detection_eng → ndr-correlated + ndr-dlq
  Step D → kinetic_eng → response execution
  Step E → structured pipeline report
"""

import json
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules import network_eng, identity_eng, detection_eng, kinetic_eng

BLUEPRINT_VERSION = "v1.2"
ECS_VERSION = "8.11.0"
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")


def run_pipeline(pipeline_run_id: Optional[str] = None, mode: str = "test") -> Dict[str, Any]:
    run_id = pipeline_run_id or str(uuid.uuid4())
    run_timestamp = datetime.now(timezone.utc).isoformat()

    print(f"[correlator] Pipeline run started: {run_id} | mode={mode} | ts={run_timestamp}")

    detection_eng._init_db()
    kinetic_eng._init_db()

    print("[correlator] Step A — network_eng: generating traffic events...")
    step_a_start = time.time()
    if mode == "test":
        network_eng.run_normal_mode(15)
        network_eng.run_beacon_mode(src_ip="10.0.1.45", test_run_id=run_id)
    else:
        network_eng.run_normal_mode(10)
    step_a_time = time.time() - step_a_start

    print("[correlator] Step B — identity_eng: generating identity events...")
    step_b_start = time.time()
    if mode == "test":
        identity_eng.run_normal_mode(10)
        identity_eng.run_alert_simulation(test_run_id=run_id)
    else:
        identity_eng.run_normal_mode(10)
    step_b_time = time.time() - step_b_start

    print("[correlator] Step C — detection_eng: full 5-operation pipeline...")
    step_c_start = time.time()
    if mode == "test":
        detection_result = detection_eng.run_test_mode(test_run_id=run_id)
    else:
        detection_result = detection_eng.run_detect_mode()
    step_c_time = time.time() - step_c_start

    print("[correlator] Step D — kinetic_eng: executing responses...")
    step_d_start = time.time()
    kinetic_executions = []
    response_times = []

    payloads = detection_result.get("payloads", [])
    for payload in payloads:
        result = kinetic_eng.execute_kl001(payload)
        kinetic_executions.append(result)

        if result.get("status") == "COMPLETE":
            rt = result.get("response_time_seconds", 0)
            response_times.append(rt)
            print(f"  → KL-001 {result.get('tier')} | {payload['alert_type']} | "
                  f"host={payload['host_ip']} | {rt}s | SLA={'MET' if result.get('sla_met') else 'MISSED'}")

        if payload.get("alert_type") in ("SUSPICIOUS_IAM_KEY_ROTATION", "BRUTE_FORCE_SUCCESS"):
            kl002_result = kinetic_eng.execute_kl002(payload)
            kinetic_executions.append(kl002_result)
            if kl002_result.get("status") == "COMPLETE":
                print(f"  → KL-002 IAM Kill | {payload['iam_user']} | {kl002_result.get('response_time_seconds')}s")

    step_d_time = time.time() - step_d_start

    avg_response = round(sum(response_times) / len(response_times), 3) if response_times else 0

    conn = sqlite3.connect(DB_PATH)
    try:
        net_count = conn.execute('SELECT COUNT(*) FROM "ndr-network"').fetchone()[0]
        id_count = conn.execute('SELECT COUNT(*) FROM "ndr-identity"').fetchone()[0]
        corr_count = conn.execute('SELECT COUNT(*) FROM "ndr-correlated"').fetchone()[0]
        dlq_count = conn.execute('SELECT COUNT(*) FROM "ndr-dlq"').fetchone()[0]
    except sqlite3.OperationalError:
        net_count = id_count = corr_count = dlq_count = 0
    finally:
        conn.close()

    report = {
        "pipeline_run_id": run_id,
        "timestamp": run_timestamp,
        "mode": mode,
        "records_generated_network": net_count,
        "records_generated_identity": id_count,
        "records_correlated": corr_count,
        "records_dlq": dlq_count,
        "sigma_rules_fired": detection_result.get("alert_types", []),
        "sigma_rules_unique": list(set(detection_result.get("alert_types", []))),
        "kinetic_executions": len(kinetic_executions),
        "avg_response_seconds": avg_response,
        "step_timings": {
            "network_eng_seconds": round(step_a_time, 3),
            "identity_eng_seconds": round(step_b_time, 3),
            "detection_eng_seconds": round(step_c_time, 3),
            "kinetic_eng_seconds": round(step_d_time, 3),
            "total_seconds": round(step_a_time + step_b_time + step_c_time + step_d_time, 3),
        },
        "blueprint_version": BLUEPRINT_VERSION,
        "ecs_version": ECS_VERSION,
    }

    print(f"\n[correlator] === PIPELINE REPORT ===")
    print(f"  Run ID:              {report['pipeline_run_id']}")
    print(f"  Network records:     {report['records_generated_network']}")
    print(f"  Identity records:    {report['records_generated_identity']}")
    print(f"  Correlated records:  {report['records_correlated']}")
    print(f"  DLQ records:         {report['records_dlq']}")
    print(f"  Sigma rules fired:   {report['sigma_rules_unique']}")
    print(f"  Kinetic executions:  {report['kinetic_executions']}")
    print(f"  Avg response (s):    {report['avg_response_seconds']}")
    print(f"  Total pipeline (s):  {report['step_timings']['total_seconds']}")
    print(f"  Blueprint version:   {report['blueprint_version']}")

    return report


def get_stats() -> Dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    tables = {
        "ndr-network": 0,
        "ndr-identity": 0,
        "ndr-correlated": 0,
        "ndr-dlq": 0,
    }

    for table in tables:
        try:
            tables[table] = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        except sqlite3.OperationalError:
            tables[table] = 0

    last_correlated = None
    try:
        row = conn.execute(
            'SELECT alert_type, severity, source_ip, eng3_correlation_id, timestamp '
            'FROM "ndr-correlated" ORDER BY timestamp DESC LIMIT 1'
        ).fetchone()
        if row:
            last_correlated = {
                "alert_type": row[0],
                "severity": row[1],
                "source_ip": row[2],
                "eng3_correlation_id": row[3],
                "timestamp": row[4],
            }
    except sqlite3.OperationalError:
        pass

    conn.close()

    return {
        "tables": tables,
        "last_correlated_alert": last_correlated,
        "blueprint_version": BLUEPRINT_VERSION,
        "ecs_version": ECS_VERSION,
    }


def get_health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "platform_version": BLUEPRINT_VERSION,
        "ecs_version": ECS_VERSION,
        "modules": [
            "network_eng",
            "identity_eng",
            "detection_eng",
            "kinetic_eng",
            "correlator",
        ],
        "oracle_ready": True,
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "run":
            run_id = sys.argv[2] if len(sys.argv) > 2 else None
            report = run_pipeline(pipeline_run_id=run_id, mode="test")
            print(json.dumps(report, indent=2))
        elif cmd == "stats":
            print(json.dumps(get_stats(), indent=2))
        elif cmd == "health":
            print(json.dumps(get_health(), indent=2))
        else:
            print(f"Unknown command: {cmd}. Use: run, stats, health")
    else:
        report = run_pipeline(mode="test")
        print(json.dumps(report, indent=2))
