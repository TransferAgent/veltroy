import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Shield,
  AlertTriangle,
  Activity,
  RotateCcw,
  FileText,
  Heart,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import { Link } from "wouter";

interface GridTenant {
  tenant_id: string;
  name: string;
  tier: string;
  is_trial: boolean;
  status: string;
  ticket_count: number;
  last_alert_type: string | null;
  last_alert_time: string | null;
  last_playbook: string | null;
  last_kinetic_time: string | null;
}

interface GridOverview {
  tenants: GridTenant[];
  total_tenants: number;
  total_tickets: number;
  online_count: number;
  blueprint_version: string;
}

interface FeedEntry {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  alert_type: string;
  severity: string;
  source_ip: string | null;
  status: string;
  timestamp: string;
  kl_response_seconds: string | null;
}

interface GridFeed {
  feed: FeedEntry[];
  count: number;
}

interface DlqHealth {
  status: string;
  dlq_unexpected?: number;
  dlq_total?: number;
  [key: string]: unknown;
}

interface TicketDetail {
  id: string;
  alert_type: string;
  severity: string;
  source_ip: string | null;
  status: string;
  timestamp: string;
}

interface TicketsResponse {
  tickets: TicketDetail[];
  count: number;
}

function relativeTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case "PROTECTED": return "#48BB78";
    case "MONITORING": return "#F6AD55";
    case "PENDING": return "#718096";
    default: return "#718096";
  }
}

function cityStatusColor(online: number, total: number): string {
  if (total === 0) return "#718096";
  if (online === total) return "#48BB78";
  if (online > 0) return "#F6AD55";
  return "#EF4444";
}

const PLAYBOOK_MAP: Record<string, string> = {
  "KL-001": "Isolate Host",
  "KL-002": "Revoke IAM Keys",
  "KL-003": "Block Lateral Move",
  "KL-004": "Force MFA Reset",
  "KL-005": "Quarantine Endpoint",
  "KL-006": "SOAR Ticket Auto-Create",
};

function authFetch(url: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("ndr_token")}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
}

