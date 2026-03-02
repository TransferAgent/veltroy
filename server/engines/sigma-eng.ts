import { randomUUID } from "crypto";
import type {
  NetworkEvent,
  IdentityEvent,
  SigmaRule,
  SigmaFiring,
  CorrelatedDoc,
} from "@shared/schema";

const SIGMA_RULE_DEFS: SigmaRule[] = [
  {
    id: "ndr-sigma-C2_BEACON",
    title: "NDR - C2 Beacon Detection (Low-Jitter Periodic Outbound)",
    status: "production",
    description:
      "Detects command-and-control beaconing via low-jitter, low-payload periodic outbound connections to a single external IP. Maps to Interface Contract alert_type: C2_BEACON. Severity: CRITICAL if >20 connections; HIGH if >10.",
    author: "Engineer 3 — Blueprint v1.2",
    alert_type: "C2_BEACON",
    mitre_technique_ids: ["T1071.001", "T1571"],
    mitre_tactics: ["command_and_control"],
    severity: "critical",
    logsource_index: "ndr-network-*",
    detection_summary:
      "event.category:network AND network.direction:outbound AND network.bytes<1024 AND destination NOT RFC-1918 | groupby source.ip,destination.ip | timeframe 60m | count>10 AND stddev(event.duration)<800",
    fields_to_contract: {
      alert_type: "C2_BEACON",
      severity_map: "count>20→CRITICAL, count>10→HIGH",
      host_ip: "source.ip",
      host_id: "host.id",
    },
    false_positives: [
      "Monitoring agent heartbeats (whitelist via labels.service_account)",
    ],
    fire_count: 0,
    registered_at: new Date().toISOString(),
  },
  {
    id: "ndr-sigma-LATERAL_MOVE",
    title: "NDR - Lateral Movement via Auth + SMB/RDP/WMI Fan-Out",
    status: "production",
    description:
      "Detects post-authentication lateral movement. A user authenticates successfully then immediately initiates connections to multiple internal hosts over lateral movement protocols (SMB/RDP/WMI/SSH). The Identity Layer (Eng2) and Network Layer (Eng1) signals are BOTH required — this fires on the correlated index only. Maps to Interface Contract alert_type: LATERAL_MOVE.",
    author: "Engineer 3 — Blueprint v1.2",
    alert_type: "LATERAL_MOVE",
    mitre_technique_ids: ["T1021", "T1021.001", "T1021.002"],
    mitre_tactics: ["lateral_movement"],
    severity: "high",
    logsource_index: "ndr-correlated-*",
    detection_summary:
      "auth_anchor(event.category:authentication AND event.outcome:success) AND lateral_protocol(destination.port IN 445,3389,5985,22,135) AND host_spread(unique_destinations>=3) | groupby source.ip,user.name | timeframe 30m",
    fields_to_contract: {
      alert_type: "LATERAL_MOVE",
      severity: "HIGH",
      host_ip: "source.ip",
      host_id: "host.id",
      iam_user: "user.name",
    },
    false_positives: [
      "Sysadmin RDP sessions during change windows",
      "Automated patch deployment tools",
    ],
    fire_count: 0,
    registered_at: new Date().toISOString(),
  },
  {
    id: "ndr-sigma-BRUTE_FORCE_SUCCESS",
    title: "NDR - Brute Force Culminating in Successful Authentication",
    status: "production",
    description:
      "The most dangerous brute force variant: an attacker who SUCCEEDS. Detects a pattern of ≥10 authentication failures from a single source.ip followed by a SUCCESS from the same IP, targeting the same or multiple user accounts within a 10-minute window. Maps to Interface Contract alert_type: BRUTE_FORCE_SUCCESS.",
    author: "Engineer 3 — Blueprint v1.2",
    alert_type: "BRUTE_FORCE_SUCCESS",
    mitre_technique_ids: ["T1110", "T1110.001"],
    mitre_tactics: ["credential_access", "initial_access"],
    severity: "critical",
    logsource_index: "ndr-identity-*",
    detection_summary:
      "failure_burst(event.category:authentication AND event.outcome:failure) AND success_confirmation(event.outcome:success) | groupby source.ip | timeframe 10m | count(failures)>=10 AND count(success)>=1 | ordered:true",
    fields_to_contract: {
      alert_type: "BRUTE_FORCE_SUCCESS",
      severity: "CRITICAL",
      host_ip: "source.ip",
      iam_user: "user.name",
      aws_sg_id: "labels.aws_sg_id",
    },
    false_positives: [
      "Typo-followed-by-correct-password (single failure only — threshold=10 filters this)",
    ],
    fire_count: 0,
    registered_at: new Date().toISOString(),
  },
  {
    id: "ndr-sigma-SUSPICIOUS_IAM_KEY_ROTATION",
    title: "NDR - Suspicious AWS IAM Access Key Rotation (Persistence Setup)",
    status: "production",
    description:
      "Detects an IAM user creating a new access key immediately after a suspicious auth event (new geo, after-hours, following brute force). This is the persistence play — attacker locks in access before the compromised password is changed. Maps to Interface Contract alert_type: SUSPICIOUS_IAM_KEY_ROTATION.",
    author: "Engineer 3 — Blueprint v1.2",
    alert_type: "SUSPICIOUS_IAM_KEY_ROTATION",
    mitre_technique_ids: ["T1098.001", "T1078.004"],
    mitre_tactics: ["persistence", "privilege_escalation"],
    severity: "critical",
    logsource_index: "ndr-identity-*",
    detection_summary:
      "key_creation(event.dataset:aws.cloudtrail AND event.action:CreateAccessKey) AND (suspicious_context OR self_rotation)",
    fields_to_contract: {
      alert_type: "SUSPICIOUS_IAM_KEY_ROTATION",
      severity: "CRITICAL",
      iam_user: "user.name",
      aws_security_group_id: "labels.aws_sg_id",
      host_ip: "source.ip",
    },
    false_positives: [
      "Approved key rotation via IaC (tag with labels.iac_deploy=true to suppress)",
      "Onboarding flows (new user first key creation)",
    ],
    fire_count: 0,
    registered_at: new Date().toISOString(),
  },
  {
    id: "ndr-sigma-HOST_CARDINALITY_SPIKE",
    title:
      "NDR - Host Cardinality Spike (The Vectra Killer — Tier 1 ISOLATE Trigger)",
    status: "production",
    description:
      "The primary trigger for Tier 1 ISOLATE action by Engineer 4. Tracks the number of unique INTERNAL hosts a single source IP communicates with over a 60-minute rolling window. Thresholds: ≥20 unique hosts → CRITICAL (immediate ISOLATE); ≥10 → HIGH (QUARANTINE + INVESTIGATE); ≥5 → MEDIUM (INVESTIGATE). Kinetic Law #2: ANY concurrent signal auto-escalates one tier. Maps to Interface Contract alert_type: HOST_CARDINALITY_SPIKE. This is the PRIMARY Phase Gate 0 trigger.",
    author: "Engineer 3 — Blueprint v1.2 (Vectra Killer)",
    alert_type: "HOST_CARDINALITY_SPIKE",
    mitre_technique_ids: ["T1018", "T1046", "T1135"],
    mitre_tactics: ["discovery", "lateral_movement"],
    severity: "critical",
    logsource_index: "ndr-network-*",
    detection_summary:
      "internal_fan_out(source.ip:RFC-1918 AND destination.ip:RFC-1918 AND network.direction:internal) NOT exclude_known_scanners | groupby source.ip | timeframe 60m | count(distinct destination.ip)>=5 | escalation: >=20→CRITICAL/ISOLATE, >=10→HIGH/QUARANTINE, >=5→MEDIUM/INVESTIGATE",
    fields_to_contract: {
      alert_type: "HOST_CARDINALITY_SPIKE",
      host_ip: "source.ip",
      host_id: "host.id",
      severity: "derived from threshold",
    },
    false_positives: [
      "Network vulnerability scanners (excluded via host.name filter)",
      "Backup agents performing network discovery",
      "Domain controllers during policy refresh (tag DC IPs in labels.dc_ip=true)",
    ],
    fire_count: 0,
    registered_at: new Date().toISOString(),
  },
];

