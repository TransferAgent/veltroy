# NDR Platform - Phase Gate 0

## Overview
AI-driven Network Detection and Response (NDR) platform prototype. Integrates four specialized modules:
- **Eng 1 - Packet Metadata**: Network event ingestion via Zeek Traffic Simulator (conn.log, dns.log, http.log)
- **Eng 2 - Identity Logs**: Identity event ingestion via Wazuh + CloudTrail simulators (linux, windows, cloudtrail)
- **Eng 3 - Data Correlation**: MITRE ATT&CK threat correlation engine + Attack Pattern vector index
- **Eng 4 - Automated Response**: Automated response orchestration

All data structures are ECS 8.11.0 compliant. The Oracle Script monitors end-to-end pipeline latency with a sub-60-second detection-to-response SLA target.

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
- `client/src/pages/responses.tsx` - Response actions table (Eng 4)
- `client/src/pages/pipeline.tsx` - Oracle Script pipeline monitor

### Backend (Express + TypeScript)
- `server/routes.ts` - API endpoints
- `server/pipeline.ts` - NDR pipeline simulation engine (delegates to Engineer modules)
- `server/engines/network-eng.ts` - Engineer 1 Traffic Simulator: generates ECS-compliant conn/dns/http logs from Zeek field mappings
- `server/engines/identity-eng.ts` - Engineer 2 Identity Simulator: generates ECS-compliant auth events from Wazuh/CloudTrail configs
- `server/engines/correlation-eng.ts` - Engineer 3 Attack Pattern Seeder: generates 15 seeded attack patterns with MITRE ATT&CK mappings, IoC tags, detection rules, and community ID linking
- `server/storage.ts` - Re-exports pipeline

### Shared
- `shared/schema.ts` - ECS 8.11.0 compliant Zod schemas with Zeek + identity + attack pattern fields

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
- **Blueprint version**: v1.2.1
- **wazuh.linux**: auth.log/secure monitoring, SSH/PAM/sudo events, Wazuh rule.level→event.severity mapping (0-15 scaled to 0-100), log.file.path, host.hostname, host.ip, source.port
- **wazuh.windows**: Security Event Channel, Event IDs 4624/4625/4720/4740/7045, winlog.event_id, winlog.logon_type, host.ip
- **aws.cloudtrail**: IAM events (ConsoleLogin, AssumeRole, CreateUser, AttachUserPolicy, DeleteUser, GetSessionToken, UpdateAccountPasswordPolicy), cloud.provider/account.id/region, user.type, user.id (ARN), event.provider, user_agent.name, GeoIP enrichment
- **ndr-identity-* fields** (Eng 3 template): labels.identity_provider, labels.mfa_used, labels.risk_score, user_agent.name
- **Held patches**: ECS pin, IDENTITY-006 rebuild, GeoIP architecture, EventBridge upgrade, Heartbeat, Index naming

## Engineer 3 Integration (OpenSearch Index Templates)
Three index templates structurally mapped into the platform data layer:
- **ndr-network-*** (1A): Extended network event schema with event.duration, event.risk_score, network.transport/packets/type, source/dest bytes/packets/geo, host.os.name, labels.sensor_id/pipeline_version, threat.indicator/technique.id
- **ndr-identity-*** (1B): Extended identity event schema with user.full_name/email, user_agent.name, related.ip/user, labels.identity_provider/mfa_used/risk_score
- **ndr-attack-patterns** (1C): Semantic vector index with 15 seeded patterns — pattern_id, pattern_name, description, mitre_technique_id, mitre_tactic, severity (low/medium/high/critical), confidence_score (0-1), related_community_ids (linked to network flows), ioc_tags, raw_pattern_text (detection rules), pattern_embedding (1536-dim kNN vector placeholder)
- **Correlation linking**: correlationSchema.matched_pattern_id links threat detections to their matching attack pattern
- **Blueprint version**: v1.3 (Attack Patterns page)

## API Endpoints
- `GET /api/dashboard/stats` - Dashboard statistics including logSourceBreakdown, identitySourceBreakdown, attackPatternCount
- `GET /api/events` - Network events (Eng 1: zeek.conn, zeek.dns, zeek.http)
- `GET /api/identity` - Identity events (Eng 2: wazuh.linux, wazuh.windows, aws.cloudtrail)
- `GET /api/threats` - Threat correlations with matched_pattern_id (Eng 3)
- `PATCH /api/threats/:id` - Update threat status (Zod validated)
- `GET /api/attack-patterns` - Attack pattern vector index (Eng 3)
- `GET /api/responses` - Response actions (Eng 4)
- `GET /api/pipeline/metrics` - Pipeline latency metrics
- `GET /api/pipeline/status` - Pipeline status (Oracle Script)

## Key Features
- Real-time pipeline simulation generating ECS-compliant events every 4 seconds
- Three Zeek log streams with distinct tabbed views and specialized columns
- Three identity log streams with distinct tabbed views (Linux auth, Windows Security, AWS CloudTrail)
- 15 seeded attack patterns with MITRE ATT&CK mappings, IoC tags, and detection rules
- Community ID computation for cross-tool correlation + pattern linking
- RFC-1918 direction heuristic matching Zeek's Site::is_local_addr logic
- Wazuh rule.level severity scaling and Windows Event ID tracking
- CloudTrail IAM event classification (authentication vs iam)
- MITRE ATT&CK tactic and technique mapping
- Sub-60s SLA monitoring with compliance tracking
- Dark/light theme toggle
- Filterable tables/cards with search across IPs, domains, URLs, rules, users, hosts, IoCs, techniques
- Interactive threat status management with pattern matching
- Live charts: latency breakdown, severity distribution, log source pie chart

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
- Blueprint versions: v1.2 (Eng 1 Zeek), v1.2.1 (Eng 2 Identity), v1.3 (Eng 3 Attack Patterns)
