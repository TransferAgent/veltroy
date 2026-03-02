import { z } from "zod";

export const ECS_VERSION = "8.11.0";
export const NDR_BLUEPRINT_VER = "v1.2";

export const ecsDatasetEnum = z.enum([
  "zeek.conn", "zeek.dns", "zeek.http",
  "wazuh.linux", "wazuh.windows", "aws.cloudtrail",
  "ndr.correlation", "ndr.response",
]);

const ecsBaseSchema = z.object({
  ecs: z.object({
    version: z.literal(ECS_VERSION),
  }),
  agent: z.object({
    name: z.string(),
    type: z.string(),
    version: z.string(),
  }),
  observer: z.object({
    name: z.string(),
    type: z.string(),
    vendor: z.string(),
    product: z.string(),
  }),
});

export const networkEventSchema = ecsBaseSchema.extend({
  id: z.string(),
  "@timestamp": z.string(),
  event: z.object({
    id: z.string(),
    kind: z.enum(["event", "alert", "signal"]),
    category: z.array(z.string()),
    type: z.array(z.string()),
    outcome: z.enum(["success", "failure", "unknown"]),
    severity: z.number().min(0).max(100),
    module: z.string(),
    dataset: z.string(),
    created: z.string(),
    action: z.string().optional(),
    duration: z.number().optional(),
    risk_score: z.number().optional(),
  }),
  source: z.object({
    ip: z.string(),
    port: z.number(),
    bytes: z.number().optional(),
    packets: z.number().optional(),
    geo: z.object({
      country_name: z.string().optional(),
      country_iso_code: z.string().optional(),
      city_name: z.string().optional(),
      location: z.object({
        lat: z.number(),
        lon: z.number(),
      }).optional(),
    }).optional(),
  }),
  destination: z.object({
    ip: z.string(),
    port: z.number(),
    bytes: z.number().optional(),
    packets: z.number().optional(),
    geo: z.object({
      country_iso_code: z.string(),
      city_name: z.string().optional(),
      location: z.object({
        lat: z.number(),
        lon: z.number(),
      }).optional(),
    }).optional(),
  }),
  network: z.object({
    protocol: z.string(),
    transport: z.string().optional(),
    direction: z.enum(["ingress", "egress", "internal"]),
    bytes: z.number(),
    packets: z.number().optional(),
    community_id: z.string().optional(),
    type: z.string().optional(),
  }),
  host: z.object({
    name: z.string(),
    ip: z.array(z.string()),
    os: z.object({
      name: z.string(),
    }).optional(),
  }).optional(),
  related: z.object({
    ip: z.array(z.string()),
  }).optional(),
  rule: z.object({
    name: z.string(),
    id: z.string(),
  }).optional(),
  threat: z.object({
    indicator: z.string().optional(),
    technique: z.object({
      id: z.string(),
    }).optional(),
  }).optional(),
  labels: z.object({
    sensor_id: z.string().optional(),
    pipeline_version: z.string().optional(),
  }).optional(),
  dns: z.object({
    type: z.string(),
    question: z.object({
      name: z.string(),
      type: z.string(),
    }),
    response_code: z.string(),
    answers: z.array(z.object({
      data: z.string(),
      type: z.string(),
    })).optional(),
  }).optional(),
  url: z.object({
    full: z.string(),
    domain: z.string(),
    path: z.string(),
    scheme: z.string(),
  }).optional(),
  http: z.object({
    request: z.object({
      method: z.string(),
      bytes: z.number().optional(),
    }),
    response: z.object({
      status_code: z.number(),
      bytes: z.number().optional(),
    }).optional(),
    version: z.string().optional(),
  }).optional(),
  zeek: z.object({
    uid: z.string(),
    log_source: z.string(),
  }).optional(),
  ndr: z.object({
    blueprint_version: z.string(),
  }).optional(),
});

export type NetworkEvent = z.infer<typeof networkEventSchema>;

