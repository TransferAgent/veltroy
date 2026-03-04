# Engineer 3 Audit — Detection Brain (Sigma/DBT Correlation)
## Blueprint v1.2 | 2026-03-04

**Module**: modules/detection_eng.py
**Audit Score**: 10/10 PASS
**Verdict**: AUDIT PASSED – Blueprint v1.2 Sprint 3

---

## CHECK 1: Pipeline Runs (5 cycles, all 5 Sigma rules confirmed)

| Run | Sigma Rules | Kinetic | Pipeline Time |
|-----|-------------|---------|---------------|
| 1 | 5/5 | 26 | 1.379s |
| 2 | 5/5 | 36 | 1.572s |
| 3 | 5/5 | 54 | 1.600s |
| 4 | 5/5 | 72 | 2.003s |
| 5 | 5/5 | 94 | 2.751s |

- **Sigma types**: C2_BEACON, LATERAL_MOVE, BRUTE_FORCE_SUCCESS, SUSPICIOUS_IAM_KEY_ROTATION, HOST_CARDINALITY_SPIKE
- **Unique correlation IDs**: 36
- **Average pipeline time**: 1.861s
- **Result**: PASS

## CHECK 2: Adaptive Temporal Windows (5/5 types verified)

| Sigma Rule | confidence | window_used | method |
|------------|-----------|-------------|--------|
| C2_BEACON | HIGH | 300 | source_ip_join_adaptive |
| LATERAL_MOVE | HIGH | 900 | source_ip_join_adaptive |
| BRUTE_FORCE_SUCCESS | HIGH | 120 | source_ip_join_adaptive |
| SUSPICIOUS_IAM_KEY_ROTATION | HIGH | 1800 | source_ip_join_adaptive |
| HOST_CARDINALITY_SPIKE | HIGH | 3600 | source_ip_join_adaptive |

- **Result**: PASS

## CHECK 3: ECS Guardian Rejection Test

- **AUDIT_BAD_A** (missing source.ip): Rejected to ndr-dlq
- **AUDIT_BAD_B** (ecs.version=7.0.0): Rejected to ndr-dlq
- **AUDIT_BAD_C** (missing event.category): Rejected to ndr-dlq
- **DLQ status after injection**: WARNING, unexpected_count=3
- **DLQ status after cleanup**: NOMINAL, unexpected_count=0
- **Result**: PASS (3 sub-checks: rejection, WARNING, revert)

## CHECK 4: Pre-Commit Pattern

- **pre_commit_written=true**: 47/47 records
- **pre_commit_written=false/null**: 0
- **Result**: PASS

## CHECK 5: community_id Per Rule Type

| Sigma Rule | community_id |
|------------|-------------|
| BRUTE_FORCE_SUCCESS | 1:3jZrh9mJWhtmK8OWBsqgk0Jt8h4= |
| C2_BEACON | 1:o6Sb7OnoheW+J3J9nFS1jBxCUAM= |
| HOST_CARDINALITY_SPIKE | 1:dNw/qOp5C1VyNx8778p01GMQ5kE= |
| LATERAL_MOVE | 1:/SfrPFKBZHG+gBvVBZYqmro8oww= |
| SUSPICIOUS_IAM_KEY_ROTATION | 1:YDCaBlT5VlYY4EwriX/7pfLaDkw= |

- **Result**: PASS

## CHECK 6: DLQ Watcher Live Test

- **Clean state**: NOMINAL (pc7=3, unexpected=0)
- **After injection**: WARNING (unexpected=3)
- **After cleanup**: NOMINAL (unexpected=0)
- **Result**: PASS

## CHECK 7: Sprint 2 API Endpoints

| Endpoint | Status | Detail |
|----------|--------|--------|
| POST /v1/state/kinetic | 200 OK | execution_state=IN_PROGRESS |
| GET /v1/audit/kinetic/{id} | 200 OK | correlation_confidence + correlation_window_used present |
| POST /v1/audit/kinetic/rollback | 200 OK | execution_state=ROLLED_BACK, rollback_token=AUDIT_TEST_TOKEN |

- **Result**: PASS (2 sub-checks)

---

## Fixes Applied During Audit

1. **ECS Guardian validation** (detection_eng.py line 262): Changed from `if not category AND not dataset` to separate checks — `event.category` and `event.dataset` are now independently validated.
2. **`_update_correlated_record`** (main.py): Added fallback lookup by `id` column when `eng3_correlation_id` match fails, matching `_fetch_correlated_by_id` behavior.

---

## FINAL SUMMARY

| # | Check | Result |
|---|-------|--------|
| 1 | All 5 Sigma rules fire | PASS |
| 2 | Adaptive Temporal Windows | PASS |
| 3 | ECS Guardian rejects 3/3 | PASS |
| 4 | DLQ WARNING on injection | PASS |
| 5 | DLQ reverts to NOMINAL | PASS |
| 6 | pre_commit_written=true | PASS |
| 7 | community_id all 5 types | PASS |
| 8 | DLQ Watcher cycle | PASS |
| 9 | POST state → 200 | PASS |
| 10 | GET audit + rollback | PASS |

**FINAL SCORE: 10/10 — ALL CHECKS PASS**

Comment `# AUDIT PASSED – Blueprint v1.2 Sprint 3` added to top of modules/detection_eng.py.
