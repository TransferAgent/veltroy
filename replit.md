# NDR Platform - Phase Gate 0

## Overview
This project is an AI-driven Network Detection and Response (NDR) platform prototype designed to integrate specialized modules for network and identity event ingestion, threat correlation, and automated response. The platform aims to provide sub-60-second detection-to-response capabilities for cyber threats. All data structures are ECS 8.11.0 compliant.

The platform's key capabilities include:
- Ingestion of network metadata via Zeek and identity logs via Wazuh and CloudTrail.
- Correlation of threats using MITRE ATT&CK patterns, Sigma Rules, and DBT join logic.
- Automated response orchestration for identified threats.
- Real-time pipeline simulation generating ECS-compliant events every 4 seconds.
- Sub-60s SLA monitoring for pipeline latency.

## User Preferences
- **PLATFORM_VERSION=v1.2** — no version beyond v1.2 has been authorized.
- Do NOT modify index.css; use tailwind.config.ts for design tokens.
- The app starts in dark mode.

## System Architecture

### UI/UX Decisions
The frontend is built with React and TypeScript, utilizing Tailwind CSS and shadcn/ui for styling. It features a dark mode as default, a sidebar navigation, and various pages for different functionalities:
- **Dashboard**: Command center with an overview and Zeek Log Source pie chart.
- **Events & Identity**: Tabbed views for network and identity logs.
- **Threats & Attack Patterns**: Views for threat correlation cards and attack pattern vector index.
- **Sigma Rules**: Viewer for production Sigma rules and their firings.
- **Correlated**: Displays DBT surface including Master Join, Host Cardinality, and Eng4 Dispatch.
- **Kinetic Layer**: Manages automated response actions (Host Isolation, IAM Kill Switch, Rollback Protocol).
- **Responses**: Table for tracking response actions.
- **Pipeline**: Monitors pipeline metrics.
- Interactive tables/cards with search functionalities across various data points (IPs, domains, URLs, rules, users, hosts, IoCs, techniques).
- Live charts for latency breakdown, severity distribution, and log source breakdown.

### Technical Implementations
The backend is an Express.js server in TypeScript, orchestrating the NDR pipeline simulation and delegating tasks to specialized Engineer modules.

**Core Modules (Engineers):**
- **Engineer 1 (Packet Metadata)**: Zeek Traffic Simulator generating ECS-compliant conn, dns, and http logs. Implements `network.community_id` and RFC-1918 direction heuristic.
    - **Python Module** (`modules/network_eng.py`): Standalone Python translation of Engineer 1 specs. Modes: normal (randomised benign), beacon (12 events @ 60s intervals, jitter <100ms, dst 198.51.100.42:443), heartbeat (60s interval, zeek.ndr_heartbeat), high-cardinality (>15 unique dst IPs in 5min/60min → zeek.ndr_high_cardinality). Writes to SQLite `data/ndr.db` table `ndr-network`.
- **Engineer 2 (Identity Logs)**: Wazuh and CloudTrail simulators generating ECS-compliant Linux, Windows, and AWS CloudTrail authentication events. Includes Wazuh rule.level severity scaling and CloudTrail IAM event classification.
    - **Python Module** (`modules/identity_eng.py`): Standalone Python translation of Engineer 2 specs. Three event types: Linux SSH (wazuh.security), Windows (4624/4625/4720/4740/7045), AWS CloudTrail (ConsoleLogin/AssumeRole/CreateUser/AttachUserPolicy). Six IDENTITY alert rules (001-006); 006 v2 compound: off-hours AND new country AND new host (risk_score=88). Three-layer GeoIP enrichment. Writes to SQLite `data/ndr.db` table `ndr-identity`.
