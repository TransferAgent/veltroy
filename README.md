# NDR Platform — Phase Gate 0

**AI-Driven Network Detection and Response**
Blueprint v1.2 | ECS 8.11.0 Compliant | Sub-60s Detection-to-Response SLA

---

## What This Is

A fully functional NDR (Network Detection and Response) platform prototype built with four specialist AI engineer modules. The platform ingests network traffic and identity logs, correlates threats using Sigma rules and MITRE ATT&CK mapping, and executes automated containment responses — all within a sub-60-second end-to-end SLA.

Phase Gate 0 has been cleared: **7/7 pass conditions verified by the Conductor Oracle on March 2, 2026.**

---

## Architecture

```
                        ┌──────────────────────────┐
                        │     React Dashboard      │
                        │   (TypeScript, Port 5000) │
                        └────────────┬─────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │   Express.js Backend     │
                        │   (TypeScript Engines)    │
                        └────────────┬─────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                        Flask Bus (Port 8000)                           │
│                    POST /run  |  GET /stats  |  GET /health            │
│                             main.py                                    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │   glue/correlator.py     │
                        │   (Thin Bus Wire)         │
                        └────────────┬─────────────┘
                                     │
          ┌──────────────┬───────────┼───────────┬──────────────┐
          ▼              ▼           ▼           ▼              ▼
   ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐
   │ Engineer 1  │ │Engineer 2│ │Engineer 3│ │Engineer 4│ │  DLQ   │
   │ Network/Zeek│ │ Identity │ │  Brain   │ │ Kinetic  │ │ (Bad   │
   │ network_eng │ │ ident_eng│ │detect_eng│ │kinet_eng │ │Schema) │
   └──────┬──────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘
          ▼              ▼           ▼           ▼           ▼
      ndr-network   ndr-identity  ndr-correlated  ndr-kinetic  ndr-dlq
                        └────────────┴───────────┘
                              SQLite: data/ndr.db
```

---

## Engineer Modules

### Engineer 1 — Network Metadata (The Eyes)
**File:** `modules/network_eng.py` (853 lines)

Zeek traffic simulator generating ECS 8.11.0 compliant network events.

- **Event types:** `conn.log`, `dns.log`, `http.log`
- **Modes:** Normal (randomized benign), Beacon (12 events @ 60s intervals, jitter <100ms), Heartbeat, High-Cardinality (>15 unique destinations)
- **Key features:** `network.community_id` computation (SHA-1 based), RFC-1918 direction heuristic, full ECS field population
- **Output:** `ndr-network` table

### Engineer 2 — Identity Logs (The Ears)
**File:** `modules/identity_eng.py` (950 lines)

Wazuh and CloudTrail simulator generating identity and authentication events.

- **Event types:** Linux SSH (wazuh.security), Windows (4624/4625/4720/4740/7045), AWS CloudTrail (ConsoleLogin/AssumeRole/CreateUser/AttachUserPolicy)
- **Alert rules:** 6 IDENTITY alert rules (001-006), including compound rule 006v2 (off-hours AND new country AND new host)
- **Key features:** Three-layer GeoIP enrichment, Wazuh rule.level severity scaling
- **Output:** `ndr-identity` table

### Engineer 3 — Data Correlation (The Brain)
**File:** `modules/detection_eng.py` (1,029 lines)

The core intelligence layer. Runs a 5-operation sequential pipeline:

| Operation | Function | Description |
|-----------|----------|-------------|
| 1 | ECS Guardian | Validates all documents against ECS 8.11.0. Rejects non-compliant docs to `ndr-dlq` |
| 2 | Network-Identity JOIN | Correlates events on `source.ip` within a +/-5 minute time window |
| 3 | Sigma Rule Evaluation | Evaluates 5 production Sigma rules against correlated data |
| 4 | Pre-Commit Pattern | Writes to `ndr-correlated` BEFORE dispatching to Engineer 4 |
| 5 | Eng4 Payload Build | Constructs 11-field Interface Contract payload for kinetic response |

**Sigma Rules:**

| Rule ID | Name | Trigger Condition |
|---------|------|-------------------|
| ndr-sigma-001 | C2_BEACON | Low-jitter periodic outbound (jitter <0.15, count >=10, risk >=85) |
| ndr-sigma-002 | LATERAL_MOVE | Single source connecting to >=3 internal destinations on lateral ports |
| ndr-sigma-003 | BRUTE_FORCE_SUCCESS | >=10 auth failures + 1 success within 60 seconds |
| ndr-sigma-004 | SUSPICIOUS_IAM_KEY_ROTATION | CloudTrail CreateAccessKey/AttachUserPolicy/CreateUser |
| ndr-sigma-005 | HOST_CARDINALITY_SPIKE | Single host contacting >=5 unique internal destinations in 60 minutes |

### Engineer 4 — Automated Response (The Fist)
**File:** `modules/kinetic_eng.py` (400 lines)

Automated containment and response execution.

