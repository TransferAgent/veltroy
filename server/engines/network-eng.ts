import { randomUUID } from "crypto";
import { createHash } from "crypto";
import type { NetworkEvent } from "@shared/schema";
import { ECS_VERSION, NDR_BLUEPRINT_VER } from "@shared/schema";

const ECS_DATASET_CONN = "zeek.conn";
const ECS_DATASET_DNS = "zeek.dns";
const ECS_DATASET_HTTP = "zeek.http";

const COUNTRIES = [
  "United States", "Russia", "China", "Germany", "Brazil",
  "Netherlands", "South Korea", "Iran", "Romania", "Ukraine",
];

const DNS_QUERY_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV"];
const DNS_RESPONSE_CODES = ["NOERROR", "NXDOMAIN", "SERVFAIL", "REFUSED", "NOERROR", "NOERROR"];

const DNS_DOMAINS_NORMAL = [
  "google.com", "office365.com", "github.com", "amazonaws.com",
  "cloudflare.com", "microsoft.com", "slack.com", "zoom.us",
  "api.internal.corp", "sso.corp.local", "mail.corp.local",
];

const DNS_DOMAINS_SUSPICIOUS = [
  "c2-beacon-01.darkops.ru", "exfil.data-tunnel.cn",
  "ns1.malware-cdn.top", "update.trojan-downloader.xyz",
  "d3adb33f.onion.ws", "fast-flux-rotator.biz",
  "dga-generated-12849.net", "encoded-payload.darknet.io",
];

const HTTP_PATHS_NORMAL = [
  "/api/v2/users", "/health", "/login", "/dashboard",
  "/assets/main.js", "/api/config", "/graphql", "/favicon.ico",
  "/.well-known/openid-configuration", "/api/v1/status",
];

const HTTP_PATHS_SUSPICIOUS = [
  "/wp-admin/admin-ajax.php", "/cgi-bin/../../etc/passwd",
  "/shell.php", "/.env", "/api/../../../etc/shadow",
  "/wp-login.php?action=register", "/xmlrpc.php",
  "/admin/upload.php?cmd=exec", "/debug/pprof/",
];

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
const HTTP_STATUS_CODES = [200, 200, 200, 201, 301, 302, 400, 401, 403, 404, 500, 503];
const HTTP_HOSTS = [
  "api.corp.local", "web.prod.internal", "cdn.corp.local",
  "auth.corp.local", "portal.staging.net", "192.168.1.100",
];

const CONN_PROTOCOLS = ["tcp", "udp", "icmp"];
const CONN_SERVICES = ["http", "https", "dns", "ssh", "rdp", "smtp", "ftp", "ntp", "dhcp", "smb"];

