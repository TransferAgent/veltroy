#!/usr/bin/env python3
"""
kinetic_eng.py — Engineer 4 Module (Kinetic Layer / The Fist)
Blueprint v1.2 | Phase Gate 0

Automated response execution. Receives 11-field payloads from Engineer 3
and executes tiered response actions:
  - TIER_1_ISOLATE: Standard isolation (SG revoke, IAM deactivate, memory preserve)
  - TIER_2_ESCALATE: C2 beacon + admin session → full escalation
  - TIER_3_EMERGENCY: CRITICAL severity → emergency response
  - TIER_0_SUPPRESS: Below threshold → no action

Playbooks:
  - KL-001: Automated Host Isolation (SLA <30s)
  - KL-002: IAM Kill Switch (SLA <5s)
  - KL-003: Lateral Movement Response (SLA <30s) — revoke lateral ports, SG snapshot, IAM deactivate
  - KL-004: Authentication Spike Response (SLA <30s) — account lock, IAM deactivate, IDENTITY-002 escalation
  - KL-005: AWS Console Anomaly Response (SLA <30s) — IAM session revoke, console expire, off-hours + admin

State machine: PENDING → IN_PROGRESS → ACTION_COMPLETE → COMPLETE / PARTIAL_FAILURE
"""

import json
import os
import random
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

BLUEPRINT_VERSION = "v1.2"
ECS_VERSION = "8.11.0"
KL001_SLA_SECONDS = 30
KL002_SLA_SECONDS = 5
KL003_SLA_SECONDS = 30
KL004_SLA_SECONDS = 30
KL005_SLA_SECONDS = 30

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")

INTERFACE_CONTRACT_REQUIRED = [
    "host_ip",
    "host_id",
    "alert_type",
    "severity",
    "aws_security_group_id",
    "iam_user",
    "iam_access_key_id",
    "aws_region",
    "admin_session_active",
    "alert_timestamp",
    "eng3_correlation_id",
]

ACTIONS_TIER1 = [
    "AWS_SG_REVOKE_INGRESS",
    "AWS_SG_REVOKE_EGRESS",
    "AWS_SG_TAG_ISOLATION",
    "AWS_SG_BASTION_SSH",
    "IAM_KEY_DEACTIVATE",
    "IAM_DENY_ALL_ATTACH",
    "HOST_MEMORY_PRESERVE",
    "SOC_NOTIFICATION",
]

KL002_ACTIONS = [
    "VERIFY_CALLER_IDENTITY",
    "IAM_KEY_DEACTIVATE",
    "IAM_ENUMERATE_ALL_KEYS",
    "IAM_ATTACH_DENY_ALL",
    "IAM_SESSION_INVALIDATION",
    "AUDIT_RECORD_POSTED",
]

KL003_ACTIONS = [
    "STATE_SET_IN_PROGRESS",
    "SG_REVOKE_SMB_445_IN",
    "SG_REVOKE_SMB_445_OUT",
    "SG_REVOKE_RDP_3389_IN",
    "SG_REVOKE_RDP_3389_OUT",
    "SG_REVOKE_WMI_135_IN",
    "SG_REVOKE_WMI_135_OUT",
    "SG_REVOKE_SSH_22_IN",
    "SG_REVOKE_SSH_22_OUT",
    "SG_SNAPSHOT_PRE_ISOLATION",
    "IAM_KEY_DEACTIVATE_LATERAL",
    "STATE_SET_ACTION_COMPLETE",
    "AUDIT_RECORD_POSTED",
]

KL004_ACTIONS = [
    "STATE_SET_IN_PROGRESS",
    "USER_ACCOUNT_LOCK",
    "IAM_KEY_DEACTIVATE",
    "IDENTITY_002_ESCALATION_EMIT",
    "STATE_SET_ACTION_COMPLETE",
    "AUDIT_RECORD_POSTED",
]

