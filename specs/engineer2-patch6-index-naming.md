# Engineer 2 | Blueprint v1.2 | PATCH-006
# Index Naming — Position Statement

Architect Directive: "Engineer 3 defines the canonical standard. Align to it."

## Current Identity Layer Index Names
- `logs-wazuh.security-{YYYY.MM.dd}`
- `logs-aws.cloudtrail-{YYYY.MM.dd}`
- `logs-wazuh.infrastructure-{YYYY.MM.dd}` (new — heartbeat, PATCH-005)

## Engineer 2 Commitment
- Will adopt Engineer 3's canonical naming standard in full, without modification, upon receipt of the formal schema definition.
- No index names from this layer are considered fixed until Engineer 3's standard is published and ratified by the Architect.
- Temporary aliases will be created at migration to ensure zero data loss during the rename transition.

## Conflict Record
- Engineer 1 uses: `zeek.*`
- Engineer 2 uses: `logs-wazuh.*`, `logs-aws.*`
- Arbiter: Engineer 3 (pending)
- Resolution ETA: Sprint 2 close