function isRfc1918(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function hourBucket(ts: string): string {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export function getSigmaRules(): SigmaRule[] {
  return SIGMA_RULE_DEFS.map((r) => ({ ...r }));
}

export function evaluateC2Beacon(
  networkEvents: NetworkEvent[],
): SigmaFiring[] {
  const rule = SIGMA_RULE_DEFS[0];
  const firings: SigmaFiring[] = [];
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  const recent = networkEvents.filter((e) => {
    const ts = new Date(e["@timestamp"]).getTime();
    return now - ts <= windowMs;
  });

  const outbound = recent.filter(
    (e) =>
      e.network.direction === "egress" &&
      e.network.bytes < 1024 &&
      !isRfc1918(e.destination.ip),
  );

  const groups = new Map<string, NetworkEvent[]>();
  for (const e of outbound) {
    const key = `${e.source.ip}|${e.destination.ip}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  for (const [key, events] of groups) {
    if (events.length < 10) continue;

    const durations = events
      .map((e) => e.event.duration)
      .filter((d): d is number => d != null);
    if (durations.length > 1) {
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance =
        durations.reduce((a, d) => a + (d - mean) ** 2, 0) / durations.length;
      const stddev = Math.sqrt(variance);
      if (stddev >= 800) continue;
    }

    const severity = events.length > 20 ? "CRITICAL" : "HIGH";
    const sourceIp = key.split("|")[0];
    rule.fire_count++;
    rule.last_fired = new Date().toISOString();

    firings.push({
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      sigma_rule_id: rule.id,
      alert_type: "C2_BEACON",
      severity,
      host_ip: sourceIp,
      description: `C2 beacon detected: ${events.length} low-jitter outbound connections from ${sourceIp} to ${key.split("|")[1]} in 60m window (stddev < 800ms)`,
      related_events: events.slice(0, 10).map((e) => e.id),
      context_escalation: false,
    });
  }
  return firings;
}

export function evaluateLateralMove(
  correlatedDocs: CorrelatedDoc[],
): SigmaFiring[] {
  const rule = SIGMA_RULE_DEFS[1];
  const firings: SigmaFiring[] = [];
  const LATERAL_PORTS = [445, 3389, 5985, 22, 135];
  const now = Date.now();
  const windowMs = 30 * 60 * 1000;

  const recent = correlatedDocs.filter((d) => {
    const ts = new Date(d["@timestamp"]).getTime();
    return now - ts <= windowMs;
  });

  const lateral = recent.filter((d) =>
    LATERAL_PORTS.includes(d.destination_port),
  );

  const groups = new Map<string, CorrelatedDoc[]>();
  for (const d of lateral) {
    const key = `${d.source_ip}|${d.user_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  for (const [key, docs] of groups) {
    const uniqueDests = new Set(docs.map((d) => d.destination_ip));
    if (uniqueDests.size < 3) continue;

    const [sourceIp, userName] = key.split("|");
    rule.fire_count++;
    rule.last_fired = new Date().toISOString();

    firings.push({
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      sigma_rule_id: rule.id,
      alert_type: "LATERAL_MOVE",
      severity: "HIGH",
      host_ip: sourceIp,
      iam_user: userName,
      description: `Lateral movement detected: ${userName}@${sourceIp} connected to ${uniqueDests.size} unique internal hosts via lateral protocols (SMB/RDP/WMI/SSH) within 30m`,
      related_events: docs
        .slice(0, 10)
        .map((d) => d.eng3_correlation_id),
      context_escalation: false,
    });
  }
  return firings;
}

export function evaluateBruteForceSuccess(
  identityEvents: IdentityEvent[],
): SigmaFiring[] {
  const rule = SIGMA_RULE_DEFS[2];
  const firings: SigmaFiring[] = [];
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  const recent = identityEvents.filter((e) => {
    const ts = new Date(e["@timestamp"]).getTime();
    return (
      now - ts <= windowMs &&
      e.event.category.includes("authentication")
    );
  });

  const bySourceIp = new Map<string, IdentityEvent[]>();
  for (const e of recent) {
    if (!bySourceIp.has(e.source.ip)) bySourceIp.set(e.source.ip, []);
    bySourceIp.get(e.source.ip)!.push(e);
  }

  for (const [ip, events] of bySourceIp) {
    const sorted = events.sort(
      (a, b) =>
        new Date(a["@timestamp"]).getTime() -
        new Date(b["@timestamp"]).getTime(),
    );

    const failures = sorted.filter((e) => e.event.outcome === "failure");
    const successes = sorted.filter((e) => e.event.outcome === "success");

    if (failures.length < 10 || successes.length < 1) continue;

    const lastFailure = new Date(
      failures[failures.length - 1]["@timestamp"],
    ).getTime();
    const firstSuccess = successes.find(
      (s) => new Date(s["@timestamp"]).getTime() >= lastFailure,
    );
    if (!firstSuccess) continue;

    rule.fire_count++;
    rule.last_fired = new Date().toISOString();

    firings.push({
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      sigma_rule_id: rule.id,
      alert_type: "BRUTE_FORCE_SUCCESS",
      severity: "CRITICAL",
      host_ip: ip,
      iam_user: firstSuccess.user.name,
      description: `Brute force SUCCESS: ${failures.length} auth failures from ${ip} followed by successful login as ${firstSuccess.user.name} within 10m window`,
      related_events: [
        ...failures.slice(-5).map((e) => e.id),
        firstSuccess.id,
      ],
      context_escalation: false,
    });
  }
  return firings;
}

export function evaluateSuspiciousIAMKeyRotation(
  identityEvents: IdentityEvent[],
): SigmaFiring[] {
  const rule = SIGMA_RULE_DEFS[3];
  const firings: SigmaFiring[] = [];

  const cloudtrail = identityEvents.filter(
    (e) => e.event.dataset === "aws.cloudtrail",
  );

  const keyCreations = cloudtrail.filter(
    (e) => e.event.action === "CreateAccessKey",
  );

  for (const creation of keyCreations) {
    const ts = new Date(creation["@timestamp"]).getTime();
    const hour = new Date(creation["@timestamp"]).getUTCHours();
    const afterHours = hour < 6 || hour > 20;

    const recentBruteForce = identityEvents.some(
      (e) =>
        e.event.outcome === "failure" &&
        e.source.ip === creation.source.ip &&
        Math.abs(new Date(e["@timestamp"]).getTime() - ts) < 600000,
    );

    if (afterHours || recentBruteForce) {
      rule.fire_count++;
      rule.last_fired = new Date().toISOString();

      firings.push({
        id: randomUUID(),
        "@timestamp": new Date().toISOString(),
        sigma_rule_id: rule.id,
        alert_type: "SUSPICIOUS_IAM_KEY_ROTATION",
        severity: "CRITICAL",
        host_ip: creation.source.ip,
        iam_user: creation.user.name,
        description: `Suspicious IAM key creation by ${creation.user.name} from ${creation.source.ip}${afterHours ? " (after-hours)" : ""}${recentBruteForce ? " (preceded by brute force)" : ""}`,
        related_events: [creation.id],
        context_escalation: false,
      });
    }
  }
  return firings;
}

export function evaluateHostCardinalitySpike(
  networkEvents: NetworkEvent[],
  concurrentSignalIps: Set<string>,
): SigmaFiring[] {
  const rule = SIGMA_RULE_DEFS[4];
  const firings: SigmaFiring[] = [];
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  const recent = networkEvents.filter((e) => {
    const ts = new Date(e["@timestamp"]).getTime();
    return now - ts <= windowMs;
  });

  const internal = recent.filter(
    (e) =>
      isRfc1918(e.source.ip) &&
      isRfc1918(e.destination.ip) &&
      e.network.direction === "internal" &&
      !(e.host?.name || "").toLowerCase().includes("vuln-scanner") &&
      !(e.host?.name || "").toLowerCase().includes("nessus") &&
      !(e.host?.name || "").toLowerCase().includes("qualys"),
  );

  const bySource = new Map<string, Set<string>>();
  const bySourceEvents = new Map<string, NetworkEvent[]>();
  for (const e of internal) {
    if (!bySource.has(e.source.ip)) {
      bySource.set(e.source.ip, new Set());
      bySourceEvents.set(e.source.ip, []);
    }
    bySource.get(e.source.ip)!.add(e.destination.ip);
    bySourceEvents.get(e.source.ip)!.push(e);
  }

  for (const [ip, dests] of bySource) {
    if (dests.size < 5) continue;

    const hasEscalation = concurrentSignalIps.has(ip);

    let baseSeverity: "MEDIUM" | "HIGH" | "CRITICAL";
    let actionTier: "TIER1_ISOLATE" | "TIER2_QUARANTINE" | "TIER3_INVESTIGATE";

    if (dests.size >= 20) {
      baseSeverity = "CRITICAL";
      actionTier = "TIER1_ISOLATE";
    } else if (dests.size >= 10) {
      baseSeverity = "HIGH";
      actionTier = "TIER2_QUARANTINE";
    } else {
      baseSeverity = "MEDIUM";
      actionTier = "TIER3_INVESTIGATE";
    }

    if (hasEscalation) {
      if (baseSeverity === "MEDIUM") {
        baseSeverity = "HIGH";
        actionTier = "TIER2_QUARANTINE";
      } else if (baseSeverity === "HIGH") {
        baseSeverity = "CRITICAL";
        actionTier = "TIER1_ISOLATE";
      }
    }

    rule.fire_count++;
    rule.last_fired = new Date().toISOString();

    const events = bySourceEvents.get(ip) || [];
    firings.push({
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      sigma_rule_id: rule.id,
      alert_type: "HOST_CARDINALITY_SPIKE",
      severity: baseSeverity,
      host_ip: ip,
      description: `Host cardinality spike: ${ip} contacted ${dests.size} unique internal hosts in 60m window${hasEscalation ? " (Kinetic Law #2: context escalation applied)" : ""}`,
      related_events: events.slice(0, 10).map((e) => e.id),
      eng4_action_tier: actionTier,
      context_escalation: hasEscalation,
    });
  }
  return firings;
}

export function runAllSigmaRules(
  networkEvents: NetworkEvent[],
  identityEvents: IdentityEvent[],
  correlatedDocs: CorrelatedDoc[],
): SigmaFiring[] {
  const bruteForce = evaluateBruteForceSuccess(identityEvents);
  const iamKey = evaluateSuspiciousIAMKeyRotation(identityEvents);

  const concurrentSignalIps = new Set<string>();
  for (const f of bruteForce) concurrentSignalIps.add(f.host_ip);
  for (const f of iamKey) concurrentSignalIps.add(f.host_ip);

  const c2 = evaluateC2Beacon(networkEvents);
  for (const f of c2) concurrentSignalIps.add(f.host_ip);

  const cardinality = evaluateHostCardinalitySpike(
    networkEvents,
    concurrentSignalIps,
  );
  const lateral = evaluateLateralMove(correlatedDocs);

  return [...c2, ...lateral, ...bruteForce, ...iamKey, ...cardinality];
}
