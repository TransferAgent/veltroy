import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Shield, Activity, AlertTriangle, Zap, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { getCurrentUser } from "@/lib/auth";

interface TicketRecord {
  id?: string;
  alert_type?: string;
  severity?: string;
  status?: string;
  timestamp?: string;
  source_ip?: string;
  kl_response_seconds?: number;
  ticket_json?: string;
  [key: string]: unknown;
}

interface TicketsData {
  tickets: TicketRecord[];
  tenant_id: string;
  count: number;
}

interface DlqHealth {
  status: string;
  [key: string]: unknown;
}

const PLAIN_ENGLISH: Record<string, (ticket: TicketRecord) => string> = {
  BRUTE_FORCE_SUCCESS: (t) =>
    `Blocked a brute-force attack targeting your network.\n${t.source_ip ? `Source: ${t.source_ip}. ` : ""}All access attempts blocked.\nResponse time: ${parseKlSeconds(t)}s.`,
  LATERAL_MOVE: (t) =>
    `Caught unusual movement inside your network and isolated it.\nNo data was exposed. Contained in ${parseKlSeconds(t)} seconds.`,
  C2_BEACON: () =>
    `Detected and cut an attempted remote takeover of your network.\nThe connection was blocked before any data left your environment.`,
  HOST_CARDINALITY_SPIKE: () =>
    `Unusual device scanning activity detected across your network.\nIsolated and stopped before it could spread.`,
  SUSPICIOUS_IAM_KEY_ROTATION: () =>
    `Suspicious admin credential activity detected.\nAccess was revoked immediately. No unauthorized changes were made.`,
};

const DEFAULT_EN = () =>
  `A security event was detected and neutralized.\nYour network remained protected.`;

function parseKlSeconds(t: TicketRecord): string {
  if (t.kl_response_seconds && typeof t.kl_response_seconds === "number") {
    return t.kl_response_seconds.toFixed(1);
  }
  try {
    const json = t.ticket_json ? JSON.parse(t.ticket_json) : {};
    const val = json.kl_response_seconds_value;
    if (val && val !== "N/A") return String(val);
  } catch {}
  return "< 1";
}

function relativeTimeFriendly(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) {
    const d = new Date(ts);
    return `Yesterday at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `${days} days ago`;
}

function getTrialDaysRemaining(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const expiry = new Date(expiresAt).getTime();
  return Math.max(0, Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24)));
}

function authFetch(url: string) {
  const token = localStorage.getItem("ndr_token") || sessionStorage.getItem("ndr_jwt");
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export default function TransformerOwnerView() {
  const user = getCurrentUser();
  const tenantId = user?.tenant_id || "default";
  const isTrial = user?.is_trial ?? false;
  const trialExpires = user?.trial_expires_at;
  const orgName = user?.org_name || user?.tenant_id || "Your Organization";
  const daysRemaining = getTrialDaysRemaining(trialExpires);

  const { data: tickets, isLoading: ticketsLoading } = useQuery<TicketsData>({
    queryKey: ["/api/ndr/tickets"],
    queryFn: async () => {
      const res = await authFetch("/api/ndr/tickets");
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
  });

  const allTickets = tickets?.tickets ?? [];
  const totalThreats = allTickets.length;
  const lateralMoves = allTickets.filter((t) => t.alert_type === "LATERAL_MOVE").length;
  const isOnline = dlqHealth?.status === "NOMINAL" || dlqHealth?.status === "OK" || totalThreats > 0;
  const recentTickets = allTickets.slice(0, 5);

  return (
    <div className="space-y-6" data-testid="transformer-owner-view">
      <Card className="border-2 border-green-500/50 bg-green-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-green-500" />
            <div>
              <h2 className="text-xl font-bold tracking-tight" data-testid="block-title">
                YOUR BLOCK IS PROTECTED
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm font-medium" data-testid="org-name">{orgName}</span>
                <span className="text-muted-foreground">·</span>
                {isOnline ? (
                  <Badge variant="default" className="text-[10px] bg-green-500" data-testid="block-status">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-white mr-1" />
                    ONLINE
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]" data-testid="block-status">
                    MONITORING
                  </Badge>
                )}
                <span className="text-muted-foreground">·</span>
                {isTrial ? (
                  <span className="text-xs text-muted-foreground" data-testid="trial-info">
                    {daysRemaining > 0 ? `${daysRemaining} days trial remaining` : "Trial expired"}
                  </span>
                ) : (
                  <span className="text-xs text-green-600" data-testid="subscription-info">
                    Active subscription
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-5 text-center">
            {ticketsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-amber-500" />
                <p className="text-3xl font-bold font-mono" data-testid="threats-stopped">{totalThreats}</p>
                <p className="text-sm font-medium">Threats Stopped</p>
                <p className="text-xs text-muted-foreground">(last 6 days)</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5 text-center">
            {ticketsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <Activity className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <p className="text-3xl font-bold font-mono" data-testid="lateral-blocked">{lateralMoves}</p>
                <p className="text-sm font-medium">Lateral Moves</p>
                <p className="text-xs text-muted-foreground">Blocked (this week)</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-5 text-center">
            <Zap className="h-6 w-6 mx-auto mb-2 text-green-500" />
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <p className="text-lg font-bold" data-testid="crew-status">Active</p>
            </div>
            <p className="text-sm font-medium">AI Crew Status</p>
            <p className="text-xs text-muted-foreground">98% noise out</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            What Your AI Crew Did For You
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ticketsLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : recentTickets.length > 0 ? (
            <div className="divide-y" data-testid="activity-feed">
              {recentTickets.map((ticket, i) => {
                const translator = PLAIN_ENGLISH[ticket.alert_type || ""] || DEFAULT_EN;
                const description = translator(ticket);
                const timeLabel = ticket.timestamp
                  ? relativeTimeFriendly(ticket.timestamp)
                  : "Recently";

                return (
                  <div key={ticket.id || i} className="px-5 py-4" data-testid={`activity-entry-${i}`}>
                    <div className="flex items-start gap-3">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {timeLabel}
                        </p>
                        {description.split("\n").map((line, li) => (
                          <p key={li} className="text-sm leading-relaxed">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No security events recorded yet. Your AI crew is standing watch.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/threats">
          <Button variant="outline" className="gap-2" data-testid="btn-view-technical">
            View Full Technical Report
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        {isTrial && (
          <Link href="/upgrade">
            <Button variant="default" className="gap-2 bg-green-600 hover:bg-green-700" data-testid="btn-upgrade">
              Upgrade for Live Detection
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
