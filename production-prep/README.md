# NDR Platform — Production Deployment Sequence

Blueprint v1.2 | Sprint 4

## Prerequisites

- AWS CLI configured with appropriate IAM permissions
- Terraform >= 1.5 installed
- Docker installed and authenticated to ECR
- PostgreSQL RDS instance provisioned (or use Terraform)
- OpenSearch master credentials available

## Deployment Steps

### 1. Dry-Run Migration

```bash
DRY_RUN=true python3 production-prep/migration/sqlite_to_postgres.py
```

Verify source row counts before proceeding. Review `migration/schema_diff.md` for type promotions.

### 2. Create OpenSearch Domain (~15 min provisioning)

```bash
cd production-prep/terraform
terraform init
terraform apply -target=aws_opensearch_domain.ndr_platform
```

Wait for domain status: Active. Note the domain endpoint for `OPENSEARCH_HOST`.

### 3. Create ECR Repository

```bash
terraform apply -target=aws_ecr_repository.ndr_platform
terraform apply -target=aws_ecr_lifecycle_policy.ndr_platform
```

### 4. Build and Push Docker Image

```bash
cd ../..
docker build -t ndr-platform:v1.2 .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag ndr-platform:v1.2 <account>.dkr.ecr.us-east-1.amazonaws.com/ndr-platform:v1.2
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/ndr-platform:v1.2
```

### 5. Deploy App Runner Service

Update placeholder values in `app-runner-service.tf`:
- `OPENSEARCH_HOST` → OpenSearch domain endpoint
- `DB_HOST` → RDS PostgreSQL endpoint

```bash
cd production-prep/terraform
terraform apply -target=aws_apprunner_service.ndr_platform_prod
```

### 6. Run Phase Gate 1 Oracle (PRODUCTION)

```bash
DEPLOYMENT_STAGE=PRODUCTION python3 oracle/ndr_phase_gate_1_oracle_v1.py
```

Target: 12/12 PASS. Do not proceed to live migration until Oracle clears.

### 7. Live Data Migration

```bash
python3 production-prep/migration/sqlite_to_postgres.py
```

Verify counts match source vs target. Review any mismatches before declaring production-ready.

## Post-Deployment

- Monitor `/health` endpoint via App Runner health checks
- Run `GET /dlq/health` to confirm DLQ Watcher is NOMINAL
- Verify all 6 kinetic playbooks fire against live AWS resources
- Confirm SOAR tickets land in `ndr.tickets` (PostgreSQL, not SQLite)
