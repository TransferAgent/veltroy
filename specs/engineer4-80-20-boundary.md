# ENGINEER 4 — 80/20 ENFORCEMENT BOUNDARY

## Automated (Engineer 4 owns — 80%)

- Host network isolation (SG revoke)
- IAM credential deactivation + DenyAll
- Console session invalidation
- Memory state preservation (SSM)
- SOC notification (Slack/Teams)
- Audit trail → Eng3 Data Lake

## Human / CPA (20% — manual gate required)

- Authorize forensic disk image
- Decide IR escalation path
- Approve recovery/re-provisioning window
- Legal/compliance notification (if PII involved)
- Root cause sign-off before re-enabling IAM user
