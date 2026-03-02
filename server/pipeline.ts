import { randomUUID } from "crypto";
import type {
  NetworkEvent,
  IdentityEvent,
  Correlation,
  ResponseAction,
  PipelineMetric,
  PipelineStatus,
} from "@shared/schema";
import { ECS_VERSION, NDR_BLUEPRINT_VER } from "@shared/schema";
import { generateTrafficBatch } from "./engines/network-eng";
import { generateIdentityBatch } from "./engines/identity-eng";

const USERS = ["admin", "jdoe", "svc_backup", "root", "developer01", "analyst", "db_admin", "guest", "support", "cto"];
const COUNTRIES = ["United States", "Russia", "China", "Germany", "Brazil", "Netherlands", "South Korea", "Iran", "Romania", "Ukraine"];

const MITRE_TACTICS = [
  { name: "Reconnaissance", id: "TA0043" },
  { name: "Initial Access", id: "TA0001" },
  { name: "Execution", id: "TA0002" },
  { name: "Persistence", id: "TA0003" },
  { name: "Credential Access", id: "TA0006" },
  { name: "Lateral Movement", id: "TA0008" },
  { name: "Exfiltration", id: "TA0010" },
  { name: "Command and Control", id: "TA0011" },
];

const MITRE_TECHNIQUES = [
  { name: "Network Service Scanning", id: "T1046", tactic: 0 },
  { name: "Exploit Public-Facing Application", id: "T1190", tactic: 1 },
  { name: "Brute Force", id: "T1110", tactic: 4 },
  { name: "Valid Accounts", id: "T1078", tactic: 3 },
  { name: "Application Layer Protocol", id: "T1071", tactic: 7 },
  { name: "Exfiltration Over Alternative Protocol", id: "T1048", tactic: 6 },
  { name: "Remote Services", id: "T1021", tactic: 5 },
  { name: "Scheduled Task/Job", id: "T1053", tactic: 2 },
  { name: "DNS Tunneling", id: "T1572", tactic: 7 },
  { name: "Data Staged", id: "T1074", tactic: 6 },
];