export const identityEventSchema = ecsBaseSchema.extend({
  id: z.string(),
  "@timestamp": z.string(),
  event: z.object({
    id: z.string(),
    kind: z.enum(["event", "alert"]),
    category: z.array(z.string()),
    type: z.array(z.string()),
    outcome: z.enum(["success", "failure", "unknown"]),
    action: z.string(),
    module: z.string(),
    dataset: z.string(),
    created: z.string(),
    severity: z.number().optional(),
    reason: z.string().optional(),
    provider: z.string().optional(),
  }),
  user: z.object({
    name: z.string(),
    full_name: z.string().optional(),
    email: z.string().optional(),
    domain: z.string().optional(),
    roles: z.array(z.string()).optional(),
    type: z.string().optional(),
    id: z.string().optional(),
  }),
  source: z.object({
    ip: z.string(),
    port: z.number().optional(),
    geo: z.object({
      country_name: z.string(),
      country_iso_code: z.string().optional(),
      city_name: z.string().optional(),
      location: z.object({
        lat: z.number(),
        lon: z.number(),
      }).optional(),
    }).optional(),
  }),
  host: z.object({
    hostname: z.string(),
    ip: z.string().optional(),
  }).optional(),
  log: z.object({
    file: z.object({
      path: z.string(),
    }),
  }).optional(),
  cloud: z.object({
    provider: z.string(),
    account: z.object({
      id: z.string(),
    }).optional(),
    region: z.string().optional(),
  }).optional(),
  message: z.string().optional(),
  related: z.object({
    ip: z.array(z.string()),
    user: z.array(z.string()),
  }).optional(),
  user_agent: z.object({
    original: z.string(),
    name: z.string().optional(),
  }).optional(),
  winlog: z.object({
    event_id: z.number(),
    channel: z.string(),
    logon_type: z.number().optional(),
  }).optional(),
  labels: z.object({
    identity_provider: z.string().optional(),
    mfa_used: z.boolean().optional(),
    risk_score: z.number().optional(),
  }).optional(),
  ndr: z.object({
    blueprint_version: z.string(),
  }).optional(),
});

export type IdentityEvent = z.infer<typeof identityEventSchema>;

export const attackPatternSchema = z.object({
  "@timestamp": z.string(),
  pattern_id: z.string(),
  pattern_name: z.string(),
  description: z.string(),
  mitre_technique_id: z.string(),
  mitre_tactic: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence_score: z.number().min(0).max(1),
  related_community_ids: z.array(z.string()),
  ioc_tags: z.array(z.string()),
  raw_pattern_text: z.string(),
  pattern_embedding: z.array(z.number()).optional(),
});

export type AttackPattern = z.infer<typeof attackPatternSchema>;

export const threatStatusEnum = z.enum(["new", "investigating", "resolved", "false_positive"]);

export const correlationSchema = z.object({
  id: z.string(),
  "@timestamp": z.string(),
  ecs: z.object({ version: z.literal(ECS_VERSION) }),
  threat: z.object({
    indicator: z.object({
      type: z.string(),
      description: z.string(),
      confidence: z.enum(["Low", "Medium", "High", "Critical"]),
    }),
    tactic: z.object({
      name: z.string(),
      id: z.string(),
    }),
    technique: z.object({
      name: z.string(),
      id: z.string(),
    }),
  }),
  related_events: z.array(z.string()),
  matched_pattern_id: z.string().optional(),
  severity: z.number().min(0).max(100),
  status: threatStatusEnum,
});

export type Correlation = z.infer<typeof correlationSchema>;

export const updateThreatStatusSchema = z.object({
  status: threatStatusEnum,
});

export const responseActionSchema = z.object({
  id: z.string(),
  "@timestamp": z.string(),
  ecs: z.object({ version: z.literal(ECS_VERSION) }),
  correlation_id: z.string(),
  action: z.object({
    type: z.enum(["block_ip", "isolate_host", "disable_account", "quarantine", "alert_only"]),
    target: z.string(),
    status: z.enum(["pending", "executing", "completed", "failed", "rolled_back"]),
  }),
  latency_ms: z.number(),
});

export type ResponseAction = z.infer<typeof responseActionSchema>;

export const pipelineMetricSchema = z.object({
  id: z.string(),
  "@timestamp": z.string(),
  stages: z.object({
    ingestion_ms: z.number(),
    identity_ms: z.number(),
    correlation_ms: z.number(),
    response_ms: z.number(),
  }),
  total_pipeline_ms: z.number(),
  events_processed: z.number(),
  sla_met: z.boolean(),
});

export type PipelineMetric = z.infer<typeof pipelineMetricSchema>;

export interface DashboardStats {
  totalEvents: number;
  activeThreats: number;
  responseActions: number;
  avgLatencyMs: number;
  slaCompliance: number;
  eventsPerSecond: number;
  threatsByConfidence: { confidence: string; count: number }[];
  severityDistribution: { range: string; count: number }[];
  pipelineStatus: "healthy" | "degraded" | "critical";
  logSourceBreakdown: { source: string; count: number }[];
  identitySourceBreakdown: { source: string; count: number }[];
  attackPatternCount: number;
}