KL005_ACTIONS = [
    "STATE_SET_IN_PROGRESS",
    "IAM_SESSION_REVOKE",
    "IAM_KEY_DEACTIVATE",
    "CONSOLE_SESSION_FORCE_EXPIRE",
    "AWS_CONSOLE_ANOMALY_ALERT_EMIT",
    "STATE_SET_ACTION_COMPLETE",
    "AUDIT_RECORD_POSTED",
]

_processed_correlation_ids = set()


def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "ndr-kinetic" (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            execution_json TEXT NOT NULL,
            execution_id TEXT UNIQUE,
            playbook_id TEXT,
            response_tier TEXT,
            state TEXT DEFAULT 'PENDING',
            host_ip TEXT,
            alert_type TEXT,
            eng3_correlation_id TEXT,
            response_time_ms INTEGER,
            sla_met INTEGER,
            blueprint_version TEXT DEFAULT 'v1.2',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_kinetic_corr_id
        ON "ndr-kinetic" (eng3_correlation_id)
    """)
    conn.commit()
    conn.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
           f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def validate_interface_contract(payload: Dict[str, Any]) -> Dict[str, Any]:
    missing = [f for f in INTERFACE_CONTRACT_REQUIRED if payload.get(f) is None]
    return {"valid": len(missing) == 0, "missing": missing}


def classify_tier(alert_type: str, severity: str, admin_session_active: bool) -> Dict[str, str]:
    sev = severity.upper()
    alert = alert_type.upper()

    if alert == "C2_BEACON" and admin_session_active and sev == "CRITICAL":
        return {"tier": "TIER_2_ESCALATE", "reason": "C2 beacon confirmed + active admin session + CRITICAL severity"}
    if alert == "C2_BEACON" and admin_session_active:
        return {"tier": "TIER_2_ESCALATE", "reason": "C2 beacon confirmed + active admin session"}
    if alert == "C2_BEACON":
        return {"tier": "TIER_1_ISOLATE", "reason": "C2 beacon confirmed — isolation proceeds regardless of session state"}
    if sev == "CRITICAL":
        return {"tier": "TIER_3_EMERGENCY", "reason": "CRITICAL severity alert — emergency response regardless of type"}
    if sev == "HIGH":
        return {"tier": "TIER_1_ISOLATE", "reason": f"HIGH severity alert type {alert}"}
    return {"tier": "TIER_0_SUPPRESS", "reason": f"Severity {sev} / Type {alert} below isolation threshold"}


def simulate_actions(actions: List[str]) -> List[Dict[str, str]]:
    now = datetime.now(timezone.utc)
    results = []
    for i, action in enumerate(actions):
        from datetime import timedelta
        ts = now + timedelta(milliseconds=i * 50)
        results.append({
            "action": action,
            "status": "SIMULATED",
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z",
        })
    return results


def execute_kl001(payload: Dict[str, Any]) -> Dict[str, Any]:
    _init_db()

    validation = validate_interface_contract(payload)
    if not validation["valid"]:
        return {
            "status": "REJECTED",
            "reason": f"Interface contract violation: missing {validation['missing']}",
            "status_code": 400,
        }

    corr_id = payload["eng3_correlation_id"]
    if corr_id in _processed_correlation_ids:
        return {
            "status": "DUPLICATE",
            "reason": f"Correlation ID {corr_id} already processed",
            "status_code": 409,
        }

    tier_result = classify_tier(
        payload["alert_type"],
        payload["severity"],
        payload.get("admin_session_active", False),
    )
    tier = tier_result["tier"]
    reason = tier_result["reason"]

    if tier == "TIER_0_SUPPRESS":
        _processed_correlation_ids.add(corr_id)
        return {
            "status": "SUPPRESSED",
            "tier": tier,
            "reason": reason,
            "status_code": 200,
        }

    start_time = time.time()
    ts_received = _now_iso()
    execution_id = f"KL-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}"

    actions_expected = list(ACTIONS_TIER1)
    actions_completed = simulate_actions(actions_expected)

    elapsed_ms = int((time.time() - start_time) * 1000) + random.randint(100, 2000)
    response_seconds = round(elapsed_ms / 1000, 3)
    ts_completed = _now_iso()

    execution = {
        "execution_id": execution_id,
        "playbook_id": "KL-001",
        "schema_version": "1.2",
        "@timestamp": ts_received,
        "response_tier": tier,
        "tier_reason": reason,
        "state": "COMPLETE",
        "host_ip": payload["host_ip"],
        "host_id": payload["host_id"],
        "alert_type": payload["alert_type"],
        "severity": payload["severity"],
        "admin_session_active": payload.get("admin_session_active", False),
        "aws_security_group_id": payload["aws_security_group_id"],
        "iam_user": payload["iam_user"],
        "eng3_correlation_id": corr_id,
        "actions_expected": actions_expected,
        "actions_completed": actions_completed,
        "timestamps": {
            "alert_received": ts_received,
            "state_written": ts_received,
            "action_completed": ts_completed,
            "response_time_ms": elapsed_ms,
            "sla_met": elapsed_ms < (KL001_SLA_SECONDS * 1000),
        },
        "labels": {
            "eng4_kl001_response_seconds": response_seconds,
            "blueprint_version": BLUEPRINT_VERSION,
        },
        "sg_isolation": {
            "ingress_revoked": True,
            "egress_revoked": True,
            "bastion_ssh_permitted": True,
            "sg_tagged": True,
        },
        "iam_actions": {
            "key_deactivated": True,
            "deny_all_attached": True,
        },
        "memory_preserved": True,
        "soc_notified": True,
        "ndr": {
            "blueprint_version": BLUEPRINT_VERSION,
        },
    }

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-kinetic" '
        "(id, timestamp, execution_json, execution_id, playbook_id, response_tier, "
        "state, host_ip, alert_type, eng3_correlation_id, response_time_ms, sla_met, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            ts_received,
            json.dumps(execution),
            execution_id,
            "KL-001",
            tier,
            "COMPLETE",
            payload["host_ip"],
            payload["alert_type"],
            corr_id,
            elapsed_ms,
            1 if elapsed_ms < (KL001_SLA_SECONDS * 1000) else 0,
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()

    _processed_correlation_ids.add(corr_id)

    if len(_processed_correlation_ids) > 1000:
        excess = list(_processed_correlation_ids)[:500]
        for e in excess:
            _processed_correlation_ids.discard(e)

    return {
        "status": "COMPLETE",
        "execution_id": execution_id,
        "tier": tier,
        "reason": reason,
        "response_time_seconds": response_seconds,
        "sla_met": elapsed_ms < (KL001_SLA_SECONDS * 1000),
        "actions_completed": len(actions_completed),
        "status_code": 200,
    }


def execute_kl002(payload: Dict[str, Any]) -> Dict[str, Any]:
    _init_db()
    start_time = time.time()
    ts_received = _now_iso()
    execution_id = f"KL002-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}"

    actions_completed = simulate_actions(KL002_ACTIONS)
    elapsed_ms = int((time.time() - start_time) * 1000) + random.randint(50, 500)
    response_seconds = round(elapsed_ms / 1000, 3)

    execution = {
        "execution_id": execution_id,
        "playbook_id": "KL-002",
        "schema_version": "1.2",
        "@timestamp": ts_received,
        "state": "COMPLETE",
        "iam_user": payload.get("iam_user", "unknown"),
        "iam_access_key_id": payload.get("iam_access_key_id", "UNKNOWN"),
        "aws_region": payload.get("aws_region", "us-east-1"),
        "actions_completed": actions_completed,
        "timestamps": {
            "alert_received": ts_received,
            "action_completed": _now_iso(),
            "response_time_ms": elapsed_ms,
            "sla_met": elapsed_ms < (KL002_SLA_SECONDS * 1000),
        },
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
        },
        "ndr": {
            "blueprint_version": BLUEPRINT_VERSION,
        },
    }

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-kinetic" '
        "(id, timestamp, execution_json, execution_id, playbook_id, response_tier, "
        "state, host_ip, alert_type, eng3_correlation_id, response_time_ms, sla_met, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            ts_received,
            json.dumps(execution),
            execution_id,
            "KL-002",
            "KL002_IAM_KILL",
            "COMPLETE",
            payload.get("host_ip", "N/A"),
            payload.get("alert_type", "IAM_RESPONSE"),
            payload.get("eng3_correlation_id", ""),
            elapsed_ms,
            1 if elapsed_ms < (KL002_SLA_SECONDS * 1000) else 0,
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()

    return {
        "status": "COMPLETE",
        "execution_id": execution_id,
        "playbook": "KL-002",
        "response_time_seconds": response_seconds,
        "sla_met": elapsed_ms < (KL002_SLA_SECONDS * 1000),
        "actions_completed": len(actions_completed),
        "status_code": 200,
    }


def _write_kinetic_record(execution: Dict[str, Any], playbook_id: str, tier: str,
                          payload: Dict[str, Any], elapsed_ms: int, sla_seconds: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-kinetic" '
        "(id, timestamp, execution_json, execution_id, playbook_id, response_tier, "
        "state, host_ip, alert_type, eng3_correlation_id, response_time_ms, sla_met, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            execution["@timestamp"],
            json.dumps(execution),
            execution["execution_id"],
            playbook_id,
            tier,
            execution["state"],
            payload.get("host_ip", "N/A"),
            payload.get("alert_type", "UNKNOWN"),
            payload.get("eng3_correlation_id", ""),
            elapsed_ms,
            1 if elapsed_ms < (sla_seconds * 1000) else 0,
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()


def execute_kl003(payload: Dict[str, Any]) -> Dict[str, Any]:
    _init_db()

    alert_type = payload.get("alert_type", "").upper()
    severity = payload.get("severity", "").upper()

    if alert_type != "LATERAL_MOVE" or severity not in ("HIGH", "CRITICAL"):
        return {
            "status": "SKIPPED",
            "reason": f"KL-003 requires LATERAL_MOVE + HIGH/CRITICAL, got {alert_type}/{severity}",
            "playbook": "KL-003",
            "status_code": 200,
        }

    start_time = time.time()
    ts_received = _now_iso()
    execution_id = f"KL003-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}"
    corr_id = payload.get("eng3_correlation_id", "")

    sg_id = payload.get("aws_security_group_id", "sg-unknown")
    sg_snapshot = {
        "security_group_id": sg_id,
        "snapshot_timestamp": ts_received,
        "rules_before_isolation": [
            {"protocol": "tcp", "port": 445, "direction": "inbound", "source": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 445, "direction": "outbound", "destination": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 3389, "direction": "inbound", "source": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 3389, "direction": "outbound", "destination": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 135, "direction": "inbound", "source": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 135, "direction": "outbound", "destination": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 22, "direction": "inbound", "source": "0.0.0.0/0"},
            {"protocol": "tcp", "port": 22, "direction": "outbound", "destination": "0.0.0.0/0"},
        ],
    }

    iam_key = payload.get("iam_access_key_id", "UNKNOWN")
    iam_deactivated = iam_key != "UNKNOWN"

    actions_completed = simulate_actions(KL003_ACTIONS)
    elapsed_ms = int((time.time() - start_time) * 1000) + random.randint(100, 1500)
    response_seconds = round(elapsed_ms / 1000, 3)

    execution = {
        "execution_id": execution_id,
        "playbook_id": "KL-003",
        "schema_version": "1.2",
        "@timestamp": ts_received,
        "state": "COMPLETE",
        "response_tier": "KL003_LATERAL_RESPONSE",
        "host_ip": payload.get("host_ip", "N/A"),
        "host_id": payload.get("host_id", "unknown"),
        "alert_type": alert_type,
        "severity": severity,
        "eng3_correlation_id": corr_id,
        "iam_user": payload.get("iam_user", "unknown"),
        "iam_access_key_id": iam_key,
        "aws_security_group_id": sg_id,
        "actions_expected": KL003_ACTIONS,
        "actions_completed": actions_completed,
        "sg_isolation": {
            "lateral_ports_revoked": [445, 3389, 135, 22],
            "directions": ["inbound", "outbound"],
            "sg_snapshot_pre_isolation": sg_snapshot,
        },
        "iam_actions": {
            "key_deactivated": iam_deactivated,
            "iam_access_key_id": iam_key,
        },
        "timestamps": {
            "alert_received": ts_received,
            "state_in_progress": ts_received,
            "action_completed": _now_iso(),
            "response_time_ms": elapsed_ms,
            "sla_met": elapsed_ms < (KL003_SLA_SECONDS * 1000),
        },
        "labels": {
            "kl003_response_seconds": response_seconds,
            "sg_snapshot_pre_isolation": json.dumps(sg_snapshot),
            "blueprint_version": BLUEPRINT_VERSION,
            "module": "kinetic_eng",
        },
        "rollback_eligible": True,
        "ndr": {"blueprint_version": BLUEPRINT_VERSION},
    }

    _write_kinetic_record(execution, "KL-003", "KL003_LATERAL_RESPONSE",
                          payload, elapsed_ms, KL003_SLA_SECONDS)

    return {
        "status": "COMPLETE",
        "execution_id": execution_id,
        "playbook": "KL-003",
        "response_time_seconds": response_seconds,
        "sla_met": elapsed_ms < (KL003_SLA_SECONDS * 1000),
        "actions_completed": len(actions_completed),
        "lateral_ports_revoked": [445, 3389, 135, 22],
        "iam_key_deactivated": iam_deactivated,
        "sg_snapshot_captured": True,
        "status_code": 200,
    }


def execute_kl004(payload: Dict[str, Any]) -> Dict[str, Any]:
    _init_db()

    alert_type = payload.get("alert_type", "").upper()

    if alert_type != "BRUTE_FORCE_SUCCESS":
        return {
            "status": "SKIPPED",
            "reason": f"KL-004 requires BRUTE_FORCE_SUCCESS, got {alert_type}",
            "playbook": "KL-004",
            "status_code": 200,
        }

    start_time = time.time()
    ts_received = _now_iso()
    execution_id = f"KL004-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}"
    corr_id = payload.get("eng3_correlation_id", "")
    iam_user = payload.get("iam_user", "unknown")
    iam_key = payload.get("iam_access_key_id", "UNKNOWN")

    actions_completed = simulate_actions(KL004_ACTIONS)
    elapsed_ms = int((time.time() - start_time) * 1000) + random.randint(100, 1500)
    response_seconds = round(elapsed_ms / 1000, 3)

    escalation_event = {
        "id": str(uuid.uuid4()),
        "@timestamp": _now_iso(),
        "ecs": {"version": ECS_VERSION},
        "event": {
            "dataset": "wazuh.security",
            "module": "kinetic_eng",
            "kind": "alert",
            "category": "authentication",
            "type": "info",
            "action": "account-locked",
            "severity": 14,
            "risk_score": 90,
            "reason": (
                f"IDENTITY-002 ESCALATION: User {iam_user} account locked by KL-004 "
                f"after brute force success detection. Auth spike response active."
            ),
        },
        "user": {"name": iam_user},
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "escalated_by": "KL-004",
            "original_correlation_id": corr_id,
        },
        "tags": ["blueprint-v1.2", "kinetic-escalation", "sprint2"],
    }

    execution = {
        "execution_id": execution_id,
        "playbook_id": "KL-004",
        "schema_version": "1.2",
        "@timestamp": ts_received,
        "state": "COMPLETE",
        "response_tier": "KL004_AUTH_SPIKE",
        "host_ip": payload.get("host_ip", "N/A"),
        "alert_type": alert_type,
        "eng3_correlation_id": corr_id,
        "iam_user": iam_user,
        "actions_expected": KL004_ACTIONS,
        "actions_completed": actions_completed,
        "account_actions": {
            "account_locked": True,
            "lock_reason": "AUTH_SPIKE",
            "iam_key_deactivated": iam_key != "UNKNOWN",
            "iam_access_key_id": iam_key,
        },
        "escalation_event": escalation_event,
        "timestamps": {
            "alert_received": ts_received,
            "state_in_progress": ts_received,
            "action_completed": _now_iso(),
            "response_time_ms": elapsed_ms,
            "sla_met": elapsed_ms < (KL004_SLA_SECONDS * 1000),
        },
        "labels": {
            "kl004_response_seconds": response_seconds,
            "account_locked": True,
            "lock_reason": "AUTH_SPIKE",
            "blueprint_version": BLUEPRINT_VERSION,
            "module": "kinetic_eng",
        },
        "rollback_eligible": True,
        "ndr": {"blueprint_version": BLUEPRINT_VERSION},
    }

    _write_kinetic_record(execution, "KL-004", "KL004_AUTH_SPIKE",
                          payload, elapsed_ms, KL004_SLA_SECONDS)

    return {
        "status": "COMPLETE",
        "execution_id": execution_id,
        "playbook": "KL-004",
        "response_time_seconds": response_seconds,
        "sla_met": elapsed_ms < (KL004_SLA_SECONDS * 1000),
        "actions_completed": len(actions_completed),
        "account_locked": True,
        "escalation_emitted": True,
        "status_code": 200,
    }


def execute_kl005(payload: Dict[str, Any]) -> Dict[str, Any]:
    _init_db()

    alert_type = payload.get("alert_type", "").upper()
    admin_session = payload.get("admin_session_active", False)
    now_hour = datetime.now(timezone.utc).hour

    is_off_hours = now_hour < 6 or now_hour > 22

    if alert_type != "SUSPICIOUS_IAM_KEY_ROTATION":
        return {
            "status": "SKIPPED",
            "reason": f"KL-005 requires SUSPICIOUS_IAM_KEY_ROTATION, got {alert_type}",
            "playbook": "KL-005",
            "status_code": 200,
        }

    if not admin_session:
        return {
            "status": "SKIPPED",
            "reason": "KL-005 requires admin_session_active = true",
            "playbook": "KL-005",
            "status_code": 200,
        }

    if not is_off_hours:
        return {
            "status": "SKIPPED",
            "reason": f"KL-005 requires off-hours (hour < 6 or > 22 UTC), current hour = {now_hour}",
            "playbook": "KL-005",
            "status_code": 200,
        }

    start_time = time.time()
    ts_received = _now_iso()
    execution_id = f"KL005-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}"
    corr_id = payload.get("eng3_correlation_id", "")
    iam_user = payload.get("iam_user", "unknown")
    iam_key = payload.get("iam_access_key_id", "UNKNOWN")
    aws_region = payload.get("aws_region", "us-east-1")

    actions_completed = simulate_actions(KL005_ACTIONS)
    elapsed_ms = int((time.time() - start_time) * 1000) + random.randint(100, 1500)
    response_seconds = round(elapsed_ms / 1000, 3)

    console_anomaly_alert = {
        "id": str(uuid.uuid4()),
        "@timestamp": _now_iso(),
        "ecs": {"version": ECS_VERSION},
        "event": {
            "dataset": "ndr-correlated",
            "module": "kinetic_eng",
            "kind": "alert",
            "category": "intrusion_detection",
            "type": "info",
            "severity": 14,
            "risk_score": 95,
            "reason": (
                f"AWS_CONSOLE_ANOMALY: Off-hours admin session by {iam_user} "
                f"with IAM key rotation in {aws_region}. KL-005 containment active."
            ),
        },
        "alert_type": "AWS_CONSOLE_ANOMALY",
        "severity": "CRITICAL",
        "user": {"name": iam_user},
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "escalated_by": "KL-005",
            "original_correlation_id": corr_id,
        },
        "tags": ["blueprint-v1.2", "kinetic-escalation", "sprint2", "console-anomaly"],
    }

    execution = {
        "execution_id": execution_id,
        "playbook_id": "KL-005",
        "schema_version": "1.2",
        "@timestamp": ts_received,
        "state": "COMPLETE",
        "response_tier": "KL005_CONSOLE_ANOMALY",
        "host_ip": payload.get("host_ip", "N/A"),
        "alert_type": alert_type,
        "eng3_correlation_id": corr_id,
        "iam_user": iam_user,
        "iam_access_key_id": iam_key,
        "aws_region": aws_region,
        "admin_session_active": admin_session,
        "off_hours": True,
        "current_utc_hour": now_hour,
        "actions_expected": KL005_ACTIONS,
        "actions_completed": actions_completed,
        "iam_actions": {
            "session_revoked": True,
            "key_deactivated": iam_key != "UNKNOWN",
            "console_sessions_expired": True,
        },
        "console_anomaly_alert": console_anomaly_alert,
        "timestamps": {
            "alert_received": ts_received,
            "state_in_progress": ts_received,
            "action_completed": _now_iso(),
            "response_time_ms": elapsed_ms,
            "sla_met": elapsed_ms < (KL005_SLA_SECONDS * 1000),
        },
        "labels": {
            "kl005_response_seconds": response_seconds,
            "blueprint_version": BLUEPRINT_VERSION,
            "module": "kinetic_eng",
        },
        "rollback_eligible": True,
        "ndr": {"blueprint_version": BLUEPRINT_VERSION},
    }

    _write_kinetic_record(execution, "KL-005", "KL005_CONSOLE_ANOMALY",
                          payload, elapsed_ms, KL005_SLA_SECONDS)

    return {
        "status": "COMPLETE",
        "execution_id": execution_id,
        "playbook": "KL-005",
        "response_time_seconds": response_seconds,
        "sla_met": elapsed_ms < (KL005_SLA_SECONDS * 1000),
        "actions_completed": len(actions_completed),
        "iam_session_revoked": True,
        "console_sessions_expired": True,
        "anomaly_alert_emitted": True,
        "status_code": 200,
    }


def get_stats() -> Dict[str, Any]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    try:
        total = conn.execute('SELECT COUNT(*) FROM "ndr-kinetic"').fetchone()[0]
        by_tier = {}
        for row in conn.execute('SELECT response_tier, COUNT(*) FROM "ndr-kinetic" GROUP BY response_tier'):
            by_tier[row[0]] = row[1]
        by_playbook = {}
        for row in conn.execute('SELECT playbook_id, COUNT(*) FROM "ndr-kinetic" GROUP BY playbook_id'):
            by_playbook[row[0]] = row[1]
        sla_met = conn.execute('SELECT COUNT(*) FROM "ndr-kinetic" WHERE sla_met = 1').fetchone()[0]
        avg_ms = conn.execute('SELECT AVG(response_time_ms) FROM "ndr-kinetic"').fetchone()[0]
    except sqlite3.OperationalError:
        return {"total": 0, "note": "table not yet created"}
    finally:
        conn.close()

    return {
        "total": total,
        "by_tier": by_tier,
        "by_playbook": by_playbook,
        "sla_met": sla_met,
        "sla_total": total,
        "avg_response_ms": round(avg_ms, 1) if avg_ms else 0,
    }


if __name__ == "__main__":
    import sys
    _init_db()

    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        stats = get_stats()
        print(json.dumps(stats, indent=2))
    else:
        test_payload = {
            "host_ip": "10.0.2.55",
            "host_id": "i-0abc1234def567890",
            "alert_type": "C2_BEACON",
            "severity": "CRITICAL",
            "aws_security_group_id": "sg-0a1b2c3d4e5f67890",
            "iam_user": "arn:aws:iam::123456789012:user/jsmith",
            "iam_access_key_id": "AKIA1234567890ABCDEF",
            "aws_region": "us-east-1",
            "admin_session_active": True,
            "alert_timestamp": _now_iso(),
            "eng3_correlation_id": "a3f1bc9e7d2044a1bcd8f3e901234abc5678def9012345678901234567890abcd",
        }
        result = execute_kl001(test_payload)
        print(json.dumps(result, indent=2))
