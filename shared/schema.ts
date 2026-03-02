import { z } from "zod";

export const ECS_VERSION = "8.11.0";
export const NDR_BLUEPRINT_VER = "v1.2";

export const ecsDatasetEnum = z.enum(["zeek.conn", "zeek.dns", "zeek.http", "ndr.identity", "ndr.correlation", "ndr.response"]);

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
  }),
  source: z.object({
    ip: z.string(),
    port: z.number(),
    geo: z.object({
      country_name: z.string(),
    }).optional(),
  }),
  destination: z.object({
    ip: z.string(),
    port: z.number(),
  }),
  network: z.object({
    protocol: z.string(),
    direction: z.enum(["ingress", "egress", "internal"]),
    bytes: z.number(),
    community_id: z.string().optional(),
  }),
  host: z.object({
    name: z.string(),
    ip: z.array(z.string()),
  }).optional(),
  related: z.object({
    ip: z.array(z.string()),
  }).optional(),
  rule: z.object({
    name: z.string(),
    id: z.string(),
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
  }),
  user: z.object({
    name: z.string(),
    domain: z.string().optional(),
    roles: z.array(z.string()).optional(),
  }),
  source: z.object({
    ip: z.string(),
    geo: z.object({
      country_name: z.string(),
    }).optional(),
  }),
  related: z.object({
    ip: z.array(z.string()),
    user: z.array(z.string()),
  }).optional(),
  user_agent: z.object({
    original: z.string(),
  }).optional(),
});

export type IdentityEvent = z.infer<typeof identityEventSchema>;

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