export interface PipelineStatus {
  running: boolean;
  uptime_seconds: number;
  total_events_processed: number;
  current_latency_ms: number;
  sla_target_ms: number;
  sla_compliance_pct: number;
  stages: {
    name: string;
    status: "active" | "idle" | "error";
    avg_latency_ms: number;
    last_processed: string;
  }[];
}

export const sigmaAlertTypeEnum = z.enum([
  "C2_BEACON",
  "LATERAL_MOVE",
  "BRUTE_FORCE_SUCCESS",
  "SUSPICIOUS_IAM_KEY_ROTATION",
  "HOST_CARDINALITY_SPIKE",
]);

export const sigmaRuleSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["production", "testing", "deprecated"]),
  description: z.string(),
  author: z.string(),
  alert_type: sigmaAlertTypeEnum,
  mitre_technique_ids: z.array(z.string()),
  mitre_tactics: z.array(z.string()),
  severity: z.enum(["medium", "high", "critical"]),
  logsource_index: z.string(),
  detection_summary: z.string(),
  fields_to_contract: z.record(z.string()),
  false_positives: z.array(z.string()),
  fire_count: z.number(),
  last_fired: z.string().optional(),
  registered_at: z.string(),
});

export type SigmaRule = z.infer<typeof sigmaRuleSchema>;

export const eng4ActionTierEnum = z.enum([
  "TIER1_ISOLATE",
  "TIER2_QUARANTINE",
  "TIER3_INVESTIGATE",
  "NOMINAL",
]);

export const correlatedDocSchema = z.object({
  eng3_correlation_id: z.string(),
  "@timestamp": z.string(),
  source_ip: z.string(),
  host_id: z.string().optional(),
  host_name: z.string().optional(),
  network_community_id: z.string().optional(),
  user_name: z.string(),
  user_email: z.string().optional(),
  iam_user: z.string().optional(),
  aws_security_group_id: z.string().optional(),
  alert_type_hint: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  destination_ip: z.string(),
  destination_port: z.number(),
  network_protocol: z.string(),
  network_bytes: z.number().optional(),
  unique_dest_host_count: z.number(),
  unique_flow_count: z.number(),
  auth_country: z.string().optional(),
  mfa_used: z.boolean().optional(),
  identity_provider: z.string().optional(),
  auth_action: z.string().optional(),
  delta_seconds: z.number(),
  auth_timestamp: z.string(),
  network_timestamp: z.string(),
  session_window: z.string(),
  dbt_updated_at: z.string(),
});

export type CorrelatedDoc = z.infer<typeof correlatedDocSchema>;

export const hostCardinalitySchema = z.object({
  source_ip: z.string(),
  host_id: z.string().optional(),
  host_name: z.string().optional(),
  window_start: z.string(),
  window_end: z.string(),
  unique_dest_hosts: z.number(),
  unique_flows: z.number(),
  total_connections: z.number(),
  dest_host_list: z.array(z.string()),
  protocols_used: z.array(z.string()),
  ports_contacted: z.array(z.number()),
  max_flow_risk_score: z.number(),
  first_contact: z.string(),
  last_contact: z.string(),
  cardinality_severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  eng4_action_tier: eng4ActionTierEnum,
  kinetic_law2_escalated: z.boolean(),
  dbt_updated_at: z.string(),
});

export type HostCardinality = z.infer<typeof hostCardinalitySchema>;

export const dispatchSurfaceSchema = z.object({
  eng3_correlation_id: z.string(),
  host_ip: z.string(),
  host_id: z.string().optional(),
  alert_type: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  aws_security_group_id: z.string().optional(),
  iam_user: z.string().optional(),
  user_name: z.string().optional(),
  network_community_id: z.string().optional(),
  destination_ip: z.string(),
  destination_port: z.number(),
  network_protocol: z.string(),
  auth_country: z.string().optional(),
  mfa_used: z.boolean().optional(),
  unique_dest_hosts: z.number(),
  network_timestamp: z.string(),
  auth_timestamp: z.string(),
  session_window: z.string(),
  surface_generated_at: z.string(),
});

export type DispatchSurface = z.infer<typeof dispatchSurfaceSchema>;

export const sigmaFiringSchema = z.object({
  id: z.string(),
  "@timestamp": z.string(),
  sigma_rule_id: z.string(),
  alert_type: sigmaAlertTypeEnum,
  severity: z.enum(["MEDIUM", "HIGH", "CRITICAL"]),
  host_ip: z.string(),
  host_id: z.string().optional(),
  iam_user: z.string().optional(),
  description: z.string(),
  related_events: z.array(z.string()),
  eng4_action_tier: eng4ActionTierEnum.optional(),
  context_escalation: z.boolean(),
});

export type SigmaFiring = z.infer<typeof sigmaFiringSchema>;
