import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Activity, AlertTriangle, Ticket, Play, RefreshCw } from "lucide-react";
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

interface TicketsData {
  tickets: Array<Record<string, unknown>>;
  tenant_id: string;
  count: number;
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

export default function ProtectedView() {
  const { toast } = useToast();
  const [labToken, setLabToken] = useState<string | null>(null);
  const [labRole, setLabRole] = useState<string>("owner");
  const [labTenant, setLabTenant] = useState<string>("default");

  useEffect(() => {
    fetch("/api/ndr/token/lab")
      .then((r) => r.json())
      .then((data) => {
        if (data.tokens) {
          setLabToken(data.tokens[labRole]);
        }
      })
      .catch(() => {});
  }, [labRole]);

  const authHeaders = labToken ? { Authorization: `Bearer ${labToken}` } : {};

  const { data: healthData, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ["/api/ndr/health"],
    queryFn: async () => {
      const res = await fetch("/api/ndr/health", { headers: authHeaders });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!labToken,
  });

  const { data: dlqData, isLoading: dlqLoading } = useQuery<DlqHealthData>({
    queryKey: ["/api/ndr/dlq/health"],
    queryFn: async () => {
      const res = await fetch("/api/ndr/dlq/health", { headers: authHeaders });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!labToken,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery<TicketsData>({
    queryKey: ["/api/ndr/tickets"],
    queryFn: async () => {
      const res = await fetch("/api/ndr/tickets", { headers: authHeaders });
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
  const canRunPipeline = labRole === "owner" || labRole === "super_admin";

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="protected-view">
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
          <select
            value={labRole}
            onChange={(e) => setLabRole(e.target.value)}
            className="text-xs px-2 py-1 rounded border bg-background"
            data-testid="select-lab-role"
          >
            <option value="owner">owner</option>
            <option value="super_admin">super_admin</option>
            <option value="billing_admin">billing_admin</option>
            <option value="support">support</option>
            <option value="customer">customer</option>
          </select>
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
                  <span className="font-mono">{(ticket.alert_type as string) || "unknown"}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {(ticket.severity as string) || "—"}
                  </Badge>
                  <span className="text-muted-foreground">{(ticket.status as string) || "OPEN"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
