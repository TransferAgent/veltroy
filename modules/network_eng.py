# AUDIT PASSED – Blueprint v1.2 Sprint 3
#!/usr/bin/env python3
"""
network_eng.py — Engineer 1 Module (Network Specialist)
Blueprint v1.2 | Phase Gate 0

Generates ECS 8.11.0-compliant mock network events and writes them
to the ndr-network table in the SQLite warehouse (data/ndr.db).

Modes:
  - Normal Traffic: randomised benign conn/dns/http events
  - C2 Beacon: 12 events at 60s intervals, jitter < 100ms, dst 198.51.100.42:443
  - Heartbeat: synthetic telemetry every 60s (zeek.ndr_heartbeat)
  - High Cardinality: flags hosts contacting > 15 unique dst IPs in 5min/60min

Spec sources:
  - specs/engineer1-technical-handover.md
  - specs/engineer1-ecs-sample.json
  - scripts/ndr-beacon-detection.zeek
  - scripts/ndr-high-cardinality.zeek
  - scripts/ndr-heartbeat.zeek
"""

import hashlib
import json
import math
import os
import random
import sqlite3
import struct
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

ECS_VERSION = "8.11.0"
BLUEPRINT_VERSION = "v1.2"
SENSOR_ID = "zeek-sensor-replit-01"

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ndr.db")

BEACON_DST_IP = "198.51.100.42"
BEACON_DST_PORT = 443
BEACON_COUNT = 12
BEACON_INTERVAL_SEC = 60
BEACON_JITTER_MAX_MS = 100
BEACON_MIN_CONNECTIONS = 10
BEACON_JITTER_THRESHOLD = 0.15

HIGH_CARD_THRESHOLD = 15
HIGH_CARD_WINDOW_5MIN = 300
HIGH_CARD_WINDOW_60MIN = 3600

HEARTBEAT_INTERVAL_SEC = 60
HEARTBEAT_DARK_TIMEOUT = 90
HEARTBEAT_DEGRADED_LOWER = 60
HEARTBEAT_DEGRADED_UPPER = 90
HEARTBEAT_LOW_PACKET_DROP_PCT = 0.50

_heartbeat_packet_history = []

DNS_DOMAINS_NORMAL = [
    "google.com", "office365.com", "github.com", "amazonaws.com",
    "cloudflare.com", "microsoft.com", "slack.com", "zoom.us",
    "api.internal.corp", "sso.corp.local", "mail.corp.local",
]
DNS_DOMAINS_SUSPICIOUS = [
    "telemetry.badactor.io", "c2-beacon-01.darkops.ru",
    "exfil.data-tunnel.cn", "ns1.malware-cdn.top",
    "update.trojan-downloader.xyz", "dga-generated-12849.net",
]
HTTP_PATHS_NORMAL = [
    "/api/v2/users", "/health", "/login", "/dashboard",
    "/assets/main.js", "/api/config", "/graphql", "/favicon.ico",
]
HTTP_PATHS_SUSPICIOUS = [
    "/c2/check-in", "/wp-admin/admin-ajax.php",
    "/cgi-bin/../../etc/passwd", "/shell.php", "/.env",
]
HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]
HTTP_STATUS_CODES = [200, 200, 200, 201, 301, 400, 401, 403, 404, 500]
CONN_PROTOCOLS = ["tcp", "udp"]
CONN_SERVICES = ["http", "https", "dns", "ssh", "rdp", "smtp", "ftp"]
DNS_QUERY_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT"]
DNS_RESPONSE_CODES = ["NOERROR", "NXDOMAIN", "SERVFAIL", "REFUSED"]
CONN_STATES = ["SF", "S0", "S1", "REJ", "RSTO", "RSTR", "SH", "SHR", "OTH"]

_tracker_5min: Dict[str, Dict[str, float]] = {}
_tracker_60min: Dict[str, Dict[str, float]] = {}
_port_tracker_5min: Dict[str, Dict[int, float]] = {}
_alert_cooldown: Dict[str, float] = {}
_heartbeat_seq = 0
_heartbeat_start = time.time()
_heartbeat_packet_count = 0


