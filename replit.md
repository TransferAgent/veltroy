# NDR Platform

## Overview
The NDR Platform is an AI-driven Network Detection and Response prototype designed to deliver sub-60-second detection-to-response capabilities for cyber threats. It integrates specialized modules for network and identity event ingestion, threat correlation, and automated response orchestration. All data structures are compliant with ECS 8.11.0.

Key capabilities include:
- Ingestion of network metadata (Zeek) and identity logs (Wazuh, CloudTrail).
- Threat correlation using MITRE ATT&CK patterns, Sigma Rules, and DBT join logic.
- Automated response orchestration for identified threats.
- Real-time pipeline simulation and monitoring with a sub-60s SLA.

The project aims to establish a robust, AI-powered security platform capable of rapid threat neutralization, providing a significant advantage in defending against sophisticated cyber attacks.

## User Preferences
- **PLATFORM_VERSION=v1.2** — no version beyond v1.2 has been authorized.
- Do NOT modify index.css; use tailwind.config.ts for design tokens.
- The app starts in dark mode.

## System Architecture

### UI/UX Decisions
The frontend is built with React and TypeScript, leveraging Tailwind CSS and shadcn/ui. It features a default dark mode, a sidebar navigation, and dedicated pages for Dashboard, Events & Identity, Threats & Attack Patterns, Sigma Rules, Correlated data, Kinetic Layer, Responses, and Pipeline monitoring. Interactive tables, cards, and live charts are used for data visualization and interaction. Role-conditional views like `GridOperatorView` (super_admin) and `TransformerOwnerView` (non-super_admin) are implemented for tailored user experiences.

### Technical Implementations
The backend is an Express.js server in TypeScript orchestrating the NDR pipeline. The core logic is modularized into four "Engineer" components, with a Flask Bus serving as the orchestration layer and a DLQ Watcher for error handling.

**Core Modules (Engineers):**
- **Engineer 1 (Packet Metadata)**: Simulates Zeek traffic, generating ECS-compliant network logs with RFC-1918 direction heuristics and `network.community_id`. Includes sensor health state machine (ALIVE, DEGRADED, DARK) and high-cardinality detection.
- **Engineer 2 (Identity Logs)**: Simulates Wazuh and CloudTrail events, generating ECS-compliant Linux, Windows, and AWS authentication logs. Incorporates Wazuh rule-level severity scaling, CloudTrail IAM event classification, and GeoIP enrichment.
- **Engineer 3 (Data Correlation - Brain Layer)**: Handles data warehousing, Sigma rule evaluation (5 production rules including `HOST_CARDINALITY_SPIKE`), and DBT models (`ndr_network_identity_join`, `ndr_host_cardinality_60m`, `ndr_eng4_dispatch_surface`). Implements an ECS Guardian for validation, Network-Identity JOIN, and a Pre-Commit Pattern with Adaptive Temporal Windows before dispatching to Engineer 4.
- **Engineer 4 (Automated Response - Kinetic Layer)**: Orchestrates six automated response playbooks (KL-001 Host Isolation, KL-002 IAM Kill Switch, KL-003 Lateral Movement Response, KL-004 Authentication Spike Response, KL-005 AWS Console Anomaly Response, KL-006 SOAR Ticket Creation). All playbooks adhere to strict SLAs, include rollback capabilities, and support a state machine for execution tracking.

**Orchestration Layer:**
- `glue/correlator.py`: Calls the four Engineer modules sequentially, handling pipeline execution, statistics, health checks, and DLQ monitoring.
- `main.py`: A Flask server exposing API endpoints for pipeline execution, system health, kinetic state updates, audit records, and ticket management.
- **DLQ Watcher**: Monitors the Dead Letter Queue for unexpected entries, classifying DLQ health status (NOMINAL, WARNING, CRITICAL_DLQ_SPIKE).

**Authentication and Authorization:**
- Implements JWT validation and RBAC with five NDR roles (owner, super_admin, billing_admin, support, customer).
- Features a tenant proxy for multi-tenancy, a full registration/login flow with bcrypt hashing, OTP email verification, and trial tenant provisioning.
- Includes parent/child user invite functionality and role-specific access controls.

**Production Readiness:**
- Terraform configurations for OpenSearch, ECR, and App Runner are defined.
- SQL DDL for PostgreSQL and a migration script from SQLite to PostgreSQL are prepared for production deployment.

## External Dependencies

The platform integrates with and simulates data from the following external systems and standards:

- **Zeek**: Simulated network metadata ingestion (`conn.log`, `dns.log`, `http.log`).
- **Wazuh**: Simulated identity event ingestion (Linux and Windows logs).
- **AWS CloudTrail**: Simulated cloud identity event ingestion (IAM events).
- **MITRE ATT&CK Framework**: Used for threat correlation and mapping.
- **Elastic Common Schema (ECS) 8.11.0**: Standardizes all data structures.
- **Recharts**: For frontend data visualization.
- **TanStack Query**: For efficient data fetching in the frontend.
- **Wouter**: For client-side routing.
- **Zod**: For robust schema validation.
- **Nodemailer**: For email-based OTP verification (console logging in LAB mode).
- **OpenSearch**: Target for production data storage and querying (simulated with SQLite in LAB mode).
- **AWS SES**: Target for production email delivery.
- **RDS PostgreSQL**: Target for production database.