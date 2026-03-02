# NDR Platform - Phase Gate 0

## Overview
AI-driven Network Detection and Response (NDR) platform prototype. Integrates four specialized modules:
- **Eng 1 - Packet Metadata**: Network event ingestion via Zeek Traffic Simulator (conn.log, dns.log, http.log)
- **Eng 2 - Identity Logs**: Identity event ingestion via Wazuh + CloudTrail simulators (linux, windows, cloudtrail)
- **Eng 3 - Data Correlation**: MITRE ATT&CK threat correlation engine + Attack Pattern vector index + Sigma Rules + DBT Join Logic
- **Eng 4 - Automated Response**: Automated response orchestration

All data structures are ECS 8.11.0 compliant. **PLATFORM_VERSION=v1.2** — no version beyond v1.2 has been authorized. The Oracle Script monitors end-to-end pipeline latency with a sub-60-second detection-to-response SLA target.

## Architecture

### Frontend (React + TypeScript)
- `client/src/App.tsx` - Main app layout with sidebar navigation
- `client/src/components/theme-provider.tsx` - Dark/light mode (dark default)
- `client/src/components/app-sidebar.tsx` - Navigation sidebar with live stats + pattern count badge
- `client/src/pages/dashboard.tsx` - Command center overview with Zeek Log Source pie chart
- `client/src/pages/events.tsx` - Network events with tabbed views (All, conn.log, dns.log, http.log)
- `client/src/pages/identity.tsx` - Identity logs with tabbed views (All, Linux, Windows, CloudTrail)
- `client/src/pages/threats.tsx` - Threat correlation cards with matched_pattern_id linking (Eng 3)
- `client/src/pages/attack-patterns.tsx` - Attack Pattern vector index viewer (Eng 3 — ndr-attack-patterns)
- `client/src/pages/sigma-rules.tsx` - Sigma Rules viewer with Rules tab (5 production rules) and Firings tab (Eng 3 Brain)
- `client/src/pages/correlated.tsx` - Brain DBT Surface with Master Join, Host Cardinality, and Eng4 Dispatch tabs
- `client/src/pages/kinetic.tsx` - Kinetic Layer KL-001 viewer with Executions, Action Detail, and Interface Contract tabs (Eng 4)
- `client/src/pages/responses.tsx` - Response actions table (Eng 4)
- `client/src/pages/pipeline.tsx` - Oracle Script pipeline monitor

### Backend (Express + TypeScript)
- `server/routes.ts` - API endpoints
- `server/pipeline.ts` - NDR pipeline simulation engine (delegates to Engineer modules, runs Brain cycle)
- `server/engines/network-eng.ts` - Engineer 1 Traffic Simulator: generates ECS-compliant conn/dns/http logs from Zeek field mappings
- `server/engines/identity-eng.ts` - Engineer 2 Identity Simulator: generates ECS-compliant auth events from Wazuh/CloudTrail configs
- `server/engines/correlation-eng.ts` - Engineer 3 Attack Pattern Seeder: generates 15 seeded attack patterns with MITRE ATT&CK mappings, IoC tags, detection rules, and community ID linking
- `server/engines/sigma-eng.ts` - Engineer 3 Sigma Rule Engine: 5 production Sigma rules (C2_BEACON, LATERAL_MOVE, BRUTE_FORCE_SUCCESS, SUSPICIOUS_IAM_KEY_ROTATION, HOST_CARDINALITY_SPIKE) with full evaluation logic
- `server/engines/dbt-eng.ts` - Engineer 3 DBT Models: Master Join (network↔identity on source.ip ±5min), Host Cardinality 60m (Vectra Killer), Eng4 Dispatch Surface
- `server/engines/kinetic-eng.ts` - Engineer 4 KL-001 Kinetic Engine: Tier-based circuit breaker, bidirectional SG isolation, IAM kill switch, atomic pre-commit audit, state machine, Interface Contract v1.2
- `server/storage.ts` - Re-exports pipeline

### Shared
- `shared/schema.ts` - ECS 8.11.0 compliant Zod schemas with all data types: NetworkEvent, IdentityEvent, AttackPattern, Correlation, ResponseAction, SigmaRule, SigmaFiring, CorrelatedDoc, HostCardinality, DispatchSurface

