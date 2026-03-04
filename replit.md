# NDR Platform - Phase Gate 0

## Overview
This project is an AI-driven Network Detection and Response (NDR) platform prototype designed to integrate specialized modules for network and identity event ingestion, threat correlation, and automated response. The platform aims to provide sub-60-second detection-to-response capabilities for cyber threats. All data structures are ECS 8.11.0 compliant.

Key capabilities include:
- Ingestion of network metadata via Zeek and identity logs via Wazuh and CloudTrail.
- Correlation of threats using MITRE ATT&CK patterns, Sigma Rules, and DBT join logic.
- Automated response orchestration for identified threats.
- Real-time pipeline simulation generating ECS-compliant events every 4 seconds.
- Sub-60s SLA monitoring for pipeline latency.

The business vision is to deliver a cutting-edge security solution that significantly reduces the time from detection to response, minimizing potential damage from cyber threats. The project aims to establish a new standard in proactive and automated cybersecurity, offering a robust and scalable platform for various organizational needs.

## User Preferences
- **PLATFORM_VERSION=v1.2** — no version beyond v1.2 has been authorized.
- Do NOT modify index.css; use tailwind.config.ts for design tokens.
- The app starts in dark mode.

## System Architecture

### UI/UX Decisions
The frontend is built with React and TypeScript, utilizing Tailwind CSS and shadcn/ui for styling. It features a dark mode as default, a sidebar navigation, and various pages for functionalities such as Dashboard, Events & Identity, Threats & Attack Patterns, Sigma Rules, Correlated Data, Kinetic Layer, Responses, and Pipeline monitoring. Interactive tables/cards with search functionalities and live charts for latency and severity distribution are also included.

### Technical Implementations
The backend is an Express.js server in TypeScript, orchestrating the NDR pipeline simulation and delegating tasks to specialized Engineer modules.

**Core Modules (Engineers):**
- **Engineer 1 (Packet Metadata)**: Zeek Traffic Simulator generating ECS-compliant conn, dns, and http logs with network.community_id and RFC-1918 direction heuristic. Includes beacon, heartbeat, and high-cardinality detection modes, with a sensor health state machine (ALIVE, DEGRADED, DARK).
- **Engineer 2 (Identity Logs)**: Wazuh and CloudTrail simulators generating ECS-compliant Linux, Windows, and AWS CloudTrail authentication events. Includes Wazuh rule.level severity scaling, CloudTrail IAM event classification, and eight IDENTITY alert rules with GeoIP enrichment. Enforces canonical index names: `ndr-network`, `ndr-identity`, `ndr-correlated`, `ndr-dlq`.
- **Engineer 3 (Data Correlation - Brain Layer)**: Manages data warehousing, Sigma Rule Engine (five production rules including C2_BEACON, LATERAL_MOVE, HOST_CARDINALITY_SPIKE), and DBT Models for network-identity joining and host cardinality. Implements a 5-operation pipeline: ECS Guardian validation, network-identity join, Sigma rule evaluation, Pre-Commit Pattern with Adaptive Temporal Windows, and Engineer 4 payload construction.
- **Engineer 4 (Automated Response - Kinetic Layer)**: Orchestrates automated response actions through six kinetic playbooks (KL-001 Host Isolation, KL-002 IAM Kill Switch, KL-003 Lateral Movement Response, KL-004 Authentication Spike Response, KL-005 AWS Console Anomaly Response, KL-006 SOAR Ticket Creation). All playbooks are designed with specific SLAs, support rollback, and include mechanisms for state tracking and audit trails.

**Orchestration Layer:**
- `glue/correlator.py`: Orchestrates the sequence of Engineer modules (network → identity → detection → kinetic) and includes a DLQ Watcher for monitoring malformed events.
- `main.py`: Flask Bus server exposing API endpoints for running the pipeline, retrieving health/stats, managing DLQ health, handling SOAR tickets, and auditing kinetic actions.
- **Conductor-Owned**: Read-only Oracle scripts (`ndr_phase_gate_0_oracle_v2.py`, `ndr_phase_gate_1_oracle_v1.py`) for verifying platform compliance and performance against predefined pass conditions.

**Authentication and Authorization:**
- **JWT/RBAC Bridge**: Implemented with JWT validation middleware, role-based access control (RBAC) using predefined NDR roles (owner, super_admin, billing_admin, support, customer), and a tenant proxy for routing requests with `X-Tenant-ID` headers.

**Shared Components:**
- `shared/schema.ts`: Defines ECS 8.11.0 compliant Zod schemas for data consistency.

## External Dependencies

The platform integrates with and simulates data from the following external systems:
- **Zeek**: For network event ingestion.
- **Wazuh**: For identity event ingestion.
- **AWS CloudTrail**: For cloud identity event ingestion.
- **MITRE ATT&CK Framework**: Used for threat correlation and mapping.
- **Elastic Common Schema (ECS) 8.11.0**: For data standardization.
- **Recharts**: For frontend data visualization.
- **TanStack Query**: For frontend data fetching.
- **Wouter**: For frontend client-side routing.
- **Zod**: For schema validation.