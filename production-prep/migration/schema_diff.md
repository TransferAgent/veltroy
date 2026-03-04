# Schema Diff — SQLite to PostgreSQL

Blueprint v1.2 | Sprint 4

## ndr-network → ndr.ndr_network

| SQLite Column | SQLite Type | PostgreSQL Column | PostgreSQL Type | Notes |
|---------------|-------------|-------------------|-----------------|-------|
| id | TEXT | id | TEXT | Primary key |
| timestamp | TEXT | timestamp | TEXT | ISO-8601 string |
| event_json | TEXT | event_json | TEXT | JSON document |
| event_kind | TEXT | event_kind | TEXT | |
| event_dataset | TEXT | event_dataset | TEXT | |
| source_ip | TEXT | source_ip | TEXT | |
| destination_ip | TEXT | destination_ip | TEXT | |
| community_id | TEXT | community_id | TEXT | |
| severity | INTEGER | severity | BIGINT | Type promotion |
| blueprint_version | TEXT | blueprint_version | TEXT | |
| created_at | TEXT | created_at | TIMESTAMPTZ | Type promotion |

## ndr-identity → ndr.ndr_identity

| SQLite Column | SQLite Type | PostgreSQL Column | PostgreSQL Type | Notes |
|---------------|-------------|-------------------|-----------------|-------|
| id | TEXT | id | TEXT | Primary key |
| timestamp | TEXT | timestamp | TEXT | ISO-8601 string |
| event_json | TEXT | event_json | TEXT | JSON document |
| event_kind | TEXT | event_kind | TEXT | |
| event_dataset | TEXT | event_dataset | TEXT | |
| source_ip | TEXT | source_ip | TEXT | |
| user_name | TEXT | user_name | TEXT | |
| alert_rule_id | TEXT | alert_rule_id | TEXT | |
| severity | INTEGER | severity | BIGINT | Type promotion |
| blueprint_version | TEXT | blueprint_version | TEXT | |
| created_at | TEXT | created_at | TIMESTAMPTZ | Type promotion |

## ndr-correlated → ndr.ndr_correlated

| SQLite Column | SQLite Type | PostgreSQL Column | PostgreSQL Type | Notes |
|---------------|-------------|-------------------|-----------------|-------|
| id | TEXT | id | TEXT | Primary key |
| timestamp | TEXT | timestamp | TEXT | ISO-8601 string |
| event_json | TEXT | event_json | TEXT | JSON document |
| eng3_correlation_id | TEXT | eng3_correlation_id | TEXT | Unique |
| alert_type | TEXT | alert_type | TEXT | |
| severity | TEXT | severity | TEXT | |
| sigma_rule_id | TEXT | sigma_rule_id | TEXT | |
| source_ip | TEXT | source_ip | TEXT | |
| host_ip | TEXT | host_ip | TEXT | |
| iam_user | TEXT | iam_user | TEXT | |
| pre_commit_written | INTEGER | pre_commit_written | BOOLEAN | Cast: 0/1 → false/true |
| dispatched | INTEGER | dispatched | BOOLEAN | Cast: 0/1 → false/true |
| dispatch_payload | TEXT | dispatch_payload | TEXT | JSON string |
| blueprint_version | TEXT | blueprint_version | TEXT | |
| created_at | TEXT | created_at | TIMESTAMPTZ | Type promotion |

## ndr-dlq → ndr.ndr_dlq

| SQLite Column | SQLite Type | PostgreSQL Column | PostgreSQL Type | Notes |
|---------------|-------------|-------------------|-----------------|-------|
| id | TEXT | id | TEXT | Primary key |
| timestamp | TEXT | timestamp | TEXT | ISO-8601 string |
| event_json | TEXT | event_json | TEXT | JSON document |
| rejection_reason | TEXT | rejection_reason | TEXT | |
| source_index | TEXT | source_index | TEXT | |
| blueprint_version | TEXT | blueprint_version | TEXT | |
| created_at | TEXT | created_at | TIMESTAMPTZ | Type promotion |

**Flag**: `dlq_watcher_flag` is stored inside `event_json` as TEXT `"true"`/`"false"` in SQLite. In PostgreSQL, cast to BOOLEAN when extracting from JSON: `(event_json::jsonb->>'dlq_watcher_flag')::boolean`.

## ndr-tickets → ndr.ndr_tickets

| SQLite Column | SQLite Type | PostgreSQL Column | PostgreSQL Type | Notes |
|---------------|-------------|-------------------|-----------------|-------|
| id | TEXT | id | TEXT | Primary key |
| timestamp | TEXT | timestamp | TEXT | ISO-8601 string |
| ticket_json | TEXT | ticket_json | TEXT | JSON document |
| alert_type | TEXT | alert_type | TEXT | |
| eng3_correlation_id | TEXT | eng3_correlation_id | TEXT | |
| severity | TEXT | severity | TEXT | |
| source_ip | TEXT | source_ip | TEXT | |
| status | TEXT | status | TEXT | Default: OPEN |
| ticket_source | TEXT | ticket_source | TEXT | Default: SOAR_AUTO |
| tenant_id | TEXT | tenant_id | TEXT | Default: default |
| blueprint_version | TEXT | blueprint_version | TEXT | |
| created_at | TEXT | created_at | TIMESTAMPTZ | Type promotion |

## ndr-kinetic → ndr.ndr_kinetic

| SQLite Column | SQLite Type | PostgreSQL Column | PostgreSQL Type | Notes |
|---------------|-------------|-------------------|-----------------|-------|
| id | TEXT | id | TEXT | Primary key |
| timestamp | TEXT | timestamp | TEXT | ISO-8601 string |
| execution_json | TEXT | execution_json | TEXT | JSON document |
| execution_id | TEXT | execution_id | TEXT | Unique |
| playbook_id | TEXT | playbook_id | TEXT | |
| response_tier | TEXT | response_tier | TEXT | |
| state | TEXT | state | TEXT | |
| host_ip | TEXT | host_ip | TEXT | |
| alert_type | TEXT | alert_type | TEXT | |
| eng3_correlation_id | TEXT | eng3_correlation_id | TEXT | |
| response_time_ms | INTEGER | response_time_ms | BIGINT | Type promotion |
| sla_met | INTEGER | sla_met | BOOLEAN | Cast: 0/1 → false/true |
| blueprint_version | TEXT | blueprint_version | TEXT | |
| created_at | TEXT | created_at | TIMESTAMPTZ | Type promotion |

## Type Promotion Summary

| SQLite Type | PostgreSQL Type | Affected Columns |
|-------------|-----------------|------------------|
| TEXT | TEXT | Most columns (no change) |
| TEXT (datetime) | TIMESTAMPTZ | All created_at columns |
| INTEGER | BIGINT | severity (network/identity), response_time_ms (kinetic) |
| INTEGER (0/1) | BOOLEAN | pre_commit_written, dispatched, sla_met |
| TEXT ("true"/"false") | BOOLEAN | dlq_watcher_flag (inside event_json) |
