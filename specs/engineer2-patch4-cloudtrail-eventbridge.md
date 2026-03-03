# Engineer 2 | Blueprint v1.2 | PATCH-004
# CloudTrail EventBridge Upgrade Path Documentation

Architect Directive: "Document the upgrade from S3 polling to EventBridge/SQS for Phase 2."

## Current State (Lab / Phase 1)
- Architecture: Logstash S3 input plugin, polling every 30 seconds
- Latency: Up to 30 seconds (poll interval)
- Scale: Adequate for Lab (<500 events/min)
- Risk: S3 LIST API calls accumulate cost at scale

## Target State (Production / Phase 2)
- Architecture: CloudTrail → S3 → S3 Event Notification → SNS Topic → SQS Queue → Logstash SQS Input Plugin
- Latency: Near real-time (<3 seconds)
- Scale: Handles millions of events/day without polling
- Cost: SQS pricing replaces expensive S3 LIST calls

## Migration Steps (Phase 2 Execution)

### Step 1: Enable S3 Event Notifications on CloudTrail bucket
- Event type: `s3:ObjectCreated:*`
- Prefix filter: `AWSLogs/<ACCOUNT_ID>/CloudTrail/`

### Step 2: Create SNS Topic
- Name: `cloudtrail-iam-events`
- Subscribe SQS queue to SNS topic

### Step 3: Create SQS Queue
- Name: `cloudtrail-logstash-ingest`
- Visibility timeout: 300s (match Logstash batch window)
- Message retention: 4 days
- Dead-letter queue: `cloudtrail-dlq` (after 3 failures)

### Step 4: Update Logstash input block
```
input {
  sqs {
    queue             => "cloudtrail-logstash-ingest"
    region            => "us-east-1"
    polling_frequency => 10
    batch_size        => 10
    codec             => json
    access_key_id     => "${AWS_ACCESS_KEY_ID}"
    secret_access_key => "${AWS_SECRET_ACCESS_KEY}"
    add_field => {
      "[@metadata][pipeline]"  => "cloudtrail-iam"
      "[@metadata][transport]" => "eventbridge-sqs"
    }
  }
}
```

### Step 5: Validate DLQ
- Monitor `cloudtrail-dlq` for failed messages
- Alert if DLQ depth > 0 (Watcher job)

### Step 6: Decommission S3 polling input block

## Rollback Plan
S3 polling config is preserved in version control. If SQS pipeline fails, revert Logstash config and re-enable S3 polling within 5 minutes. No data loss — CloudTrail S3 files are retained for 90 days.

## Phase 2 Trigger Condition
Migrate when CloudTrail event volume exceeds 50,000 events/day OR when Lab graduates to production infrastructure. Whichever comes first.
