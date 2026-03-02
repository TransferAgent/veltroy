# NDR Platform - Phase Gate 0

## Overview
AI-driven Network Detection and Response (NDR) platform prototype. Integrates four specialized modules:
- **Eng 1 - Packet Metadata**: Network event ingestion and processing
- **Eng 2 - Identity Logs**: Authentication and identity event tracking
- **Eng 3 - Data Correlation**: MITRE ATT&CK threat correlation engine
- **Eng 4 - Automated Response**: Automated response orchestration

All data structures are ECS 8.11.0 compliant. The Oracle Script monitors end-to-end pipeline latency with a sub-60-second detection-to-response SLA target.

## Architecture

### Frontend (React + TypeScript)
- `client/src/App.tsx` - Main app layout with sidebar navigation
- `client/src/components/theme-provider.tsx` - Dark/light mode (dark default)
- `client/src/components/app-sidebar.tsx` - Navigation sidebar with live stats
- `client/src/pages/dashboard.tsx` - Command center overview
- `client/src/pages/events.tsx` - Network events table (Eng 1)
- `client/src/pages/identity.tsx` - Identity logs table (Eng 2)
- `client/src/pages/threats.tsx` - Threat correlation cards (Eng 3)
- `client/src/pages/responses.tsx` - Response actions table (Eng 4)
- `client/src/pages/pipeline.tsx` - Oracle Script pipeline monitor

### Backend (Express + TypeScript)
- `server/routes.ts` - API endpoints
- `server/pipeline.ts` - NDR pipeline simulation engine
- `server/storage.ts` - Re-exports pipeline

### Shared
- `shared/schema.ts` - ECS 8.11.0 compliant Zod schemas and TypeScript types

## API Endpoints
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/events` - Network events (Eng 1)
- `GET /api/identity` - Identity events (Eng 2)
- `GET /api/threats` - Threat correlations (Eng 3)
- `PATCH /api/threats/:id` - Update threat status
- `GET /api/responses` - Response actions (Eng 4)
- `GET /api/pipeline/metrics` - Pipeline latency metrics
- `GET /api/pipeline/status` - Pipeline status (Oracle Script)

## Key Features
- Real-time pipeline simulation generating ECS-compliant events every 4 seconds
- MITRE ATT&CK tactic and technique mapping
- Sub-60s SLA monitoring with compliance tracking
- Dark/light theme toggle
- Filterable tables for events, identity logs, and responses
- Interactive threat status management
- Live charts for latency breakdown and throughput

## Tech Stack
- React, TypeScript, Tailwind CSS, shadcn/ui
- Express.js backend
- Recharts for data visualization
- TanStack Query for data fetching
- Wouter for client-side routing
- Zod for schema validation