- **Engineer 3 (Data Correlation - Brain Layer)**:
    - **Warehouse**: Three index templates (`ndr-network-*`, `ndr-identity-*`, `ndr-attack-patterns`) for extended schemas and semantic vector index.
    - **Sigma Rule Engine**: Five production Sigma rules (C2_BEACON, LATERAL_MOVE, BRUTE_FORCE_SUCCESS, SUSPICIOUS_IAM_KEY_ROTATION, HOST_CARDINALITY_SPIKE) with full evaluation logic and Interface Contract binding. `HOST_CARDINALITY_SPIKE` implements Kinetic Law #2 for context escalation.
    - **DBT Models**: `ndr_network_identity_join` (Master JOIN on source.ip ±5 min), `ndr_host_cardinality_60m` (Vectra Killer engine for rolling 60min unique dest count), and `ndr_eng4_dispatch_surface` (filters critical/high alerts for Eng4).
    - **Python Module** (`modules/detection_eng.py`): Full 5-operation pipeline — (1) ECS Guardian validation routing invalids to ndr-dlq, (2) Network-Identity JOIN on source.ip ±5min window, (3) Sigma rule evaluation for all 5 rules, (4) Pre-Commit Pattern writing to ndr-correlated before dispatch, (5) 11-field Engineer 4 payload build (host_ip, host_id, alert_type, severity, aws_security_group_id, iam_user, iam_access_key_id, aws_region, admin_session_active, alert_timestamp, eng3_correlation_id). UNKNOWN sentinel for non-derivable iam_access_key_id. Modes: detect (run full pipeline on existing data), test (generate synthetic data triggering all 5 Sigma rules), stats (report across 4 tables). Writes to SQLite `data/ndr.db` tables `ndr-correlated` and `ndr-dlq`.
- **Engineer 4 (Automated Response - Kinetic Layer)**:
    - **KL-001 Automated Host Isolation**: Tier-based circuit breaker, bidirectional security group isolation, IAM kill switch, atomic pre-commit audit with execution state machine (PENDING → IN_PROGRESS → COMPLETE). Signed Interface Contract v1.2 (draft-07 JSON Schema, 14 fields: 11 required + 3 optional, additionalProperties: false, strict patterns for sg-id/AKIA key/aws-region).
    - **KL-002 IAM Kill Switch**: Standalone IAM credential containment with a target SLA of < 5 seconds for key deactivation, triggered by specific IAM-related alerts. Includes actions like IAM key deactivation, enumeration, deny policy attachment, and session invalidation.
    - **KL-ROLLBACK-001 Rollback Protocol**: Human-gated operation to reverse actions from KL-001 or KL-002, supporting dry run mode and tracking 5 rollback actions.
    - **Python Module** (`modules/kinetic_eng.py`): KL-001 host isolation (TIER_0_SUPPRESS/TIER_1_ISOLATE/TIER_2_ESCALATE/TIER_3_EMERGENCY), KL-002 IAM Kill Switch, 11-field Interface Contract validation, simulated SG revoke/IAM deactivate/memory preserve/SOC notification actions, state machine (PENDING→IN_PROGRESS→COMPLETE), SLA tracking (<30s KL-001, <5s KL-002). Writes to SQLite `data/ndr.db` table `ndr-kinetic`.

**Orchestration Layer:**
- `glue/correlator.py`: Thin Bus Wire — calls all 4 modules in sequence (network_eng → identity_eng → detection_eng → kinetic_eng). Exposes `run_pipeline()`, `get_stats()`, `get_health()`. No detection logic — calls only.
- `main.py`: Flask Bus on port 8000 (port 5000 reserved for TypeScript dashboard preview) — POST /run, GET /stats, GET /health endpoints for Oracle and external access. Runs as "Flask Bus" workflow.

**Conductor-Owned (Read-Only — No Engineer May Modify):**
- `oracle/ndr_phase_gate_0_oracle_v2.py` — Phase Gate 0 Oracle Script (Blueprint v1.2). Checks 7 pass conditions (PC1–PC7): PC1 True Positive in ndr-correlated-*, PC2 Detection Latency <60s, PC3 KL-001 SLA <30s, PC4 Pre-Commit Pattern, PC5 Zero DLQ errors, PC6 community_id populated, PC7 Malformed doc → DLQ. Final arbiter of Phase Gate 0 pass/fail.

**Shared Components:**
- `shared/schema.ts`: Defines ECS 8.11.0 compliant Zod schemas for all data types, ensuring data consistency across modules.

## External Dependencies

The platform integrates with and simulates data from the following external systems:

- **Zeek**: For network event ingestion (simulated `conn.log`, `dns.log`, `http.log`).
- **Wazuh**: For identity event ingestion (simulated Linux and Windows logs).
- **AWS CloudTrail**: For cloud identity event ingestion (simulated IAM events).
- **MITRE ATT&CK Framework**: Used for threat correlation and mapping attack patterns.
- **Elastic Common Schema (ECS) 8.11.0**: All data structures adhere to this schema for standardization.
- **Recharts**: For data visualization in the frontend.
- **TanStack Query**: For data fetching in the frontend.
- **Wouter**: For client-side routing in the frontend.
- **Zod**: For schema validation across the platform.