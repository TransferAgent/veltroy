#!/usr/bin/env python3
"""
identity_eng.py — Engineer 2 Module (Identity Specialist)
Blueprint v1.2 | Phase Gate 0

Generates ECS 8.11.0-compliant mock identity events and writes them
to the ndr-identity table in the SQLite warehouse (data/ndr.db).

Event types:
  - Linux SSH auth events (event.dataset = wazuh.security)
  - Windows Event Log (4624, 4625, 4720, 4740, 7045)
  - AWS CloudTrail IAM (ConsoleLogin, AssumeRole, CreateUser, AttachUserPolicy)

Alert conditions (IDENTITY-001 through IDENTITY-006):
  001: Successful login from new/unexpected country (risk_score >= 75)
  002: Account lockout spike (>5 failures in 60s for one user)
  003: Windows 4740 account lockout
  004: AWS ConsoleLogin from new IP
  005: IAM privilege escalation via AttachUserPolicy (CRITICAL)
  006 v2: Compound behavioral — off-hours AND new country AND new host

GeoIP: Three-layer simulation (MaxMind primary, ASN always, reputation scoring)

Spec sources:
  - specs/engineer2-technical-handover.md
  - specs/engineer2-ecs-sample.json
  - specs/engineer2-alert-definitions.xml
  - specs/engineer2-patch1-ecs-pin.md
  - specs/engineer2-patch2-identity006v2.xml
  - specs/engineer2-patch3-geoip-spof.md
"""

import json
import os
import random
import sqlite3
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from modules.network_eng import compute_community_id

ECS_VERSION = "8.11.0"
BLUEPRINT_VERSION = "v1.2"

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")

COUNTRIES = [
    {"name": "United States", "iso": "US", "cities": [("New York", 40.7128, -74.0060), ("San Francisco", 37.7749, -122.4194), ("Chicago", 41.8781, -87.6298)]},
    {"name": "Germany", "iso": "DE", "cities": [("Frankfurt", 50.1109, 8.6821), ("Berlin", 52.5200, 13.4050), ("Munich", 48.1351, 11.5820)]},
    {"name": "United Kingdom", "iso": "GB", "cities": [("London", 51.5074, -0.1278)]},
    {"name": "Japan", "iso": "JP", "cities": [("Tokyo", 35.6762, 139.6503)]},
    {"name": "Canada", "iso": "CA", "cities": [("Toronto", 43.6532, -79.3832)]},
    {"name": "Australia", "iso": "AU", "cities": [("Sydney", -33.8688, 151.2093)]},
    {"name": "France", "iso": "FR", "cities": [("Paris", 48.8566, 2.3522)]},
    {"name": "Netherlands", "iso": "NL", "cities": [("Amsterdam", 52.3676, 4.9041)]},
    {"name": "Singapore", "iso": "SG", "cities": [("Singapore", 1.3521, 103.8198)]},
    {"name": "Brazil", "iso": "BR", "cities": [("São Paulo", -23.5505, -46.6333)]},
]

SUSPICIOUS_COUNTRIES = [
    {"name": "Russia", "iso": "RU", "cities": [("Moscow", 55.7558, 37.6173), ("Saint Petersburg", 59.9311, 30.3609)]},
    {"name": "China", "iso": "CN", "cities": [("Beijing", 39.9042, 116.4074), ("Shanghai", 31.2304, 121.4737)]},
    {"name": "Iran", "iso": "IR", "cities": [("Tehran", 35.6892, 51.3890)]},
    {"name": "North Korea", "iso": "KP", "cities": [("Pyongyang", 39.0392, 125.7625)]},
    {"name": "Romania", "iso": "RO", "cities": [("Bucharest", 44.4268, 26.1025)]},
]

