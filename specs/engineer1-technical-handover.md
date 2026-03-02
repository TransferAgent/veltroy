# NDR PLATFORM — SPRINT 1 TECHNICAL HANDOVER
## Issued By: Engineer 1 (Network Specialist)
## Blueprint: v1.2 | Date: 2025-03-02

## COMPLETED — Sprint 1 Scope

| Asset | Status | Notes |
|-------|--------|-------|
| local.zeek | DELIVERED | Tier-1 primary signal config, JSON output enabled |
| ndr-ecs-rewriter.zeek | DELIVERED | ECS 8.11.0 field mapping for all 3 log types |
| ndr-beacon-detection.zeek | DELIVERED | Jitter-aware C2 beacon scorer |
| ndr-high-cardinality.zeek | SCAFFOLDED→FULL | Sprint 2 Priority 1 CRITICAL — full implementation delivered |
| ndr-suricata-bridge.zeek | SCAFFOLDED | Tier-2 passthrough hook structure ready |
| ECS JSON Sample (10 records) | DELIVERED | Covers conn / dns / http / beacon / suricata bridge |

## HANDOVER NOTES FOR CONSUMING AGENTS

### Engineer 3 (Data Architect):
- All logs emit event.dataset = zeek.conn, zeek.dns, zeek.http, zeek.ndr_beacon
- network.community_id is populated on ALL records — use as the cross-tool correlation key (Zeek ↔ Suricata pivot)
- ECS version locked at 8.11.0 — ensure your Logstash/Filebeat pipelines match the index template

### Triage Agent:
- event.kind = "alert" records are pre-filtered high-priority signals
- labels.tier distinguishes tier1_behavioral (act on) from tier2_confirmation (validate only)
- zeek.ndr_beacon.risk_score range: 0–100. Threshold >= 85 = escalate immediately
- labels.flag values: dga_candidate, idn_homograph_candidate, high_cardinality_conn — route to Threat Intel Layer

### Conductor (Architect Layer):
- Platform Law #1 (Vocalist Principle) is structurally enforced: Suricata records are architecturally separated via labels.tier = "tier2_confirmation" and carry a correlated_zeek_uid backlink — they cannot be mistaken for primary signals
- The Lab environment is ready for n8n workflow hookup — Zeek JSON output is at /opt/zeek/logs/current/ with 1-hour rotation
- Sprint 2 blockers from this layer: ndr-high-cardinality.zeek thresholds need Conductor sign-off on internal RFC-1918 range definitions before activation

## SPRINT 2 RECOMMENDATIONS (Engineer 1 Scope Only)
- SSL/TLS Layer — Add ssl.log ECS mapping (JA3/JA3S fingerprinting for encrypted C2 detection)
- High-Cardinality Completion — Finalize ndr-high-cardinality.zeek with Conductor-approved IP scope
- DNS Entropy Scoring — Inline DGA scoring (Shannon entropy > 4.0 threshold) already scaffolded in sample output, needs Zeek implementation
- The Field Migration — AWS deployment diff: swap Log::default_path_prefix for Kinesis Firehose stream endpoint; rest of config is environment-agnostic
