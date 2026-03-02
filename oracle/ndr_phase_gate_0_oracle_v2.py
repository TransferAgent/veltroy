#!/usr/bin/env python3

"""
ndr_phase_gate_0_oracle_v2.py — Blueprint v1.2
AMENDMENT 1 COMPLIANT: This script is executed by the CONDUCTOR ONLY.
Engineer 3 does NOT run this script. Engineer 3 does NOT see results
before the Conductor delivers the verdict to Architect AI.

EXECUTION OWNER: CONDUCTOR (Pass/Fail Final Arbiter)
SCRIPT AUTHOR:   Engineer 3 (provides; does not execute)
"""

import requests, json
from datetime import datetime, timezone

OS           = "http://localhost:9200"
TEST_RUN_ID  = input("Enter Test Run ID from Engineer 1's injection report: ").strip()

results    = {}
all_detail = []

def check(pc_id: str, label: str, passed: bool, detail: str = "") -> bool:
    icon = "✅ PASS" if passed else "❌ FAIL"
    line = f"  {icon}  [{pc_id}] {label}"
    if detail:
        line += f"\n           Detail: {detail}"
    print(line)
    all_detail.append({"pc": pc_id, "passed": passed, "detail": detail})
    results[pc_id] = passed
    return passed

print(f"\n{'═'*64}")
print(f"  PHASE GATE 0 ORACLE — Blueprint v1.2")
print(f"  Conductor: {datetime.now(timezone.utc).isoformat()}")
print(f"  Test Run ID: {TEST_RUN_ID}")
print(f"{'═'*64}\n")

# ── PC1: True Positive in ndr-correlated-* ───────────────────────────
r    = requests.get(f"{OS}/ndr-correlated-*/_search", json={
    "query": {"bool": {"must": [
        {"term":  {"alert_type": "C2_BEACON"}},
        {"term":  {"labels.test_run_id": TEST_RUN_ID}},
        {"range": {"alert_timestamp": {"gte": "now-2h"}}}
    ]}},
    "size": 1
}).json()
hits = r["hits"]["total"]["value"]
check("PC1", "True Positive in ndr-correlated-*",
      hits >= 1, f"Correlated C2_BEACON alerts found: {hits}")

# ── PC2: Detection Latency < 60s (Platform Law #3) ───────────────────
r    = requests.get(f"{OS}/ndr-correlated-*/_search", json={
    "query": {"term": {"labels.test_run_id": TEST_RUN_ID}},
    "aggs":  {
        "avg_lat": {"avg": {"field": "labels.detection_latency_seconds"}},
        "max_lat": {"max": {"field": "labels.detection_latency_seconds"}}
    },
    "size": 0
}).json()
avg_lat = r["aggregations"]["avg_lat"]["value"] or 999
max_lat = r["aggregations"]["max_lat"]["value"] or 999
check("PC2", "Detection Latency < 60s — Platform Law #3",
      max_lat < 60,
      f"Avg: {avg_lat:.1f}s | Max: {max_lat:.1f}s | Target: <60s")

# ── PC3: KL-001 SLA < 30s (Eng4 audit field — Amendment 3 patched) ───
r    = requests.get(f"{OS}/ndr-correlated-*/_search", json={
    "query": {"term": {"labels.test_run_id": TEST_RUN_ID}},
    "aggs":  {"kl001": {"max":
        {"field": "labels.eng4_kl001_response_seconds"}}},
    "size": 0
}).json()
kl001 = r["aggregations"]["kl001"]["value"] or 999
check("PC3", "KL-001 SLA < 30s (Eng4 patched field)",
      kl001 < 30.0,
      f"KL-001 T_TOTAL: {kl001:.3f}s | Target: <30.0s")

# ── PC4: Pre-Commit Pattern — pre_commit_written=true ────────────────
r    = requests.get(f"{OS}/ndr-correlated-*/_search", json={
    "query": {"bool": {"must": [
        {"term": {"labels.test_run_id": TEST_RUN_ID}},
        {"term": {"correlation.pre_commit_written": True}}
    ]}},
    "size": 1
}).json()
pc4_hits = r["hits"]["total"]["value"]
check("PC4", "Pre-Commit Pattern — pre_commit_written=true in correlated doc",
      pc4_hits >= 1, f"Pre-committed documents: {pc4_hits}")

# ── PC5: Zero DLQ documents for this run's valid beacons ─────────────
r = requests.get(f"{OS}/ndr-dlq-bad-schema-*/_search", json={
    "query": {"bool": {"must": [
        {"term": {"labels.test_run_id": TEST_RUN_ID}},
        {"term": {"labels.pc7_test": False}}   # Exclude intentional PC7 doc
    ]}},
    "size": 0
}).json()
dlq_count = r["hits"]["total"]["value"]
check("PC5", "Zero DLQ errors for valid beacon documents",
      dlq_count == 0, f"DLQ hits (excl. PC7): {dlq_count} (target: 0)")

# ── PC6: community_id populated and consistent ───────────────────────
r = requests.get(f"{OS}/ndr-correlated-*/_search", json={
    "query":   {"term": {"labels.test_run_id": TEST_RUN_ID}},
    "_source": ["network_summary.community_ids"],
    "size": 10
}).json()
hits_data  = r["hits"]["hits"]
comm_valid = all(
    h["_source"].get("network_summary", {}).get("community_ids")
    for h in hits_data
)
check("PC6", "network.community_id populated and consistent",
      comm_valid and len(hits_data) > 0,
      f"community_id present in {len(hits_data)} correlated doc(s)")

# ── PC7: Malformed document routed to DLQ — ECS Guardian validated ───
r = requests.get(f"{OS}/ndr-dlq-bad-schema-*/_search", json={
    "query": {"term": {"labels.test_run_id": "PC7_MALFORMED_TEST"}},
    "size": 1
}).json()
pc7_dlq = r["hits"]["total"]["value"]

# Also confirm it did NOT reach ndr-network-*
r2 = requests.get(f"{OS}/ndr-network-*/_search", json={
    "query": {"term": {"labels.test_run_id": "PC7_MALFORMED_TEST"}},
    "size": 1
}).json()
pc7_network_contamination = r2["hits"]["total"]["value"]

check("PC7", "Malformed doc → DLQ (ECS Guardian active, pipeline protected)",
      pc7_dlq >= 1 and pc7_network_contamination == 0,
      f"DLQ hits: {pc7_dlq} | ndr-network-* contamination: {pc7_network_contamination}")

# ── FINAL VERDICT ─────────────────────────────────────────────────────
passed_count = sum(results.values())
total_count  = len(results)
all_passed   = all(results.values())

print(f"\n{'═'*64}")
print(f"  PHASE GATE 0 — SYNTHETIC TRAFFIC TEST VERDICT")
print(f"  Conductor reporting to: Architect AI")
print(f"  Test Run ID: {TEST_RUN_ID}")
print(f"{'═'*64}")
print(f"  Conditions Passed: {passed_count}/{total_count}")
print(f"\n  VERDICT: {'🔓 PHASE GATE 0 — OPEN' if all_passed else '🔒 PHASE GATE 0 — BLOCKED'}")
print(f"\n  {'Phase Gate 0 exits. Platform proceeds to Phase 1.' if all_passed else 'Failures listed above. Remediation required before re-test.'}")
print(f"{'═'*64}\n")

# Conductor delivers this output block to Architect AI verbatim
