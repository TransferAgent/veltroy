import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Network,
  ShieldAlert,
  Zap,
  Timer,
  TrendingUp,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import type {
  DashboardStats,
  PipelineMetric,
  NetworkEvent,
  Correlation,
} from "@shared/schema";
import { getCurrentUser } from "@/lib/auth";
import GridOperatorView from "@/components/GridOperatorView";

const severityColors: Record<string, string> = {
  "0-25": "hsl(142, 76%, 36%)",
  "26-50": "hsl(32, 95%, 44%)",
  "51-75": "hsl(340, 82%, 48%)",
  "76-100": "hsl(0, 84%, 42%)",
};

const confidenceColors: Record<string, string> = {
  Low: "hsl(142, 76%, 36%)",
  Medium: "hsl(32, 95%, 44%)",
  High: "hsl(340, 82%, 48%)",
  Critical: "hsl(0, 84%, 42%)",
};

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  loading,
  testId,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  loading?: boolean;
  testId: string;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-1">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold font-mono tracking-tight" data-testid={testId}>
              {value}
            </p>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="rounded-md bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LatencyChart({ metrics }: { metrics: PipelineMetric[] }) {
  const chartData = metrics.slice(-30).map((m) => ({
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
    sla: 60000,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-1">
          <CardTitle className="text-sm font-medium">
            Pipeline Latency (Oracle Script)
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            Target: &lt;60s
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`${value.toFixed(0)}ms`, ""]}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="Total"
              />
              <Line
                type="monotone"
                dataKey="ingestion"
                stroke="hsl(var(--chart-2))"
                strokeWidth={1}
                dot={false}
                opacity={0.6}
                name="Ingestion"
              />
              <Line
                type="monotone"
                dataKey="correlation"
                stroke="hsl(var(--chart-3))"
                strokeWidth={1}
                dot={false}
                opacity={0.6}
                name="Correlation"
              />
              <Line
                type="monotone"
                dataKey="response"
                stroke="hsl(var(--chart-4))"
                strokeWidth={1}
                dot={false}
                opacity={0.6}
                name="Response"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityChart({ data }: { data: { range: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Severity Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Events">
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={severityColors[entry.range] || "hsl(var(--primary))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const logSourceColors: Record<string, string> = {
  "zeek.conn": "hsl(var(--chart-1))",
  "zeek.dns": "hsl(var(--chart-2))",
  "zeek.http": "hsl(var(--chart-4))",
};

function LogSourceChart({ data }: { data: { source: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-1">
          <CardTitle className="text-sm font-medium">
            Zeek Log Sources
          </CardTitle>
          <Badge variant="secondary" className="text-[10px] font-mono">
            Blueprint v1.2
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[220px] flex items-center">
          <div className="w-1/2 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.source}
                      fill={logSourceColors[entry.source] || "hsl(var(--primary))"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "11px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-1/2 space-y-2.5">
            {data.map((entry) => (
              <div key={entry.source} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: logSourceColors[entry.source] || "hsl(var(--primary))" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono">{entry.source}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.count} events ({total > 0 ? ((entry.count / total) * 100).toFixed(0) : 0}%)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentAlerts({ events }: { events: NetworkEvent[] }) {
  const alerts = events
    .filter((e) => e.event.kind === "alert")
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Recent Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            No recent alerts
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center gap-3 rounded-md bg-accent/30 p-2"
                data-testid={`alert-item-${alert.id}`}
              >
                <div
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    alert.event.severity >= 75
                      ? "bg-destructive"
                      : alert.event.severity >= 50
                        ? "bg-chart-5"
                        : "bg-chart-4"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {alert.rule?.name || alert.event.category.join(", ")}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {alert.source.ip} → {alert.destination.ip}:{alert.destination.port}
                  </p>
                </div>
                <Badge
                  variant={alert.event.severity >= 75 ? "destructive" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {alert.event.severity}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveThreats({ threats }: { threats: Correlation[] }) {
  const active = threats
    .filter((t) => t.status === "new" || t.status === "investigating")
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Active Threats</CardTitle>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            No active threats
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((threat) => (
              <div
                key={threat.id}
                className="flex items-start gap-3 rounded-md bg-accent/30 p-2"
                data-testid={`threat-item-${threat.id}`}
              >
                <ShieldAlert
                  className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                    threat.threat.indicator.confidence === "Critical"
                      ? "text-destructive"
                      : threat.threat.indicator.confidence === "High"
                        ? "text-chart-5"
                        : "text-chart-4"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {threat.threat.technique.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {threat.threat.tactic.name} ({threat.threat.tactic.id})
                  </p>
                </div>
                <Badge
                  style={{
                    backgroundColor:
                      confidenceColors[threat.threat.indicator.confidence],
                    color: "white",
                  }}
                  className="text-[10px] shrink-0"
                >
                  {threat.threat.indicator.confidence}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const user = getCurrentUser();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 3000,
  });

  const { data: metrics } = useQuery<PipelineMetric[]>({
    queryKey: ["/api/pipeline/metrics"],
    refetchInterval: 3000,
  });

  const { data: events } = useQuery<NetworkEvent[]>({
    queryKey: ["/api/events"],
    refetchInterval: 5000,
  });

  const { data: threats } = useQuery<Correlation[]>({
    queryKey: ["/api/threats"],
    refetchInterval: 5000,
  });

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {isSuperAdmin && <GridOperatorView />}

      <div className="flex items-center justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Apex NDR
          </h1>
          <p className="text-[10px] text-amber-400/80 font-medium tracking-wide uppercase">
            Seeded Data (Read Only)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <Activity className="h-3 w-3 text-chart-2" />
            <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-eps">
              {stats?.eventsPerSecond?.toFixed(1) || "0"} eps
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Events"
          value={stats?.totalEvents?.toLocaleString() || "0"}
          icon={Network}
          subtitle="Network + Identity"
          loading={statsLoading}
          testId="stat-total-events"
        />
        <StatCard
          title="Active Threats"
          value={stats?.activeThreats || 0}
          icon={ShieldAlert}
          subtitle="Correlated detections"
          loading={statsLoading}
          testId="stat-active-threats"
        />
        <StatCard
          title="Response Actions"
          value={stats?.responseActions || 0}
          icon={Zap}
          subtitle="Automated responses"
          loading={statsLoading}
          testId="stat-response-actions"
        />
        <StatCard
          title="Avg Latency"
          value={
            stats?.avgLatencyMs != null
              ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s`
              : "--"
          }
          icon={Timer}
          subtitle={`SLA: ${stats?.slaCompliance?.toFixed(1) || "--"}%`}
          loading={statsLoading}
          testId="stat-avg-latency"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LatencyChart metrics={metrics || []} />
        <LogSourceChart data={stats?.logSourceBreakdown || []} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SeverityChart data={stats?.severityDistribution || []} />
        <RecentAlerts events={events || []} />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <ActiveThreats threats={threats || []} />
      </div>
    </div>
  );
}