const RULE_NAMES = [
  "SSH Brute Force Detected",
  "Port Scan Activity",
  "DNS Tunneling Suspected",
  "Unusual Data Transfer Volume",
  "C2 Beacon Pattern",
  "Failed Auth Threshold Exceeded",
  "Privilege Escalation Attempt",
  "Lateral Movement Detected",
  "Abnormal Protocol on Standard Port",
  "Geographic Anomaly in Access Pattern",
  "High Cardinality Connection Burst",
  "Known Bad IP Contacted",
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

function isRFC1918(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function ipToBytes(ip: string): Buffer {
  const parts = ip.split(".").map(Number);
  return Buffer.from(parts);
}

function portToBytes(port: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(port);
  return buf;
}

function computeCommunityId(
  srcIp: string, srcPort: number,
  dstIp: string, dstPort: number,
  protocol: number
): string {
  let sIp = srcIp, sPort = srcPort, dIp = dstIp, dPort = dstPort;
  if (srcIp > dstIp || (srcIp === dstIp && srcPort > dstPort)) {
    sIp = dstIp; sPort = dstPort; dIp = srcIp; dPort = srcPort;
  }

  const seed = Buffer.alloc(2);
  seed.writeUInt16BE(0);

  const data = Buffer.concat([
    seed,
    ipToBytes(sIp),
    ipToBytes(dIp),
    Buffer.from([protocol]),
    Buffer.from([0]),
    portToBytes(sPort),
    portToBytes(dPort),
  ]);

  const hash = createHash("sha1").update(data).digest("base64");
  return `1:${hash}`;
}

function zeekUid(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let uid = "C";
  for (let i = 0; i < 17; i++) {
    uid += chars[Math.floor(Math.random() * chars.length)];
  }
  return uid;
}

function protocolNumber(proto: string): number {
  switch (proto) {
    case "tcp": return 6;
    case "udp": return 17;
    case "icmp": return 1;
    default: return 6;
  }
}

export function generateConnLog(forceAlert = false): NetworkEvent {
  const isAlert = forceAlert || Math.random() < 0.2;
  const srcIp = Math.random() < 0.6 ? internalIP() : randIP();
  const dstIp = Math.random() < 0.4 ? internalIP() : randIP();
  const srcPort = randInt(1024, 65535);
  const dstPort = randItem([22, 80, 443, 53, 3389, 8080, 25, 3306, 5432, 8443, 445, 139, 21, 123]);
  const proto = randItem(CONN_PROTOCOLS);
  const severity = isAlert ? randInt(40, 100) : randInt(0, 30);
  const now = new Date().toISOString();
  const uid = zeekUid();
  const eventId = randomUUID();

  const direction: "ingress" | "egress" | "internal" =
    isRFC1918(srcIp) && isRFC1918(dstIp) ? "internal" :
    isRFC1918(srcIp) ? "egress" : "ingress";

  const communityId = computeCommunityId(srcIp, srcPort, dstIp, dstPort, protocolNumber(proto));

  return {
    ecs: { version: ECS_VERSION as typeof ECS_VERSION },
    agent: { name: "zeek", type: "zeek", version: "6.0.4" },
    observer: OBSERVER,
    id: eventId,
    "@timestamp": now,
    event: {
      id: uid,
      kind: isAlert ? "alert" : "event",
      category: ["network"],
      type: ["connection"],
      outcome: isAlert ? randItem(["success", "failure"] as const) : "success",
      severity,
      module: "zeek",
      dataset: ECS_DATASET_CONN,
      created: now,
      ...(isAlert ? { action: randItem(RULE_NAMES) } : {}),
    },
    source: {
      ip: srcIp,
      port: srcPort,
      ...(direction === "ingress" && Math.random() < 0.6
        ? { geo: { country_name: randItem(COUNTRIES) } }
        : {}),
    },
    destination: {
      ip: dstIp,
      port: dstPort,
    },
    network: {
      protocol: proto,
      direction,
      bytes: randInt(64, 2097152),
      community_id: communityId,
    },
    related: {
      ip: [srcIp, dstIp],
    },
    zeek: {
      uid,
      log_source: "conn.log",
    },
    ndr: {
      blueprint_version: NDR_BLUEPRINT_VER,
    },
    ...(isAlert
      ? {
          rule: {
            name: randItem(RULE_NAMES),
            id: `NDR-${randInt(1000, 9999)}`,
          },
        }
      : {}),
  };
}

export function generateDnsLog(forceAlert = false): NetworkEvent {
  const isSuspicious = forceAlert || Math.random() < 0.15;
  const srcIp = internalIP();
  const dstIp = Math.random() < 0.7 ? internalIP() : randIP();
  const srcPort = randInt(1024, 65535);
  const severity = isSuspicious ? randInt(50, 90) : randInt(0, 20);
  const now = new Date().toISOString();
  const uid = zeekUid();
  const eventId = randomUUID();
  const queryType = randItem(DNS_QUERY_TYPES);
  const domain = isSuspicious ? randItem(DNS_DOMAINS_SUSPICIOUS) : randItem(DNS_DOMAINS_NORMAL);
  const responseCode = isSuspicious ? randItem(["NXDOMAIN", "SERVFAIL"]) : randItem(DNS_RESPONSE_CODES);

  const communityId = computeCommunityId(srcIp, srcPort, dstIp, 53, 17);

  return {
    ecs: { version: ECS_VERSION as typeof ECS_VERSION },
    agent: { name: "zeek", type: "zeek", version: "6.0.4" },
    observer: OBSERVER,
    id: eventId,
    "@timestamp": now,
    event: {
      id: uid,
      kind: isSuspicious ? "alert" : "event",
      category: ["network"],
      type: ["protocol"],
      outcome: responseCode === "NOERROR" ? "success" : "failure",
      severity,
      module: "zeek",
      dataset: ECS_DATASET_DNS,
      created: now,
      ...(isSuspicious ? { action: randItem(["DNS Tunneling Suspected", "Known Bad Domain Query", "DGA Domain Detected"]) } : {}),
    },
    source: {
      ip: srcIp,
      port: srcPort,
    },
    destination: {
      ip: dstIp,
      port: 53,
    },
    network: {
      protocol: "udp",
      direction: isRFC1918(srcIp) && isRFC1918(dstIp) ? "internal" : isRFC1918(srcIp) ? "egress" : "ingress",
      bytes: randInt(40, 512),
      community_id: communityId,
    },
    related: {
      ip: [srcIp, dstIp],
    },
    dns: {
      type: queryType,
      question: {
        name: domain,
        type: queryType,
      },
      response_code: responseCode,
      ...(responseCode === "NOERROR" ? {
        answers: [{
          data: `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
          type: queryType,
        }],
      } : {}),
    },
    zeek: {
      uid,
      log_source: "dns.log",
    },
    ndr: {
      blueprint_version: NDR_BLUEPRINT_VER,
    },
    ...(isSuspicious
      ? {
          rule: {
            name: randItem(["DNS Tunneling Suspected", "Known Bad Domain", "DGA Detection"]),
            id: `NDR-${randInt(1000, 9999)}`,
          },
        }
      : {}),
  };
}

export function generateHttpLog(forceAlert = false): NetworkEvent {
  const isSuspicious = forceAlert || Math.random() < 0.15;
  const srcIp = Math.random() < 0.7 ? internalIP() : randIP();
  const dstIp = Math.random() < 0.5 ? internalIP() : randIP();
  const srcPort = randInt(1024, 65535);
  const dstPort = randItem([80, 443, 8080, 8443, 3000]);
  const severity = isSuspicious ? randInt(40, 95) : randInt(0, 20);
  const now = new Date().toISOString();
  const uid = zeekUid();
  const eventId = randomUUID();
  const method = isSuspicious ? randItem(["POST", "PUT", "DELETE"]) : randItem(HTTP_METHODS);
  const path = isSuspicious ? randItem(HTTP_PATHS_SUSPICIOUS) : randItem(HTTP_PATHS_NORMAL);
  const host = randItem(HTTP_HOSTS);
  const statusCode = isSuspicious ? randItem([400, 401, 403, 500, 503]) : randItem(HTTP_STATUS_CODES);
  const scheme = dstPort === 443 || dstPort === 8443 ? "https" : "http";

  const direction: "ingress" | "egress" | "internal" =
    isRFC1918(srcIp) && isRFC1918(dstIp) ? "internal" :
    isRFC1918(srcIp) ? "egress" : "ingress";

  const communityId = computeCommunityId(srcIp, srcPort, dstIp, dstPort, 6);

  return {
    ecs: { version: ECS_VERSION as typeof ECS_VERSION },
    agent: { name: "zeek", type: "zeek", version: "6.0.4" },
    observer: OBSERVER,
    id: eventId,
    "@timestamp": now,
    event: {
      id: uid,
      kind: isSuspicious ? "alert" : "event",
      category: ["web"],
      type: ["access"],
      outcome: statusCode < 400 ? "success" : "failure",
      severity,
      module: "zeek",
      dataset: ECS_DATASET_HTTP,
      created: now,
      ...(isSuspicious ? { action: randItem(["Web Application Attack", "Path Traversal Attempt", "Suspicious Upload"]) } : {}),
    },
    source: {
      ip: srcIp,
      port: srcPort,
      ...(direction === "ingress" && Math.random() < 0.5
        ? { geo: { country_name: randItem(COUNTRIES) } }
        : {}),
    },
    destination: {
      ip: dstIp,
      port: dstPort,
    },
    network: {
      protocol: "tcp",
      direction,
      bytes: randInt(200, 524288),
      community_id: communityId,
    },
    related: {
      ip: [srcIp, dstIp],
    },
    url: {
      full: `${scheme}://${host}${path}`,
      domain: host,
      path,
      scheme,
    },
    http: {
      request: {
        method,
        bytes: randInt(100, 10240),
      },
      response: {
        status_code: statusCode,
        bytes: randInt(200, 1048576),
      },
      version: randItem(["1.1", "2.0"]),
    },
    zeek: {
      uid,
      log_source: "http.log",
    },
    ndr: {
      blueprint_version: NDR_BLUEPRINT_VER,
    },
    ...(isSuspicious
      ? {
          rule: {
            name: randItem(["Web Application Attack", "Path Traversal", "Suspicious HTTP Method"]),
            id: `NDR-${randInt(1000, 9999)}`,
          },
        }
      : {}),
  };
}

export function generateTrafficBatch(count: number): NetworkEvent[] {
  const events: NetworkEvent[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.5) {
      events.push(generateConnLog());
    } else if (roll < 0.8) {
      events.push(generateDnsLog());
    } else {
      events.push(generateHttpLog());
    }
  }
  return events;
}