## Engineer 1 Integration (Zeek → ECS Rewriter)
Ingested from `local.zeek` and `ndr-ecs-rewriter.zeek`:
- **Three log streams**: `zeek.conn` (event.dataset), `zeek.dns`, `zeek.http`
- **conn.log**: event.kind=event, event.category=network, event.type=connection, network.community_id (SHA1 5-tuple hash), RFC-1918 direction heuristic
- **dns.log**: event.category=network, dns.type from qtype_name, dns.question.name, dns.response_code, dns.answers
- **http.log**: event.category=web, url.full = scheme://host+path, http.request.method, http.response.status_code
- **ECS metadata**: agent.name=zeek, agent.type=zeek, zeek.uid (Zeek-format UID), zeek.log_source, ndr.blueprint_version=v1.2
- **ndr-network-* fields** (Eng 3 template): event.duration, event.risk_score, network.transport, network.packets, network.type, source/destination.bytes/packets, labels.sensor_id, labels.pipeline_version
- **Sprint 2 criticals** (ndr-high-cardinality.zeek, ndr-heartbeat.zeek): NOT yet integrated — held for sequential deployment

## Engineer 2 Integration (Wazuh + CloudTrail → ECS)
Ingested from `ossec.conf` (Linux+Windows) and `cloudtrail-iam.conf`:
- **Three identity streams**: `wazuh.linux`, `wazuh.windows`, `aws.cloudtrail`
- **Blueprint version**: v1.2
- **wazuh.linux**: auth.log/secure monitoring, SSH/PAM/sudo events, Wazuh rule.level→event.severity mapping (0-15 scaled to 0-100), log.file.path, host.hostname, host.ip, source.port
- **wazuh.windows**: Security Event Channel, Event IDs 4624/4625/4720/4740/7045, winlog.event_id, winlog.logon_type, host.ip
- **aws.cloudtrail**: IAM events (ConsoleLogin, AssumeRole, CreateUser, AttachUserPolicy, DeleteUser, GetSessionToken, UpdateAccountPasswordPolicy), cloud.provider/account.id/region, user.type, user.id (ARN), event.provider, user_agent.name, GeoIP enrichment
- **ndr-identity-* fields** (Eng 3 template): labels.identity_provider, labels.mfa_used, labels.risk_score, user_agent.name
- **Held patches**: ECS pin, IDENTITY-006 rebuild, GeoIP architecture, EventBridge upgrade, Heartbeat, Index naming

## Engineer 3 Integration (Brain Layer)

### Warehouse (Step 1 — Complete)
Three index templates structurally mapped into the platform data layer (Blueprint v1.2):
- **ndr-network-*** (1A): Extended network event schema
- **ndr-identity-*** (1B): Extended identity event schema
- **ndr-attack-patterns** (1C): Semantic vector index with 15 seeded patterns

### Brain (Step 2 — Complete)

#### Sigma Rules (5 of 5 — All Registered)
| Rule ID | Alert Type | MITRE | Severity | Index |
|---------|-----------|-------|----------|-------|
| ndr-sigma-C2_BEACON | C2_BEACON | T1071.001, T1571 | critical | ndr-network-* |
| ndr-sigma-LATERAL_MOVE | LATERAL_MOVE | T1021, T1021.001, T1021.002 | high | ndr-correlated-* |
| ndr-sigma-BRUTE_FORCE_SUCCESS | BRUTE_FORCE_SUCCESS | T1110, T1110.001 | critical | ndr-identity-* |
| ndr-sigma-SUSPICIOUS_IAM_KEY_ROTATION | SUSPICIOUS_IAM_KEY_ROTATION | T1098.001, T1078.004 | critical | ndr-identity-* |
| ndr-sigma-HOST_CARDINALITY_SPIKE | HOST_CARDINALITY_SPIKE | T1018, T1046, T1135 | critical | ndr-network-* |

- All rules bound to Interface Contract fields_to_contract
- HOST_CARDINALITY_SPIKE implements Kinetic Law #2 (context escalation)
- Vectra Killer thresholds: ≥20→CRITICAL/ISOLATE, ≥10→HIGH/QUARANTINE, ≥5→MEDIUM/INVESTIGATE

#### DBT Models (3 of 3 — All Installed)
| Model | Function | Dependencies |
|-------|----------|-------------|
| ndr_network_identity_join | Master JOIN — links network + identity on source.ip ± 5 min | ndr-network-* + ndr-identity-* |
| ndr_host_cardinality_60m | Vectra Killer engine — rolling 60min unique dest count per source IP | ndr-network-* |
| ndr_eng4_dispatch_surface | Filters CRITICAL/HIGH alerts → feeds Engineer 4 circuit-breaker | ndr-correlated-* + ndr_host_cardinality_60m |

