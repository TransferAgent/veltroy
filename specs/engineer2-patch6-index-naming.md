# Engineer 2 | Blueprint v1.2 | PATCH-006
# Index Naming — APPLIED (Ratified)

The Engineer 3 canonical index naming standard is ratified in the Interface Contract v1.2.

## Authoritative Index Names (No suffix, no alias, no variant)
1. `ndr-network`
2. `ndr-identity`
3. `ndr-correlated`
4. `ndr-dlq`

## Status
- FULLY APPLIED across all modules
- All four index names are enforced in: `network_eng.py`, `identity_eng.py`, `detection_eng.py`, `correlator.py`
- No legacy `logs-wazuh.*` or `logs-aws.*` references remain in production code
- No date suffixes, no wildcards, no aliases