export default function GridOperatorView() {
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: overview, isLoading: overviewLoading, error: overviewError, refetch: refetchOverview } = useQuery<GridOverview>({
    queryKey: ["/api/ndr/grid/overview", refreshKey],
    queryFn: async () => {
      const res = await authFetch("/api/ndr/grid/overview");
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: 1000,
  });

  const { data: feed, isLoading: feedLoading } = useQuery<GridFeed>({
    queryKey: ["/api/ndr/grid/feed", refreshKey],
    queryFn: async () => {
      const res = await authFetch("/api/ndr/grid/feed?limit=10");
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: dlqHealth } = useQuery<DlqHealth>({
    queryKey: ["/api/ndr/dlq/health"],
    queryFn: async () => {
      const res = await authFetch("/api/ndr/dlq/health");
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: tenantTickets, isLoading: ticketsLoading } = useQuery<TicketsResponse>({
    queryKey: ["/api/ndr/tickets", expandedTenant],
    queryFn: async () => {
      const res = await authFetch(`/api/ndr/tickets?tenant_id=${encodeURIComponent(expandedTenant!)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!expandedTenant,
  });

  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const totalTenants = overview?.total_tenants ?? 0;
  const onlineCount = overview?.online_count ?? 0;
  const totalTickets = overview?.total_tickets ?? 0;
  const cityColor = cityStatusColor(onlineCount, totalTenants);

  return (
    <div className="space-y-6" data-testid="grid-operator-view">
      <Card className="border-2" style={{ borderColor: cityColor }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6" style={{ color: cityColor }} />
              <div>
                <h2 className="text-lg font-bold tracking-tight" data-testid="grid-title">
                  POWER GRID COMMAND — NDR PLATFORM
                </h2>
                <p className="text-sm text-muted-foreground">
                  City Status:{" "}
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: cityColor }}
                  />
                  <span className="font-mono font-semibold" data-testid="grid-online-count">
                    {overviewLoading ? "..." : `${onlineCount} TRANSFORMERS ONLINE`}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono" data-testid="grid-total-tickets">{totalTickets}</p>
                <p className="text-xs text-muted-foreground">Threats Auto-Contained</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-green-500" data-testid="grid-triage-count">0</p>
                <p className="text-xs text-muted-foreground">to Triage</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Transformer Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {overviewLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="transformer-table">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-3 pl-5">Transformer</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Last AI Action</th>
                    <th className="text-right p-3 pr-5">Threats</th>
                    <th className="p-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.tenants.map((tenant) => (
                    <TransformerRow
                      key={tenant.tenant_id}
                      tenant={tenant}
                      expanded={expandedTenant === tenant.tenant_id}
                      onToggle={() =>
                        setExpandedTenant(
                          expandedTenant === tenant.tenant_id ? null : tenant.tenant_id
                        )
                      }
                      tickets={expandedTenant === tenant.tenant_id ? tenantTickets : undefined}
                      ticketsLoading={ticketsLoading && expandedTenant === tenant.tenant_id}
                    />
                  ))}
                  {(!overview || overview.tenants.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground" data-testid="transformer-empty">
                        {overviewError ? (
                          <div className="space-y-2">
                            <p className="text-amber-500">Could not load transformer status.</p>
                            <Button size="sm" variant="outline" onClick={() => refetchOverview()} data-testid="btn-retry-overview">
                              Retry
                            </Button>
                          </div>
                        ) : (
                          "No transformers online yet."
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Feed — What the AI Crew Just Did
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {feedLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto" data-testid="live-feed">
                {feed?.feed.map((entry) => (
                  <FeedEntry key={entry.id} entry={entry} />
                ))}
                {(!feed?.feed || feed.feed.length === 0) && (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No feed entries yet
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              God-Mode Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/responses">
              <Button variant="outline" className="w-full justify-start gap-2" data-testid="btn-force-rollback">
                <RotateCcw className="h-4 w-4" />
                Force Rollback
              </Button>
            </Link>
            <Link href="/sigma-rules">
              <Button variant="outline" className="w-full justify-start gap-2" data-testid="btn-sigma-rules">
                <BookOpen className="h-4 w-4" />
                Sigma Rules
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 opacity-60"
              disabled
              data-testid="btn-export-soc2"
            >
              <FileText className="h-4 w-4" />
              Export SOC 2 Report
              <Badge variant="secondary" className="ml-auto text-[10px]">Sprint 6</Badge>
            </Button>
            <div className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Heart className="h-4 w-4" />
                DLQ Health
              </div>
              {dlqHealth ? (
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={dlqHealth.status === "NOMINAL" ? "default" : "destructive"}
                      className="text-[10px]"
                      data-testid="dlq-status"
                    >
                      {dlqHealth.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-mono" data-testid="dlq-total">{dlqHealth.dlq_total ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unexpected</span>
                    <span className="font-mono" data-testid="dlq-unexpected">{dlqHealth.dlq_unexpected ?? 0}</span>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TransformerRow({
  tenant,
  expanded,
  onToggle,
  tickets,
  ticketsLoading,
}: {
  tenant: GridTenant;
  expanded: boolean;
  onToggle: () => void;
  tickets?: TicketsResponse;
  ticketsLoading: boolean;
}) {
  const color = statusColor(tenant.status);
  const playbookLabel = tenant.last_playbook
    ? `${tenant.last_playbook} · ${relativeTime(tenant.last_kinetic_time)}`
    : "—";

  return (
    <>
      <tr
        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={onToggle}
        data-testid={`transformer-row-${tenant.tenant_id}`}
      >
        <td className="p-3 pl-5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tenant.name}</span>
            <Badge
              variant="secondary"
              className="text-[10px]"
              style={{
                backgroundColor: tenant.is_trial ? "#F6AD5520" : "#805AD520",
                color: tenant.is_trial ? "#DD6B20" : "#805AD5",
              }}
            >
              {tenant.tier.toUpperCase()}
            </Badge>
          </div>
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-mono" style={{ color }}>{tenant.status}</span>
          </div>
        </td>
        <td className="p-3">
          <span className="text-xs font-mono text-muted-foreground">{playbookLabel}</span>
        </td>
        <td className="p-3 pr-5 text-right">
          <span className="font-mono font-semibold" data-testid={`threat-count-${tenant.tenant_id}`}>
            {tenant.ticket_count}
          </span>
        </td>
        <td className="p-3">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-muted/30 p-0">
            <div className="px-5 py-3">
              {ticketsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : tickets && tickets.tickets.length > 0 ? (
                <table className="w-full text-xs" data-testid={`tickets-detail-${tenant.tenant_id}`}>
                  <thead>
                    <tr className="text-muted-foreground uppercase tracking-wider">
                      <th className="text-left py-1">Alert</th>
                      <th className="text-left py-1">Severity</th>
                      <th className="text-left py-1">Source IP</th>
                      <th className="text-left py-1">Status</th>
                      <th className="text-right py-1">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.tickets.slice(0, 5).map((t, i) => (
                      <tr key={i} className="border-t border-muted">
                        <td className="py-1.5 font-mono">{t.alert_type}</td>
                        <td className="py-1.5">
                          <Badge variant={t.severity === "CRITICAL" ? "destructive" : "secondary"} className="text-[10px]">
                            {t.severity}
                          </Badge>
                        </td>
                        <td className="py-1.5 font-mono">{t.source_ip || "—"}</td>
                        <td className="py-1.5">{t.status}</td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {relativeTime(t.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground py-2">No tickets for this transformer</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FeedEntry({ entry }: { entry: FeedEntry }) {
  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const tenantName = entry.tenant_name || entry.tenant_id;

  const playbookFired = PLAYBOOK_MAP[entry.alert_type] ? entry.alert_type : null;
  const slaDisplay = entry.kl_response_seconds && entry.kl_response_seconds !== "N/A"
    ? `${entry.kl_response_seconds}s`
    : null;

  return (
    <div className="px-5 py-3 hover:bg-muted/30 transition-colors" data-testid={`feed-entry-${entry.id}`}>
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap pt-0.5">
          {timeStr}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{tenantName}</span>
            <Badge
              variant={entry.severity === "CRITICAL" ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {entry.alert_type}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {entry.source_ip && (
              <span className="font-mono">Source: {entry.source_ip}</span>
            )}
            {slaDisplay && (
              <span>SLA: {slaDisplay}</span>
            )}
            <span>SOAR #{entry.id.slice(0, 8)}</span>
          </div>
        </div>
        <AlertTriangle
          className="h-4 w-4 flex-shrink-0 mt-0.5"
          style={{
            color: entry.severity === "CRITICAL" ? "#EF4444"
              : entry.severity === "HIGH" ? "#F59E0B"
              : "#718096",
          }}
        />
      </div>
    </div>
  );
}