def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "ndr-network" (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            event_json TEXT NOT NULL,
            event_kind TEXT NOT NULL,
            event_dataset TEXT NOT NULL,
            source_ip TEXT,
            destination_ip TEXT,
            community_id TEXT,
            severity INTEGER DEFAULT 0,
            blueprint_version TEXT DEFAULT 'v1.2',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_network_dataset
        ON "ndr-network" (event_dataset)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_network_source_ip
        ON "ndr-network" (source_ip)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_ndr_network_timestamp
        ON "ndr-network" (timestamp)
    """)
    conn.commit()
    conn.close()


def _write_event(event: Dict[str, Any]):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO "ndr-network" '
        "(id, timestamp, event_json, event_kind, event_dataset, "
        "source_ip, destination_ip, community_id, severity, blueprint_version) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            event["id"],
            event["@timestamp"],
            json.dumps(event),
            event["event"]["kind"],
            event["event"]["dataset"],
            event.get("source", {}).get("ip"),
            event.get("destination", {}).get("ip"),
            event.get("network", {}).get("community_id"),
            event["event"].get("severity", 0),
            BLUEPRINT_VERSION,
        ),
    )
    conn.commit()
    conn.close()


def _write_events(events: List[Dict[str, Any]]):
    conn = sqlite3.connect(DB_PATH)
    for event in events:
        conn.execute(
            'INSERT OR REPLACE INTO "ndr-network" '
            "(id, timestamp, event_json, event_kind, event_dataset, "
            "source_ip, destination_ip, community_id, severity, blueprint_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                event["id"],
                event["@timestamp"],
                json.dumps(event),
                event["event"]["kind"],
                event["event"]["dataset"],
                event.get("source", {}).get("ip"),
                event.get("destination", {}).get("ip"),
                event.get("network", {}).get("community_id"),
                event["event"].get("severity", 0),
                BLUEPRINT_VERSION,
            ),
        )
    conn.commit()
    conn.close()


def _rand_internal_ip() -> str:
    return f"10.0.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _rand_external_ip() -> str:
    return f"{random.randint(11, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _rand_ip() -> str:
    return _rand_internal_ip() if random.random() < 0.6 else _rand_external_ip()


def _is_rfc1918(ip: str) -> bool:
    parts = list(map(int, ip.split(".")))
    if parts[0] == 10:
        return True
    if parts[0] == 172 and 16 <= parts[1] <= 31:
        return True
    if parts[0] == 192 and parts[1] == 168:
        return True
    return False


def compute_community_id(
    src_ip: str, src_port: int,
    dst_ip: str, dst_port: int,
    protocol: int = 6
) -> str:
    s_ip, s_port, d_ip, d_port = src_ip, src_port, dst_ip, dst_port
    if src_ip > dst_ip or (src_ip == dst_ip and src_port > dst_port):
        s_ip, s_port, d_ip, d_port = dst_ip, dst_port, src_ip, src_port

    seed = struct.pack("!H", 0)
    s_ip_bytes = bytes(map(int, s_ip.split(".")))
    d_ip_bytes = bytes(map(int, d_ip.split(".")))
    proto_bytes = struct.pack("BB", protocol, 0)
    s_port_bytes = struct.pack("!H", s_port)
    d_port_bytes = struct.pack("!H", d_port)

    data = seed + s_ip_bytes + d_ip_bytes + proto_bytes + s_port_bytes + d_port_bytes
    h = hashlib.sha1(data).digest()
    import base64
    b64 = base64.b64encode(h).decode("ascii")
    return f"1:{b64}"


def _zeek_uid() -> str:
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "C" + "".join(random.choice(chars) for _ in range(17))


def _protocol_number(proto: str) -> int:
    return {"tcp": 6, "udp": 17, "icmp": 1}.get(proto, 6)


def _direction(src_ip: str, dst_ip: str) -> str:
    src_int = _is_rfc1918(src_ip)
    dst_int = _is_rfc1918(dst_ip)
    if src_int and dst_int:
        return "internal"
    if src_int:
        return "egress"
    return "ingress"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
           f"{random.randint(0, 999):03d}Z"


def generate_conn_event(
    src_ip: Optional[str] = None,
    dst_ip: Optional[str] = None,
    dst_port: Optional[int] = None,
    force_alert: bool = False,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    is_alert = force_alert or random.random() < 0.2
    src = src_ip or (random.choice([_rand_internal_ip, _rand_ip])())
    dst = dst_ip or (random.choice([_rand_internal_ip, _rand_external_ip])())
    s_port = random.randint(1024, 65535)
    d_port = dst_port or random.choice([22, 80, 443, 53, 3389, 8080, 25, 3306, 5432, 445])
    proto = random.choice(CONN_PROTOCOLS)
    severity = random.randint(40, 100) if is_alert else random.randint(0, 30)
    ts = timestamp or _now_iso()
    uid = _zeek_uid()
    event_id = str(uuid.uuid4())
    dirn = _direction(src, dst)
    community_id = compute_community_id(src, s_port, dst, d_port, _protocol_number(proto))
    src_bytes = random.randint(64, 1048576)
    dst_bytes = random.randint(64, 1048576)
    src_packets = random.randint(1, 5000)
    dst_packets = random.randint(1, 5000)
    duration = random.randint(100, 300000000)

    event = {
        "id": event_id,
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "kind": "alert" if is_alert else "event",
            "category": "network",
            "type": "connection",
            "dataset": "zeek.conn",
            "duration": duration,
            "severity": severity,
        },
        "source": {
            "ip": src,
            "port": s_port,
            "bytes": src_bytes,
            "packets": src_packets,
        },
        "destination": {
            "ip": dst,
            "port": d_port,
            "bytes": dst_bytes,
            "packets": dst_packets,
        },
        "network": {
            "transport": proto,
            "protocol": random.choice(CONN_SERVICES) if proto == "tcp" else "dns",
            "community_id": community_id,
            "direction": dirn,
        },
        "zeek": {
            "session_id": uid,
            "conn_state": random.choice(CONN_STATES),
            "history": "ShADadFf",
        },
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "tier": "tier1_primary",
            "sensor": "zeek",
        },
    }

    if is_alert:
        event["event"]["risk_score"] = round(severity / 100 * 100, 1)

    return event


def generate_dns_event(
    src_ip: Optional[str] = None,
    domain: Optional[str] = None,
    force_suspicious: bool = False,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    is_suspicious = force_suspicious or random.random() < 0.15
    src = src_ip or _rand_internal_ip()
    dst = random.choice(["8.8.8.8", "8.8.4.4", "1.1.1.1"])
    s_port = random.randint(1024, 65535)
    ts = timestamp or _now_iso()
    uid = _zeek_uid()
    event_id = str(uuid.uuid4())
    query_domain = domain or (
        random.choice(DNS_DOMAINS_SUSPICIOUS) if is_suspicious
        else random.choice(DNS_DOMAINS_NORMAL)
    )
    query_type = random.choice(DNS_QUERY_TYPES)
    response_code = (
        random.choice(["NXDOMAIN", "SERVFAIL"]) if is_suspicious
        else random.choice(DNS_RESPONSE_CODES)
    )
    community_id = compute_community_id(src, s_port, dst, 53, 17)
    severity = random.randint(50, 90) if is_suspicious else random.randint(0, 20)

    event = {
        "id": event_id,
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "kind": "alert" if is_suspicious else "event",
            "category": "network",
            "type": "lookup",
            "dataset": "zeek.dns",
            "severity": severity,
        },
        "source": {"ip": src, "port": s_port},
        "destination": {"ip": dst, "port": 53},
        "dns": {
            "id": random.randint(10000, 65535),
            "op_code": "QUERY",
            "question": {"name": query_domain, "type": query_type, "class": "IN"},
            "answers": (
                [{"type": "A", "ttl": random.randint(30, 300),
                  "data": _rand_external_ip()}]
                if response_code == "NOERROR" else []
            ),
            "response_code": response_code,
        },
        "network": {
            "transport": "udp",
            "community_id": community_id,
            "direction": "egress",
        },
        "zeek": {"session_id": uid, "rejected": False},
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "tier": "tier1_primary",
            "sensor": "zeek",
        },
    }

    if is_suspicious:
        event["event"]["risk_score"] = round(severity / 100 * 100, 1)
        if random.random() < 0.5:
            event["labels"]["flag"] = "dga_candidate"
            event["labels"]["entropy_score"] = round(random.uniform(3.5, 5.0), 2)
        else:
            event["labels"]["flag"] = "idn_homograph_candidate"

    return event


def generate_http_event(
    src_ip: Optional[str] = None,
    force_suspicious: bool = False,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    is_suspicious = force_suspicious or random.random() < 0.15
    src = src_ip or _rand_internal_ip()
    dst = _rand_external_ip()
    s_port = random.randint(1024, 65535)
    d_port = random.choice([80, 443, 8080])
    ts = timestamp or _now_iso()
    uid = _zeek_uid()
    event_id = str(uuid.uuid4())
    method = random.choice(HTTP_METHODS)
    path = (
        random.choice(HTTP_PATHS_SUSPICIOUS) if is_suspicious
        else random.choice(HTTP_PATHS_NORMAL)
    )
    status_code = random.choice(HTTP_STATUS_CODES)
    domain = (
        random.choice(DNS_DOMAINS_SUSPICIOUS) if is_suspicious
        else random.choice(DNS_DOMAINS_NORMAL)
    )
    scheme = "https" if d_port == 443 else "http"
    community_id = compute_community_id(src, s_port, dst, d_port, 6)
    severity = random.randint(40, 90) if is_suspicious else random.randint(0, 20)

    event = {
        "id": event_id,
        "@timestamp": ts,
        "ecs": {"version": ECS_VERSION},
        "event": {
            "kind": "alert" if is_suspicious else "event",
            "category": "web",
            "type": "access",
            "dataset": "zeek.http",
            "severity": severity,
        },
        "source": {"ip": src, "port": s_port},
        "destination": {"ip": dst, "port": d_port},
        "http": {
            "request": {"method": method, "body": {"bytes": random.randint(0, 2048)}},
            "response": {"status_code": status_code, "body": {"bytes": random.randint(0, 65536)}},
            "version": "1.1",
        },
        "url": {
            "full": f"{scheme}://{domain}{path}",
            "domain": domain,
            "path": path,
            "scheme": scheme,
        },
        "user_agent": {
            "original": random.choice([
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Mozilla/5.0 (compatible; MSIE 9.0; WinNT)",
                "curl/7.85.0",
                "python-requests/2.28.0",
            ])
        },
        "network": {"community_id": community_id},
        "zeek": {
            "session_id": uid,
            "proxied": False,
            "tags": ["post_body_capture"] if method == "POST" else [],
        },
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "tier": "tier1_primary",
            "sensor": "zeek",
        },
    }

    if is_suspicious:
        event["event"]["risk_score"] = round(severity / 100 * 100, 1)
        if "curl" in event["user_agent"]["original"]:
            event["zeek"]["tags"].append("potential_tool_user_agent")

    return event


def generate_beacon_sequence(
    src_ip: Optional[str] = None,
    test_run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    src = src_ip or "10.0.1.45"
    events = []
    base_time = datetime.now(timezone.utc)
    intervals = []
    prev_time = None

    for i in range(BEACON_COUNT):
        jitter_ms = random.uniform(-BEACON_JITTER_MAX_MS, BEACON_JITTER_MAX_MS)
        offset = timedelta(seconds=BEACON_INTERVAL_SEC * i, milliseconds=jitter_ms)
        ts = base_time + offset
        ts_str = ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z"

        if prev_time is not None:
            intervals.append((ts - prev_time).total_seconds())
        prev_time = ts

        s_port = random.randint(1024, 65535)
        community_id = compute_community_id(
            src, s_port, BEACON_DST_IP, BEACON_DST_PORT, 6
        )
        uid = _zeek_uid()
        event_id = str(uuid.uuid4())

        event = {
            "id": event_id,
            "@timestamp": ts_str,
            "ecs": {"version": ECS_VERSION},
            "event": {
                "kind": "event",
                "category": "network",
                "type": "connection",
                "dataset": "zeek.conn",
                "duration": random.randint(1000000, 5000000),
                "severity": 10,
            },
            "source": {
                "ip": src,
                "port": s_port,
                "bytes": random.randint(200, 800),
                "packets": random.randint(3, 8),
            },
            "destination": {
                "ip": BEACON_DST_IP,
                "port": BEACON_DST_PORT,
                "bytes": random.randint(100, 400),
                "packets": random.randint(3, 8),
            },
            "network": {
                "transport": "tcp",
                "protocol": "ssl",
                "community_id": community_id,
                "direction": "egress",
            },
            "zeek": {
                "session_id": uid,
                "conn_state": "SF",
                "history": "ShADadFf",
            },
            "labels": {
                "blueprint_version": BLUEPRINT_VERSION,
                "tier": "tier1_primary",
                "sensor": "zeek",
            },
        }

        if test_run_id:
            event["labels"]["test_run_id"] = test_run_id

        events.append(event)

    if len(intervals) >= BEACON_MIN_CONNECTIONS - 1:
        mean_interval = sum(intervals) / len(intervals)
        variance = sum((x - mean_interval) ** 2 for x in intervals) / len(intervals)
        stddev = math.sqrt(variance)
        jitter_score = stddev / mean_interval if mean_interval > 0 else 0
        risk_score = (1.0 - jitter_score) * 100.0

        beacon_alert = {
            "id": str(uuid.uuid4()),
            "@timestamp": _now_iso(),
            "ecs": {"version": ECS_VERSION},
            "event": {
                "kind": "alert",
                "category": "intrusion_detection",
                "type": "indicator",
                "dataset": "zeek.ndr_beacon",
                "risk_score": round(risk_score, 1),
                "severity": 91,
            },
            "source": {"ip": src},
            "destination": {"ip": BEACON_DST_IP, "port": BEACON_DST_PORT},
            "zeek": {
                "ndr_beacon": {
                    "connection_count": BEACON_COUNT,
                    "avg_interval_sec": round(mean_interval, 2),
                    "jitter_score": round(jitter_score, 4),
                    "risk_score": round(risk_score, 1),
                }
            },
            "network": {
                "community_id": compute_community_id(
                    src, 0, BEACON_DST_IP, BEACON_DST_PORT, 6
                ),
            },
            "labels": {
                "blueprint_version": BLUEPRINT_VERSION,
                "tier": "tier1_behavioral",
                "sensor": "zeek",
                "signal_type": "beacon_detected",
            },
        }
        if test_run_id:
            beacon_alert["labels"]["test_run_id"] = test_run_id
        events.append(beacon_alert)

    return events


def generate_heartbeat_event(status: str = "ALIVE", degraded_reason: Optional[str] = None) -> Dict[str, Any]:
    global _heartbeat_seq, _heartbeat_start, _heartbeat_packet_count, _heartbeat_packet_history
    _heartbeat_seq += 1
    uptime = time.time() - _heartbeat_start

    severity_map = {"ALIVE": 0, "DEGRADED": 55, "DARK": 100}
    event_kind = "event" if status == "ALIVE" else "alert"
    event_type = "info" if status != "DEGRADED" else "DEGRADED"
    dataset = "ndr.sensor_health" if status == "DEGRADED" else "zeek.ndr_heartbeat"

    _heartbeat_packet_history.append(_heartbeat_packet_count)
    if len(_heartbeat_packet_history) > 4:
        _heartbeat_packet_history = _heartbeat_packet_history[-4:]

    event = {
        "id": str(uuid.uuid4()),
        "@timestamp": _now_iso(),
        "ecs": {"version": ECS_VERSION},
        "event": {
            "kind": event_kind,
            "category": "process",
            "type": event_type,
            "dataset": dataset,
            "severity": severity_map.get(status, 100),
            "risk_score": severity_map.get(status, 100),
        },
        "source": {"ip": "127.0.0.1", "port": 0},
        "destination": {"ip": "127.0.0.1", "port": 0},
        "network": {
            "community_id": compute_community_id("127.0.0.1", 0, "127.0.0.1", 0, 6),
        },
        "zeek": {
            "ndr_heartbeat": {
                "sensor_id": SENSOR_ID,
                "sensor_host": "replit-ndr-01",
                "sequence_number": _heartbeat_seq,
                "status": status,
                "uptime_seconds": round(uptime, 1),
                "packets_processed": _heartbeat_packet_count,
                "auto_restart_eligible": True,
                "restart_command": "/opt/zeek/bin/zeekctl restart",
            }
        },
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "tier": "infrastructure",
            "sensor": "zeek",
            "heartbeat_status": status,
        },
    }

    if status == "DEGRADED" and degraded_reason:
        event["labels"]["degraded_reason"] = degraded_reason

    return event


def generate_shutdown_heartbeat() -> Dict[str, Any]:
    event = generate_heartbeat_event(status="DARK")
    event["event"]["type"] = "SHUTDOWN"
    event["zeek"]["ndr_heartbeat"]["status"] = "SHUTDOWN"
    event["labels"]["heartbeat_status"] = "SHUTDOWN"
    return event


def generate_degraded_heartbeat(sensor_id: str = SENSOR_ID, degraded_reason: str = "LATE_HEARTBEAT") -> Dict[str, Any]:
    event = generate_heartbeat_event(status="DEGRADED", degraded_reason=degraded_reason)
    event["zeek"]["ndr_heartbeat"]["sensor_id"] = sensor_id
    return event


def _check_high_cardinality(src_ip: str, dst_ip: str, dst_port: int = 0) -> Optional[Dict[str, Any]]:
    global _heartbeat_packet_count
    _heartbeat_packet_count += 1

    now = time.time()

    if src_ip not in _tracker_5min:
        _tracker_5min[src_ip] = {}
    _tracker_5min[src_ip][dst_ip] = now

    if src_ip not in _port_tracker_5min:
        _port_tracker_5min[src_ip] = {}
    _port_tracker_5min[src_ip][dst_port] = now

    expired_5 = [k for k, v in _tracker_5min.get(src_ip, {}).items() if now - v > HIGH_CARD_WINDOW_5MIN]
    for k in expired_5:
        del _tracker_5min[src_ip][k]

    expired_p5 = [k for k, v in _port_tracker_5min.get(src_ip, {}).items() if now - v > HIGH_CARD_WINDOW_5MIN]
    for k in expired_p5:
        del _port_tracker_5min[src_ip][k]

    if src_ip not in _tracker_60min:
        _tracker_60min[src_ip] = {}
    _tracker_60min[src_ip][dst_ip] = now

    expired_60 = [k for k, v in _tracker_60min.get(src_ip, {}).items() if now - v > HIGH_CARD_WINDOW_60MIN]
    for k in expired_60:
        del _tracker_60min[src_ip][k]

    unique_5 = len(_tracker_5min.get(src_ip, {}))
    unique_60 = len(_tracker_60min.get(src_ip, {}))
    unique_ports = len(_port_tracker_5min.get(src_ip, {}))

    alert = None

    if unique_5 > HIGH_CARD_THRESHOLD:
        cooldown_key = f"{src_ip}|{HIGH_CARD_WINDOW_5MIN}"
        if cooldown_key not in _alert_cooldown or (now - _alert_cooldown[cooldown_key]) > HIGH_CARD_WINDOW_5MIN:
            _alert_cooldown[cooldown_key] = now
            dst_set = list(_tracker_5min[src_ip].keys())[:10]
            alert = _build_high_card_alert(src_ip, unique_5, unique_ports, dst_set, HIGH_CARD_WINDOW_5MIN)
    elif unique_60 > HIGH_CARD_THRESHOLD:
        cooldown_key = f"{src_ip}|{HIGH_CARD_WINDOW_60MIN}"
        if cooldown_key not in _alert_cooldown or (now - _alert_cooldown[cooldown_key]) > HIGH_CARD_WINDOW_60MIN:
            _alert_cooldown[cooldown_key] = now
            dst_set = list(_tracker_60min[src_ip].keys())[:10]
            alert = _build_high_card_alert(src_ip, unique_60, unique_ports, dst_set, HIGH_CARD_WINDOW_60MIN)

    return alert


def _build_high_card_alert(
    src_ip: str, unique_count: int, unique_ports: int, sample_ips: List[str], window: int
) -> Dict[str, Any]:
    is_internal = _is_rfc1918(src_ip)
    base_score = min((unique_count / 100.0) * 100.0, 100.0)
    if is_internal:
        base_score = min(base_score * 1.2, 100.0)

    if unique_ports > 50:
        detection_class = "port_scan"
    elif unique_count > 30 and unique_ports <= 5:
        detection_class = "c2_fanout"
    elif unique_count > 15 and is_internal:
        detection_class = "lateral_movement"
    else:
        detection_class = "high_cardinality"

    return {
        "id": str(uuid.uuid4()),
        "@timestamp": _now_iso(),
        "ecs": {"version": ECS_VERSION},
        "event": {
            "kind": "alert",
            "category": "intrusion_detection",
            "type": "indicator",
            "dataset": "zeek.ndr_high_cardinality",
            "severity": int(base_score),
            "risk_score": round(base_score, 1),
        },
        "source": {"ip": src_ip, "port": 0},
        "destination": {"ip": sample_ips[0] if sample_ips else "0.0.0.0", "port": 0},
        "network": {
            "community_id": compute_community_id(src_ip, 0, sample_ips[0] if sample_ips else "0.0.0.0", 0, 6),
        },
        "zeek": {
            "ndr_high_cardinality": {
                "unique_dst_count": unique_count,
                "unique_dst_ports": unique_ports,
                "window_seconds": window,
                "sample_dst_ips": sample_ips,
                "detection_class": detection_class,
                "risk_score": round(base_score, 1),
            }
        },
        "labels": {
            "blueprint_version": BLUEPRINT_VERSION,
            "tier": "tier1_behavioral",
            "sensor": "zeek",
            "signal_type": "high_cardinality_conn",
        },
    }


def generate_normal_traffic(count: int = 10) -> List[Dict[str, Any]]:
    events = []
    for _ in range(count):
        roll = random.random()
        if roll < 0.4:
            ev = generate_conn_event()
        elif roll < 0.7:
            ev = generate_dns_event()
        else:
            ev = generate_http_event()
        events.append(ev)

        src_ip = ev.get("source", {}).get("ip", "")
        dst_ip = ev.get("destination", {}).get("ip", "")
        dst_port = ev.get("destination", {}).get("port", 0)
        if src_ip and dst_ip:
            card_alert = _check_high_cardinality(src_ip, dst_ip, dst_port)
            if card_alert:
                events.append(card_alert)

    return events


def run_normal_mode(count: int = 10) -> List[Dict[str, Any]]:
    _init_db()
    events = generate_normal_traffic(count)
    _write_events(events)
    return events


def run_beacon_mode(
    src_ip: Optional[str] = None,
    test_run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    _init_db()
    events = generate_beacon_sequence(src_ip=src_ip, test_run_id=test_run_id)
    _write_events(events)
    return events


def run_heartbeat() -> Dict[str, Any]:
    _init_db()
    event = generate_heartbeat_event()
    _write_event(event)
    return event


def get_event_count() -> int:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute('SELECT COUNT(*) FROM "ndr-network"')
    count = cursor.fetchone()[0]
    conn.close()
    return count


def get_events_by_dataset(dataset: str, limit: int = 50) -> List[Dict[str, Any]]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(
        'SELECT event_json FROM "ndr-network" WHERE event_dataset = ? '
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
        'SELECT event_json FROM "ndr-network" ORDER BY timestamp DESC LIMIT ?',
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]


def get_stats() -> Dict[str, Any]:
    _init_db()
    conn = sqlite3.connect(DB_PATH)
    total = conn.execute('SELECT COUNT(*) FROM "ndr-network"').fetchone()[0]
    by_dataset = {}
    for row in conn.execute(
        'SELECT event_dataset, COUNT(*) FROM "ndr-network" GROUP BY event_dataset'
    ):
        by_dataset[row[0]] = row[1]
    by_kind = {}
    for row in conn.execute(
        'SELECT event_kind, COUNT(*) FROM "ndr-network" GROUP BY event_kind'
    ):
        by_kind[row[0]] = row[1]
    conn.close()
    return {
        "total_events": total,
        "by_dataset": by_dataset,
        "by_kind": by_kind,
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
        print(f"[network_eng] Normal mode: generated {len(events)} events")
        for ev in events:
            print(f"  {ev['event']['dataset']} | {ev['event']['kind']} | {ev['source']['ip']} → {ev['destination']['ip']} | community_id={ev.get('network', {}).get('community_id', 'N/A')}")

    elif mode == "beacon":
        src = sys.argv[2] if len(sys.argv) > 2 else None
        test_id = sys.argv[3] if len(sys.argv) > 3 else None
        events = run_beacon_mode(src_ip=src, test_run_id=test_id)
        print(f"[network_eng] Beacon mode: generated {len(events)} events (12 conn + beacon alert)")
        for ev in events:
            print(f"  {ev['event']['dataset']} | {ev['event']['kind']} | {ev.get('source', {}).get('ip', 'N/A')} → {ev.get('destination', {}).get('ip', 'N/A')}")

    elif mode == "heartbeat":
        ev = run_heartbeat()
        print(f"[network_eng] Heartbeat: seq={ev['zeek']['ndr_heartbeat']['sequence_number']} status={ev['zeek']['ndr_heartbeat']['status']}")

    elif mode == "stats":
        stats = get_stats()
        print(json.dumps(stats, indent=2))

    else:
        print(f"Unknown mode: {mode}. Use: normal, beacon, heartbeat, stats")
        sys.exit(1)