- Master join uses true ±5 minute window (no hour-boundary restriction)
- Host cardinality uses true rolling 60-minute window (now - 60m to now)
- Dispatch surface only surfaces TIER1_ISOLATE and TIER2_QUARANTINE actions

### Brain Status
- Warehouse: built, schema-correct
- Sigma rules: 5/5 registered, production status, fire_count tracking live
- DBT models: 3/3 installed, running every pipeline cycle
- Brain is structurally wired and listening — will fire when matching patterns appear in live traffic

## Engineer 4 Integration (Kinetic Layer — Inject 1)

### KL-001 Automated Host Isolation (Complete)
The fully-patched composite workflow with all 5 elements merged:
- **DELIVERABLE 1**: n8n workflow skeleton (translated to TypeScript simulation engine)
- **PRIORITY 1**: Tier-based circuit breaker replacing AND logic (C2_BEACON alone triggers isolation)
- **PRIORITY 2**: Bidirectional SG isolation (ingress + egress revoked, bastion SSH permitted, SG tagged)
- **PRIORITY 4**: Atomic pre-commit audit with execution state machine (PENDING → IN_PROGRESS → COMPLETE)
- **ONE-LINE FIX**: `labels.eng4_kl001_response_seconds` (float, 3-decimal precision)

#### Tier Classification Engine
| Tier | Condition | Response |
|------|-----------|----------|
| TIER_0_SUPPRESS | Low/Medium severity, non-beacon | No action |
| TIER_1_ISOLATE | C2_BEACON (session irrelevant) OR HIGH severity | Full isolation |
| TIER_2_ESCALATE | C2_BEACON + active admin session | Escalated containment |
| TIER_3_EMERGENCY | Any CRITICAL regardless of type (non-beacon) | Emergency response |

#### 8 Tracked Actions per Execution
1. AWS_SG_REVOKE_INGRESS
2. AWS_SG_REVOKE_EGRESS
3. AWS_SG_TAG_ISOLATION
4. AWS_SG_BASTION_SSH
5. IAM_KEY_DEACTIVATE
6. IAM_DENY_ALL_ATTACH
7. HOST_MEMORY_PRESERVE
8. SOC_NOTIFICATION

#### Interface Contract v1.2 (PRIORITY 5)
11-field payload schema — defines what Eng3 dispatch surface sends to Eng4:
| Field | Required |
|-------|----------|
| host_ip | YES |
| host_id | no |
| alert_type | YES |
| severity | YES |
| admin_session_active | no |
| aws_security_group_id | YES |
| iam_user | YES |
| eng3_correlation_id | no |
| network_community_id | no |
| destination_ip | no |
| destination_port | no |

### KL-002 IAM Kill Switch (Inject 2 — Complete)
Standalone IAM credential containment — no dependencies on KL-001:
- **Playbook**: KL-002-IAM-KILL-SWITCH
- **SLA Target**: < 5 seconds key deactivation
- **Triggers**: SUSPICIOUS_IAM_KEY_ROTATION, BRUTE_FORCE_SUCCESS, or CRITICAL severity alerts

#### 6 Tracked Actions per Execution
1. VERIFY_CALLER_IDENTITY — Validate AWS credentials before proceeding
2. IAM_KEY_DEACTIVATE — Disable the compromised access key (reversible)
3. IAM_ENUMERATE_ALL_KEYS — Find and deactivate ALL keys for the user (sweep)
4. IAM_ATTACH_DENY_ALL — Attach AWSDenyAll managed policy (belt-and-suspenders)
5. IAM_SESSION_INVALIDATION — Force-expire all active console/CLI sessions
6. AUDIT_RECORD_POSTED — Post audit record to Eng3 Data Lake

- Access key IDs are masked in audit records (AKIA****XXXX format)
- Fallback inline deny policy if AWSDenyAll managed policy unavailable
- Console password rotation + forced reset on session invalidation

### Kinetic Layer Status
- KL-001 engine: armed, consuming dispatch surface every pipeline cycle (SLA: 30s)
- KL-002 engine: armed, consuming dispatch surface for IAM-related alerts (SLA: 5s)
- Executions: 0 at init (expected — requires dispatch surface triggers from Brain)
- Remaining Injects: KL-ROLLBACK-001, additional workflows

