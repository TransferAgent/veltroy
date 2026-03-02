import type { DispatchSurface, KineticExecution } from "@shared/schema";

const ACTIONS_EXPECTED_TIER1 = [
  "AWS_SG_REVOKE_INGRESS",
  "AWS_SG_REVOKE_EGRESS",
  "AWS_SG_TAG_ISOLATION",
  "AWS_SG_BASTION_SSH",
  "IAM_KEY_DEACTIVATE",
  "IAM_DENY_ALL_ATTACH",
  "HOST_MEMORY_PRESERVE",
  "SOC_NOTIFICATION",
];

const ACTIONS_EXPECTED_TIER2 = [
  ...ACTIONS_EXPECTED_TIER1,
];

const ACTIONS_EXPECTED_TIER3 = [
  ...ACTIONS_EXPECTED_TIER1,
];

interface InterfaceContractPayload {
  host_ip: string;
  host_id: string;
  alert_type: string;
  severity: string;
  admin_session_active: boolean;
  aws_security_group_id: string;
  iam_user: string;
  eng3_correlation_id: string;
  network_community_id: string;
  destination_ip: string;
  destination_port: number;
}

const INTERFACE_CONTRACT_FIELDS = [
  "host_ip",
  "host_id",
  "alert_type",
  "severity",
  "admin_session_active",
  "aws_security_group_id",
  "iam_user",
  "eng3_correlation_id",
  "network_community_id",
  "destination_ip",
  "destination_port",
] as const;

function validateInterfaceContract(payload: Record<string, unknown>): { valid: boolean; missing: string[] } {
  const required: string[] = ["host_ip", "alert_type", "severity", "aws_security_group_id", "iam_user"];
  const missing: string[] = [];
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      missing.push(field);
    }
  }
  return { valid: missing.length === 0, missing };
}

function classifyTier(
  alertType: string,
  severity: string,
  adminSessionActive: boolean
): { tier: KineticExecution["response_tier"]; reason: string } {
  const sev = severity.toUpperCase();
  const alert = alertType.toUpperCase();

  if (alert === "C2_BEACON" && adminSessionActive && sev === "CRITICAL") {
    return {
      tier: "TIER_2_ESCALATE",
      reason: "C2 beacon confirmed + active admin session + CRITICAL severity",
    };
  }
  if (alert === "C2_BEACON" && adminSessionActive) {
    return {
      tier: "TIER_2_ESCALATE",
      reason: "C2 beacon confirmed + active admin session",
    };
  }
  if (alert === "C2_BEACON") {
    return {
      tier: "TIER_1_ISOLATE",
      reason: "C2 beacon confirmed — isolation proceeds regardless of session state",
    };
  }
  if (sev === "CRITICAL") {
    return {
      tier: "TIER_3_EMERGENCY",
      reason: "CRITICAL severity alert — emergency response regardless of type",
    };
  }
  if (sev === "HIGH") {
    return {
      tier: "TIER_1_ISOLATE",
      reason: `HIGH severity alert type ${alert}`,
    };
  }
  return {
    tier: "TIER_0_SUPPRESS",
    reason: `Severity ${sev} / Type ${alert} below isolation threshold`,
  };
}

function getActionsForTier(tier: KineticExecution["response_tier"]): string[] {
  switch (tier) {
    case "TIER_1_ISOLATE":
      return ACTIONS_EXPECTED_TIER1;
    case "TIER_2_ESCALATE":
      return ACTIONS_EXPECTED_TIER2;
    case "TIER_3_EMERGENCY":
      return ACTIONS_EXPECTED_TIER3;
    default:
      return [];
  }
}

function simulateActions(actions: string[]): KineticExecution["actions_completed"] {
  const now = Date.now();
  return actions.map((action, i) => ({
    action,
    status: "SIMULATED" as const,
    timestamp: new Date(now + i * 50).toISOString(),
  }));
}

const processedCorrelationIds = new Set<string>();

