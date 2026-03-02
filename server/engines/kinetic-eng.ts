import type { DispatchSurface, KineticExecution, KL002Execution, RollbackExecution } from "@shared/schema";

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
  aws_security_group_id: string;
  iam_user: string;
  iam_access_key_id: string;
  aws_region: string;
  admin_session_active: boolean;
  alert_timestamp: string;
  eng3_correlation_id: string;
  sigma_rule_id?: string;
  mitre_tactic?: string;
  mitre_technique?: string;
}

const INTERFACE_CONTRACT_REQUIRED = [
  "host_ip",
  "host_id",
  "alert_type",
  "severity",
  "aws_security_group_id",
  "iam_user",
  "iam_access_key_id",
  "aws_region",
  "admin_session_active",
  "alert_timestamp",
  "eng3_correlation_id",
] as const;

const INTERFACE_CONTRACT_OPTIONAL = [
  "sigma_rule_id",
  "mitre_tactic",
  "mitre_technique",
] as const;

function validateInterfaceContract(payload: Record<string, unknown>): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const field of INTERFACE_CONTRACT_REQUIRED) {
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

    const payload: InterfaceContractPayload = {
      host_ip: entry.host_ip,
      host_id: entry.host_id,
      alert_type: entry.alert_type,
      severity: entry.severity,
      aws_security_group_id: entry.aws_security_group_id,
      iam_user: entry.iam_user,
      iam_access_key_id: entry.iam_access_key_id,
      aws_region: entry.aws_region,
      admin_session_active: entry.admin_session_active,
      alert_timestamp: entry.alert_timestamp,
      eng3_correlation_id: entry.eng3_correlation_id,
      sigma_rule_id: entry.sigma_rule_id,
      mitre_tactic: entry.mitre_tactic,
      mitre_technique: entry.mitre_technique,
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

const KL002_ACTIONS = [
  "VERIFY_CALLER_IDENTITY",
  "IAM_KEY_DEACTIVATE",
  "IAM_ENUMERATE_ALL_KEYS",
  "IAM_ATTACH_DENY_ALL",
  "IAM_SESSION_INVALIDATION",
  "AUDIT_RECORD_POSTED",
];

function generateFakeAccessKeyId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key = "AKIA";
  for (let i = 0; i < 16; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function maskAccessKeyId(keyId: string): string {
  if (keyId.length < 8) return "****";
  return `${keyId.slice(0, 4)}****${keyId.slice(-4)}`;
}

const processedKL002Users = new Set<string>();

export function processKL002FromDispatch(
  dispatchEntries: DispatchSurface[]
): KL002Execution[] {
  const executions: KL002Execution[] = [];

  for (const entry of dispatchEntries) {
    const iamUser = entry.iam_user || entry.user_name;
    if (!iamUser || iamUser === "unknown") continue;

    const alertUpper = entry.alert_type.toUpperCase();
    const isIamRelated =
      alertUpper === "SUSPICIOUS_IAM_KEY_ROTATION" ||
      alertUpper === "BRUTE_FORCE_SUCCESS" ||
      entry.severity === "CRITICAL";

    if (!isIamRelated) continue;

    const dedupeKey = `${iamUser}|${entry.eng3_correlation_id}`;
    if (processedKL002Users.has(dedupeKey)) continue;

    const accessKeyId = entry.iam_access_key_id || generateFakeAccessKeyId();
    const tsStart = Date.now();
    const now = new Date();
    const durationMs = Math.floor(Math.random() * 3500) + 500;
    const tsEnd = new Date(tsStart + durationMs);

    const actionsTaken: KL002Execution["actions_taken"] = KL002_ACTIONS.map((action, i) => {
      const numKeys = Math.floor(Math.random() * 3) + 1;
      let detail = "";
      switch (action) {
        case "VERIFY_CALLER_IDENTITY":
          detail = `Caller identity verified — Account=123456789012`;
          break;
        case "IAM_KEY_DEACTIVATE":
          detail = `Key ${maskAccessKeyId(accessKeyId)} set to Inactive`;
          break;
        case "IAM_ENUMERATE_ALL_KEYS":
          detail = `Found ${numKeys} active key(s) for ${iamUser} — all deactivated`;
          break;
        case "IAM_ATTACH_DENY_ALL":
          detail = `AWSDenyAll attached to ${iamUser}`;
          break;
        case "IAM_SESSION_INVALIDATION":
          detail = `Console password rotated + reset required for ${iamUser}`;
          break;
        case "AUDIT_RECORD_POSTED":
          detail = `Audit record posted to Eng3 Data Lake — schema v1.2`;
          break;
      }
      return {
        action,
        status: "SIMULATED" as const,
        timestamp: new Date(tsStart + i * 100).toISOString(),
        detail,
        dry_run: false,
      };
    });

    const execution: KL002Execution = {
      execution_id: `KL002-${tsStart}-${Math.random().toString(36).slice(2, 6)}`,
      playbook_id: "KL-002",
      schema_version: "1.2",
      "@timestamp": now.toISOString(),
      state: "COMPLETE",
      iam_user: iamUser,
      access_key_id_masked: maskAccessKeyId(accessKeyId),
      region: entry.aws_region || "us-east-1",
      dry_run: false,
      sweep_all_keys: true,
      actions_taken: actionsTaken,
      timestamps: {
        start: now.toISOString(),
        end: tsEnd.toISOString(),
        duration_ms: durationMs,
        sla_met: durationMs < 5000,
      },
      status: "SUCCESS",
      error: null,
      triggered_by: entry.eng3_correlation_id,
      ndr: {
        blueprint_version: "v1.2",
      },
    };

    executions.push(execution);
    processedKL002Users.add(dedupeKey);
  }

  if (processedKL002Users.size > 1000) {
    const entries = Array.from(processedKL002Users);
    entries.splice(0, entries.length - 500);
    processedKL002Users.clear();
    entries.forEach((id) => processedKL002Users.add(id));
  }

  return executions;
}

const ROLLBACK_ACTIONS = [
  "FETCH_ORIGINAL_AUDIT",
  "SG_RESTORE",
  "IAM_KEY_REACTIVATE",
  "IAM_POLICY_DETACH",
  "ROLLBACK_AUDIT_POSTED",
];

export function executeRollback(
  originalExecutionId: string,
  authorizedBy: string,
  dryRun: boolean,
  kl001Executions: KineticExecution[],
  kl002Executions: KL002Execution[],
): RollbackExecution {
  const tsStart = Date.now();
  const now = new Date();
  const rollbackExecId = `RB-${tsStart}-${Math.random().toString(36).slice(2, 6)}`;

  const kl001Match = kl001Executions.find((e) => e.execution_id === originalExecutionId);
  const kl002Match = kl002Executions.find((e) => e.execution_id === originalExecutionId);

  const originalPlaybook = kl001Match ? "KL-001" : kl002Match ? "KL-002" : "UNKNOWN";

  const target = {
    host_ip: kl001Match?.host_ip,
    sg_id: kl001Match?.aws_security_group_id || `sg-${Math.random().toString(36).slice(2, 10)}`,
    iam_user: kl001Match?.iam_user || kl002Match?.iam_user || "unknown",
    access_key_id_masked: kl002Match?.access_key_id_masked || "AKIA****XXXX",
  };

  const durationMs = Math.floor(Math.random() * 2000) + 300;
  const tsEnd = new Date(tsStart + durationMs);

  const originalFound = !!(kl001Match || kl002Match);

  const actions: RollbackExecution["actions"] = ROLLBACK_ACTIONS.map((action, i) => {
    let detail = "";
    let status: "SUCCESS" | "SKIPPED" | "FAILURE" | "SIMULATED";
    if (action === "FETCH_ORIGINAL_AUDIT") {
      status = originalFound ? "SUCCESS" : "FAILURE";
      detail = originalFound
        ? `Audit record retrieved for execution_id: ${originalExecutionId}`
        : `No audit record found for ${originalExecutionId} — target fields unavailable`;
    } else if (dryRun) {
      status = "SKIPPED";
      switch (action) {
        case "SG_RESTORE":
          detail = `DRY RUN — would restore ingress + egress rules on ${target.sg_id}`;
          break;
        case "IAM_KEY_REACTIVATE":
          detail = `DRY RUN — would reactivate ${target.access_key_id_masked} for ${target.iam_user}`;
          break;
        case "IAM_POLICY_DETACH":
          detail = `DRY RUN — would detach DenyAll policies from ${target.iam_user}`;
          break;
        case "ROLLBACK_AUDIT_POSTED":
          detail = `DRY RUN — rollback audit would be posted — authorized by ${authorizedBy}`;
          break;
      }
    } else {
      status = "SIMULATED";
      switch (action) {
        case "SG_RESTORE":
          detail = `SG ${target.sg_id} restored to pre-isolation state`;
          break;
        case "IAM_KEY_REACTIVATE":
          detail = `Key ${target.access_key_id_masked} reactivated for ${target.iam_user}`;
          break;
        case "IAM_POLICY_DETACH":
          detail = `All DenyAll policies removed from ${target.iam_user}`;
          break;
        case "ROLLBACK_AUDIT_POSTED":
          detail = `Rollback audit posted — authorized by ${authorizedBy}`;
          break;
      }
    }
    return {
      action,
      status,
      timestamp: new Date(tsStart + i * 80).toISOString(),
      detail,
      dry_run: dryRun,
    };
  });

  const hasFailure = actions.some((a) => a.status === "FAILURE");
  const overallStatus: "SUCCESS" | "PARTIAL_FAILURE" | "ABORTED" =
    !originalFound && !dryRun ? "PARTIAL_FAILURE" : hasFailure && !dryRun ? "PARTIAL_FAILURE" : "SUCCESS";

  return {
    rollback_execution_id: rollbackExecId,
    original_execution_id: originalExecutionId,
    original_playbook_id: originalPlaybook,
    playbook_id: "KL-ROLLBACK-001",
    schema_version: "1.2",
    "@timestamp": now.toISOString(),
    state: "COMPLETE",
    authorized_by: authorizedBy,
    authorization_valid: true,
    dry_run: dryRun,
    target,
    actions,
    timestamps: {
      start: now.toISOString(),
      end: tsEnd.toISOString(),
      duration_ms: durationMs,
    },
    status: overallStatus,
    ndr: {
      blueprint_version: "v1.2",
    },
  };
}

export function getInterfaceContractSchema(): object {
  return {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "ndr-platform/kinetic-layer/inbound-alert/v1.2",
    title: "KL Inbound Alert Payload",
    description: "Signed contract between Engineer 3 (Data Layer) and Engineer 4 (Kinetic Layer). Both parties must validate against this schema before production go-live.",
    type: "object",
    required: [...INTERFACE_CONTRACT_REQUIRED],
    properties: {
      host_ip:               { type: "string", format: "ipv4" },
      host_id:               { type: "string", minLength: 1 },
      alert_type:            { type: "string", enum: ["C2_BEACON", "LATERAL_MOVEMENT", "AUTH_SPIKE", "AWS_CONSOLE_ANOMALY", "DATA_EXFIL"] },
      severity:              { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      aws_security_group_id: { type: "string", pattern: "^sg-[0-9a-f]{8,17}$" },
      iam_user:              { type: "string", minLength: 1 },
      iam_access_key_id:     { type: "string", pattern: "^AKIA[0-9A-Z]{16}$" },
      aws_region:            { type: "string", pattern: "^[a-z]{2}-[a-z]+-[0-9]$" },
      admin_session_active:  { type: "boolean" },
      alert_timestamp:       { type: "string", format: "date-time" },
      eng3_correlation_id:   { type: "string", minLength: 8, description: "Eng3 internal ID for cross-system audit correlation" },
      sigma_rule_id:         { type: "string", description: "Optional — Sigma rule that fired" },
      mitre_tactic:          { type: "string", description: "Optional — MITRE ATT&CK tactic" },
      mitre_technique:       { type: "string", description: "Optional — MITRE ATT&CK technique ID" },
    },
    additionalProperties: false,
    fields: [
      ...INTERFACE_CONTRACT_REQUIRED.map((f) => ({ name: f, required: true })),
      ...INTERFACE_CONTRACT_OPTIONAL.map((f) => ({ name: f, required: false })),
    ],
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