KNOWN_ASNS = [
    {"number": 3320, "org": "Deutsche Telekom AG", "risk": "low"},
    {"number": 15169, "org": "Google LLC", "risk": "low"},
    {"number": 16509, "org": "Amazon.com Inc.", "risk": "low"},
    {"number": 8075, "org": "Microsoft Corporation", "risk": "low"},
    {"number": 13335, "org": "Cloudflare Inc.", "risk": "low"},
    {"number": 7922, "org": "Comcast Cable Communications", "risk": "low"},
    {"number": 20473, "org": "AS-CHOOPA (Vultr)", "risk": "high"},
    {"number": 14061, "org": "DigitalOcean LLC", "risk": "high"},
    {"number": 24940, "org": "Hetzner Online GmbH", "risk": "high"},
    {"number": 9009, "org": "M247 Ltd (VPN Provider)", "risk": "high"},
    {"number": 174, "org": "Cogent Communications", "risk": "medium"},
    {"number": 4134, "org": "China Telecom", "risk": "medium"},
    {"number": 12389, "org": "Rostelecom PJSC", "risk": "medium"},
]

LINUX_USERS = ["jsmith", "admin", "deploy", "svc_backup", "developer", "analyst", "ubuntu", "root"]
LINUX_HOSTNAMES = ["lab-host-01", "prod-web-01", "prod-db-01", "staging-app-02", "dev-build-01", "bastion-01"]

WINDOWS_USERS = ["Administrator", "jdoe", "svc_sql", "helpdesk", "analyst01", "svc_exchange"]
WINDOWS_HOSTNAMES = ["DC01", "WS-FINANCE-03", "SRV-APP-01", "WS-DEV-07", "SRV-FILE-02", "DC02"]
WINDOWS_DOMAINS = ["CORP", "CORP-LAB", "PROD", "DEV"]

AWS_USERS = ["admin-user", "deploy-bot", "lambda-executor", "dev-engineer", "security-auditor"]
AWS_ACCOUNT_IDS = ["123456789012", "987654321098", "112233445566"]
AWS_REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]

USER_BASELINE_COUNTRIES = {
    "jsmith": ["US", "DE", "GB"],
    "admin": ["US"],
    "deploy": ["US", "DE"],
    "svc_backup": ["US"],
    "developer": ["US", "GB", "CA"],
    "analyst": ["US", "FR"],
    "ubuntu": ["US"],
    "root": ["US"],
    "Administrator": ["US"],
    "jdoe": ["US", "GB"],
    "svc_sql": ["US"],
    "helpdesk": ["US", "DE"],
    "analyst01": ["US"],
    "svc_exchange": ["US"],
    "admin-user": ["US"],
    "deploy-bot": ["US", "EU"],
    "lambda-executor": ["US"],
    "dev-engineer": ["US", "DE", "JP"],
    "security-auditor": ["US", "GB"],
}

USER_BASELINE_HOSTS = {
    "jsmith": ["lab-host-01", "dev-build-01"],
    "admin": ["prod-web-01", "prod-db-01", "bastion-01"],
    "deploy": ["prod-web-01", "staging-app-02"],
    "developer": ["dev-build-01", "staging-app-02"],
    "analyst": ["lab-host-01"],
    "Administrator": ["DC01", "SRV-APP-01"],
    "jdoe": ["WS-FINANCE-03"],
    "helpdesk": ["WS-DEV-07", "DC01"],
}

_lockout_tracker: Dict[str, List[float]] = {}


