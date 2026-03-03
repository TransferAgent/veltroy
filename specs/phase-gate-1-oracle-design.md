# Phase Gate 1 Oracle — Design Specification

**Blueprint v1.2 | Architect AI | Sprint 3 Deliverable**

**Target Stage: PRODUCTION (OpenSearch + RDS PostgreSQL + Live AWS)**

**Script to be built: oracle/ndr_phase_gate_1_oracle_v1.py**

**Author when built: Engineer 3**

---

## Prerequisites Before Running Phase Gate 1

- [ ] DEPLOYMENT_STAGE = PRODUCTION (not LAB)
- [ ] oracle/lab_adapter.py is ABSENT or disabled
- [ ] OpenSearch domain ndr-prod is live and reachable
- [ ] RDS PostgreSQL schema `ndr` is provisioned
- [ ] All 4 index templates applied to OpenSearch
- [ ] Live Wazuh agents sending events
- [ ] Live CloudTrail feeding ndr-identity pipeline
- [ ] KL-001/002 have live AWS SG and IAM targets configured
- [ ] Flask Bus running on production port (App Runner)

---

## Pass Conditions (PC1–PC12)

### PC1 — OpenSearch Connectivity

- Query all four production indices: ndr-network-*, ndr-identity-*, 
  ndr-correlated-*, ndr-dlq-*
- PASS: All four return HTTP 200 and record count > 0
- FAIL: Any index unreachable or empty after 5-minute data soak

### PC2 — Live Data Ingestion (Not Synthetic)

- Confirm network records contain real source.ip values 
  (not 10.0.0.x LAB addresses)
- Confirm identity records contain real @timestamp within last 300s
- PASS: >= 10 live network records and >= 5 live identity records
- FAIL: Only synthetic/seeded data present

### PC3 — All 5 Sigma Rules Fire on Live Traffic

- Run POST /run against live data
- PASS: All 5 rules (C2_BEACON, LATERAL_MOVE, BRUTE_FORCE_SUCCESS,
  SUSPICIOUS_IAM_KEY_ROTATION, HOST_CARDINALITY_SPIKE) appear 
  in ndr-correlated-* within one pipeline cycle
- FAIL: Any Sigma rule produces zero hits after 3 consecutive runs
- Note: C2_BEACON and LATERAL_MOVE may require seeded traffic 
  in controlled production test window

### PC4 — Kinetic Playbooks Execute Against Live AWS Resources

- KL-001: SG isolation rule must be applied to a real EC2 Security Group
- KL-002: IAM key must be deactivated via real AWS IAM API call
- KL-003/004/005: Must emit real state-machine transitions to ndr-correlated
- KL-006: Ticket must land in RDS PostgreSQL ndr.tickets table (not SQLite)
- PASS: At least KL-001 and KL-002 confirm live AWS API responses (not mocked)
- FAIL: Any kinetic action returns a simulated/stub response

### PC5 — All KL-001–006 SLAs Met Under Production Load

- Run POST /run 3 consecutive times
- PASS: All playbook SLA targets met on all 3 runs
  (KL-001/002/003/004/005 < 30s, KL-006 < 30s)
- FAIL: Any single SLA breach on any run

### PC6 — SOAR Tickets in RDS PostgreSQL

- After POST /run, query RDS PostgreSQL: 
  SELECT COUNT(*) FROM ndr.tickets WHERE ticket_source='SOAR_AUTO'
- Confirm tenant_id field is populated (not null or 'default')
- PASS: >= 1 ticket present with real tenant_id
- FAIL: Tickets in SQLite only, or tenant_id = 'default'

### PC7 — DLQ Watcher NOMINAL on Live Data

- GET /dlq/health must return dlq_status=NOMINAL
- dlq_unexpected_count must equal 0 on clean live data
- PASS: NOMINAL confirmed, no unexpected records flagged
- FAIL: WARNING or CRITICAL_DLQ_SPIKE on clean production data

### PC8 — DEGRADED Heartbeat on Real Sensor Data

- Confirm generate_degraded_heartbeat() fires when a live Wazuh 
  agent misses its 60s heartbeat window
- PASS: DEGRADED event appears in ndr-network with correct 
  degraded_reason within 90s of agent silence
- FAIL: No DEGRADED event; state jumps directly ALIVE → DARK

### PC9 — Tenant Isolation (Multi-Tenancy)

- With >= 2 tenants provisioned, confirm tenant A cannot query 
  tenant B's records in ndr-correlated
- PASS: OpenSearch index-level or document-level isolation 
  enforced; cross-tenant query returns 0 results
- FAIL: Cross-tenant data leak detected
- Note: If only 1 tenant at Phase Gate 1 time, stub this PC 
  with tenant_id field verification only (defer full isolation 
  test to Phase Gate 2)

### PC10 — Adaptive Temporal Windows on Live Data

- Confirm ndr-correlated records contain fields:
  correlation_confidence, correlation_window_used, 
  method=source_ip_join_adaptive
- Confirm at least one record shows HIGH confidence
- PASS: All three fields present on >= 80% of correlated records
- FAIL: Fields missing or method reverted to static

### PC11 — lab_adapter.py ABSENT

- Confirm oracle/lab_adapter.py is not imported anywhere 
  in the production codebase
- Confirm DEPLOYMENT_STAGE = PRODUCTION in environment
- PASS: grep for lab_adapter returns zero results in active code
- FAIL: lab_adapter still imported or DEPLOYMENT_STAGE = LAB

### PC12 — Audit Trail Integrity (HMAC)

- After POST /run, confirm all kinetic action records in 
  RDS PostgreSQL ndr.audit_log have non-null hmac_signature 
  (64-char HMAC-SHA256)
- PASS: 100% of audit records have valid HMAC signatures
- FAIL: Any audit record missing or malformed signature

---

## Scoring

- 12/12 PASS = Phase Gate 1 CLEARED → DEPLOYMENT_STAGE = PRODUCTION
- 11/12 PASS = Conditional PASS (PC9 stub only acceptable)
- < 11/12 = FAIL → Remediate and rerun

---

## Version

Blueprint v1.2 | Phase Gate 1 Design | Sprint 3

Oracle script to be authored by Engineer 3 in Sprint 4