export function processDispatchSurface(
  dispatchEntries: DispatchSurface[]
): KineticExecution[] {
  const executions: KineticExecution[] = [];

  for (const entry of dispatchEntries) {
    if (processedCorrelationIds.has(entry.eng3_correlation_id)) {
      continue;
    }

    const adminSessionActive = Math.random() < 0.4;

    const payload: InterfaceContractPayload = {
      host_ip: entry.host_ip,
      host_id: entry.host_id || `host-${entry.host_ip.replace(/\./g, "-")}`,
      alert_type: entry.alert_type,
      severity: entry.severity,
      admin_session_active: adminSessionActive,
      aws_security_group_id: entry.aws_security_group_id || `sg-${Math.random().toString(36).slice(2, 10)}`,
      iam_user: entry.iam_user || entry.user_name || "unknown",
      eng3_correlation_id: entry.eng3_correlation_id,
      network_community_id: entry.network_community_id || "",
      destination_ip: entry.destination_ip,
      destination_port: entry.destination_port,
    };

    const validation = validateInterfaceContract(payload as unknown as Record<string, unknown>);
    if (!validation.valid) {
      continue;
    }

    const { tier, reason } = classifyTier(
      payload.alert_type,
      payload.severity,
      payload.admin_session_active
    );

    if (tier === "TIER_0_SUPPRESS") {
      processedCorrelationIds.add(entry.eng3_correlation_id);
      continue;
    }

    const tsReceived = new Date().toISOString();
    const executionId = `KL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const actionsExpected = getActionsForTier(tier);
    const actionsCompleted = simulateActions(actionsExpected);
    const tsCompleted = new Date().toISOString();
    const responseMs = Math.floor(Math.random() * 8000) + 500;
    const responseSeconds = parseFloat((responseMs / 1000).toFixed(3));

    const execution: KineticExecution = {
      execution_id: executionId,
      playbook_id: "KL-001",
      schema_version: "1.2",
      "@timestamp": tsReceived,
      response_tier: tier,
      tier_reason: reason,
      state: "COMPLETE",
      host_ip: payload.host_ip,
      host_id: payload.host_id,
      alert_type: payload.alert_type,
      severity: payload.severity,
      admin_session_active: payload.admin_session_active,
      aws_security_group_id: payload.aws_security_group_id,
      iam_user: payload.iam_user,
      eng3_correlation_id: payload.eng3_correlation_id,
      actions_expected: actionsExpected,
      actions_completed: actionsCompleted,
      timestamps: {
        alert_received: tsReceived,
        state_written: tsReceived,
        action_completed: tsCompleted,
        response_time_ms: responseMs,
        sla_met: responseMs < 30000,
      },
      labels: {
        eng4_kl001_response_seconds: responseSeconds,
      },
      sg_isolation: {
        ingress_revoked: true,
        egress_revoked: true,
        bastion_ssh_permitted: true,
        sg_tagged: true,
      },
      iam_actions: {
        key_deactivated: true,
        deny_all_attached: true,
      },
      memory_preserved: true,
      soc_notified: true,
      ndr: {
        blueprint_version: "v1.2",
      },
    };

    executions.push(execution);
    processedCorrelationIds.add(entry.eng3_correlation_id);
  }

  if (processedCorrelationIds.size > 1000) {
    const entries = Array.from(processedCorrelationIds);
    entries.splice(0, entries.length - 500);
    processedCorrelationIds.clear();
    entries.forEach((id) => processedCorrelationIds.add(id));
  }

  return executions;
}

export function getInterfaceContractSchema(): object {
  return {
    schema_id: "ndr-eng4-interface-contract-v1.2",
    version: "1.2",
    description: "Interface Contract JSON Schema — defines the 11-field payload Engineer 3 dispatch surface sends to Engineer 4 kinetic layer",
    fields: INTERFACE_CONTRACT_FIELDS.map((f) => ({
      name: f,
      required: ["host_ip", "alert_type", "severity", "aws_security_group_id", "iam_user"].includes(f),
    })),
    tier_classification: {
      TIER_0_SUPPRESS: "Low/Medium severity, non-beacon, no session — no action taken",
      TIER_1_ISOLATE: "C2_BEACON detected (session state irrelevant) OR HIGH severity — full isolation",
      TIER_2_ESCALATE: "C2_BEACON + active admin session — escalated containment",
      TIER_3_EMERGENCY: "Any CRITICAL severity regardless of type — emergency response",
    },
    sla_target_ms: 30000,
    playbook_id: "KL-001",
    ndr_blueprint_version: "v1.2",
  };
}