## API Endpoints
- `GET /api/dashboard/stats` - Dashboard statistics including logSourceBreakdown, identitySourceBreakdown, attackPatternCount
- `GET /api/events` - Network events (Eng 1: zeek.conn, zeek.dns, zeek.http)
- `GET /api/identity` - Identity events (Eng 2: wazuh.linux, wazuh.windows, aws.cloudtrail)
- `GET /api/threats` - Threat correlations with matched_pattern_id (Eng 3)
- `PATCH /api/threats/:id` - Update threat status (Zod validated)
- `GET /api/attack-patterns` - Attack pattern vector index (Eng 3)
- `GET /api/sigma-rules` - Sigma rule definitions with fire counts (Eng 3 Brain)
- `GET /api/sigma-firings` - Sigma rule firing history (Eng 3 Brain)
- `GET /api/correlated-docs` - Master join results (Eng 3 DBT)
- `GET /api/host-cardinality` - Host cardinality 60m results (Eng 3 DBT — Vectra Killer)
- `GET /api/dispatch-surface` - Eng4 dispatch surface (Eng 3 DBT)
- `GET /api/kinetic-executions` - KL-001 kinetic execution history (Eng 4)
- `GET /api/kl002-executions` - KL-002 IAM kill switch execution history (Eng 4)
- `GET /api/kinetic-contract` - Interface Contract v1.2 JSON schema (Eng 4)
- `GET /api/responses` - Response actions (Eng 4)
- `GET /api/pipeline/metrics` - Pipeline latency metrics
- `GET /api/pipeline/status` - Pipeline status (Oracle Script)

## Key Features
- Real-time pipeline simulation generating ECS-compliant events every 4 seconds
- Three Zeek log streams with distinct tabbed views and specialized columns
- Three identity log streams with distinct tabbed views (Linux auth, Windows Security, AWS CloudTrail)
- 15 seeded attack patterns with MITRE ATT&CK mappings, IoC tags, and detection rules
- 5 Sigma detection rules with Interface Contract binding and live fire tracking
- 3 DBT transformation models: Master Join, Host Cardinality (Vectra Killer), Eng4 Dispatch Surface
- KL-001 Kinetic Layer: tier-based circuit breaker, bidirectional SG isolation, IAM kill switch, state machine, Interface Contract v1.2
- Community ID computation for cross-tool correlation + pattern linking
- RFC-1918 direction heuristic matching Zeek's Site::is_local_addr logic
- Wazuh rule.level severity scaling and Windows Event ID tracking
- CloudTrail IAM event classification (authentication vs iam)
- MITRE ATT&CK tactic and technique mapping
- Kinetic Law #2: context escalation on HOST_CARDINALITY_SPIKE
- Sub-60s SLA monitoring with compliance tracking
- Dark/light theme toggle
- Filterable tables/cards with search across IPs, domains, URLs, rules, users, hosts, IoCs, techniques
- Interactive threat status management with pattern matching
- Live charts: latency breakdown, severity distribution, log source pie chart

## Dependency Map
- ✅ Warehouse built (ndr-network-*, ndr-identity-*, ndr-attack-patterns)
- ✅ Brain uploaded (Sigma x5, DBT x3) — structurally wired, listening
- ⏳ Fuel (Engineer 1 full stack — Sprint 2 criticals pending)
- ⏳ Fuel (Engineer 2 full stack — remaining patches pending)
- ✅ Hands (Engineer 4 KL-001 Inject 1 — armed, listening)
- ✅ Hands (Engineer 4 KL-002 Inject 2 — IAM Kill Switch armed)
- ⏳ Hands (Engineer 4 Injects 3-4 — KL-ROLLBACK-001, remaining workflows)
- ⏳ Phase Gate 0 — Synthetic Traffic Test — pending GO-ORDER

## Tech Stack
- React, TypeScript, Tailwind CSS, shadcn/ui
- Express.js backend
- Recharts for data visualization
- TanStack Query for data fetching
- Wouter for client-side routing
- Zod for schema validation

## Important Notes
- `apiRequest` function signature: `apiRequest(method, url, data)` — NOT `(url, options)`
- Do NOT modify index.css; use tailwind.config.ts for design tokens
- App starts in dark mode
- **PLATFORM_VERSION=v1.2** — no version beyond v1.2 has been authorized by Alpha Leader or Architect AI
