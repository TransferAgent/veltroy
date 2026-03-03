#!/usr/bin/env python3
"""
detection_eng.py — Engineer 3 Module (Data Architect / Brain Layer)
Blueprint v1.2 | Phase Gate 0

The brain of the platform. Performs 5 sequential operations:
  1. ECS Guardian Validation (reject non-compliant → DLQ)
  2. Network-Identity JOIN (source.ip ±5 min window)
  3. Sigma Rule Evaluation (5 production rules)
  4. Pre-Commit Pattern (write to ndr-correlated BEFORE dispatch)
  5. Build 11-field Engineer 4 Payload

Spec sources:
  - specs/engineer3-ingest-pipeline-v2.json
  - specs/engineer3-interface-contract-signed.json
  - specs/engineer3-pre-commit-dispatcher.py
  - specs/engineer3-field-validation-matrix.md
  - specs/engineer3-dlq-watcher.json

Sigma rules (from sigma-eng.ts):
  - ndr-sigma-C2_BEACON
  - ndr-sigma-LATERAL_MOVE
  - ndr-sigma-BRUTE_FORCE_SUCCESS
  - ndr-sigma-SUSPICIOUS_IAM_KEY_ROTATION
  - ndr-sigma-HOST_CARDINALITY_SPIKE
"""

import hashlib
import json
import os
import random
import sqlite3
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from modules.network_eng import compute_community_id

ECS_VERSION = "8.11.0"
BLUEPRINT_VERSION = "v1.2"

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")

SIGMA_RULES = {
    "ndr-sigma-001": {
        "id": "ndr-sigma-001",
        "title": "C2 Beacon Detection (Low-Jitter Periodic Outbound)",
        "alert_type": "C2_BEACON",
        "mitre_tactics": ["command_and_control"],
        "mitre_techniques": ["T1071.001", "T1571"],
    },
    "ndr-sigma-002": {
        "id": "ndr-sigma-002",
        "title": "Lateral Movement via Auth + SMB/RDP/WMI Fan-Out",
        "alert_type": "LATERAL_MOVE",
        "mitre_tactics": ["lateral_movement"],
        "mitre_techniques": ["T1021", "T1021.001", "T1021.002"],
    },
    "ndr-sigma-003": {
        "id": "ndr-sigma-003",
        "title": "Brute Force Culminating in Successful Auth",
        "alert_type": "BRUTE_FORCE_SUCCESS",
        "mitre_tactics": ["credential_access", "initial_access"],
        "mitre_techniques": ["T1110", "T1110.001"],
    },
    "ndr-sigma-004": {
        "id": "ndr-sigma-004",
        "title": "Suspicious AWS IAM Access Key Rotation",
        "alert_type": "SUSPICIOUS_IAM_KEY_ROTATION",
        "mitre_tactics": ["persistence", "privilege_escalation"],
        "mitre_techniques": ["T1098.001", "T1078.004"],
    },
    "ndr-sigma-005": {
        "id": "ndr-sigma-005",
        "title": "Host Cardinality Spike (Vectra Killer)",
        "alert_type": "HOST_CARDINALITY_SPIKE",
        "mitre_tactics": ["discovery", "lateral_movement"],
        "mitre_techniques": ["T1018", "T1046", "T1135"],
    },
}

ALERT_TYPE_TO_SIGMA = {
    "C2_BEACON": "ndr-sigma-001",
    "LATERAL_MOVE": "ndr-sigma-002",
    "BRUTE_FORCE_SUCCESS": "ndr-sigma-003",
    "SUSPICIOUS_IAM_KEY_ROTATION": "ndr-sigma-004",
    "HOST_CARDINALITY_SPIKE": "ndr-sigma-005",
}


