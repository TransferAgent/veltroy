# Engineer 2 | Blueprint v1.2 | PATCH-005
# Wazuh Agent Heartbeat Monitoring

Architect Directive: "If a Wazuh agent goes silent, we need to know."

## Configuration

```xml
<ossec_config>
  <global>
    <agents_disconnection_time>300</agents_disconnection_time>
    <agents_disconnection_alert_time>300</agents_disconnection_alert_time>
  </global>
</ossec_config>
```

## Rules

### IDENTITY-007: Agent Silent Alert (rule id 100300, level 12)
- Trigger: Wazuh agent disconnected (base rule 502)
- Fires when agent is silent for > 5 minutes
- ECS mapping: `event.kind = alert`, `event.category = host`
- Description: Agent has gone SILENT. Identity telemetry gap on host. Community_id correlation NOW DEGRADED for this endpoint.
- Dataset: `wazuh.agent_health`
- Index: `logs-wazuh.infrastructure-*`

### IDENTITY-008: Agent Flapping Alert (rule id 100301, level 7)
- Trigger: Same agent (agent.id) disconnects multiple times within 1 hour
- Timeframe: 3600 seconds
- Match field: `agent.id`
- Description: Agent has disconnected MULTIPLE TIMES in 1 hour. Possible instability or tampering.
- Dataset: `wazuh.agent_health`

## Data Lake Impact
Agent health alerts map to `event.dataset: wazuh.agent_health` and appear in the Data Lake under `logs-wazuh.infrastructure-*`. Engineer 3 should be aware this index exists for cross-layer health dashboards.
