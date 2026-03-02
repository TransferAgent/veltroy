import { randomUUID } from "crypto";
import { createHash } from "crypto";
import type { IdentityEvent } from "@shared/schema";
import { ECS_VERSION } from "@shared/schema";

const NDR_BLUEPRINT_VER = "v1.2.1";

const ECS_DATASET_WAZUH_LINUX = "wazuh.linux";
const ECS_DATASET_WAZUH_WINDOWS = "wazuh.windows";
const ECS_DATASET_CLOUDTRAIL = "aws.cloudtrail";

const COUNTRIES = [
  { name: "United States", iso: "US", cities: ["New York", "San Francisco", "Chicago", "Dallas"] },
  { name: "Russia", iso: "RU", cities: ["Moscow", "Saint Petersburg"] },
  { name: "China", iso: "CN", cities: ["Beijing", "Shanghai", "Shenzhen"] },
  { name: "Germany", iso: "DE", cities: ["Berlin", "Frankfurt", "Munich"] },
  { name: "Brazil", iso: "BR", cities: ["São Paulo", "Rio de Janeiro"] },
  { name: "Netherlands", iso: "NL", cities: ["Amsterdam", "Rotterdam"] },
  { name: "South Korea", iso: "KR", cities: ["Seoul", "Busan"] },
  { name: "Iran", iso: "IR", cities: ["Tehran"] },
  { name: "Romania", iso: "RO", cities: ["Bucharest"] },
  { name: "Ukraine", iso: "UA", cities: ["Kyiv", "Odessa"] },
];

const LINUX_USERS = ["root", "admin", "deploy", "svc_backup", "www-data", "postgres", "developer", "analyst", "jenkins", "ubuntu"];
const LINUX_HOSTNAMES = ["prod-web-01", "prod-db-01", "staging-app-02", "dev-build-01", "bastion-01", "monitor-01"];

const WINDOWS_USERS = ["Administrator", "jdoe", "svc_sql", "helpdesk", "domain\\admin", "SYSTEM", "svc_exchange", "analyst01"];
const WINDOWS_HOSTNAMES = ["DC01", "WS-FINANCE-03", "SRV-APP-01", "WS-DEV-07", "SRV-FILE-02", "DC02"];
const WINDOWS_DOMAINS = ["CORP", "PROD", "DEV", "STAGING"];

const AWS_USERS = ["admin-user", "deploy-bot", "lambda-executor", "dev-engineer", "security-auditor", "root"];
const AWS_ACCOUNT_IDS = ["123456789012", "987654321098", "112233445566"];
const AWS_REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"];
const AWS_USER_AGENTS = [
  "aws-cli/2.13.0 Python/3.11.4",
  "console.amazonaws.com",
  "Boto3/1.28.0 Python/3.10.12",
  "AWSLambda/python3.11",
  "signin.amazonaws.com",
];

const WAZUH_LINUX_ACTIONS = [
  { action: "sshd_login", desc: "Accepted publickey for %USER% from %IP% port %PORT%", category: "authentication", type: "start", ruleLevel: 3 },
  { action: "sshd_login_failed", desc: "Failed password for %USER% from %IP% port %PORT%", category: "authentication", type: "start", ruleLevel: 5 },
  { action: "sshd_invalid_user", desc: "Invalid user %USER% from %IP% port %PORT%", category: "authentication", type: "start", ruleLevel: 8 },
  { action: "sudo_command", desc: "%USER% : TTY=pts/0 ; PWD=/home/%USER% ; COMMAND=/usr/bin/apt update", category: "process", type: "start", ruleLevel: 4 },
  { action: "sudo_failed", desc: "%USER% : 3 incorrect password attempts ; TTY=pts/0", category: "authentication", type: "denied", ruleLevel: 10 },
  { action: "su_session_opened", desc: "pam_unix(su:session): session opened for user %USER% by root", category: "session", type: "start", ruleLevel: 3 },
  { action: "account_locked", desc: "pam_tally2(sshd:auth): account %USER% is locked", category: "authentication", type: "denied", ruleLevel: 12 },
  { action: "pam_auth_failure", desc: "pam_unix(sshd:auth): authentication failure; user=%USER% rhost=%IP%", category: "authentication", type: "denied", ruleLevel: 5 },
];

const WINDOWS_EVENTS = [
  { eventId: 4624, action: "logon_success", desc: "An account was successfully logged on", category: "authentication", type: "start", logonTypes: [2, 3, 7, 10] },
  { eventId: 4625, action: "logon_failure", desc: "An account failed to log on", category: "authentication", type: "start", logonTypes: [2, 3, 10] },
  { eventId: 4720, action: "account_created", desc: "A user account was created", category: "iam", type: "creation" },
  { eventId: 4740, action: "account_lockout", desc: "A user account was locked out", category: "authentication", type: "denied" },
  { eventId: 7045, action: "service_installed", desc: "A service was installed in the system", category: "configuration", type: "installation" },
];

