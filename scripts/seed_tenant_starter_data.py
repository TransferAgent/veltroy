#!/usr/bin/env python3
"""
Seed starter data for a new tenant so their "My House" is not empty.
Inserts: 3 network events, 3 identity logs, 2 correlated threats, 2 tickets.
All rows stamped with the given tenant_id.

Usage:
  python3 scripts/seed_tenant_starter_data.py --tenant_id="acme-abc123"
  python3 scripts/seed_tenant_starter_data.py --tenant_id="acme-abc123" --dry-run
"""

import argparse
import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ndr.db")


def ts(offset_minutes=0):
    return (datetime.utcnow() - timedelta(minutes=offset_minutes)).isoformat() + "Z"


def uid():
    return str(uuid.uuid4())


def build_network_events(tenant_id):
    return [
        {
            "id": uid(),
            "timestamp": ts(5),
            "event_json": json.dumps({
                "event": {"kind": "event", "dataset": "zeek.conn", "category": ["network"]},
                "source": {"ip": "10.0.1.15", "port": 49821},
                "destination": {"ip": "192.168.1.1", "port": 443},
                "network": {"transport": "tcp", "community_id": "1:abc123"},
                "ndr": {"tenant_id": tenant_id, "blueprint_version": "v1.2"},
            }),
            "event_kind": "event",
            "event_dataset": "zeek.conn",
            "source_ip": "10.0.1.15",
            "destination_ip": "192.168.1.1",
            "community_id": "1:abc123",
            "severity": 2,
            "blueprint_version": "v1.2",
            "created_at": ts(5),
            "tenant_id": tenant_id,
        },
        {
            "id": uid(),
            "timestamp": ts(3),
            "event_json": json.dumps({
                "event": {"kind": "event", "dataset": "zeek.dns", "category": ["network"]},
                "source": {"ip": "10.0.1.22", "port": 55012},
                "destination": {"ip": "8.8.8.8", "port": 53},
                "dns": {"question": {"name": "api.internal.local"}},
                "ndr": {"tenant_id": tenant_id, "blueprint_version": "v1.2"},
            }),
            "event_kind": "event",
            "event_dataset": "zeek.dns",
            "source_ip": "10.0.1.22",
            "destination_ip": "8.8.8.8",
            "community_id": "1:dns456",
            "severity": 1,
            "blueprint_version": "v1.2",
            "created_at": ts(3),
            "tenant_id": tenant_id,
        },
        {
            "id": uid(),
            "timestamp": ts(1),
            "event_json": json.dumps({
                "event": {"kind": "alert", "dataset": "zeek.notice", "category": ["intrusion_detection"]},
                "source": {"ip": "10.0.1.50", "port": 8080},
                "destination": {"ip": "203.0.113.45", "port": 4444},
                "network": {"transport": "tcp"},
                "ndr": {"tenant_id": tenant_id, "blueprint_version": "v1.2"},
            }),
            "event_kind": "alert",
            "event_dataset": "zeek.notice",
            "source_ip": "10.0.1.50",
            "destination_ip": "203.0.113.45",
            "community_id": "1:alert789",
            "severity": 4,
            "blueprint_version": "v1.2",
            "created_at": ts(1),
            "tenant_id": tenant_id,
        },
    ]


def build_identity_events(tenant_id):
    return [
        {
            "id": uid(),
            "timestamp": ts(4),
            "event_json": json.dumps({
                "event": {"kind": "event", "dataset": "auth.login", "category": ["authentication"]},
                "user": {"name": "jsmith"},
                "source": {"ip": "10.0.1.15"},
                "event.outcome": "success",
                "ndr": {"tenant_id": tenant_id},
            }),
            "event_kind": "event",
            "event_dataset": "auth.login",
            "event_action": "login_success",
            "user_name": "jsmith",
            "source_ip": "10.0.1.15",
            "severity": 0,
            "blueprint_version": "v1.2",
            "created_at": ts(4),
            "tenant_id": tenant_id,
        },
        {
            "id": uid(),
            "timestamp": ts(2),
            "event_json": json.dumps({
                "event": {"kind": "event", "dataset": "auth.login", "category": ["authentication"]},
                "user": {"name": "admin"},
                "source": {"ip": "10.0.1.99"},
                "event.outcome": "failure",
                "ndr": {"tenant_id": tenant_id},
            }),
            "event_kind": "event",
            "event_dataset": "auth.login",
            "event_action": "login_failure",
            "user_name": "admin",
            "source_ip": "10.0.1.99",
            "severity": 3,
            "blueprint_version": "v1.2",
            "created_at": ts(2),
            "tenant_id": tenant_id,
        },
        {
            "id": uid(),
            "timestamp": ts(0),
            "event_json": json.dumps({
                "event": {"kind": "event", "dataset": "auth.privilege", "category": ["iam"]},
                "user": {"name": "svc-deploy"},
                "source": {"ip": "10.0.1.5"},
                "event.outcome": "success",
                "ndr": {"tenant_id": tenant_id},
            }),
            "event_kind": "event",
            "event_dataset": "auth.privilege",
            "event_action": "privilege_escalation",
            "user_name": "svc-deploy",
            "source_ip": "10.0.1.5",
            "severity": 2,
            "blueprint_version": "v1.2",
            "created_at": ts(0),
            "tenant_id": tenant_id,
        },
    ]


