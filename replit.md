# NDR Platform - Phase Gate 0

## Overview
This project is an AI-driven Network Detection and Response (NDR) platform prototype. Its purpose is to integrate specialized modules for network and identity event ingestion, threat correlation, and automated response, aiming for sub-60-second detection-to-response capabilities for cyber threats. All data structures are ECS 8.11.0 compliant.

Key capabilities include:
- Ingestion of network metadata (Zeek) and identity logs (Wazuh, CloudTrail).
- Threat correlation using MITRE ATT&CK patterns, Sigma Rules, and DBT join logic.
- Automated response orchestration.
- Real-time pipeline simulation generating ECS-compliant events.

## User Preferences
- **PLATFORM_VERSION=v1.2** — no version beyond v1.2 has been authorized.
- Do NOT modify index.css; use tailwind.config.ts for design tokens.
- The app starts in dark mode.

## System Architecture

### UI/UX Decisions
The frontend, built with React and TypeScript, uses Tailwind CSS and shadcn/ui. It defaults to dark mode and includes sidebar navigation for various functionalities such as Dashboard, Events & Identity, Threats & Attack Patterns, Sigma Rules, Correlated data, Kinetic Layer, Responses, and Pipeline monitoring. Interactive tables/cards with search functionalities and live charts for metrics are also present.

### Technical Implementations
The backend is an Express.js server (TypeScript) orchestrating the NDR pipeline through specialized Engineer modules.

**Core Modules (Engineers):**
- **Engineer 1 (Packet Metadata)**: Zeek Traffic Simulator generating ECS-compliant conn, dns, and http logs. Includes `network.community_id`, RFC-1918 direction heuristic, heartbeat, and high-cardinality detection.
- **Engineer 2 (Identity Logs)**: Wazuh and CloudTrail simulators generating ECS-compliant Linux, Windows, and AWS CloudTrail authentication events. Features Wazuh rule.level severity scaling, CloudTrail IAM event classification, and GeoIP enrichment. Enforces canonical index names: `ndr-network`, `ndr-identity`, `ndr-correlated`, `ndr-dlq`.
- **Engineer 3 (Data Correlation - Brain Layer)**: Manages data warehousing, Sigma Rule evaluation (5 production rules including `HOST_CARDINALITY_SPIKE` for context escalation), and DBT models (`ndr_network_identity_join`, `ndr_host_cardinality_60m`, `ndr_eng4_dispatch_surface`). Implements a 5-operation pipeline: ECS Guardian validation, Network-Identity JOIN, Sigma rule evaluation, Pre-Commit Pattern with Adaptive Temporal Windows, and Engineer 4 payload build.
- **Engineer 4 (Automated Response - Kinetic Layer)**: Orchestrates automated response actions through six kinetic playbooks (KL-001 to KL-006) and a Rollback Protocol (KL-ROLLBACK-001). Playbooks include Host Isolation, IAM Kill Switch, Lateral Movement Response, Authentication Spike Response, AWS Console Anomaly Response, and SOAR Ticket Creation. All playbooks adhere to strict SLAs and are rollback-eligible.

**Orchestration Layer:**
- `glue/correlator.py`: Orchestrates the sequence of Engineer modules (network → identity → detection → kinetic) and includes a DLQ Watcher.
- `main.py`: Flask Bus server exposing API endpoints for pipeline execution, health checks, DLQ monitoring, kinetic state updates, audit trails, and ticket retrieval.

**Authentication and Authorization:**
- Implements JWT validation, role-based access control (RBAC) with five NDR roles, and tenant proxying for multi-tenancy.
- Features a full registration/login flow with bcrypt hashing, OTP email verification, and trial tenant provisioning with associated UX.

**Shared Components:**
- `shared/schema.ts`: Defines ECS 8.11.0 compliant Zod schemas for data consistency.

### System Design Choices
- **Multi-tenancy**: Implemented at data layer with `tenant_id` column in `ndr-tickets` and enforced via `X-Tenant-ID` header.
- **Immutable Modules**: Core Engineer modules are declared immutable after audit, ensuring stable behavior.
- **Deployment Stages**: Supports `LAB` (SQLite) and `PRODUCTION` (OpenSearch, RDS PostgreSQL) deployment stages.
- **SLAs**: Critical operations like detection latency and kinetic responses are designed with strict Service Level Agreements (SLAs).

## External Dependencies

- **Zeek**: Simulated network event source.
- **Wazuh**: Simulated identity event source.
- **AWS CloudTrail**: Simulated cloud identity event source.
- **MITRE ATT&CK Framework**: Used for threat pattern correlation.
- **Elastic Common Schema (ECS) 8.11.0**: Standard for all data structures.
- **Recharts**: Frontend data visualization library.
- **TanStack Query**: Frontend data fetching library.
- **Wouter**: Frontend client-side routing library.
- **Zod**: Schema validation library.
- **Nodemailer**: Used for OTP email verification (simulated to console in LAB mode).
- **better-sqlite3**: Database driver for SQLite.
- **bcrypt**: Password hashing library.
- **Express.js**: Backend web application framework.
- **React**: Frontend UI library.
- **TypeScript**: Programming language used for both frontend and backend.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **shadcn/ui**: UI component library.