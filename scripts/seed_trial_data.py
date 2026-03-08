#!/usr/bin/env python3
"""
Part B — Seed 6 days of demo NDR data for a new trial tenant.
Called automatically on POST /auth/register when is_trial=True.
Usage: python scripts/seed_trial_data.py --tenant_id=<id> [--dry-run]
Sprint 4 S4-04 | Blueprint v1.2

Matches existing SQLite schema in data/ndr.db:
  ndr-tickets:    id(TEXT), timestamp, ticket_json, alert_type, eng3_correlation_id, severity, source_ip, status, ticket_source, tenant_id, blueprint_version
  ndr-correlated: id(TEXT), timestamp, event_json, eng3_correlation_id, alert_type, severity, sigma_rule_id, source_ip, host_ip, iam_user, pre_commit_written, dispatched, dispatch_payload, blueprint_version
  ndr-network:    id(TEXT), timestamp, event_json, event_kind, event_dataset, source_ip, destination_ip, community_id, severity, blueprint_version
  ndr-identity:   id(TEXT), timestamp, event_json, event_kind, event_dataset, event_action, user_name, source_ip, community_id, severity, alert_rule_id, blueprint_version
  ndr-kinetic:    id(TEXT), timestamp, execution_json, execution_id, playbook_id, response_tier, state, host_ip, alert_type, eng3_correlation_id, response_time_ms, sla_met, blueprint_version
"""

import argparse
import json
import os
import random
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ndr.db")

NOW = datetime.now(timezone.utc)


def _uid():
    return str(uuid.uuid4())


def _ts(days_ago: float, hour_offset: float = 0.0) -> str:
    dt = NOW - timedelta(days=days_ago) + timedelta(hours=hour_offset)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _rand_ip():
    return f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"


def _corr_id():
    return f"ENG3-{uuid.uuid4().hex[:8].upper()}"


def _community_id():
    return f"1:{uuid.uuid4().hex[:20]}"


