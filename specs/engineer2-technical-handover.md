# TECHNICAL HANDOVER — ENGINEER 2 / IDENTITY LAYER
## Blueprint v1.2.1 | Sprint 1 | Date: 2026-03-02

FROM  : Engineer 2 — Identity Specialist
TO    : Conductor / Architect AI Layer
CC    : Data Lake Engineer (community_id consumers)

## COMPLETED IN SPRINT 1

- [x] Wazuh ossec.conf — Linux auth.log monitoring (SSH, PAM, sudo)
- [x] Wazuh ossec.conf — Windows Event 4624/4625/4740 collection
- [x] ECS field mapping table (Wazuh native → ECS)
- [x] CloudTrail S3 → Logstash pipeline (IAM event ingest + ECS map)
- [x] community_id fingerprint embedded in all identity events
- [x] ECS-compliant JSON sample event (user.name + source.ip populated)
- [x] 6x alert rule definitions (brute force, geo anomaly, priv-esc)
- [x] GeoIP enrichment enabled on source.ip for all pipelines

## INTEGRATION DEPENDENCIES

- Engineer 1 (Network): Consume community_id from network.community_id to correlate user logins with packet flows. Field: network.community_id (SHA1, base64)
- Data Lake: Index targets: logs-wazuh.security-* (host auth), logs-aws.cloudtrail-* (cloud IAM). ECS version: 8.x
- n8n / Replit Lab: Logstash listening on TCP 5044 (Beats). Wazuh Manager → Logstash → Elasticsearch

## KNOWN LIMITATIONS (Sprint 1)

- community_id for CloudTrail is pseudo-deterministic (no L4 ports). Full community_id alignment requires Engineer 1 to provide packet correlation logic for cloud egress events.
- Geo-anomaly alerts (Rule 100101) require a baseline of known IPs per user — baseline ML job not in scope for Sprint 1. Recommended: Elasticsearch anomaly detection job in Sprint 2.
- Windows Logon Type 3 (network) vs Type 10 (remote interactive) distinction is captured in wazuh data.LogonType but not yet surfaced in ECS event.type. Flagged for Sprint 2 mapping.

## NEXT SPRINT RECOMMENDATIONS (Sprint 2)

- [ ] Implement ML-based user baseline for geo/time anomaly detection
- [ ] Add user.risk_score roll-up field aggregated from alert history
- [ ] Map Windows Logon Types to ECS event.type vocabulary
- [ ] Integrate Okta/Azure AD SSO events (event.dataset: okta.system)
- [ ] Add UEBA correlation: link user.name → asset → network flow
- [ ] Define suppression windows for known service accounts

HANDOVER STATUS: COMPLETE — READY FOR DATA LAKE INGESTION