const ECS_BASE = {
  ecs: { version: ECS_VERSION as typeof ECS_VERSION },
  agent: { name: "ndr-agent", type: "ndr", version: "0.1.0" },
  observer: { name: "ndr-sensor-01", type: "ids", vendor: "NDR Platform", product: "Phase Gate 0" },
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randIP(): string {
  return `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

function internalIP(): string {
  return `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

export class NDRPipeline {
  networkEvents: NetworkEvent[] = [];
  identityEvents: IdentityEvent[] = [];
  correlations: Correlation[] = [];
  responseActions: ResponseAction[] = [];
  pipelineMetrics: PipelineMetric[] = [];

  private startTime: number;
  private totalEventsProcessed = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private slaMetCount = 0;
  private slaTotalCount = 0;

  constructor() {
    this.startTime = Date.now();
    this.seedInitialData();
  }

  private seedInitialData() {
    const seedEvents = generateTrafficBatch(20);
    this.networkEvents.push(...seedEvents);

    const seedIdentity = generateIdentityBatch(10);
    this.identityEvents.push(...seedIdentity);
    for (let i = 0; i < 5; i++) {
      this.runCorrelation();
    }
    for (let i = 0; i < 3; i++) {
      this.pipelineMetrics.push({
        id: randomUUID(),
        "@timestamp": new Date(Date.now() - (3 - i) * 4000).toISOString(),
        stages: {
          ingestion_ms: randInt(50, 500),
          identity_ms: randInt(100, 800),
          correlation_ms: randInt(200, 2000),
          response_ms: randInt(50, 300),
        },
        total_pipeline_ms: randInt(500, 3500),
        events_processed: randInt(3, 9),
        sla_met: true,
      });
    }
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.runPipelineCycle(), 4000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private runPipelineCycle() {
    const ingestionStart = Date.now();

    const eventCount = randInt(2, 6);
    const newEvents = generateTrafficBatch(eventCount);
    this.networkEvents.push(...newEvents);
    const ingestionMs = Date.now() - ingestionStart + randInt(50, 500);

    const identityStart = Date.now();
    const identityCount = randInt(1, 3);
    const newIdentity = generateIdentityBatch(identityCount);
    this.identityEvents.push(...newIdentity);
    const identityMs = Date.now() - identityStart + randInt(100, 800);

    const correlationStart = Date.now();
    if (Math.random() < 0.4) {
      this.runCorrelation();
    }
    const correlationMs = Date.now() - correlationStart + randInt(200, 2000);

    const responseStart = Date.now();
    const responseMs = Date.now() - responseStart + randInt(50, 300);

    const totalMs = ingestionMs + identityMs + correlationMs + responseMs;
    this.totalEventsProcessed += eventCount + identityCount;
    this.slaTotalCount++;
    if (totalMs < 60000) this.slaMetCount++;

    this.pipelineMetrics.push({
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      stages: {
        ingestion_ms: ingestionMs,
        identity_ms: identityMs,
        correlation_ms: correlationMs,
        response_ms: responseMs,
      },
      total_pipeline_ms: totalMs,
      events_processed: eventCount + identityCount,
      sla_met: totalMs < 60000,
    });

    if (this.pipelineMetrics.length > 200) {
      this.pipelineMetrics = this.pipelineMetrics.slice(-200);
    }
    if (this.networkEvents.length > 500) {
      this.networkEvents = this.networkEvents.slice(-500);
    }
    if (this.identityEvents.length > 200) {
      this.identityEvents = this.identityEvents.slice(-200);
    }
  }

  private runCorrelation() {
    const technique = randItem(MITRE_TECHNIQUES);
    const tactic = MITRE_TACTICS[technique.tactic];
    const confidence = randItem(["Low", "Medium", "High", "Critical"] as const);
    const severity = confidence === "Critical" ? randInt(80, 100) : confidence === "High" ? randInt(60, 80) : confidence === "Medium" ? randInt(30, 60) : randInt(0, 30);

    const relatedIds = this.networkEvents
      .slice(-10)
      .filter(() => Math.random() < 0.4)
      .map((e) => e.id);

    const correlation: Correlation = {
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      ecs: { version: ECS_VERSION as typeof ECS_VERSION },
      threat: {
        indicator: {
          type: randItem(["file", "ip", "domain", "url", "email"]),
          description: `${technique.name} activity detected from correlated network and identity events. Multiple indicators suggest ${tactic.name.toLowerCase()} operations.`,
          confidence,
        },
        tactic: { name: tactic.name, id: tactic.id },
        technique: { name: technique.name, id: technique.id },
      },
      related_events: relatedIds.length > 0 ? relatedIds : [randomUUID()],
      severity,
      status: randItem(["new", "new", "investigating"] as const),
    };

    this.correlations.push(correlation);

    if (confidence === "High" || confidence === "Critical") {
      this.createResponse(correlation);
    }

    if (this.correlations.length > 100) {
      this.correlations = this.correlations.slice(-100);
    }
  }

  private createResponse(correlation: Correlation) {
    const actionTypes = ["block_ip", "isolate_host", "disable_account", "quarantine", "alert_only"] as const;
    const latency = randInt(100, 5000);

    const response: ResponseAction = {
      id: randomUUID(),
      "@timestamp": new Date().toISOString(),
      ecs: { version: ECS_VERSION as typeof ECS_VERSION },
      correlation_id: correlation.id,
      action: {
        type: randItem(actionTypes),
        target: Math.random() < 0.5 ? randIP() : randItem(USERS),
        status: randItem(["pending", "executing", "completed", "completed", "completed"] as const),
      },
      latency_ms: latency,
    };

    this.responseActions.push(response);

    if (this.responseActions.length > 100) {
      this.responseActions = this.responseActions.slice(-100);
    }
  }

  getStatus(): PipelineStatus {
    const recentMetrics = this.pipelineMetrics.slice(-5);
    const currentLatency = recentMetrics.length > 0
      ? recentMetrics[recentMetrics.length - 1].total_pipeline_ms
      : 0;

    const stageAvgs = { ingestion: 0, identity: 0, correlation: 0, response: 0 };

    if (recentMetrics.length > 0) {
      recentMetrics.forEach((m) => {
        stageAvgs.ingestion += m.stages.ingestion_ms;
        stageAvgs.identity += m.stages.identity_ms;
        stageAvgs.correlation += m.stages.correlation_ms;
        stageAvgs.response += m.stages.response_ms;
      });
      Object.keys(stageAvgs).forEach((k) => {
        (stageAvgs as any)[k] /= recentMetrics.length;
      });
    }

    return {
      running: this.intervalId !== null,
      uptime_seconds: (Date.now() - this.startTime) / 1000,
      total_events_processed: this.totalEventsProcessed,
      current_latency_ms: currentLatency,
      sla_target_ms: 60000,
      sla_compliance_pct: this.slaTotalCount > 0
        ? (this.slaMetCount / this.slaTotalCount) * 100
        : 100,
      stages: [
        { name: "ingestion", status: "active", avg_latency_ms: stageAvgs.ingestion, last_processed: new Date().toISOString() },
        { name: "identity", status: "active", avg_latency_ms: stageAvgs.identity, last_processed: new Date().toISOString() },
        { name: "correlation", status: "active", avg_latency_ms: stageAvgs.correlation, last_processed: new Date().toISOString() },
        { name: "response", status: "active", avg_latency_ms: stageAvgs.response, last_processed: new Date().toISOString() },
      ],
    };
  }

  getDashboardStats(): import("@shared/schema").DashboardStats {
    const activeThreats = this.correlations.filter(
      (c) => c.status === "new" || c.status === "investigating"
    ).length;

    const recentMetrics = this.pipelineMetrics.slice(-10);
    const avgLatency = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.total_pipeline_ms, 0) / recentMetrics.length
      : 0;

    const sevDist = [
      { range: "0-25", count: 0 },
      { range: "26-50", count: 0 },
      { range: "51-75", count: 0 },
      { range: "76-100", count: 0 },
    ];

    this.networkEvents.forEach((e) => {
      const s = e.event.severity;
      if (s <= 25) sevDist[0].count++;
      else if (s <= 50) sevDist[1].count++;
      else if (s <= 75) sevDist[2].count++;
      else sevDist[3].count++;
    });

    const threatsByConf = ["Low", "Medium", "High", "Critical"].map((c) => ({
      confidence: c,
      count: this.correlations.filter((t) => t.threat.indicator.confidence === c).length,
    }));

    const logSourceBreakdown = [
      { source: "zeek.conn", count: this.networkEvents.filter((e) => e.event.dataset === "zeek.conn").length },
      { source: "zeek.dns", count: this.networkEvents.filter((e) => e.event.dataset === "zeek.dns").length },
      { source: "zeek.http", count: this.networkEvents.filter((e) => e.event.dataset === "zeek.http").length },
    ];

    const identitySourceBreakdown = [
      { source: "wazuh.linux", count: this.identityEvents.filter((e) => e.event.dataset === "wazuh.linux").length },
      { source: "wazuh.windows", count: this.identityEvents.filter((e) => e.event.dataset === "wazuh.windows").length },
      { source: "aws.cloudtrail", count: this.identityEvents.filter((e) => e.event.dataset === "aws.cloudtrail").length },
    ];

    const status = this.getStatus();
    const pipelineStatus: "healthy" | "degraded" | "critical" =
      status.sla_compliance_pct >= 95 ? "healthy" :
      status.sla_compliance_pct >= 80 ? "degraded" : "critical";

    return {
      totalEvents: this.networkEvents.length + this.identityEvents.length,
      activeThreats,
      responseActions: this.responseActions.length,
      avgLatencyMs: avgLatency,
      slaCompliance: status.sla_compliance_pct,
      eventsPerSecond: this.totalEventsProcessed / Math.max(1, (Date.now() - this.startTime) / 1000),
      threatsByConfidence: threatsByConf,
      severityDistribution: sevDist,
      pipelineStatus,
      logSourceBreakdown,
      identitySourceBreakdown,
    };
  }
}

export const pipeline = new NDRPipeline();
