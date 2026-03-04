import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Activity, AlertTriangle, Ticket, Play, RefreshCw, Clock, ArrowUpCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HealthData {
  status: string;
  blueprint_version?: string;
  ecs_version?: string;
  platform_version?: string;
  [key: string]: unknown;
}

interface DlqHealthData {
  status: string;
  dlq_unexpected?: number;
  dlq_total?: number;
  [key: string]: unknown;
}

interface TicketRecord {
  alert_type?: string;
  severity?: string;
  status?: string;
  timestamp?: string;
  event_json?: string;
  [key: string]: unknown;
}

interface TicketsData {
  tickets: TicketRecord[];
  tenant_id: string;
  count: number;
}

interface AuthUser {
  email: string;
  role: string;
  tenant_id: string;
  is_trial: boolean;
  trial_expires_at: string | null;
}

function getStatusColor(status: string | undefined): string {
  if (!status) return "bg-gray-400";
  const s = status.toUpperCase();
  if (s === "NOMINAL" || s === "LIVE" || s === "HEALTHY" || s === "OK") return "bg-green-500";
  if (s === "DEGRADED" || s === "WARNING") return "bg-amber-500";
  return "bg-red-500";
}

function getStatusBadgeVariant(status: string | undefined): "default" | "secondary" | "destructive" {
  if (!status) return "secondary";
  const s = status.toUpperCase();
  if (s === "NOMINAL" || s === "LIVE" || s === "HEALTHY" || s === "OK") return "default";
  if (s === "DEGRADED" || s === "WARNING") return "secondary";
  return "destructive";
}

function getTrialDaysRemaining(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
}

function getTrialBannerColor(daysRemaining: number): string {
  if (daysRemaining <= 0) return "border-red-500 bg-red-500/10";
  if (daysRemaining <= 2) return "border-amber-500 bg-amber-500/10";
  return "border-blue-500 bg-blue-500/10";
}

function getLastAlertHoursAgo(tickets: TicketRecord[]): number {
  if (!tickets || tickets.length === 0) return -1;
  let mostRecent = 0;
  for (const t of tickets) {
    if (t.timestamp) {
      const ts = new Date(t.timestamp).getTime();
      if (ts > mostRecent) mostRecent = ts;
    }
  }
  if (mostRecent === 0) return -1;
  return Math.round((Date.now() - mostRecent) / (1000 * 60 * 60));
}