def seed(tenant_id: str, dry_run: bool = False, db_path: str = DB_PATH):
    results = {}

    tickets = []
    alert_types = (
        ["BRUTE_FORCE_SUCCESS"] * 5 +
        ["C2_BEACON"] * 4 +
        ["LATERAL_MOVE"] * 3 +
        ["HOST_CARDINALITY_SPIKE"] * 2
    )
    severities = {"BRUTE_FORCE_SUCCESS": "HIGH", "C2_BEACON": "CRITICAL", "LATERAL_MOVE": "CRITICAL", "HOST_CARDINALITY_SPIKE": "MEDIUM"}

    for i, alert_type in enumerate(alert_types):
        day = (i * 6) / 14
        hour = random.uniform(0, 8)
        ts = _ts(0, -2) if i == 0 else _ts(day, hour)
        src_ip = _rand_ip()
        corr_id = _corr_id()
        ticket_doc = {
            "alert_type": alert_type,
            "severity": severities[alert_type],
            "tenant_id": tenant_id,
            "source_ip": src_ip,
            "eng3_correlation_id": corr_id,
            "blueprint_version": "v1.2",
            "status": "OPEN",
            "ticket_source": "SOAR_AUTO",
            "labels": {"noise_filtered_pct": 98, "ticket_source": "SOAR_AUTO"}
        }
        tickets.append({
            "id": _uid(),
            "timestamp": ts,
            "ticket_json": json.dumps(ticket_doc),
            "alert_type": alert_type,
            "eng3_correlation_id": corr_id,
            "severity": severities[alert_type],
            "source_ip": src_ip,
            "status": "OPEN",
            "ticket_source": "SOAR_AUTO",
            "tenant_id": tenant_id,
            "blueprint_version": "v1.2",
        })
    results["ndr-tickets"] = len(tickets)

    correlated = []
    corr_types = ["LATERAL_MOVE"] * 3 + ["C2_BEACON"] * 3 + ["BRUTE_FORCE"] * 2
    sigma_map = {"LATERAL_MOVE": "sigma_lateral_movement", "C2_BEACON": "sigma_c2_beacon", "BRUTE_FORCE": "sigma_brute_force"}
    for i, ctype in enumerate(corr_types):
        day = (i * 6) / 8
        corr_id = _corr_id()
        src_ip = _rand_ip()
        event_doc = {
            "alert_type": ctype,
            "blueprint_version": "v1.2",
            "correlation_confidence": "HIGH",
            "pre_commit_written": True,
            "tenant_id": tenant_id,
            "labels": {"correlation_confidence": "HIGH", "blueprint_version": "v1.2"}
        }
        correlated.append({
            "id": _uid(),
            "timestamp": _ts(day, random.uniform(0, 6)),
            "event_json": json.dumps(event_doc),
            "eng3_correlation_id": corr_id,
            "alert_type": ctype,
            "severity": "CRITICAL" if ctype != "BRUTE_FORCE" else "HIGH",
            "sigma_rule_id": sigma_map[ctype],
            "source_ip": src_ip,
            "host_ip": _rand_ip(),
            "iam_user": None,
            "pre_commit_written": 1,
            "dispatched": 1,
            "dispatch_payload": None,
            "blueprint_version": "v1.2",
        })
    results["ndr-correlated"] = len(correlated)

    network = []
    for i in range(50):
        is_beacon = i >= 35
        day = (i * 6) / 50
        src_ip = _rand_ip()
        dst_ip = "198.51.100.42" if is_beacon else _rand_ip()
        event_doc = {
            "event_type": "beacon_candidate" if is_beacon else "connection",
            "tenant_id": tenant_id,
            "blueprint_version": "v1.2",
            "source_ip": src_ip,
            "destination_ip": dst_ip,
        }
        network.append({
            "id": _uid(),
            "timestamp": _ts(day, random.uniform(0, 12)),
            "event_json": json.dumps(event_doc),
            "event_kind": "alert" if is_beacon else "event",
            "event_dataset": "zeek.conn",
            "source_ip": src_ip,
            "destination_ip": dst_ip,
            "community_id": _community_id(),
            "severity": random.randint(40, 80) if is_beacon else random.randint(1, 20),
            "blueprint_version": "v1.2",
        })
    results["ndr-network"] = len(network)

    identity = []
    id_types = ["ssh_login"] * 8 + ["off_hours_anomaly"] * 7 + ["cloudtrail"] * 5
    action_map = {"ssh_login": "ssh-login", "off_hours_anomaly": "off-hours-access", "cloudtrail": "AssumeRole"}
    dataset_map = {"ssh_login": "wazuh.linux", "off_hours_anomaly": "wazuh.windows", "cloudtrail": "aws.cloudtrail"}
    for i, id_type in enumerate(id_types):
        day = (i * 6) / 20
        risk = 88 if (id_type == "off_hours_anomaly" and i in [8, 9]) else random.randint(20, 75)
        user_name = f"user-{random.randint(100,999)}"
        src_ip = _rand_ip()
        event_doc = {
            "event_type": id_type,
            "risk_score": risk,
            "tenant_id": tenant_id,
            "blueprint_version": "v1.2",
            "user_name": user_name,
        }
        identity.append({
            "id": _uid(),
            "timestamp": _ts(day, random.uniform(0, 10)),
            "event_json": json.dumps(event_doc),
            "event_kind": "alert" if risk >= 70 else "event",
            "event_dataset": dataset_map[id_type],
            "event_action": action_map[id_type],
            "user_name": user_name,
            "source_ip": src_ip,
            "community_id": _community_id(),
            "severity": risk,
            "alert_rule_id": None,
            "blueprint_version": "v1.2",
        })
    results["ndr-identity"] = len(identity)

    kinetic = []
    playbooks = ["KL-001", "KL-002", "KL-003", "KL-004", "KL-005", "KL-006"]
    for pb in playbooks:
        for j in range(2):
            day = random.uniform(0, 5)
            exec_id = _uid()
            exec_doc = {
                "playbook_id": pb,
                "execution_state": "COMPLETED",
                "tenant_id": tenant_id,
                "blueprint_version": "v1.2",
                "labels": {"noise_filtered_pct": 98}
            }
            kinetic.append({
                "id": _uid(),
                "timestamp": _ts(day, random.uniform(0, 8)),
                "execution_json": json.dumps(exec_doc),
                "execution_id": exec_id,
                "playbook_id": pb,
                "response_tier": "AUTOMATIC",
                "state": "COMPLETED",
                "host_ip": _rand_ip(),
                "alert_type": random.choice(["BRUTE_FORCE_SUCCESS", "C2_BEACON", "LATERAL_MOVE"]),
                "eng3_correlation_id": _corr_id(),
                "response_time_ms": random.randint(200, 2500),
                "sla_met": 1,
                "blueprint_version": "v1.2",
            })
    results["ndr-kinetic"] = len(kinetic)

    if dry_run:
        print(f"\n[seed_trial_data] DRY RUN — tenant_id={tenant_id}")
        for table, count in results.items():
            print(f"  {table}: {count} rows (not written)")
        return results

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for t in tickets:
        cursor.execute('''
            INSERT INTO "ndr-tickets" (id, timestamp, ticket_json, alert_type, eng3_correlation_id, severity, source_ip, status, ticket_source, tenant_id, blueprint_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (t["id"], t["timestamp"], t["ticket_json"], t["alert_type"], t["eng3_correlation_id"], t["severity"], t["source_ip"], t["status"], t["ticket_source"], t["tenant_id"], t["blueprint_version"]))

    for c in correlated:
        cursor.execute('''
            INSERT INTO "ndr-correlated" (id, timestamp, event_json, eng3_correlation_id, alert_type, severity, sigma_rule_id, source_ip, host_ip, iam_user, pre_commit_written, dispatched, dispatch_payload, blueprint_version, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (c["id"], c["timestamp"], c["event_json"], c["eng3_correlation_id"], c["alert_type"], c["severity"], c["sigma_rule_id"], c["source_ip"], c["host_ip"], c["iam_user"], c["pre_commit_written"], c["dispatched"], c["dispatch_payload"], c["blueprint_version"], c["tenant_id"]))

    for n in network:
        cursor.execute('''
            INSERT INTO "ndr-network" (id, timestamp, event_json, event_kind, event_dataset, source_ip, destination_ip, community_id, severity, blueprint_version, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (n["id"], n["timestamp"], n["event_json"], n["event_kind"], n["event_dataset"], n["source_ip"], n["destination_ip"], n["community_id"], n["severity"], n["blueprint_version"], n["tenant_id"]))

    for d in identity:
        cursor.execute('''
            INSERT INTO "ndr-identity" (id, timestamp, event_json, event_kind, event_dataset, event_action, user_name, source_ip, community_id, severity, alert_rule_id, blueprint_version, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (d["id"], d["timestamp"], d["event_json"], d["event_kind"], d["event_dataset"], d["event_action"], d["user_name"], d["source_ip"], d["community_id"], d["severity"], d["alert_rule_id"], d["blueprint_version"], d["tenant_id"]))

    for k in kinetic:
        cursor.execute('''
            INSERT INTO "ndr-kinetic" (id, timestamp, execution_json, execution_id, playbook_id, response_tier, state, host_ip, alert_type, eng3_correlation_id, response_time_ms, sla_met, blueprint_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (k["id"], k["timestamp"], k["execution_json"], k["execution_id"], k["playbook_id"], k["response_tier"], k["state"], k["host_ip"], k["alert_type"], k["eng3_correlation_id"], k["response_time_ms"], k["sla_met"], k["blueprint_version"]))

    conn.commit()
    conn.close()

    print(f"\n[seed_trial_data] Seed complete — tenant_id={tenant_id}")
    for table, count in results.items():
        print(f"  {table}: {count} rows inserted")
    print(f"  tenant_id confirmed: {tenant_id}")

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed trial data for NDR tenant")
    parser.add_argument("--tenant_id", required=True, help="Tenant ID to seed data for")
    parser.add_argument("--dry-run", action="store_true", help="Print counts without writing")
    args = parser.parse_args()
    seed(args.tenant_id, dry_run=args.dry_run)