- **KL-001 Host Isolation** (SLA: <30s): Tiered circuit breaker — TIER_0_SUPPRESS, TIER_1_ISOLATE, TIER_2_ESCALATE, TIER_3_EMERGENCY
- **KL-002 IAM Kill Switch** (SLA: <5s): Credential deactivation, deny policy attachment, session invalidation
- **State machine:** PENDING → IN_PROGRESS → COMPLETE
- **Interface Contract:** 11 required fields validated against JSON Schema v1.2
- **Output:** `ndr-kinetic` table

---

## Orchestration

### Correlator (`glue/correlator.py`)
Thin Bus Wire — zero detection logic. Calls all 4 modules in sequence:

```
Step A → network_eng (generate traffic)
Step B → identity_eng (generate identity events)
Step B.1 → PC7 malformed doc injection (ECS Guardian validation)
Step C → detection_eng (full 5-operation pipeline)
Step D → kinetic_eng (execute responses, write SLA back to correlated docs)
Step E → structured pipeline report
```

### Flask Bus (`main.py`)
HTTP API on port 8000:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/run` | POST | Execute full pipeline. Accepts `{"mode": "test"}` |
| `/stats` | GET | Table counts, last alert, version info |
| `/health` | GET | Health check with uptime |

---

## Dashboard (TypeScript Frontend)

React + Tailwind CSS + shadcn/ui dashboard on port 5000:

- **Dashboard** — Command center overview with Zeek log source breakdown
- **Events & Identity** — Tabbed views for network and identity logs
- **Threats & Attack Patterns** — MITRE ATT&CK correlation cards and vector index
- **Sigma Rules** — Production rule viewer with firing history
- **Correlated** — DBT surface: Master Join, Host Cardinality, Eng4 Dispatch
- **Kinetic Layer** — Automated response management (Host Isolation, IAM Kill Switch, Rollback)
- **Responses** — Response action tracking table
- **Pipeline** — Real-time pipeline metrics and latency monitoring

---

## Data Storage

SQLite database at `data/ndr.db` with 5 tables:

| Table | Writer | Description |
|-------|--------|-------------|
| `ndr-network` | Engineer 1 | Zeek network events (conn, dns, http) |
| `ndr-identity` | Engineer 2 | Wazuh + CloudTrail identity events |
| `ndr-correlated` | Engineer 3 | Sigma-matched correlated alerts with pre-commit tracking |
| `ndr-dlq` | Engineer 3 | Dead letter queue for ECS-invalid documents |
| `ndr-kinetic` | Engineer 4 | Response execution records with SLA tracking |

---

## Specification Files

All engineer specifications are maintained in `/specs`:

| File | Description |
|------|-------------|
| `engineer1-ecs-sample.json` | ECS 8.11.0 sample document for network events |
| `engineer1-technical-handover.md` | Engineer 1 technical handover document |
| `engineer2-alert-definitions.xml` | Identity alert rule definitions (001-006) |
| `engineer2-ecs-sample.json` | ECS 8.11.0 sample document for identity events |
| `engineer2-patch1-ecs-pin.md` | ECS version pin patch |
| `engineer2-patch2-identity006v2.xml` | IDENTITY-006 v2 compound rule patch |
| `engineer2-patch3-geoip-spof.md` | GeoIP SPOF mitigation patch |
| `engineer2-technical-handover.md` | Engineer 2 technical handover document |
| `engineer3-dlq-watcher.json` | DLQ watcher configuration |
| `engineer3-field-validation-matrix.md` | Field validation matrix for ECS compliance |
| `engineer3-ingest-pipeline-v2.json` | Ingest pipeline v2 configuration |
| `engineer3-interface-contract-signed.json` | Signed Interface Contract v1.2 (JSON Schema draft-07) |
| `engineer3-pre-commit-dispatcher.py` | Pre-commit dispatcher reference implementation |
| `engineer4-sla-framework.md` | SLA timing targets (T0-T5), E2E <30s, optimizations |
| `engineer4-audit-schema.md` | Sprint 1 handover manifest, artifact status, Sprint 2 dependencies |
| `engineer4-80-20-boundary.md` | Automated (80%) vs Human/CPA (20%) enforcement boundary |

---

## Oracle & Lab Testing

### Oracle Script (Conductor-Owned)
**File:** `oracle/ndr_phase_gate_0_oracle_v2.py` — Read-only. No engineer may modify.

Validates 7 pass conditions against the pipeline output:

| PC | Check | Target |
|----|-------|--------|
| PC1 | True Positive in ndr-correlated | >= 1 C2_BEACON alert |
| PC2 | Detection Latency | < 60 seconds |
| PC3 | KL-001 Response SLA | < 30 seconds |
| PC4 | Pre-Commit Pattern | pre_commit_written=true before dispatch |
| PC5 | Zero DLQ for valid beacons | 0 errors for clean documents |
| PC6 | community_id populated | Present in all correlated docs |
| PC7 | Malformed doc routed to DLQ | ECS Guardian active, pipeline protected |

### Lab Adapter
**File:** `oracle/lab_adapter.py` — Conductor-authorized SQLite shim for local testing.

Monkey-patches `requests.get` to intercept all OpenSearch queries from the Oracle and redirect them to `data/ndr.db`. Supports term queries, bool/must queries, aggregations (avg/max/min/sum), source filtering, and range queries.

**Usage:**
```python
import oracle.lab_adapter as lab
lab.install()
# Now run the Oracle — all OpenSearch calls hit SQLite instead
```

---

## Running the Platform

### Prerequisites
- Python 3.11+
- Node.js 20+
- Dependencies installed via Replit package manager

### Start the Dashboard
```bash
npm run dev
# Serves React dashboard on port 5000
```

### Start the Flask Bus
```bash
python3 main.py
# Flask Bus API on port 8000
```

### Execute the Pipeline
```bash
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{"mode": "test"}'
```

### Run Phase Gate 0 Oracle
```bash
python3 -c "
import oracle.lab_adapter as lab
lab.install()
import sys, io
sys.stdin = io.StringIO('<TEST_RUN_ID>\n')
exec(open('oracle/ndr_phase_gate_0_oracle_v2.py').read())
"
```

---

## Phase Gate 0 Clearance Record

| Field | Value |
|-------|-------|
| **Date** | March 2, 2026 |
| **Oracle Result** | 7/7 PASS |
| **Verdict** | PHASE GATE 0 — OPEN |
| **Pipeline Run ID** | `e3d8822b-3f4c-4337-9b4e-02b616bfa58b` |
| **Platform Version** | v1.2 — CERTIFIED |

### Live Fire Patches Applied

| Patch | Description |
|-------|-------------|
| PC2 Fix | `labels.detection_latency_seconds` added to `_build_correlated_alert` in detection_eng.py |
| PC3 Fix | `labels.eng4_kl001_response_seconds` written back to ndr-correlated via `_update_correlated_labels` in correlator.py |
| PC6 Fix | `network_summary.community_ids` populated in all 4 non-C2_BEACON Sigma evaluators |

### Oracle Output (Verbatim)
```
  PASS  [PC1] True Positive in ndr-correlated-*
           Detail: Correlated C2_BEACON alerts found: 2
  PASS  [PC2] Detection Latency < 60s — Platform Law #3
           Detail: Avg: 1.5s | Max: 2.4s | Target: <60s
  PASS  [PC3] KL-001 SLA < 30s (Eng4 patched field)
           Detail: KL-001 T_TOTAL: 1.579s | Target: <30.0s
  PASS  [PC4] Pre-Commit Pattern — pre_commit_written=true in correlated doc
           Detail: Pre-committed documents: 5
  PASS  [PC5] Zero DLQ errors for valid beacon documents
           Detail: DLQ hits (excl. PC7): 0 (target: 0)
  PASS  [PC6] network.community_id populated and consistent
           Detail: community_id present in 5 correlated doc(s)
  PASS  [PC7] Malformed doc -> DLQ (ECS Guardian active, pipeline protected)
           Detail: DLQ hits: 3 | ndr-network-* contamination: 0

  Conditions Passed: 7/7
  VERDICT: PHASE GATE 0 — OPEN
  Phase Gate 0 exits. Platform proceeds to Phase 1.