const CLOUDTRAIL_EVENTS = [
  { action: "ConsoleLogin", priority: "HIGH", alertDesc: "New country/IP", category: "authentication", type: "start" },
  { action: "AssumeRole", priority: "HIGH", alertDesc: "Cross-account assumption", category: "authentication", type: "start" },
  { action: "CreateUser", priority: "CRITICAL", alertDesc: "Unauthorized IAM creation", category: "iam", type: "change" },
  { action: "AttachUserPolicy", priority: "CRITICAL", alertDesc: "Privilege escalation", category: "iam", type: "change" },
  { action: "DeleteUser", priority: "HIGH", alertDesc: "Account removal", category: "iam", type: "change" },
  { action: "GetSessionToken", priority: "MEDIUM", alertDesc: "Token harvesting risk", category: "authentication", type: "start" },
  { action: "UpdateAccountPasswordPolicy", priority: "HIGH", alertDesc: "Policy weakening", category: "iam", type: "change" },
];

const OBSERVER = {
  name: "ndr-sensor-01",
  type: "ids",
  vendor: "NDR Platform",
  product: "Phase Gate 0",
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

function wazuhRuleLevelToSeverity(ruleLevel: number): number {
  return Math.min(100, Math.round((ruleLevel / 15) * 100));
}

function priorityToSeverity(priority: string): number {
  switch (priority) {
    case "CRITICAL": return randInt(80, 100);
    case "HIGH": return randInt(55, 80);
    case "MEDIUM": return randInt(30, 55);
    default: return randInt(10, 30);
  }
}

export function generateLinuxAuthEvent(forceAlert = false): IdentityEvent {
  const template = forceAlert
    ? randItem(WAZUH_LINUX_ACTIONS.filter(a => a.ruleLevel >= 8))
    : randItem(WAZUH_LINUX_ACTIONS);

  const isAlert = forceAlert || template.ruleLevel >= 8;
  const isFailed = template.type === "denied" || template.action.includes("failed") || template.action.includes("invalid");
  const userName = randItem(LINUX_USERS);
  const sourceIp = Math.random() < 0.6 ? internalIP() : randIP();
  const sourcePort = randInt(1024, 65535);
  const hostname = randItem(LINUX_HOSTNAMES);
  const now = new Date().toISOString();
  const eventId = randomUUID();
  const geoInfo = Math.random() < 0.4 ? randItem(COUNTRIES) : null;

  const logPath = hostname.includes("prod") || hostname.includes("bastion")
    ? "/var/log/auth.log"
    : "/var/log/secure";

  const desc = template.desc
    .replace("%USER%", userName)
    .replace("%IP%", sourceIp)
    .replace(/%PORT%/g, String(sourcePort));

  return {
    ecs: { version: ECS_VERSION as typeof ECS_VERSION },
    agent: { name: `wazuh-agent-${hostname}`, type: "wazuh", version: "4.7.2" },
    observer: OBSERVER,
    id: eventId,
    "@timestamp": now,
    event: {
      id: eventId,
      kind: isAlert ? "alert" : "event",
      category: [template.category],
      type: [template.type],
      outcome: isFailed ? "failure" : "success",
      action: template.action,
      module: "wazuh",
      dataset: ECS_DATASET_WAZUH_LINUX,
      created: now,
      severity: wazuhRuleLevelToSeverity(template.ruleLevel),
      reason: template.desc.replace(/%\w+%/g, "..."),
    },
    user: {
      name: userName,
      domain: hostname,
    },
    source: {
      ip: sourceIp,
      port: sourcePort,
      ...(geoInfo ? {
        geo: {
          country_name: geoInfo.name,
          country_iso_code: geoInfo.iso,
          city_name: randItem(geoInfo.cities),
        },
      } : {}),
    },
    host: { hostname, ip: internalIP() },
    log: { file: { path: logPath } },
    message: desc,
    related: { ip: [sourceIp], user: [userName] },
    labels: {
      identity_provider: "wazuh",
      mfa_used: false,
      risk_score: parseFloat((wazuhRuleLevelToSeverity(template.ruleLevel) / 100 * 1).toFixed(2)),
    },
    ndr: { blueprint_version: NDR_BLUEPRINT_VER },
  };
}

export function generateWindowsSecurityEvent(forceAlert = false): IdentityEvent {
  const template = forceAlert
    ? randItem(WINDOWS_EVENTS.filter(e => e.eventId === 4625 || e.eventId === 4740))
    : randItem(WINDOWS_EVENTS);

  const isAlert = forceAlert || template.eventId === 4625 || template.eventId === 4740;
  const isFailed = template.eventId === 4625 || template.eventId === 4740;
  const userName = randItem(WINDOWS_USERS);
  const domain = randItem(WINDOWS_DOMAINS);
  const hostname = randItem(WINDOWS_HOSTNAMES);
  const sourceIp = Math.random() < 0.5 ? internalIP() : randIP();
  const now = new Date().toISOString();
  const eventId = randomUUID();
  const geoInfo = Math.random() < 0.3 ? randItem(COUNTRIES) : null;

  const logonType = template.logonTypes ? randItem(template.logonTypes) : undefined;
  const severity = isFailed ? randInt(50, 85) : randInt(5, 30);

  return {
    ecs: { version: ECS_VERSION as typeof ECS_VERSION },
    agent: { name: `wazuh-agent-${hostname}`, type: "wazuh", version: "4.7.2" },
    observer: OBSERVER,
    id: eventId,
    "@timestamp": now,
    event: {
      id: eventId,
      kind: isAlert ? "alert" : "event",
      category: [template.category],
      type: [template.type],
      outcome: isFailed ? "failure" : "success",
      action: template.action,
      module: "wazuh",
      dataset: ECS_DATASET_WAZUH_WINDOWS,
      created: now,
      severity,
      reason: template.desc,
    },
    user: {
      name: userName,
      domain: `${domain}\\${hostname}`,
      roles: [isFailed ? "user" : randItem(["admin", "user", "service"])],
    },
    source: {
      ip: sourceIp,
      ...(geoInfo ? {
        geo: {
          country_name: geoInfo.name,
          country_iso_code: geoInfo.iso,
          city_name: randItem(geoInfo.cities),
        },
      } : {}),
    },
    host: { hostname, ip: internalIP() },
    log: { file: { path: `Security` } },
    message: `${template.desc}. Subject: ${domain}\\${userName}. Logon Type: ${logonType || "N/A"}`,
    related: { ip: [sourceIp], user: [userName] },
    labels: {
      identity_provider: "active_directory",
      mfa_used: Math.random() < 0.3,
      risk_score: parseFloat((severity / 100).toFixed(2)),
    },
    winlog: {
      event_id: template.eventId,
      channel: "Security",
      ...(logonType !== undefined ? { logon_type: logonType } : {}),
    },
    ndr: { blueprint_version: NDR_BLUEPRINT_VER },
  };
}

export function generateCloudTrailEvent(forceAlert = false): IdentityEvent {
  const template = forceAlert
    ? randItem(CLOUDTRAIL_EVENTS.filter(e => e.priority === "CRITICAL" || e.priority === "HIGH"))
    : randItem(CLOUDTRAIL_EVENTS);

  const isAlert = forceAlert || template.priority === "CRITICAL";
  const hasError = Math.random() < 0.2;
  const userName = randItem(AWS_USERS);
  const accountId = randItem(AWS_ACCOUNT_IDS);
  const region = randItem(AWS_REGIONS);
  const sourceIp = randIP();
  const now = new Date().toISOString();
  const requestId = randomUUID();
  const eventId = randomUUID();
  const geoInfo = randItem(COUNTRIES);

  const communityIdData = `${sourceIp}${requestId}${now}`;
  const communityId = `1:${createHash("sha1").update(communityIdData).digest("base64")}`;

  const severity = hasError ? priorityToSeverity(template.priority) + 10 : priorityToSeverity(template.priority);

  return {
    ecs: { version: ECS_VERSION as typeof ECS_VERSION },
    agent: { name: "cloudtrail-ingest", type: "logstash", version: "8.11.0" },
    observer: OBSERVER,
    id: eventId,
    "@timestamp": now,
    event: {
      id: requestId,
      kind: isAlert ? "alert" : "event",
      category: [template.category],
      type: [template.type],
      outcome: hasError ? "failure" : "success",
      action: template.action,
      module: "aws",
      dataset: ECS_DATASET_CLOUDTRAIL,
      created: now,
      severity: Math.min(100, severity),
      reason: hasError ? randItem(["AccessDenied", "UnauthorizedAccess", "InvalidClientTokenId", "MalformedPolicyDocument"]) : undefined,
      provider: "iam.amazonaws.com",
    },
    user: {
      name: userName,
      type: randItem(["IAMUser", "AssumedRole", "Root", "FederatedUser"]),
      id: `arn:aws:iam::${accountId}:user/${userName}`,
    },
    source: {
      ip: sourceIp,
      geo: {
        country_name: geoInfo.name,
        country_iso_code: geoInfo.iso,
        city_name: randItem(geoInfo.cities),
      },
    },
    cloud: {
      provider: "aws",
      account: { id: accountId },
      region,
    },
    related: { ip: [sourceIp], user: [userName] },
    user_agent: {
      original: randItem(AWS_USER_AGENTS),
      name: randItem(["aws-cli", "console", "boto3", "lambda", "signin"]),
    },
    labels: {
      identity_provider: "aws_iam",
      mfa_used: Math.random() < 0.4,
      risk_score: parseFloat((Math.min(100, severity) / 100).toFixed(2)),
    },
    ndr: { blueprint_version: NDR_BLUEPRINT_VER },
  };
}

export function generateIdentityBatch(count: number): IdentityEvent[] {
  const events: IdentityEvent[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.4) {
      events.push(generateLinuxAuthEvent());
    } else if (roll < 0.7) {
      events.push(generateWindowsSecurityEvent());
    } else {
      events.push(generateCloudTrailEvent());
    }
  }
  return events;
}