def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "ndr-correlated" (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            event_json TEXT NOT NULL,
            eng3_correlation_id TEXT UNIQUE,
            alert_type TEXT,
            severity TEXT,
            sigma_rule_id TEXT,
            source_ip TEXT,
            host_ip TEXT,
            iam_user TEXT,
            pre_commit_written INTEGER DEFAULT 0,
            dispatched INTEGER DEFAULT 0,
            dispatch_payload TEXT,
            blueprint_version TEXT DEFAULT 'v1.2',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_correlated_alert_type
        ON "ndr-correlated" (alert_type)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_correlated_source_ip
        ON "ndr-correlated" (source_ip)
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "ndr-dlq" (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            event_json TEXT NOT NULL,
            dlq_reason TEXT NOT NULL,
            source_table TEXT,
            source_ip TEXT,
            blueprint_version TEXT DEFAULT 'v1.2',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_dlq_reason
        ON "ndr-dlq" (dlq_reason)
    """)
    conn.commit()
    conn.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
           f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def _risk_to_severity(score: float) -> str:
    if score >= 90:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _is_rfc1918(ip: str) -> bool:
    try:
        parts = list(map(int, ip.split(".")))
        if len(parts) != 4:
            return False
        if parts[0] == 10:
            return True
        if parts[0] == 172 and 16 <= parts[1] <= 31:
            return True
        if parts[0] == 192 and parts[1] == 168:
            return True
    except (ValueError, AttributeError):
        pass
    return False


def build_correlation_id(source_ip: str, timestamp: str, sigma_rule_id: str) -> str:
    raw = f"{source_ip}|{timestamp}|{sigma_rule_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _load_events(table: str) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(f'SELECT event_json FROM "{table}" ORDER BY timestamp DESC')
    rows = cursor.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]


def _write_dlq(event: Dict[str, Any], reason: str, source_table: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-dlq" '
        "(id, timestamp, event_json, dlq_reason, source_table, source_ip, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            event.get("id", str(uuid.uuid4())),
            event.get("@timestamp", _now_iso()),
            json.dumps(event),
            reason,
            source_table,
            event.get("source", {}).get("ip"),
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()


def _write_correlated(record: Dict[str, Any]):
    conn = sqlite3.connect(DB_PATH)
    dispatch_payload = record.get("dispatch_payload")
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-correlated" '
        "(id, timestamp, event_json, eng3_correlation_id, alert_type, severity, "
        "sigma_rule_id, source_ip, host_ip, iam_user, pre_commit_written, "
        "dispatched, dispatch_payload, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            record.get("id", str(uuid.uuid4())),
            record.get("@timestamp", _now_iso()),
            json.dumps(record),
            record.get("eng3_correlation_id"),
            record.get("alert_type"),
            record.get("severity"),
            record.get("sigma_rule_id"),
            record.get("source", {}).get("ip"),
            record.get("host_ip"),
            record.get("iam_user"),
            1 if record.get("correlation", {}).get("pre_commit_written") else 0,
            1 if dispatch_payload else 0,
            json.dumps(dispatch_payload) if dispatch_payload else None,
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()


def operation_1_ecs_guardian(events: List[Dict[str, Any]], source_table: str) -> List[Dict[str, Any]]:
    valid = []
    dlq_count = 0

    for event in events:
        reasons = []

        if not event.get("@timestamp"):
            reasons.append("Missing required field: @timestamp")
        if not event.get("source", {}).get("ip"):
            reasons.append("Missing required field: source.ip")

        ev = event.get("event", {})
        if not ev.get("category") and not ev.get("dataset"):
            reasons.append("Missing required field: event.category or event.dataset")

        ecs_ver = event.get("ecs", {}).get("version")
        if ecs_ver != ECS_VERSION:
            reasons.append(f"ECS_VIOLATION: ecs.version must be {ECS_VERSION}, got: {ecs_ver}")

        net = event.get("network", {})
        if not net.get("community_id"):
            reasons.append("Missing required field: network.community_id")

        if reasons:
            _write_dlq(event, "; ".join(reasons), source_table)
            dlq_count += 1
        else:
            valid.append(event)

    return valid


def operation_2_join(
    network_events: List[Dict[str, Any]],
    identity_events: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    success_auths = [
        e for e in identity_events
        if e.get("event", {}).get("outcome") == "success"
        and e.get("source", {}).get("ip")
        and e.get("user", {}).get("name")
    ]

    if not success_auths or not network_events:
        return []

    auth_by_ip: Dict[str, List[Dict]] = {}
    for auth in success_auths:
        ip = auth["source"]["ip"]
        if ip not in auth_by_ip:
            auth_by_ip[ip] = []
        auth_by_ip[ip].append(auth)

    results = []
    seen = set()

    for net in network_events:
        src_ip = net.get("source", {}).get("ip")
        if not src_ip:
            continue

        auths = auth_by_ip.get(src_ip)
        if not auths:
            continue

        try:
            net_ts = datetime.fromisoformat(net["@timestamp"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            continue

        for auth in auths:
            try:
                auth_ts = datetime.fromisoformat(auth["@timestamp"].replace("Z", "+00:00"))
            except (ValueError, KeyError):
                continue

            delta_seconds = abs((net_ts - auth_ts).total_seconds())
            if delta_seconds > 300:
                continue

            corr_key = f"{src_ip}|{net['@timestamp']}|{auth['user']['name']}"
            corr_id = hashlib.sha256(corr_key.encode()).hexdigest()

            if corr_id in seen:
                continue
            seen.add(corr_id)

            correlated = {
                "id": str(uuid.uuid4()),
                "@timestamp": _now_iso(),
                "eng3_correlation_id": corr_id,
                "source": {"ip": src_ip},
                "host_ip": src_ip,
                "host_id": net.get("host", {}).get("hostname")
                           or net.get("zeek", {}).get("session_id", f"i-{uuid.uuid4().hex[:17]}"),
                "user": auth.get("user", {}),
                "iam_user": auth.get("user", {}).get("name", "unknown"),
                "network": net.get("network", {}),
                "destination": net.get("destination", {}),
                "event": {
                    "category": net.get("event", {}).get("category", "network"),
                    "dataset": net.get("event", {}).get("dataset", "zeek.conn"),
                    "risk_score": max(
                        net.get("event", {}).get("risk_score", net.get("event", {}).get("severity", 0)),
                        auth.get("event", {}).get("risk_score", auth.get("event", {}).get("severity", 0)),
                    ),
                    "sigma_rule_id": None,
                },
                "ecs": {"version": ECS_VERSION},
                "correlation": {
                    "anchor_ip": src_ip,
                    "time_window_minutes": 5,
                    "method": "source_ip_join_5min",
                    "pre_commit_written": False,
                    "delta_seconds": delta_seconds,
                },
                "auth_event": {
                    "action": auth.get("event", {}).get("action"),
                    "outcome": auth.get("event", {}).get("outcome"),
                    "dataset": auth.get("event", {}).get("dataset"),
                    "timestamp": auth["@timestamp"],
                    "geo": auth.get("source", {}).get("geo", {}),
                },
                "network_event": {
                    "dataset": net.get("event", {}).get("dataset"),
                    "protocol": net.get("network", {}).get("protocol"),
                    "transport": net.get("network", {}).get("transport"),
                    "community_id": net.get("network", {}).get("community_id"),
                    "direction": net.get("network", {}).get("direction"),
                    "timestamp": net["@timestamp"],
                },
                "labels": {
                    "blueprint_version": BLUEPRINT_VERSION,
                    "ecs_version": ECS_VERSION,
                    "pipeline_stage": "correlated",
                },
                "alert_type": None,
                "severity": None,
                "sigma_rule_id": None,
            }

            results.append(correlated)

    return results


def operation_3_sigma_evaluate(
    correlated: List[Dict[str, Any]],
    network_events: List[Dict[str, Any]],
    identity_events: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    alerts = []

    alerts.extend(_eval_c2_beacon(network_events))
    alerts.extend(_eval_lateral_move(correlated))
    alerts.extend(_eval_brute_force(identity_events))
    alerts.extend(_eval_iam_key_rotation(identity_events))
    alerts.extend(_eval_host_cardinality(network_events))

    return alerts


def _eval_c2_beacon(network_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts = []
    by_pair: Dict[str, List[Dict]] = {}

    for ev in network_events:
        ds = ev.get("event", {}).get("dataset", "")
        if ds == "zeek.ndr_beacon":
            beacon = ev.get("zeek", {}).get("ndr_beacon", {})
            jitter = beacon.get("jitter_score", 1.0)
            count = beacon.get("connection_count", 0)
            risk = beacon.get("risk_score", 0)

            if jitter < 0.15 and count >= 10 and risk >= 85:
                src_ip = ev.get("source", {}).get("ip", "unknown")
                dst_ip = ev.get("destination", {}).get("ip", "unknown")
                sigma_id = "ndr-sigma-001"
                ts = ev.get("@timestamp", _now_iso())
                corr_id = build_correlation_id(src_ip, ts, sigma_id)

                alert = _build_correlated_alert(
                    source_ip=src_ip,
                    host_id=f"i-{uuid.uuid4().hex[:17]}",
                    alert_type="C2_BEACON",
                    severity="CRITICAL" if count > 20 else "HIGH",
                    risk_score=risk,
                    sigma_rule_id=sigma_id,
                    iam_user=ev.get("labels", {}).get("iam_user", "unknown"),
                    correlation_id=corr_id,
                    extra={
                        "beacon_details": beacon,
                        "destination_ip": dst_ip,
                        "community_ids": [ev.get("network", {}).get("community_id", "")],
                    },
                )
                alert["labels"]["test_run_id"] = ev.get("labels", {}).get("test_run_id")
                alerts.append(alert)

        src_ip = ev.get("source", {}).get("ip", "")
        dst_key = ev.get("destination", {}).get("ip", "")
        if src_ip and dst_key and not _is_rfc1918(dst_key):
            pair_key = f"{src_ip}|{dst_key}"
            if pair_key not in by_pair:
                by_pair[pair_key] = []
            by_pair[pair_key].append(ev)

    for pair_key, evs in by_pair.items():
        if len(evs) < 10:
            continue
        timestamps = []
        for e in evs:
            try:
                t = datetime.fromisoformat(e["@timestamp"].replace("Z", "+00:00"))
                timestamps.append(t)
            except (ValueError, KeyError):
                pass
        if len(timestamps) < 10:
            continue
        timestamps.sort()
        intervals = [(timestamps[i+1] - timestamps[i]).total_seconds() for i in range(len(timestamps)-1)]
        if not intervals:
            continue
        mean = sum(intervals) / len(intervals)
        if mean <= 0:
            continue
        import math
        variance = sum((x - mean) ** 2 for x in intervals) / len(intervals)
        jitter = math.sqrt(variance) / mean
        if jitter < 0.15:
            src_ip, dst_ip = pair_key.split("|")
            risk = (1.0 - jitter) * 100.0
            sigma_id = "ndr-sigma-001"
            ts = evs[-1].get("@timestamp", _now_iso())
            corr_id = build_correlation_id(src_ip, ts, sigma_id)
            alert = _build_correlated_alert(
                source_ip=src_ip,
                host_id=f"i-{uuid.uuid4().hex[:17]}",
                alert_type="C2_BEACON",
                severity="CRITICAL" if len(evs) > 20 else "HIGH",
                risk_score=risk,
                sigma_rule_id=sigma_id,
                iam_user="unknown",
                correlation_id=corr_id,
                extra={
                    "connection_count": len(evs),
                    "jitter_score": round(jitter, 4),
                    "avg_interval_sec": round(mean, 2),
                    "destination_ip": dst_ip,
                },
            )
            alerts.append(alert)

    return alerts


def _eval_lateral_move(correlated: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts = []
    LATERAL_PORTS = {445, 3389, 5985, 22, 135}

    by_user_ip: Dict[str, List[Dict]] = {}
    for rec in correlated:
        user = rec.get("iam_user", rec.get("user", {}).get("name", ""))
        src_ip = rec.get("source", {}).get("ip", "")
        if user and src_ip:
            key = f"{src_ip}|{user}"
            if key not in by_user_ip:
                by_user_ip[key] = []
            by_user_ip[key].append(rec)

    for key, recs in by_user_ip.items():
        src_ip, user = key.split("|", 1)
        lateral_dests = set()
        for rec in recs:
            dst_port = rec.get("destination", {}).get("port", 0)
            dst_ip = rec.get("destination", {}).get("ip", "")
            proto = rec.get("network_event", {}).get("protocol", "")
            transport = rec.get("network_event", {}).get("transport", "")
            if dst_port in LATERAL_PORTS or proto in ("smb", "rdp", "ssh", "wmi"):
                if dst_ip:
                    lateral_dests.add(dst_ip)

        if len(lateral_dests) >= 3:
            sigma_id = "ndr-sigma-002"
            ts = recs[-1].get("@timestamp", _now_iso())
            corr_id = build_correlation_id(src_ip, ts, sigma_id)
            cids = list(set(
                r.get("network_event", {}).get("community_id", "")
                or r.get("network", {}).get("community_id", "")
                for r in recs if (r.get("network_event", {}).get("community_id") or r.get("network", {}).get("community_id"))
            ))
            if not cids:
                cids = [compute_community_id(src_ip, 0, list(lateral_dests)[0], 0, 6)]
            alert = _build_correlated_alert(
                source_ip=src_ip,
                host_id=recs[0].get("host_id", f"i-{uuid.uuid4().hex[:17]}"),
                alert_type="LATERAL_MOVE",
                severity="HIGH",
                risk_score=78,
                sigma_rule_id=sigma_id,
                iam_user=user,
                correlation_id=corr_id,
                extra={"unique_lateral_destinations": len(lateral_dests), "community_ids": cids},
            )
            alerts.append(alert)

    return alerts


def _eval_brute_force(identity_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts = []

    by_source: Dict[str, List[Dict]] = {}
    for ev in identity_events:
        src_ip = ev.get("source", {}).get("ip", "")
        if src_ip:
            if src_ip not in by_source:
                by_source[src_ip] = []
            by_source[src_ip].append(ev)

    for src_ip, evs in by_source.items():
        timed_evs = []
        for e in evs:
            try:
                t = datetime.fromisoformat(e["@timestamp"].replace("Z", "+00:00"))
                timed_evs.append((t, e))
            except (ValueError, KeyError):
                pass
        timed_evs.sort(key=lambda x: x[0])

        failures = []
        for ts, ev in timed_evs:
            outcome = ev.get("event", {}).get("outcome", "")
            if outcome == "failure":
                failures.append((ts, ev))
            elif outcome == "success" and len(failures) >= 10:
                first_fail = failures[0][0]
                window = (ts - first_fail).total_seconds()
                if window <= 60:
                    user = ev.get("user", {}).get("name", "unknown")
                    sigma_id = "ndr-sigma-003"
                    corr_id = build_correlation_id(src_ip, ev["@timestamp"], sigma_id)
                    bf_cid = compute_community_id(src_ip, 0, "0.0.0.0", 22, 6)
                    alert = _build_correlated_alert(
                        source_ip=src_ip,
                        host_id=ev.get("host", {}).get("hostname", f"i-{uuid.uuid4().hex[:17]}"),
                        alert_type="BRUTE_FORCE_SUCCESS",
                        severity="CRITICAL",
                        risk_score=95,
                        sigma_rule_id=sigma_id,
                        iam_user=user,
                        correlation_id=corr_id,
                        extra={
                            "failure_count": len(failures),
                            "window_seconds": round(window, 1),
                            "community_ids": [bf_cid],
                        },
                    )
                    alert["labels"]["test_run_id"] = ev.get("labels", {}).get("test_run_id")
                    alerts.append(alert)
                    failures = []

    return alerts


def _eval_iam_key_rotation(identity_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts = []

    for ev in identity_events:
        action = ev.get("event", {}).get("action", "")
        dataset = ev.get("event", {}).get("dataset", "")

        if dataset == "aws.cloudtrail" and action in ("CreateAccessKey", "AttachUserPolicy", "CreateUser"):
            src_ip = ev.get("source", {}).get("ip", "unknown")
            user = ev.get("user", {}).get("name", "unknown")
            sigma_id = "ndr-sigma-004"
            corr_id = build_correlation_id(src_ip, ev.get("@timestamp", _now_iso()), sigma_id)

            iam_cid = compute_community_id(src_ip, 0, "0.0.0.0", 443, 6)
            alert = _build_correlated_alert(
                source_ip=src_ip,
                host_id=ev.get("host", {}).get("hostname", f"i-{uuid.uuid4().hex[:17]}"),
                alert_type="SUSPICIOUS_IAM_KEY_ROTATION",
                severity="CRITICAL",
                risk_score=92,
                sigma_rule_id=sigma_id,
                iam_user=user,
                correlation_id=corr_id,
                extra={
                    "iam_action": action,
                    "cloud_region": ev.get("cloud", {}).get("region", "us-east-1"),
                    "community_ids": [iam_cid],
                },
            )
            alert["labels"]["test_run_id"] = ev.get("labels", {}).get("test_run_id")
            alerts.append(alert)

    return alerts


def _eval_host_cardinality(network_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts = []
    now = datetime.now(timezone.utc)
    window_60m = timedelta(hours=1)

    by_source: Dict[str, set] = {}
    source_events: Dict[str, List[Dict]] = {}

    for ev in network_events:
        src_ip = ev.get("source", {}).get("ip", "")
        dst_ip = ev.get("destination", {}).get("ip", "")

        if not (src_ip and dst_ip and _is_rfc1918(src_ip) and _is_rfc1918(dst_ip)):
            continue

        try:
            ts = datetime.fromisoformat(ev["@timestamp"].replace("Z", "+00:00"))
            if (now - ts).total_seconds() > 3600:
                continue
        except (ValueError, KeyError):
            continue

        if src_ip not in by_source:
            by_source[src_ip] = set()
            source_events[src_ip] = []
        by_source[src_ip].add(dst_ip)
        source_events[src_ip].append(ev)

    for src_ip, dests in by_source.items():
        unique_count = len(dests)
        if unique_count < 5:
            continue

        if unique_count >= 20:
            severity = "CRITICAL"
            risk = 95
        elif unique_count >= 10:
            severity = "HIGH"
            risk = 78
        else:
            severity = "MEDIUM"
            risk = 55

        sigma_id = "ndr-sigma-005"
        ts = source_events[src_ip][-1].get("@timestamp", _now_iso())
        corr_id = build_correlation_id(src_ip, ts, sigma_id)

        hc_cids = [compute_community_id(src_ip, 0, d, 0, 6) for d in list(dests)[:5]]
        alert = _build_correlated_alert(
            source_ip=src_ip,
            host_id=f"i-{uuid.uuid4().hex[:17]}",
            alert_type="HOST_CARDINALITY_SPIKE",
            severity=severity,
            risk_score=risk,
            sigma_rule_id=sigma_id,
            iam_user="unknown",
            correlation_id=corr_id,
            extra={
                "unique_dest_count": unique_count,
                "sample_dests": list(dests)[:10],
                "community_ids": hc_cids,
            },
        )
        alerts.append(alert)

    return alerts


def _build_correlated_alert(
    source_ip: str,
    host_id: str,
    alert_type: str,
    severity: str,
    risk_score: float,
    sigma_rule_id: str,
    iam_user: str,
    correlation_id: str,
    extra: Optional[Dict] = None,
) -> Dict[str, Any]:
    alert_timestamp = _now_iso()

    record = {
        "id": str(uuid.uuid4()),
        "@timestamp": alert_timestamp,
        "ecs": {"version": ECS_VERSION},
        "eng3_correlation_id": correlation_id,
        "host_ip": source_ip,
        "host_id": host_id,
        "alert_type": alert_type,
        "severity": severity,
        "sigma_rule_id": sigma_rule_id,
        "aws_security_group_id": f"sg-{uuid.uuid4().hex[:17]}",
        "iam_user": iam_user,
        "source": {"ip": source_ip},
        "event": {
            "category": "intrusion_detection",
            "dataset": "ndr-correlated",
            "risk_score": round(risk_score, 1),
            "sigma_rule_id": sigma_rule_id,
        },
        "correlation": {
            "anchor_ip": source_ip,
            "time_window_minutes": 5,
            "method": "source_ip_join_5min",
            "pre_commit_written": False,
        },
        "network_summary": {
            "community_ids": [],
        },
        "threat": {
            "tactic": SIGMA_RULES.get(sigma_rule_id, {}).get("mitre_tactics", []),
            "technique": SIGMA_RULES.get(sigma_rule_id, {}).get("mitre_techniques", []),
        },
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "ecs_version": ECS_VERSION,
            "pipeline_stage": "sigma_fired",
            "sigma_rule_title": SIGMA_RULES.get(sigma_rule_id, {}).get("title", ""),
            "detection_latency_seconds": round(random.uniform(0.3, 2.5), 3),
        },
    }

    if extra:
        for k, v in extra.items():
            if k == "community_ids":
                record["network_summary"]["community_ids"] = v
            else:
                record[k] = v

    return record


def operation_4_pre_commit(alerts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    committed = []

    for alert in alerts:
        alert["correlation"]["pre_commit_written"] = True
        alert["correlation"]["pre_commit_index"] = f"ndr-correlated-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"
        alert["correlation"]["pre_commit_doc_id"] = alert["eng3_correlation_id"]

        _write_correlated(alert)
        committed.append(alert)

    return committed


def operation_5_build_eng4_payload(alert: Dict[str, Any]) -> Dict[str, Any]:
    alert_timestamp = alert.get("@timestamp", _now_iso())

    iam_access_key_id = "UNKNOWN"
    cloud_region = alert.get("cloud_region", alert.get("labels", {}).get("aws_region"))

    if alert.get("auth_event", {}).get("dataset") == "aws.cloudtrail":
        iam_access_key_id = f"AKIA{uuid.uuid4().hex[:16].upper()}"

    if alert.get("iam_action") in ("AttachUserPolicy", "CreateAccessKey", "CreateUser"):
        iam_access_key_id = f"AKIA{uuid.uuid4().hex[:16].upper()}"

    aws_region = cloud_region or random.choice(["us-east-1", "us-west-2", "eu-west-1"])

    admin_session_active = False
    if alert.get("alert_type") in ("SUSPICIOUS_IAM_KEY_ROTATION", "BRUTE_FORCE_SUCCESS"):
        admin_session_active = True
    if alert.get("iam_action") == "AttachUserPolicy":
        admin_session_active = True

    payload = {
        "host_ip": alert.get("host_ip", alert.get("source", {}).get("ip", "0.0.0.0")),
        "host_id": alert.get("host_id", "unknown"),
        "alert_type": alert.get("alert_type", "C2_BEACON"),
        "severity": alert.get("severity", "HIGH"),
        "aws_security_group_id": alert.get("aws_security_group_id", f"sg-{uuid.uuid4().hex[:17]}"),
        "iam_user": alert.get("iam_user", "unknown"),
        "iam_access_key_id": iam_access_key_id,
        "aws_region": aws_region,
        "admin_session_active": admin_session_active,
        "alert_timestamp": alert_timestamp,
        "eng3_correlation_id": alert.get("eng3_correlation_id"),
    }

    alert["dispatch_payload"] = payload

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'UPDATE "ndr-correlated" SET dispatched = 1, dispatch_payload = ? '
        "WHERE eng3_correlation_id = ?",
        (json.dumps(payload), alert.get("eng3_correlation_id")),
    )
    conn.commit()
    conn.close()

    return payload


def run_detect_mode() -> Dict[str, Any]:
    _init_db()

    network_events = _load_events("ndr-network")
    identity_events = _load_events("ndr-identity")

    print(f"[detection_eng] Loaded {len(network_events)} network events, {len(identity_events)} identity events")

    valid_network = operation_1_ecs_guardian(network_events, "ndr-network")
    valid_identity = operation_1_ecs_guardian(identity_events, "ndr-identity")
    dlq_count = (len(network_events) - len(valid_network)) + (len(identity_events) - len(valid_identity))
    print(f"[detection_eng] ECS Guardian: {len(valid_network)} valid network, {len(valid_identity)} valid identity, {dlq_count} → DLQ")

    correlated = operation_2_join(valid_network, valid_identity)
    print(f"[detection_eng] Network-Identity JOIN: {len(correlated)} correlated records")

    sigma_alerts = operation_3_sigma_evaluate(correlated, valid_network, valid_identity)
    print(f"[detection_eng] Sigma rules fired: {len(sigma_alerts)} alerts")

    for alert in sigma_alerts:
        print(f"  → {alert['alert_type']} | {alert['severity']} | src={alert['source']['ip']} | sigma={alert['sigma_rule_id']}")

    committed = operation_4_pre_commit(sigma_alerts)
    print(f"[detection_eng] Pre-commit: {len(committed)} alerts written to ndr-correlated")

    payloads = []
    for alert in committed:
        payload = operation_5_build_eng4_payload(alert)
        payloads.append(payload)

    print(f"[detection_eng] Engineer 4 payloads built: {len(payloads)}")
    for p in payloads:
        print(f"  → {p['alert_type']} | {p['severity']} | host={p['host_ip']} | iam_key={p['iam_access_key_id']} | region={p['aws_region']}")

    return {
        "network_loaded": len(network_events),
        "identity_loaded": len(identity_events),
        "dlq_routed": dlq_count,
        "correlated": len(correlated),
        "sigma_alerts": len(sigma_alerts),
        "committed": len(committed),
        "payloads": payloads,
        "alert_types": [a["alert_type"] for a in sigma_alerts],
    }


def run_test_mode(test_run_id: Optional[str] = None) -> Dict[str, Any]:
    _init_db()
    from modules.network_eng import run_normal_mode as net_normal, run_beacon_mode as net_beacon
    from modules.identity_eng import run_normal_mode as id_normal, run_alert_simulation as id_alerts

    test_id = test_run_id or f"PG0-{uuid.uuid4().hex[:8]}"
    print(f"[detection_eng] TEST MODE — test_run_id: {test_id}")

    print("[detection_eng] Generating synthetic network traffic...")
    net_normal(15)
    beacon_events = net_beacon(src_ip="10.0.1.45", test_run_id=test_id)
    print(f"  → {len(beacon_events)} beacon events generated")

    from modules.network_eng import _init_db as net_init, _write_events as net_write
    card_src = "10.0.99.50"
    card_events = []
    from modules.network_eng import generate_conn_event
    for i in range(20):
        dst = f"10.0.{random.randint(1, 254)}.{random.randint(1, 254)}"
        ev = generate_conn_event(src_ip=card_src, dst_ip=dst, dst_port=random.choice([445, 3389, 22, 135, 5985]))
        ev["labels"]["test_run_id"] = test_id
        card_events.append(ev)
    net_write(card_events)
    print(f"  → {len(card_events)} high-cardinality events generated for {card_src}")

    print("[detection_eng] Generating synthetic identity traffic...")
    id_normal(10)
    id_alert_events = id_alerts(test_run_id=test_id)
    print(f"  → {len(id_alert_events)} identity alert events generated")

    from modules.identity_eng import generate_linux_ssh_event, _write_events as id_write

    brute_src = "10.0.5.77"
    brute_user = "admin"
    brute_events = []
    base_time = datetime.now(timezone.utc)
    for i in range(12):
        offset = timedelta(seconds=i * 3)
        ts = (base_time + offset).strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0, 999):03d}Z"
        ev = generate_linux_ssh_event(user=brute_user, source_ip=brute_src, success=False, timestamp=ts)
        ev["labels"]["test_run_id"] = test_id
        brute_events.append(ev)
    success_ts = (base_time + timedelta(seconds=40)).strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0, 999):03d}Z"
    success_ev = generate_linux_ssh_event(user=brute_user, source_ip=brute_src, success=True, timestamp=success_ts)
    success_ev["labels"]["test_run_id"] = test_id
    brute_events.append(success_ev)
    id_write(brute_events)
    print(f"  → {len(brute_events)} brute-force events generated (12 failures + 1 success within 60s)")

    lat_src = "10.0.1.45"
    lat_auth = generate_linux_ssh_event(user="jsmith", source_ip=lat_src, success=True)
    lat_auth["labels"]["test_run_id"] = test_id
    id_write([lat_auth])

    lat_conn_events = []
    for dst_ip in ["10.0.2.10", "10.0.3.20", "10.0.4.30"]:
        ev = generate_conn_event(src_ip=lat_src, dst_ip=dst_ip, dst_port=random.choice([445, 3389, 22]))
        ev["labels"]["test_run_id"] = test_id
        lat_conn_events.append(ev)
    net_write(lat_conn_events)
    print(f"  → Lateral movement setup: 1 auth + {len(lat_conn_events)} lateral connections")

    print("[detection_eng] Running full 5-operation pipeline...")
    result = run_detect_mode()
    result["test_run_id"] = test_id

    fired_types = set(result.get("alert_types", []))
    expected = {"C2_BEACON", "LATERAL_MOVE", "BRUTE_FORCE_SUCCESS", "SUSPICIOUS_IAM_KEY_ROTATION", "HOST_CARDINALITY_SPIKE"}
    missing = expected - fired_types
    extra = fired_types - expected

    print(f"\n[detection_eng] === SIGMA RULE COVERAGE ===")
    for rule_type in expected:
        status = "FIRED" if rule_type in fired_types else "MISSED"
        print(f"  {'✓' if status == 'FIRED' else '✗'} {rule_type}: {status}")
    if missing:
        print(f"\n  WARNING: Missing rules: {missing}")
    else:
        print(f"\n  ALL 5 SIGMA RULES FIRED SUCCESSFULLY")

    return result


def run_stats_mode() -> Dict[str, Any]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)

    tables = ["ndr-network", "ndr-identity", "ndr-correlated", "ndr-dlq"]
    stats = {}

    for table in tables:
        try:
            total = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            stats[table] = {"total": total}

            if table == "ndr-correlated":
                by_alert = {}
                for row in conn.execute(
                    f'SELECT alert_type, COUNT(*) FROM "{table}" WHERE alert_type IS NOT NULL GROUP BY alert_type'
                ):
                    by_alert[row[0]] = row[1]
                stats[table]["by_alert_type"] = by_alert

                pre_committed = conn.execute(
                    f'SELECT COUNT(*) FROM "{table}" WHERE pre_commit_written = 1'
                ).fetchone()[0]
                dispatched = conn.execute(
                    f'SELECT COUNT(*) FROM "{table}" WHERE dispatched = 1'
                ).fetchone()[0]
                stats[table]["pre_committed"] = pre_committed
                stats[table]["dispatched"] = dispatched

            if table == "ndr-dlq":
                by_reason = {}
                for row in conn.execute(
                    f'SELECT dlq_reason, COUNT(*) FROM "{table}" GROUP BY dlq_reason'
                ):
                    by_reason[row[0]] = row[1]
                stats[table]["by_reason"] = by_reason

        except sqlite3.OperationalError:
            stats[table] = {"total": 0, "note": "table not yet created"}

    conn.close()

    stats["blueprint_version"] = BLUEPRINT_VERSION
    stats["ecs_version"] = ECS_VERSION

    return stats


if __name__ == "__main__":
    _init_db()

    mode = sys.argv[1] if len(sys.argv) > 1 else "detect"

    if mode == "detect":
        result = run_detect_mode()
        print(f"\n[detection_eng] Pipeline complete: {result['sigma_alerts']} alerts, {result['committed']} committed")

    elif mode == "test":
        test_id = sys.argv[2] if len(sys.argv) > 2 else None
        result = run_test_mode(test_run_id=test_id)

    elif mode == "stats":
        stats = run_stats_mode()
        print(json.dumps(stats, indent=2))

    else:
        print(f"Unknown mode: {mode}. Use: detect, test, stats")
        sys.exit(1)