```

---

## Project Structure

```
.
├── main.py                          # Flask Bus (port 8000)
├── glue/
│   └── correlator.py                # Thin Bus Wire orchestrator
├── modules/
│   ├── network_eng.py               # Engineer 1 — Zeek/Network
│   ├── identity_eng.py              # Engineer 2 — Wazuh/CloudTrail
│   ├── detection_eng.py             # Engineer 3 — Brain Layer
│   └── kinetic_eng.py               # Engineer 4 — Kinetic Response
├── oracle/
│   ├── ndr_phase_gate_0_oracle_v2.py  # Conductor Oracle (read-only)
│   └── lab_adapter.py               # SQLite shim for lab testing
├── specs/                           # Engineer specification files
├── server/
│   ├── engines/                     # TypeScript engine implementations
│   ├── routes.ts                    # Express API routes
│   └── storage.ts                   # Storage interface
├── client/
│   └── src/
│       └── pages/                   # React dashboard pages
├── shared/
│   └── schema.ts                    # ECS 8.11.0 Zod schemas
├── data/
│   └── ndr.db                       # SQLite database (generated at runtime)
└── README.md
```

---

## SLA Targets

| Metric | Target | Achieved |
|--------|--------|----------|
| Detection Latency (E2E) | < 60s | 2.4s max |
| KL-001 Host Isolation | < 30s | 1.579s |
| KL-002 IAM Kill Switch | < 5s | ~0.8s |
| Full Pipeline (all 4 modules) | < 60s | 1.334s |

---

## Standards Compliance

- **ECS 8.11.0** — All event documents validated by ECS Guardian
- **MITRE ATT&CK** — Tactic and technique mapping on all correlated alerts
- **Sigma Rules** — 5 production detection rules with full evaluation logic
- **Pre-Commit Pattern** — Write-before-dispatch audit trail on all alerts
- **Interface Contract v1.2** — JSON Schema draft-07 validated payloads between Eng3 and Eng4

---

## License

Internal platform prototype. Blueprint v1.2.
# veltroy