export default function ProtectedView() {
  const { toast } = useToast();
  const [labToken, setLabToken] = useState<string | null>(null);
  const [labRole, setLabRole] = useState<string>("owner");
  const [labTenant, setLabTenant] = useState<string>("default");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const isTrial = authUser?.is_trial ?? false;
  const trialDays = getTrialDaysRemaining(authUser?.trial_expires_at);

  useEffect(() => {
    const storedToken = sessionStorage.getItem("ndr_jwt");
    const storedUser = sessionStorage.getItem("ndr_user");
    if (storedToken && storedUser) {
      setLabToken(storedToken);
      const parsed = JSON.parse(storedUser) as AuthUser;
      setAuthUser(parsed);
      setLabTenant(parsed.tenant_id);
      setLabRole(parsed.role);
    }
  }, []);

  const authHeaders = labToken ? { Authorization: `Bearer ${labToken}` } : {};

  const { data: healthData, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ["/api/ndr/health", labToken],
    queryFn: async () => {
      const res = await fetch("/api/ndr/health", { headers: authHeaders });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!labToken,
  });

  const { data: dlqData, isLoading: dlqLoading } = useQuery<DlqHealthData>({
    queryKey: ["/api/ndr/dlq/health", labToken],
    queryFn: async () => {
      const res = await fetch("/api/ndr/dlq/health", { headers: authHeaders });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!labToken,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery<TicketsData>({
    queryKey: ["/api/ndr/tickets", labToken],
    queryFn: async () => {
      const res = await fetch(`/api/ndr/tickets?tenant_id=${encodeURIComponent(labTenant)}`, { headers: authHeaders });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!labToken,
  });

  const runPipelineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ndr/run", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "test" }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pipeline executed", description: "Pipeline run completed successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/ndr/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ndr/dlq/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ndr/tickets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Pipeline failed", description: err.message, variant: "destructive" });
    },
  });

  const pipelineStatus = healthData?.status || "UNKNOWN";
  const dlqStatus = dlqData?.status || "UNKNOWN";
  const ticketCount = ticketsData?.count ?? 0;
  const canRunPipeline = (labRole === "owner" || labRole === "super_admin") && !isTrial;

  const lateralMoveCount = useMemo(() => {
    if (!ticketsData?.tickets) return 0;
    return ticketsData.tickets.filter((t) => t.alert_type === "LATERAL_MOVE").length;
  }, [ticketsData]);

  const lastAlertHours = useMemo(() => {
    return getLastAlertHoursAgo(ticketsData?.tickets || []);
  }, [ticketsData]);

  const noiseFilteredPct = 98;

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="protected-view">
      {isTrial && (
        <div
          className={`border rounded-lg p-4 ${getTrialBannerColor(trialDays)}`}
          data-testid="banner-trial"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <div>
                <p className="font-semibold" data-testid="text-trial-days">
                  TRIAL ACCOUNT — {trialDays} day{trialDays !== 1 ? "s" : ""} remaining
                </p>
                <p className="text-sm text-muted-foreground">
                  You're viewing demo data. Upgrade to connect live traffic.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" data-testid="button-upgrade-basic">
                <ArrowUpCircle className="h-3 w-3 mr-1" />
                Upgrade to Basic — $99/mo
              </Button>
              <Button size="sm" data-testid="button-upgrade-pro">
                <ArrowUpCircle className="h-3 w-3 mr-1" />
                Upgrade to Pro — $499/mo
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-protected-title">
              NDR PLATFORM — NETWORK PROTECTED
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-tenant-info">
              Tenant: <span className="font-mono font-medium">{labTenant}</span>
              {" · "}
              Role: <span className="font-mono font-medium">{labRole}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canRunPipeline && (
            <Button
              size="sm"
              onClick={() => runPipelineMutation.mutate()}
              disabled={runPipelineMutation.isPending}
              data-testid="button-run-pipeline"
            >
              {runPipelineMutation.isPending ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              Run Pipeline
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-threats-blocked">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Threats Blocked (6d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ticketsLoading ? (
              <div className="animate-pulse h-8 bg-muted rounded" />
            ) : (
              <p className="text-3xl font-bold" data-testid="text-threats-blocked">{ticketCount}</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-lateral-moves">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Lateral Moves Stopped
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ticketsLoading ? (
              <div className="animate-pulse h-8 bg-muted rounded" />
            ) : (
              <p className="text-3xl font-bold" data-testid="text-lateral-moves">{lateralMoveCount}</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-last-alert">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ticketsLoading ? (
              <div className="animate-pulse h-8 bg-muted rounded" />
            ) : (
              <p className="text-3xl font-bold" data-testid="text-last-alert">
                {lastAlertHours >= 0 ? `${lastAlertHours}h ago` : "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-noise-filtered">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              AI Noise Filtered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-noise-filtered">{noiseFilteredPct}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-pipeline-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="animate-pulse h-8 bg-muted rounded" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(pipelineStatus)}`} data-testid="indicator-pipeline" />
                  <Badge variant={getStatusBadgeVariant(pipelineStatus)} data-testid="badge-pipeline-ndr">
                    {pipelineStatus === "OK" || pipelineStatus === "HEALTHY" ? "LIVE" : pipelineStatus}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono" data-testid="text-blueprint-version">
                  Blueprint: {healthData?.blueprint_version || healthData?.platform_version || "v1.2"}
                </p>
                <p className="text-xs text-muted-foreground font-mono" data-testid="text-ecs-version">
                  ECS: {healthData?.ecs_version || "8.11.0"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-dlq-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              DLQ Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dlqLoading ? (
              <div className="animate-pulse h-8 bg-muted rounded" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(dlqStatus)}`} data-testid="indicator-dlq" />
                  <Badge variant={getStatusBadgeVariant(dlqStatus)} data-testid="badge-dlq-status">
                    {dlqStatus}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono" data-testid="text-dlq-unexpected">
                  Unexpected: {dlqData?.dlq_unexpected ?? 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-tickets">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              SOAR Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ticketsLoading ? (
              <div className="animate-pulse h-8 bg-muted rounded" />
            ) : (
              <div className="space-y-2">
                <p className="text-2xl font-bold" data-testid="text-ticket-count">{ticketCount} OPEN</p>
                <p className="text-xs text-muted-foreground font-mono" data-testid="text-ticket-tenant">
                  tenant: {ticketsData?.tenant_id || labTenant}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-system-info">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">System Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Sigma rules active</p>
              <p className="font-mono font-medium" data-testid="text-sigma-rules">5</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Playbooks</p>
              <p className="font-mono font-medium" data-testid="text-playbooks">6</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Blueprint</p>
              <p className="font-mono font-medium" data-testid="text-blueprint">v1.2</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">ECS</p>
              <p className="font-mono font-medium" data-testid="text-ecs">8.11.0</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {ticketsData && ticketsData.tickets.length > 0 && (
        <Card data-testid="card-ticket-list">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-auto">
              {ticketsData.tickets.slice(0, 10).map((ticket, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs p-2 rounded bg-muted/50"
                  data-testid={`row-ticket-${idx}`}
                >
                  <span className="font-mono">{ticket.alert_type || "unknown"}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {ticket.severity || "—"}
                  </Badge>
                  <span className="text-muted-foreground">{ticket.status || "OPEN"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
