import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Shield } from "lucide-react";
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

function severityColor(sev: string) {
  switch (sev) {
    case "critical": return "bg-red-600/20 text-red-300 border-red-500/30";
    case "high": return "bg-pink-600/20 text-pink-300 border-pink-500/30";
    case "medium": return "bg-orange-600/20 text-orange-300 border-orange-500/30";
    case "low": return "bg-green-600/20 text-green-300 border-green-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function MyThreats() {
  const user = getCurrentUser();
  const { isHouseMode, activeTenantId, activeTenantName } = useHouseMode();

  const orgDisplayName = isHouseMode
    ? (activeTenantName || "Tenant")
    : user?.tenant_id
      ? user.tenant_id.replace(/-[a-z0-9]{6}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "My Organization";

  const viewAs = isHouseMode ? activeTenantId : null;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/my/threats", viewAs],
    queryFn: () => fetchWithAuth(appendViewAs("/api/my/threats?limit=100", viewAs)),
    refetchInterval: 5000,
  });

  const threats = data?.threats || [];

  return (
    <div className="p-6 space-y-6" data-testid="my-threats-page">
      <div className="flex items-center gap-3 mb-2">
        <AlertTriangle className="h-6 w-6 text-orange-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{orgDisplayName}</h1>
          <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">Threat Correlations</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs" data-testid="badge-threat-count">
          {threats.length} correlation{threats.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="hover-elevate">
              <CardContent className="p-4">
                <Skeleton className="h-6 w-32 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : threats.length === 0 ? (
        <Card className="hover-elevate">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-green-400 mx-auto mb-3 opacity-60" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-threats">
              No threats detected for your organization. Your network is clean.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {threats.map((t: any) => (
            <Card key={t.id} className="hover-elevate" data-testid={`card-threat-${t.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    {t.alert_type?.replace(/_/g, " ") || "Unknown Alert"}
                  </CardTitle>
                  <Badge className={`text-[10px] ${severityColor(t.severity)}`}>
                    {t.severity}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Source</span>
                    <div className="font-mono">{t.source_ip || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Host</span>
                    <div className="font-mono">{t.host_ip || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sigma Rule</span>
                    <div className="font-mono">{t.sigma_rule_id || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IAM User</span>
                    <div className="font-mono">{t.iam_user || "—"}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-card-border">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(t.timestamp).toLocaleString()}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {t.dispatched ? "Dispatched" : "Pending"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
