import type { AttackPattern } from "@shared/schema";

const MITRE_TACTICS = [
  "Reconnaissance", "Initial Access", "Execution", "Persistence",
  "Privilege Escalation", "Defense Evasion", "Credential Access",
  "Discovery", "Lateral Movement", "Collection", "Exfiltration",
  "Command and Control", "Impact",
];

const ATTACK_PATTERN_SEEDS: Array<{
  name: string;
  technique: string;
  tactic: string;
  severity: "low" | "medium" | "high" | "critical";
  iocTags: string[];
  description: string;
  rawText: string;
}> = [
  {
    name: "SSH Brute Force",
    technique: "T1110.001",
    tactic: "Credential Access",
    severity: "high",
    iocTags: ["brute-force", "ssh", "failed-auth", "credential-stuffing"],
    description: "Multiple failed SSH authentication attempts from a single source IP within a short time window, indicating a brute force attack against SSH services.",
    rawText: "event.dataset:zeek.conn AND destination.port:22 AND event.outcome:failure AND count > 10 within 60s",
  },
  {
    name: "DNS Tunneling",
    technique: "T1572",
    tactic: "Command and Control",
    severity: "critical",
    iocTags: ["dns-tunnel", "c2", "exfiltration", "encoded-payload"],
    description: "Unusually long DNS queries or high-frequency DNS requests to a single domain, indicating potential data exfiltration via DNS tunneling.",
    rawText: "event.dataset:zeek.dns AND dns.question.name:*.darkops.* AND network.bytes > 500 within 30s",
  },
  {
    name: "Lateral Movement via RDP",
    technique: "T1021.001",
    tactic: "Lateral Movement",
    severity: "high",
    iocTags: ["rdp", "lateral-movement", "internal-pivot", "remote-desktop"],
    description: "Internal host initiating RDP connections to multiple internal destinations, suggesting lateral movement using compromised credentials.",
    rawText: "event.dataset:zeek.conn AND destination.port:3389 AND network.direction:internal AND unique_dsts > 3 within 300s",
  },
  {
    name: "Port Scan Activity",
    technique: "T1046",
    tactic: "Reconnaissance",
    severity: "medium",
    iocTags: ["port-scan", "reconnaissance", "enumeration", "nmap"],
    description: "Single source IP connecting to many distinct destination ports on the same host, characteristic of a port scanning reconnaissance operation.",
    rawText: "event.dataset:zeek.conn AND source.ip:same AND unique_dst_ports > 50 within 120s",
  },
  {
    name: "Data Exfiltration via HTTP",
    technique: "T1048.002",
    tactic: "Exfiltration",
    severity: "critical",
    iocTags: ["exfiltration", "http", "large-upload", "data-theft"],
    description: "Large outbound HTTP POST/PUT requests to external IPs, potentially exfiltrating sensitive data over standard web protocols.",
    rawText: "event.dataset:zeek.http AND http.request.method:(POST OR PUT) AND network.direction:egress AND source.bytes > 10485760",
  },
  {
    name: "C2 Beacon Pattern",
    technique: "T1071.001",
    tactic: "Command and Control",
    severity: "critical",
    iocTags: ["c2-beacon", "periodic", "callback", "malware"],
    description: "Regular periodic HTTP/HTTPS connections to external IPs with consistent intervals, characteristic of command and control beacon behavior.",
    rawText: "event.dataset:zeek.conn AND network.direction:egress AND interval_stddev < 5s AND connection_count > 20 within 3600s",
  },
  {
    name: "Privilege Escalation via Service Install",
    technique: "T1543.003",
    tactic: "Persistence",
    severity: "high",
    iocTags: ["service-install", "persistence", "privilege-escalation", "windows"],
    description: "New Windows service installed shortly after successful authentication, suggesting post-exploitation persistence mechanism deployment.",
    rawText: "event.dataset:wazuh.windows AND winlog.event_id:7045 PRECEDED_BY winlog.event_id:4624 within 300s",
  },
  {
    name: "IAM Policy Tampering",
    technique: "T1098",
    tactic: "Persistence",
    severity: "critical",
    iocTags: ["iam", "policy-change", "privilege-escalation", "aws"],
    description: "Modification of IAM policies or attachment of admin-level policies to user accounts, indicating potential privilege escalation in cloud environments.",
    rawText: "event.dataset:aws.cloudtrail AND event.action:(AttachUserPolicy OR PutUserPolicy) AND labels.risk_score > 0.7",
  },
  {
    name: "Account Lockout Storm",
    technique: "T1110",
    tactic: "Credential Access",
    severity: "medium",
    iocTags: ["lockout", "brute-force", "authentication", "distributed"],
    description: "Multiple accounts locked out across different hosts in a short time window, suggesting a distributed brute force or credential stuffing campaign.",
    rawText: "event.dataset:wazuh.* AND event.action:account_locked AND unique_users > 5 within 300s",
  },
  {
    name: "Suspicious Cross-Account Activity",
    technique: "T1078.004",
    tactic: "Defense Evasion",
    severity: "high",
    iocTags: ["cross-account", "assume-role", "aws", "cloud-hopping"],
    description: "Role assumption across AWS accounts from unexpected source IPs or regions, potentially indicating compromised credentials being used for cloud-hopping.",
    rawText: "event.dataset:aws.cloudtrail AND event.action:AssumeRole AND source.geo.country_iso_code NOT IN (US,DE,GB)",
  },
  {
    name: "DGA Domain Communication",
    technique: "T1568.002",
    tactic: "Command and Control",
    severity: "high",
    iocTags: ["dga", "domain-generation", "c2", "malware"],
    description: "DNS queries to domains matching domain generation algorithm patterns — high entropy, random-looking domain names typical of malware C2 infrastructure.",
    rawText: "event.dataset:zeek.dns AND dns.question.name:entropy > 3.5 AND dns.response_code:NXDOMAIN AND count > 5 within 60s",
  },
  {
    name: "Internal Reconnaissance via SMB",
    technique: "T1135",
    tactic: "Discovery",
    severity: "medium",
    iocTags: ["smb", "share-enum", "discovery", "internal"],
    description: "Host connecting to SMB shares on multiple internal systems, potentially enumerating network shares for valuable data or lateral movement targets.",
    rawText: "event.dataset:zeek.conn AND destination.port:445 AND network.direction:internal AND unique_dsts > 5 within 600s",
  },
  {
    name: "Unauthorized Root Console Login",
    technique: "T1078.003",
    tactic: "Initial Access",
    severity: "critical",
    iocTags: ["root-login", "console", "aws", "initial-access"],
    description: "AWS root account console login detected, which should be extremely rare. May indicate compromised root credentials or unauthorized administrative access.",
    rawText: "event.dataset:aws.cloudtrail AND event.action:ConsoleLogin AND user.type:Root",
  },
  {
    name: "Path Traversal Attack",
    technique: "T1083",
    tactic: "Discovery",
    severity: "high",
    iocTags: ["path-traversal", "lfi", "web-attack", "directory-traversal"],
    description: "HTTP requests containing path traversal sequences (../) attempting to access files outside the web root, indicating a web application exploitation attempt.",
    rawText: "event.dataset:zeek.http AND url.path:*../* AND http.response.status_code:(200 OR 500)",
  },
  {
    name: "Encrypted Channel on Non-Standard Port",
    technique: "T1573",
    tactic: "Command and Control",
    severity: "medium",
    iocTags: ["encrypted", "non-standard-port", "c2", "evasion"],
    description: "TLS/SSL traffic detected on non-standard ports (not 443/8443), potentially indicating encrypted C2 communications attempting to evade detection.",
    rawText: "event.dataset:zeek.conn AND network.protocol:tcp AND destination.port NOT IN (443,8443) AND tls:true",
  },
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePatternId(index: number): string {
  return `PATTERN-${String(index + 1).padStart(4, "0")}`;
}

export function seedAttackPatterns(): AttackPattern[] {
  return ATTACK_PATTERN_SEEDS.map((seed, i) => ({
    "@timestamp": new Date(Date.now() - (ATTACK_PATTERN_SEEDS.length - i) * 86400000).toISOString(),
    pattern_id: generatePatternId(i),
    pattern_name: seed.name,
    description: seed.description,
    mitre_technique_id: seed.technique,
    mitre_tactic: seed.tactic,
    severity: seed.severity,
    confidence_score: parseFloat((0.6 + Math.random() * 0.39).toFixed(2)),
    related_community_ids: [],
    ioc_tags: seed.iocTags,
    raw_pattern_text: seed.rawText,
  }));
}

export function linkCommunityIds(
  patterns: AttackPattern[],
  communityIds: string[]
): void {
  for (const pattern of patterns) {
    const count = randInt(1, Math.min(5, communityIds.length));
    const selected = new Set<string>();
    for (let i = 0; i < count && communityIds.length > 0; i++) {
      selected.add(communityIds[randInt(0, communityIds.length - 1)]);
    }
    pattern.related_community_ids = Array.from(selected);
  }
}
