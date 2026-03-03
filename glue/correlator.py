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


def _update_correlated_labels(eng3_correlation_id: str, new_labels: Dict[str, Any]):
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            'SELECT event_json FROM "ndr-correlated" WHERE eng3_correlation_id = ?',
            (eng3_correlation_id,)
        ).fetchone()
        if row:
            doc = json.loads(row[0])
            if "labels" not in doc:
                doc["labels"] = {}
            doc["labels"].update(new_labels)
            conn.execute(
                'UPDATE "ndr-correlated" SET event_json = ? WHERE eng3_correlation_id = ?',
                (json.dumps(doc), eng3_correlation_id)
            )
            conn.commit()
    finally:
        conn.close()


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

    print("[correlator] Step B.1 — Injecting malformed docs for PC7 ECS Guardian validation...")
    malformed_docs = [
        {
            "id": str(uuid.uuid4()),
            "@timestamp": datetime.now(timezone.utc).isoformat(),
            "event": {"category": "network", "dataset": "zeek.conn"},
            "ecs": {"version": "8.11.0"},
            "network": {"community_id": "1:test/malformed/no-source-ip"},
            "labels": {"test_run_id": "PC7_MALFORMED_TEST", "pc7_test": True},
        },
        {
            "id": str(uuid.uuid4()),
            "@timestamp": datetime.now(timezone.utc).isoformat(),
            "source": {"ip": "10.0.0.99"},
            "event": {"category": "network", "dataset": "zeek.conn"},
            "ecs": {"version": "7.0.0"},
            "network": {"community_id": "1:test/malformed/bad-ecs-version"},
            "labels": {"test_run_id": "PC7_MALFORMED_TEST", "pc7_test": True},
        },
        {
            "id": str(uuid.uuid4()),
            "source": {"ip": "10.0.0.100"},
            "ecs": {"version": "8.11.0"},
            "network": {"community_id": "1:test/malformed/no-timestamp"},
            "labels": {"test_run_id": "PC7_MALFORMED_TEST", "pc7_test": True},
        },
    ]
    from modules.detection_eng import operation_1_ecs_guardian
    valid_from_malformed = operation_1_ecs_guardian(malformed_docs, "ndr-network")
    dlq_injected = len(malformed_docs) - len(valid_from_malformed)
    print(f"  → {dlq_injected} malformed docs routed to ndr-dlq (PC7 satisfied)")

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

            corr_id = payload.get("eng3_correlation_id")
            if corr_id:
                _update_correlated_labels(corr_id, {
                    "eng4_kl001_response_seconds": rt,
                })

        if payload.get("alert_type") in ("SUSPICIOUS_IAM_KEY_ROTATION", "BRUTE_FORCE_SUCCESS"):
            kl002_result = kinetic_eng.execute_kl002(payload)
            kinetic_executions.append(kl002_result)
            if kl002_result.get("status") == "COMPLETE":
                print(f"  → KL-002 IAM Kill | {payload['iam_user']} | {kl002_result.get('response_time_seconds')}s")

        if payload.get("alert_type") == "LATERAL_MOVE":
            kl003_result = kinetic_eng.execute_kl003(payload)
            kinetic_executions.append(kl003_result)
            if kl003_result.get("status") == "COMPLETE":
                rt003 = kl003_result.get("response_time_seconds", 0)
                print(f"  → KL-003 Lateral Response | {payload['host_ip']} | {rt003}s | SLA={'MET' if kl003_result.get('sla_met') else 'MISSED'}")
                if corr_id:
                    _update_correlated_labels(corr_id, {"kl003_response_seconds": rt003})

        if payload.get("alert_type") == "BRUTE_FORCE_SUCCESS":
            kl004_result = kinetic_eng.execute_kl004(payload)
            kinetic_executions.append(kl004_result)
            if kl004_result.get("status") == "COMPLETE":
                rt004 = kl004_result.get("response_time_seconds", 0)
                print(f"  → KL-004 Auth Spike | {payload['iam_user']} | {rt004}s | SLA={'MET' if kl004_result.get('sla_met') else 'MISSED'}")
                if corr_id:
                    _update_correlated_labels(corr_id, {"kl004_response_seconds": rt004})

        if payload.get("alert_type") == "SUSPICIOUS_IAM_KEY_ROTATION":
            kl005_result = kinetic_eng.execute_kl005(payload)
            kinetic_executions.append(kl005_result)
            if kl005_result.get("status") == "COMPLETE":
                rt005 = kl005_result.get("response_time_seconds", 0)
                print(f"  → KL-005 Console Anomaly | {payload['iam_user']} | {rt005}s | SLA={'MET' if kl005_result.get('sla_met') else 'MISSED'}")
                if corr_id:
                    _update_correlated_labels(corr_id, {"kl005_response_seconds": rt005})

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