def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "ndr-identity" (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            event_json TEXT NOT NULL,
            event_kind TEXT NOT NULL,
            event_dataset TEXT NOT NULL,
            event_action TEXT,
            user_name TEXT,
            source_ip TEXT,
            community_id TEXT,
            severity INTEGER DEFAULT 0,
            alert_rule_id TEXT,
            blueprint_version TEXT DEFAULT 'v1.2',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_identity_dataset
        ON "ndr-identity" (event_dataset)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_identity_user
        ON "ndr-identity" (user_name)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_identity_source_ip
        ON "ndr-identity" (source_ip)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_identity_timestamp
        ON "ndr-identity" (timestamp)
    """)
    conn.commit()
    conn.close()


def _write_event(event: Dict[str, Any]):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-identity" '
        "(id, timestamp, event_json, event_kind, event_dataset, event_action, "
        "user_name, source_ip, community_id, severity, alert_rule_id, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            event["id"],
            event["@timestamp"],
            json.dumps(event),
            event["event"]["kind"],
            event["event"]["dataset"],
            event["event"].get("action"),
            event.get("user", {}).get("name"),
            event.get("source", {}).get("ip"),
            event.get("network", {}).get("community_id"),
            event["event"].get("severity", 0),
            event.get("rule", {}).get("id") if "rule" in event else None,
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()


def _write_events(events: List[Dict[str, Any]]):
    conn = sqlite3.connect(DB_PATH)
    for event in events:
        conn.execute(
            'INSERT OR REPLACE INTO "ndr-identity" '
            "(id, timestamp, event_json, event_kind, event_dataset, event_action, "
            "user_name, source_ip, community_id, severity, alert_rule_id, blueprint_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                event["id"],
                event["@timestamp"],
                json.dumps(event),
                event["event"]["kind"],
                event["event"]["dataset"],
                event["event"].get("action"),
                event.get("user", {}).get("name"),
                event.get("source", {}).get("ip"),
                event.get("network", {}).get("community_id"),
                event["event"].get("severity", 0),
                event.get("rule", {}).get("id") if "rule" in event else None,
                BLUEPRINT_VERSION,
            ),
        )
    conn.commit()
    conn.close()


def _rand_external_ip() -> str:
    return f"{random.randint(11, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _rand_internal_ip() -> str:
    return f"10.0.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
           f"{random.randint(0, 999):03d}Z"


def _off_hours_iso() -> str:
    now = datetime.now(timezone.utc)
    hour = random.choice([0, 1, 2, 3, 4, 5, 6, 21, 22, 23])
    off = now.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59))
    return off.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0, 999):03d}Z"


def _enrich_geo(country_entry: Optional[Dict] = None, force_suspicious: bool = False) -> Dict[str, Any]:
    if country_entry is None:
        pool = SUSPICIOUS_COUNTRIES if force_suspicious else COUNTRIES
        country_entry = random.choice(pool)
    city_data = random.choice(country_entry["cities"])
    city_name, lat, lon = city_data

    asn = random.choice(KNOWN_ASNS)

    geo = {
        "country_name": country_entry["name"],
        "country_iso_code": country_entry["iso"],
        "city_name": city_name,
        "location": {"lat": lat, "lon": lon},
    }

    as_info = {
        "number": asn["number"],
        "organization": {"name": asn["org"]},
    }

    tags = []
    if asn["risk"] == "high":
        tags.append("asn_reputation_hit")
        tags.append("high_risk_asn")

    return {"geo": geo, "as": as_info, "asn_risk": asn["risk"], "tags": tags}


def _is_new_country(user: str, country_iso: str) -> bool:
    baseline = USER_BASELINE_COUNTRIES.get(user, ["US"])
    return country_iso not in baseline


def _is_new_host(user: str, hostname: str) -> bool:
    baseline = USER_BASELINE_HOSTS.get(user, [])
    return hostname not in baseline


def _is_off_hours(timestamp: str) -> bool:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return dt.hour < 7 or dt.hour >= 20
    except (ValueError, AttributeError):
        return False


def generate_linux_ssh_event(
    user: Optional[str] = None,
    source_ip: Optional[str] = None,
    success: bool = True,
    timestamp: Optional[str] = None,
    force_geo_anomaly: bool = False,
) -> Dict[str, Any]:
    usr = user or random.choice(LINUX_USERS)
    src_ip = source_ip or _rand_external_ip()
    dst_ip = _rand_internal_ip()
    s_port = random.randint(1024, 65535)
    d_port = 22
    ts = timestamp or _now_iso()
    hostname = random.choice(LINUX_HOSTNAMES)

    geo_data = _enrich_geo(
        force_suspicious=force_geo_anomaly,
        country_entry=random.choice(SUSPICIOUS_COUNTRIES) if force_geo_anomaly else None,
    )

    community_id = compute_community_id(src_ip, s_port, dst_ip, d_port, 6)
    severity = 3 if success else random.choice([5, 8, 10])
    outcome = "success" if success else "failure"
    action = "logged-in" if success else "logon-failed"
    reason = (
        f"Successful user authentication via SSH password"
        if success else
        f"Failed password for {usr} from {src_ip}"
    )

    event = {
        "id": str(uuid.uuid4()),
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "dataset": "wazuh.security",
            "module": "wazuh",
            "kind": "event",
            "category": "authentication",
            "type": "start",
            "action": action,
            "outcome": outcome,
            "severity": severity,
            "id": f"WZH-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{random.randint(100000, 999999):06d}",
            "reason": reason,
        },
        "user": {
            "name": usr,
            "id": str(random.randint(1000, 9999)),
            "domain": "CORP-LAB",
            "roles": random.choice([["developers", "sudo"], ["users"], ["admins", "sudo"], ["operators"]]),
        },
        "source": {
            "ip": src_ip,
            "port": s_port,
            "geo": geo_data["geo"],
            "as": geo_data["as"],
        },
        "destination": {
            "ip": dst_ip,
            "port": d_port,
            "domain": f"{hostname}.corp.internal",
        },
        "host": {
            "hostname": hostname,
            "ip": [dst_ip],
            "os": {
                "type": "linux",
                "name": "Ubuntu",
                "version": "22.04.3 LTS",
            },
        },
        "network": {
            "community_id": community_id,
            "transport": "tcp",
            "type": "ipv4",
            "direction": "inbound",
        },
        "agent": {
            "name": f"wazuh-agent-{hostname}",
            "version": "4.7.3",
            "type": "wazuh",
            "id": f"{random.randint(1, 99):03d}",
        },
        "log": {
            "file": {"path": "/var/log/auth.log"},
            "level": "info" if success else "warning",
        },
        "message": (
            f"{hostname} sshd[{random.randint(1000, 65535)}]: "
            f"{'Accepted' if success else 'Failed'} password for {usr} "
            f"from {src_ip} port {s_port} ssh2"
        ),
        "tags": ["blueprint-v1.2", "engineer2-identity", "sprint1"] + geo_data["tags"],
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "sensor": "wazuh",
            "ecs_version": ECS_VERSION,
        },
    }

    return event


def generate_windows_event(
    event_id: int = 4624,
    user: Optional[str] = None,
    source_ip: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    event_defs = {
        4624: {"action": "logon-success", "desc": "An account was successfully logged on", "category": "authentication", "type": "start", "outcome": "success", "severity": 3},
        4625: {"action": "logon-failed", "desc": "An account failed to log on", "category": "authentication", "type": "start", "outcome": "failure", "severity": 8},
        4720: {"action": "account-created", "desc": "A user account was created", "category": "iam", "type": "creation", "outcome": "success", "severity": 6},
        4740: {"action": "account-lockout", "desc": "A user account was locked out", "category": "authentication", "type": "denied", "outcome": "failure", "severity": 14},
        7045: {"action": "service-installed", "desc": "A service was installed in the system", "category": "configuration", "type": "installation", "outcome": "success", "severity": 5},
    }

    edef = event_defs.get(event_id, event_defs[4624])
    usr = user or random.choice(WINDOWS_USERS)
    src_ip = source_ip or _rand_external_ip()
    dst_ip = _rand_internal_ip()
    s_port = random.randint(1024, 65535)
    d_port = random.choice([135, 139, 445, 3389, 5985])
    ts = timestamp or _now_iso()
    hostname = random.choice(WINDOWS_HOSTNAMES)
    domain = random.choice(WINDOWS_DOMAINS)

    geo_data = _enrich_geo()
    community_id = compute_community_id(src_ip, s_port, dst_ip, d_port, 6)

    event = {
        "id": str(uuid.uuid4()),
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "dataset": "wazuh.security",
            "module": "wazuh",
            "kind": "alert" if event_id == 4740 else "event",
            "category": edef["category"],
            "type": edef["type"],
            "action": edef["action"],
            "outcome": edef["outcome"],
            "severity": edef["severity"],
            "id": f"WIN-{event_id}-{random.randint(100000, 999999):06d}",
            "code": str(event_id),
            "reason": edef["desc"],
        },
        "user": {
            "name": usr,
            "id": f"S-1-5-21-{random.randint(100000000, 999999999)}-{random.randint(1000, 9999)}",
            "domain": domain,
        },
        "source": {
            "ip": src_ip,
            "port": s_port,
            "geo": geo_data["geo"],
            "as": geo_data["as"],
        },
        "destination": {
            "ip": dst_ip,
            "port": d_port,
            "domain": f"{hostname}.{domain.lower()}.internal",
        },
        "host": {
            "hostname": hostname,
            "ip": [dst_ip],
            "os": {
                "type": "windows",
                "name": "Windows Server",
                "version": "2022",
            },
        },
        "network": {
            "community_id": community_id,
            "transport": "tcp",
            "type": "ipv4",
            "direction": "inbound",
        },
        "agent": {
            "name": f"wazuh-agent-{hostname}",
            "version": "4.7.3",
            "type": "wazuh",
            "id": f"{random.randint(100, 999):03d}",
        },
        "log": {
            "file": {"path": "Security"},
            "level": "warning" if edef["severity"] >= 10 else "info",
        },
        "message": f"Windows Event {event_id}: {edef['desc']} — User: {domain}\\{usr}",
        "winlog": {
            "event_id": event_id,
            "channel": "Security",
            "provider_name": "Microsoft-Windows-Security-Auditing",
        },
        "tags": ["blueprint-v1.2", "engineer2-identity", "windows"] + geo_data["tags"],
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "sensor": "wazuh",
            "ecs_version": ECS_VERSION,
        },
    }

    if event_id == 4740:
        event["rule"] = {
            "id": "100103",
            "name": f"IDENTITY-003: Windows account lockout event for {usr}",
        }
        event["event"]["risk_score"] = 70

    return event


def generate_cloudtrail_event(
    action: str = "ConsoleLogin",
    user: Optional[str] = None,
    source_ip: Optional[str] = None,
    timestamp: Optional[str] = None,
    force_new_ip: bool = False,
) -> Dict[str, Any]:
    action_defs = {
        "ConsoleLogin": {"category": "authentication", "type": "start", "severity": 5, "outcome": "success"},
        "AssumeRole": {"category": "authentication", "type": "start", "severity": 4, "outcome": "success"},
        "CreateUser": {"category": "iam", "type": "creation", "severity": 8, "outcome": "success"},
        "AttachUserPolicy": {"category": "iam", "type": "change", "severity": 15, "outcome": "success"},
    }

    adef = action_defs.get(action, action_defs["ConsoleLogin"])
    usr = user or random.choice(AWS_USERS)
    src_ip = source_ip or _rand_external_ip()
    ts = timestamp or _now_iso()
    region = random.choice(AWS_REGIONS)
    account_id = random.choice(AWS_ACCOUNT_IDS)

    geo_data = _enrich_geo(force_suspicious=force_new_ip)
    community_id = compute_community_id(src_ip, random.randint(1024, 65535), "0.0.0.0", 443, 6)

    is_alert = action in ("AttachUserPolicy", "CreateUser") or force_new_ip
    kind = "alert" if is_alert else "event"

    event = {
        "id": str(uuid.uuid4()),
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "dataset": "aws.cloudtrail",
            "module": "aws",
            "kind": kind,
            "category": adef["category"],
            "type": adef["type"],
            "action": action,
            "outcome": adef["outcome"],
            "severity": adef["severity"],
            "id": f"CT-{random.randint(100000, 999999):06d}",
        },
        "user": {
            "name": usr,
            "id": f"AIDA{random.randint(10000000, 99999999)}",
            "domain": f"arn:aws:iam::{account_id}:user/{usr}",
        },
        "source": {
            "ip": src_ip,
            "port": random.randint(1024, 65535),
            "geo": geo_data["geo"],
            "as": geo_data["as"],
        },
        "destination": {
            "ip": "0.0.0.0",
            "port": 443,
            "domain": f"{action.lower()}.{region}.amazonaws.com",
        },
        "host": {
            "hostname": f"aws-{region}",
            "ip": ["0.0.0.0"],
        },
        "network": {
            "community_id": community_id,
            "transport": "tcp",
            "type": "ipv4",
            "direction": "inbound",
        },
        "cloud": {
            "provider": "aws",
            "account": {"id": account_id},
            "region": region,
        },
        "agent": {
            "name": "cloudtrail",
            "version": "1.0",
            "type": "cloudtrail",
        },
        "message": f"CloudTrail: {action} by {usr} from {src_ip} in {region}",
        "tags": ["blueprint-v1.2", "engineer2-identity", "cloudtrail"] + geo_data["tags"],
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "sensor": "wazuh",
            "ecs_version": ECS_VERSION,
        },
    }

    if action == "ConsoleLogin" and force_new_ip:
        event["rule"] = {
            "id": "100104",
            "name": f"IDENTITY-004: AWS Console login success from {src_ip}",
        }
        event["event"]["risk_score"] = 75

    if action == "AttachUserPolicy":
        event["rule"] = {
            "id": "100105",
            "name": f"IDENTITY-005: CRITICAL — IAM privilege escalation by {usr}",
        }
        event["event"]["risk_score"] = 95
        event["event"]["severity"] = 15

    return event


def _trigger_identity_001(test_run_id: Optional[str] = None) -> Dict[str, Any]:
    user = random.choice(LINUX_USERS)
    country = random.choice(SUSPICIOUS_COUNTRIES)
    event = generate_linux_ssh_event(
        user=user,
        success=True,
        force_geo_anomaly=True,
    )
    event["event"]["kind"] = "alert"
    event["event"]["risk_score"] = 78
    event["event"]["severity"] = 12
    event["rule"] = {
        "id": "100101",
        "name": f"IDENTITY-001: Successful login from new/unexpected country: {country['name']}",
    }
    event["tags"].append("geo_anomaly")
    if test_run_id:
        event["labels"]["test_run_id"] = test_run_id
    return event


def _trigger_identity_002(test_run_id: Optional[str] = None) -> List[Dict[str, Any]]:
    user = random.choice(LINUX_USERS)
    src_ip = _rand_external_ip()
    events = []
    base_time = datetime.now(timezone.utc)

    for i in range(6):
        offset = timedelta(seconds=random.randint(1, 8) * i)
        ts = (base_time + offset).strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0, 999):03d}Z"
        ev = generate_linux_ssh_event(user=user, source_ip=src_ip, success=False, timestamp=ts)
        if test_run_id:
            ev["labels"]["test_run_id"] = test_run_id
        events.append(ev)

    alert = events[-1].copy()
    alert["id"] = str(uuid.uuid4())
    alert["event"] = dict(alert["event"])
    alert["event"]["kind"] = "alert"
    alert["event"]["risk_score"] = 82
    alert["event"]["severity"] = 14
    alert["rule"] = {
        "id": "100102",
        "name": f"IDENTITY-002: Account lockout spike detected for user {user} — possible brute force",
    }
    if test_run_id:
        alert["labels"] = dict(alert["labels"])
        alert["labels"]["test_run_id"] = test_run_id
    events.append(alert)
    return events


def _trigger_identity_003(test_run_id: Optional[str] = None) -> Dict[str, Any]:
    user = random.choice(WINDOWS_USERS)
    event = generate_windows_event(event_id=4740, user=user)
    if test_run_id:
        event["labels"]["test_run_id"] = test_run_id
    return event


def _trigger_identity_004(test_run_id: Optional[str] = None) -> Dict[str, Any]:
    event = generate_cloudtrail_event(action="ConsoleLogin", force_new_ip=True)
    if test_run_id:
        event["labels"]["test_run_id"] = test_run_id
    return event


def _trigger_identity_005(test_run_id: Optional[str] = None) -> Dict[str, Any]:
    event = generate_cloudtrail_event(action="AttachUserPolicy")
    if test_run_id:
        event["labels"]["test_run_id"] = test_run_id
    return event


def _trigger_identity_006(test_run_id: Optional[str] = None) -> Dict[str, Any]:
    user = random.choice(LINUX_USERS)
    new_country = random.choice(SUSPICIOUS_COUNTRIES)
    new_host = random.choice([h for h in LINUX_HOSTNAMES if h not in USER_BASELINE_HOSTS.get(user, [])])

    ts = _off_hours_iso()
    src_ip = _rand_external_ip()

    geo_data = _enrich_geo(country_entry=new_country)

    s_port = random.randint(1024, 65535)
    d_ip = _rand_internal_ip()
    community_id = compute_community_id(src_ip, s_port, d_ip, 22, 6)

    event = {
        "id": str(uuid.uuid4()),
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "dataset": "wazuh.security",
            "module": "wazuh",
            "kind": "alert",
            "category": "authentication",
            "type": "start",
            "action": "logged-in",
            "outcome": "success",
            "severity": 14,
            "risk_score": 88,
            "id": f"WZH-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{random.randint(100000, 999999):06d}",
            "reason": (
                f"IDENTITY-006 v2 [COMPOUND]: {user} logged in off-hours "
                f"from NEW country {new_country['name']} [{src_ip}] "
                f"to UNSEEN host {new_host}. All 3 behavioral conditions met."
            ),
        },
        "user": {
            "name": user,
            "id": str(random.randint(1000, 9999)),
            "domain": "CORP-LAB",
            "roles": random.choice([["developers", "sudo"], ["users"], ["admins"]]),
        },
        "source": {
            "ip": src_ip,
            "port": s_port,
            "geo": geo_data["geo"],
            "as": geo_data["as"],
        },
        "destination": {
            "ip": d_ip,
            "port": 22,
            "domain": f"{new_host}.corp.internal",
        },
        "host": {
            "hostname": new_host,
            "ip": [d_ip],
            "os": {
                "type": "linux",
                "name": "Ubuntu",
                "version": "22.04.3 LTS",
            },
        },
        "network": {
            "community_id": community_id,
            "transport": "tcp",
            "type": "ipv4",
            "direction": "inbound",
        },
        "agent": {
            "name": f"wazuh-agent-{new_host}",
            "version": "4.7.3",
            "type": "wazuh",
            "id": f"{random.randint(1, 99):03d}",
        },
        "rule": {
            "id": "100202",
            "name": (
                f"IDENTITY-006 v2 [COMPOUND]: {user} logged in off-hours "
                f"from NEW country {new_country['name']} to UNSEEN host {new_host}"
            ),
        },
        "log": {
            "file": {"path": "/var/log/auth.log"},
            "level": "warning",
        },
        "message": (
            f"{new_host} sshd[{random.randint(1000, 65535)}]: Accepted password for {user} "
            f"from {src_ip} port {s_port} ssh2"
        ),
        "tags": [
            "blueprint-v1.2", "engineer2-identity", "sprint1",
            "geo_anomaly", "new_host", "off_hours",
        ] + geo_data["tags"],
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "sensor": "wazuh",
            "ecs_version": ECS_VERSION,
            "compound_conditions": "off_hours+new_country+new_host",
        },
    }

    if test_run_id:
        event["labels"]["test_run_id"] = test_run_id

    return event


def generate_normal_traffic(count: int = 10) -> List[Dict[str, Any]]:
    events = []
    for _ in range(count):
        roll = random.random()
        if roll < 0.45:
            events.append(generate_linux_ssh_event(success=random.random() < 0.8))
        elif roll < 0.75:
            eid = random.choice([4624, 4624, 4625, 4720, 7045])
            events.append(generate_windows_event(event_id=eid))
        else:
            action = random.choice(["ConsoleLogin", "AssumeRole", "CreateUser"])
            events.append(generate_cloudtrail_event(action=action))
    return events


def run_normal_mode(count: int = 10) -> List[Dict[str, Any]]:
    _init_db()
    events = generate_normal_traffic(count)
    _write_events(events)
    return events


def run_alert_simulation(test_run_id: Optional[str] = None) -> List[Dict[str, Any]]:
    _init_db()
    all_events = []

    id001 = _trigger_identity_001(test_run_id)
    all_events.append(id001)
    print(f"  IDENTITY-001 fired: new-country login from {id001['source']['geo']['country_name']}")

    id002_events = _trigger_identity_002(test_run_id)
    all_events.extend(id002_events)
    print(f"  IDENTITY-002 fired: {len(id002_events)-1} failed logins + brute force alert for {id002_events[0]['user']['name']}")

    id003 = _trigger_identity_003(test_run_id)
    all_events.append(id003)
    print(f"  IDENTITY-003 fired: Windows 4740 lockout for {id003['user']['name']}")

    id004 = _trigger_identity_004(test_run_id)
    all_events.append(id004)
    print(f"  IDENTITY-004 fired: AWS ConsoleLogin from new IP {id004['source']['ip']}")

    id005 = _trigger_identity_005(test_run_id)
    all_events.append(id005)
    print(f"  IDENTITY-005 fired: IAM AttachUserPolicy by {id005['user']['name']} (CRITICAL)")

    id006 = _trigger_identity_006(test_run_id)
    all_events.append(id006)
    print(f"  IDENTITY-006 fired: compound off-hours + {id006['source']['geo']['country_name']} + {id006['host']['hostname']}")

    _write_events(all_events)
    return all_events


def get_event_count() -> int:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute('SELECT COUNT(*) FROM "ndr-identity"')
    count = cursor.fetchone()[0]
    conn.close()
    return count


def get_events_by_dataset(dataset: str, limit: int = 50) -> List[Dict[str, Any]]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(
        'SELECT event_json FROM "ndr-identity" WHERE event_dataset = ? '
        "ORDER BY timestamp DESC LIMIT ?",
        (dataset, limit),
    )
    rows = cursor.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]


def get_recent_events(limit: int = 50) -> List[Dict[str, Any]]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(
        'SELECT event_json FROM "ndr-identity" ORDER BY timestamp DESC LIMIT ?',
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]


def get_stats() -> Dict[str, Any]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    total = conn.execute('SELECT COUNT(*) FROM "ndr-identity"').fetchone()[0]
    by_dataset = {}
    for row in conn.execute(
        'SELECT event_dataset, COUNT(*) FROM "ndr-identity" GROUP BY event_dataset'
    ):
        by_dataset[row[0]] = row[1]
    by_kind = {}
    for row in conn.execute(
        'SELECT event_kind, COUNT(*) FROM "ndr-identity" GROUP BY event_kind'
    ):
        by_kind[row[0]] = row[1]
    by_action = {}
    for row in conn.execute(
        'SELECT event_action, COUNT(*) FROM "ndr-identity" WHERE event_action IS NOT NULL GROUP BY event_action'
    ):
        by_action[row[0]] = row[1]
    alerts = {}
    for row in conn.execute(
        'SELECT alert_rule_id, COUNT(*) FROM "ndr-identity" WHERE alert_rule_id IS NOT NULL GROUP BY alert_rule_id'
    ):
        alerts[row[0]] = row[1]
    conn.close()
    return {
        "total_events": total,
        "by_dataset": by_dataset,
        "by_kind": by_kind,
        "by_action": by_action,
        "alert_rules_fired": alerts,
        "blueprint_version": BLUEPRINT_VERSION,
        "ecs_version": ECS_VERSION,
    }


if __name__ == "__main__":
    import sys

    _init_db()

    mode = sys.argv[1] if len(sys.argv) > 1 else "normal"

    if mode == "normal":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        events = run_normal_mode(count)
        print(f"[identity_eng] Normal mode: generated {len(events)} events")
        for ev in events:
            usr = ev.get("user", {}).get("name", "N/A")
            src = ev.get("source", {}).get("ip", "N/A")
            geo = ev.get("source", {}).get("geo", {}).get("country_name", "N/A")
            ds = ev["event"]["dataset"]
            kind = ev["event"]["kind"]
            action = ev["event"].get("action", "N/A")
            cid = ev.get("network", {}).get("community_id", "N/A")[:30]
            print(f"  {ds} | {kind} | {action} | user={usr} | src={src} ({geo}) | cid={cid}")

    elif mode == "alert" or mode == "alerts":
        test_id = sys.argv[2] if len(sys.argv) > 2 else None
        print(f"[identity_eng] Alert simulation mode (test_run_id={test_id})")
        events = run_alert_simulation(test_run_id=test_id)
        print(f"[identity_eng] Generated {len(events)} events ({sum(1 for e in events if e['event']['kind'] == 'alert')} alerts)")

    elif mode == "stats":
        stats = get_stats()
        print(json.dumps(stats, indent=2))

    else:
        print(f"Unknown mode: {mode}. Use: normal, alert, stats")
        sys.exit(1)