def build_correlated(tenant_id):
    return [
        {
            "id": uid(),
            "timestamp": ts(2),
            "event_json": json.dumps({
                "alert": {"type": "brute_force_attempt", "severity": "high"},
                "source": {"ip": "10.0.1.99"},
                "user": {"name": "admin"},
                "sigma": {"rule_id": "SR-001"},
                "ndr": {"tenant_id": tenant_id},
            }),
            "eng3_correlation_id": uid(),
            "alert_type": "brute_force_attempt",
            "severity": "high",
            "sigma_rule_id": "SR-001",
            "source_ip": "10.0.1.99",
            "host_ip": "10.0.1.1",
            "iam_user": "admin",
            "pre_commit_written": 1,
            "dispatched": 0,
            "dispatch_payload": None,
            "tenant_id": tenant_id,
        },
        {
            "id": uid(),
            "timestamp": ts(1),
            "event_json": json.dumps({
                "alert": {"type": "c2_beacon_detected", "severity": "critical"},
                "source": {"ip": "10.0.1.50"},
                "destination": {"ip": "203.0.113.45"},
                "sigma": {"rule_id": "SR-003"},
                "ndr": {"tenant_id": tenant_id},
            }),
            "eng3_correlation_id": uid(),
            "alert_type": "c2_beacon_detected",
            "severity": "critical",
            "sigma_rule_id": "SR-003",
            "source_ip": "10.0.1.50",
            "host_ip": "10.0.1.50",
            "iam_user": None,
            "pre_commit_written": 1,
            "dispatched": 1,
            "dispatch_payload": json.dumps({"action": "isolate_host", "target": "10.0.1.50"}),
            "tenant_id": tenant_id,
        },
    ]


def seed(tenant_id, db_path=DB_PATH, dry_run=False):
    network = build_network_events(tenant_id)
    identity = build_identity_events(tenant_id)
    correlated = build_correlated(tenant_id)

    if dry_run:
        print(f"[seed_tenant_starter] DRY RUN for tenant '{tenant_id}':")
        print(f"  Network events: {len(network)}")
        print(f"  Identity logs:  {len(identity)}")
        print(f"  Correlations:   {len(correlated)}")
        print(f"  Total rows:     {len(network) + len(identity) + len(correlated)}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for evt in network:
        cursor.execute('''
            INSERT OR IGNORE INTO "ndr-network"
            (id, timestamp, event_json, event_kind, event_dataset, source_ip, destination_ip,
             community_id, severity, blueprint_version, created_at, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (evt["id"], evt["timestamp"], evt["event_json"], evt["event_kind"],
              evt["event_dataset"], evt["source_ip"], evt["destination_ip"],
              evt["community_id"], evt["severity"], evt["blueprint_version"],
              evt["created_at"], evt["tenant_id"]))

    for evt in identity:
        cursor.execute('''
            INSERT OR IGNORE INTO "ndr-identity"
            (id, timestamp, event_json, event_kind, event_dataset, event_action, user_name, source_ip,
             severity, blueprint_version, created_at, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (evt["id"], evt["timestamp"], evt["event_json"], evt["event_kind"],
              evt["event_dataset"], evt["event_action"], evt["user_name"], evt["source_ip"],
              evt["severity"], evt["blueprint_version"], evt["created_at"], evt["tenant_id"]))

    for evt in correlated:
        cursor.execute('''
            INSERT OR IGNORE INTO "ndr-correlated"
            (id, timestamp, event_json, eng3_correlation_id, alert_type, severity,
             sigma_rule_id, source_ip, host_ip, iam_user, pre_commit_written,
             dispatched, dispatch_payload, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (evt["id"], evt["timestamp"], evt["event_json"], evt["eng3_correlation_id"],
              evt["alert_type"], evt["severity"], evt["sigma_rule_id"], evt["source_ip"],
              evt["host_ip"], evt["iam_user"], evt["pre_commit_written"],
              evt["dispatched"], evt["dispatch_payload"], evt["tenant_id"]))

    conn.commit()
    conn.close()
    print(f"[seed_tenant_starter] Seeded {len(network) + len(identity) + len(correlated)} rows for tenant '{tenant_id}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed starter data for a new tenant")
    parser.add_argument("--tenant_id", required=True, help="Tenant ID to seed data for")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be inserted without writing")
    args = parser.parse_args()
    seed(args.tenant_id, dry_run=args.dry_run)
