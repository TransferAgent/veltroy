import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  Activity,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Server,
  Clock,
  TrendingUp,
  Gauge,
} from "lucide-react";
import type { PipelineMetric, PipelineStatus } from "@shared/schema";

const stageColors: Record<string, string> = {
  ingestion: "hsl(var(--chart-1))",
  identity: "hsl(var(--chart-2))",
  correlation: "hsl(var(--chart-3))",
  response: "hsl(var(--chart-4))",
};

const stageNames: Record<string, string> = {
  ingestion: "Packet Metadata (Eng 1)",
  identity: "Identity Logs (Eng 2)",
  correlation: "Data Correlation (Eng 3)",
  response: "Auto Response (Eng 4)",
};

function PipelineStageCard({
  stage,
}: {
  stage: PipelineStatus["stages"][0];
}) {
  const isActive = stage.status === "active";

  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-md border p-3 transition-colors ${
        isActive ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      }`}
      data-testid={`card-pipeline-stage-${stage.name}`}
    >
      {isActive && (
        <div className="absolute top-2 right-2">
          <div className="h-2 w-2 rounded-full bg-chart-2 animate-pulse" />
        </div>
      )}
      <Server className="h-5 w-5 text-muted-foreground" />
      <div className="text-center">
        <p className="text-xs font-medium">{stageNames[stage.name] || stage.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {stage.status}
        </p>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold font-mono">{stage.avg_latency_ms.toFixed(0)}</p>
        <p className="text-[10px] text-muted-foreground">ms avg</p>
      </div>
      <p className="text-[9px] text-muted-foreground font-mono">
        Last: {new Date(stage.last_processed).toLocaleTimeString()}
      </p>
    </div>
  );
}

function OracleScriptPanel({ status }: { status: PipelineStatus }) {
  const slaColor =
    status.sla_compliance_pct >= 95
      ? "text-chart-2"
      : status.sla_compliance_pct >= 80
        ? "text-chart-4"
        : "text-destructive";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Oracle Script Monitor
          </CardTitle>
          <Badge
            variant={status.running ? "default" : "destructive"}
            className="text-[10px]"
          >
            {status.running ? "ACTIVE" : "STOPPED"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Uptime</p>
            <p className="text-sm font-mono font-medium" data-testid="text-pipeline-uptime">
              {formatUptime(status.uptime_seconds)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Events Processed</p>
            <p className="text-sm font-mono font-medium" data-testid="text-events-processed">
              {status.total_events_processed.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Current Latency</p>
            <p className="text-sm font-mono font-medium" data-testid="text-current-latency">
              {(status.current_latency_ms / 1000).toFixed(1)}s
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">SLA Compliance</p>
            <p className={`text-sm font-mono font-bold ${slaColor}`} data-testid="text-sla-pct">
              {status.sla_compliance_pct.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-muted-foreground">
              SLA Target: {(status.sla_target_ms / 1000).toFixed(0)}s
            </span>
            <span className="text-[10px] font-mono">
              {status.current_latency_ms < status.sla_target_ms ? "WITHIN SLA" : "SLA BREACH"}
            </span>
          </div>
          <Progress
            value={Math.min(
              (status.current_latency_ms / status.sla_target_ms) * 100,
              100
            )}
            className="h-2"
            data-testid="progress-sla"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Pipeline() {
  const { data: status, isLoading: statusLoading } = useQuery<PipelineStatus>({
    queryKey: ["/api/pipeline/status"],
    refetchInterval: 2000,
  });

  const { data: metrics } = useQuery<PipelineMetric[]>({
    queryKey: ["/api/pipeline/metrics"],
    refetchInterval: 3000,
  });

  const latencyData = (metrics || []).slice(-40).map((m) => ({
    time: new Date(m["@timestamp"]).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    total: m.total_pipeline_ms,
    ingestion: m.stages.ingestion_ms,
    identity: m.stages.identity_ms,
    correlation: m.stages.correlation_ms,
    response: m.stages.response_ms,
  }));

  const throughputData = (metrics || []).slice(-40).map((m) => ({
    time: new Date(m["@timestamp"]).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    events: m.events_processed,
  }));

  if (statusLoading) {
    return (
      <div className="h-full overflow-auto p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
          Pipeline Monitor
        </h1>
        <p className="text-xs text-muted-foreground">
          Oracle Script end-to-end latency tracking
        </p>
      </div>

      {status && <OracleScriptPanel status={status} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {(status?.stages || []).map((stage, idx) => (
              <div key={stage.name} className="flex items-center gap-1">
                <div className="flex-1">
                  <PipelineStageCard stage={stage} />
                </div>
                {idx < (status?.stages?.length ?? 0) - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden lg:block" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-1">
              <CardTitle className="text-sm font-medium">
                Stage Latency Breakdown
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                Last 40 cycles
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latencyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}s`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number) => [`${value.toFixed(0)}ms`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="ingestion"
                    stackId="1"
                    stroke={stageColors.ingestion}
                    fill={stageColors.ingestion}
                    fillOpacity={0.3}
                    name="Ingestion"
                  />
                  <Area
                    type="monotone"
                    dataKey="identity"
                    stackId="1"
                    stroke={stageColors.identity}
                    fill={stageColors.identity}
                    fillOpacity={0.3}
                    name="Identity"
                  />
                  <Area
                    type="monotone"
                    dataKey="correlation"
                    stackId="1"
                    stroke={stageColors.correlation}
                    fill={stageColors.correlation}
                    fillOpacity={0.3}
                    name="Correlation"
                  />
                  <Area
                    type="monotone"
                    dataKey="response"
                    stackId="1"
                    stroke={stageColors.response}
                    fill={stageColors.response}
                    fillOpacity={0.3}
                    name="Response"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-1">
              <CardTitle className="text-sm font-medium">
                Throughput
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                Events per cycle
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "11px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                    name="Events"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
