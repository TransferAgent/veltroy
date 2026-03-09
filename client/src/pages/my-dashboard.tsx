import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Activity, Users, AlertTriangle } from "lucide-react";
import { getToken, getCurrentUser } from "@/lib/auth";
import { useHouseMode } from "@/context/HouseModeContext";

function fetchWithAuth(url: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  }).then((r) => {
    if (!r.ok) throw new Error("Failed to fetch");
    return r.json();
  });
}

function appendViewAs(url: string, tenantId: string | null): string {
  if (!tenantId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}view_as=${encodeURIComponent(tenantId)}`;
}

export default function MyDashboard() {
  const user = getCurrentUser();
  const { isHouseMode, activeTenantId, activeTenantName } = useHouseMode();

  const orgDisplayName = isHouseMode
    ? (activeTenantName || "Tenant")
    : user?.tenant_id
      ? user.tenant_id.replace(/-[a-z0-9]{6}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "My Organization";

  const viewAs = isHouseMode ? activeTenantId : null;

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/my/stats", viewAs],
    queryFn: () => fetchWithAuth(appendViewAs("/api/my/stats", viewAs)),
    refetchInterval: 5000,
  });

  const { data: threatsData, isLoading: threatsLoading } = useQuery({
    queryKey: ["/api/my/threats", viewAs],
    queryFn: () => fetchWithAuth(appendViewAs("/api/my/threats?limit=5", viewAs)),
    refetchInterval: 5000,
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/my/events", viewAs],
    queryFn: () => fetchWithAuth(appendViewAs("/api/my/events?limit=5", viewAs)),
    refetchInterval: 5000,
  });

  const stats = statsData?.stats;

  return (
    <div className="p-6 space-y-6" data-testid="my-dashboard-page">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-my-org-title">
            {orgDisplayName}
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase" data-testid="text-tenant-id">
            Command Center
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="hover-elevate">
              <CardContent className="p-4">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="hover-elevate" data-testid="card-stat-events">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Network Events</span>
                  <Activity className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold">{stats?.total_events ?? 0}</div>
              </CardContent>
            </Card>
            <Card className="hover-elevate" data-testid="card-stat-identity">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Identity Logs</span>
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold">{stats?.total_identity ?? 0}</div>
              </CardContent>
            </Card>
            <Card className="hover-elevate" data-testid="card-stat-threats">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Correlations</span>
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                </div>
                <div className="text-2xl font-bold">{stats?.total_correlations ?? 0}</div>
              </CardContent>
            </Card>
            <Card className="hover-elevate" data-testid="card-stat-severity">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">By Severity</span>
                  <Shield className="h-4 w-4 text-red-400" />
                </div>
                <div className="flex gap-2 mt-1">
                  <Badge variant="destructive" className="text-[10px]">{stats?.critical_count ?? 0} Crit</Badge>
                  <Badge className="bg-pink-600/20 text-pink-300 text-[10px]">{stats?.high_count ?? 0} High</Badge>
                  <Badge className="bg-orange-600/20 text-orange-300 text-[10px]">{stats?.medium_count ?? 0} Med</Badge>
                  <Badge className="bg-green-600/20 text-green-300 text-[10px]">{stats?.low_count ?? 0} Low</Badge>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="hover-elevate" data-testid="card-recent-threats">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              Recent Threats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {threatsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : threatsData?.threats?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-threats">
                No threats detected for your organization yet.
              </p>
            ) : (
              threatsData?.threats?.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-card-border bg-card/50"
                  data-testid={`row-threat-${t.id}`}
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{t.alert_type?.replace(/_/g, " ") || "Unknown"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {t.source_ip} {t.sigma_rule_id ? `· ${t.sigma_rule_id}` : ""}
                    </div>
                  </div>
                  <Badge
                    className={
                      t.severity === "critical" ? "bg-red-600/20 text-red-300" :
                      t.severity === "high" ? "bg-pink-600/20 text-pink-300" :
                      t.severity === "medium" ? "bg-orange-600/20 text-orange-300" :
                      "bg-green-600/20 text-green-300"
                    }
                  >
                    {t.severity}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-recent-events">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              Recent Network Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {eventsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : eventsData?.events?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-events">
                No network events for your organization yet.
              </p>
            ) : (
              eventsData?.events?.map((e: any) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-card-border bg-card/50"
                  data-testid={`row-event-${e.id}`}
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{e.event_dataset}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {e.source_ip} → {e.destination_ip}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {e.event_kind}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {stats?.latest_event_at && (
        <p className="text-[10px] text-muted-foreground text-right font-mono" data-testid="text-last-updated">
          Last event: {new Date(stats.latest_event_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
