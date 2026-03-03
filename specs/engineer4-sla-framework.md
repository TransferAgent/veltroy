# KINETIC LAYER — SLA FRAMEWORK v1.2.2

| METRIC            | TARGET  | MEASUREMENT POINT              |
|--------------------|---------|--------------------------------|
| T₀ (Alert In)      | t=0s    | Webhook received by n8n        |
| T₁ (Validated)     | t<2s    | Circuit breaker pass           |
| T₂ (SG Isolated)   | t<10s   | AWS API confirm revoke         |
| T₃ (IAM Killed)    | t<12s   | Access key → Inactive          |
| T₄ (SOC Notified)  | t<15s   | Slack message delivered         |
| T₅ (Audit Logged)  | t<20s   | POST to Eng3 Data Lake OK      |
| T_TOTAL (E2E)      | < 30s   | Webhook → All Actions Complete |

## Replit-Specific Optimizations for <30s

| Optimization       | Detail                                                    |
|--------------------|-----------------------------------------------------------|
| AWS CLI Pre-auth   | Use instance role or env vars — no aws configure at runtime |
| n8n Parallel Fanout| SG + IAM + SSM execute in parallel (not sequential)        |
| Webhook Keep-Alive | Replit sleeps after 5min — use UptimeRobot ping on /health |
| No DNS Lookups     | Use AWS endpoint IPs in ~/.aws/config for us-east-1        |
| Slack Async        | Slack notification is non-blocking — doesn't add to critical path |

## Replit Environment Note

n8n + AWS CLI cold start ~3-5s. Pre-warm the workflow using the /health endpoint every 5 min.
