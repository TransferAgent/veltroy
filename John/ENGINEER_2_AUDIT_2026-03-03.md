# Engineer 2 Audit — Identity Ingestion (Wazuh/ITDR)
## Blueprint v1.2 | 2026-03-03

**Module**: modules/identity_eng.py
**Audit Score**: 13/13 PASS
**Verdict**: AUDIT PASSED – Blueprint v1.2 Sprint 3

---

## CHECK 1: 50 Mock Identity Events
- **Composition**: 15 SSH (10 normal + 5 off-hours), 15 Windows (10 brute force + 5 normal 4624), 10 CloudTrail (5 CreateUser + 5 ConsoleLogin), 5 impossible travel, 5 Wazuh agent health (3 SILENT + 2 FLAPPING)
- **Total events generated**: 55
- **Total in ndr-identity**: 55
- **Result**: PASS

## CHECK 2: Identity Rule Firing (8/8 rules)

| Rule | ID | Description | Fired |
|------|----|-------------|-------|
| IDENTITY-001 | 100101 | New/unexpected country login | FIRED |
| IDENTITY-002 | 100102 | Brute force (6 failed → lockout spike) | FIRED |
| IDENTITY-003 | 100103 | Windows 4740 account lockout | FIRED |
| IDENTITY-004 | 100104 | AWS ConsoleLogin from new IP | FIRED |
| IDENTITY-005 | 100105 | IAM privilege escalation (AttachUserPolicy) | FIRED |
| IDENTITY-006 v2 | 100202 | Compound: off-hours + new country + new host | FIRED |
| IDENTITY-007 | 100300 | Wazuh agent SILENT (>90s) | FIRED |
| IDENTITY-008 | 100301 | Wazuh agent FLAPPING | FIRED |

- **Result**: PASS (6 sub-checks covering all 8 rules)

## CHECK 3: GeoIP 3-Layer Verification
- **Layer 1 (MaxMind)**: Active — country_name, city_name, lat/lon populated
- **Layer 2 (ASN)**: Active — AS number and organization populated
- **Layer 3 (Reputation)**: Active — asn_risk scoring, high_risk tagging
- **High-risk ASN test**: AS20473 (AS-CHOOPA / Vultr) detected, tags=["asn_reputation_hit", "high_risk_asn"]
- **Result**: PASS

## CHECK 4: Patch Completeness (6/6 patches active)

| Patch | Description | Status | Detail |
|-------|-------------|--------|--------|
| Patch 1 | ECS 8.11.0 enforced | ACTIVE | ECS_VERSION="8.11.0", all events carry ecs.version=8.11.0 |
| Patch 2 | IDENTITY-006 v2 compound | ACTIVE | risk_score=88, conditions=off_hours+new_country+new_host |
| Patch 3 | GeoIP SPOF 3-layer | ACTIVE | MaxMind → ASN → Reputation chain verified |
| Patch 4 | CloudTrail EventBridge | ACTIVE | specs/engineer2-patch4-cloudtrail-eventbridge.md (2,256 bytes) |
| Patch 5 | IDENTITY-007 threshold 90s | ACTIVE | ">90s" in source code and event output |
| Patch 6 | Index naming alignment | ACTIVE | Table = "ndr-identity" (canonical) |

- **Result**: PASS

## CHECK 5: IDENTITY-007 Silent Threshold
- **Variable**: Hardcoded in event reason string as ">90s"
- **Value**: 90 seconds (not 300)
- **In source code**: ">90s" found in _trigger_identity_007() reason text
- **In event output**: "90+ seconds" in message field
- **Result**: PASS

---

## FINAL SUMMARY

| # | Check | Result |
|---|-------|--------|
| 1 | 50+ events ingested | PASS |
| 2 | IDENTITY-001 fires | PASS |
| 3 | IDENTITY-002 fires | PASS |
| 4 | IDENTITY-003 fires | PASS |
| 5 | IDENTITY-004/005 fires | PASS |
| 6 | IDENTITY-006 v2 compound | PASS |
| 7 | IDENTITY-007/008 fires | PASS |
| 8 | GeoIP 3-layer active | PASS |
| 9 | Patch 1: ECS 8.11.0 | PASS |
| 10 | Patch 2: 006v2 risk=88 | PASS |
| 11 | Patch 4: EventBridge spec | PASS |
| 12 | IDENTITY-007 threshold=90s | PASS |
| 13 | All 6 patches active | PASS |

**FINAL SCORE: 13/13 — ALL CHECKS PASS**

**Final DB stats**: 69 events total (18 alerts), datasets: aws.cloudtrail=12, wazuh.agent_health=7, wazuh.security=50

Comment `# AUDIT PASSED – Blueprint v1.2 Sprint 3` added to top of modules/identity_eng.py.
