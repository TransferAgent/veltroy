# CRITICAL PATCH 1 — ECS Version Pinned to 8.11.0
## Engineer 2 | Blueprint v1.2.1 | PATCH-001

All pipeline configurations are now explicitly version-locked. This patch applies to both the Wazuh/Logstash pipeline and the CloudTrail ingest config.

## Logstash pipelines.yml — ECS Version Lock

```yaml
- pipeline.id: wazuh-identity
  path.config: "/etc/logstash/conf.d/wazuh-identity.conf"
  pipeline.ecs_compatibility: v8    # Locks to ECS 8.x family

- pipeline.id: cloudtrail-iam
  path.config: "/etc/logstash/conf.d/cloudtrail-iam.conf"
  pipeline.ecs_compatibility: v8
```

## Elasticsearch Index Template — ECS 8.11.0 Explicit Pin

```json
{
  "index_patterns": [
    "logs-wazuh.security-*",
    "logs-aws.cloudtrail-*"
  ],
  "data_stream": {},
  "template": {
    "settings": {
      "index": {
        "default_pipeline": "identity-ecs-enrich",
        "number_of_shards": 1,
        "number_of_replicas": 1
      }
    },
    "mappings": {
      "_meta": {
        "ecs_version": "8.11.0",
        "pipeline": "identity-layer",
        "blueprint": "v1.2.1",
        "engineer": "engineer-2"
      }
    }
  },
  "priority": 200,
  "composed_of": ["ecs@8.11.0-mappings", "data-streams-mappings"]
}
```

## Validation

```bash
curl -s -X GET "localhost:9200/logs-wazuh.security-*/_mapping" \
  | jq '.[].mappings._meta.ecs_version'
# Expected output: "8.11.0"
```
