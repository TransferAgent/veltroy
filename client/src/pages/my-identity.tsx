import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
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

function actionColor(action: string | null) {
  if (!action) return "bg-muted text-muted-foreground";
  if (action.includes("success")) return "bg-green-600/20 text-green-300";
  if (action.includes("failure") || action.includes("denied")) return "bg-red-600/20 text-red-300";
  if (action.includes("escalation") || action.includes("privilege")) return "bg-orange-600/20 text-orange-300";
  return "bg-blue-600/20 text-blue-300";
}

export default function MyIdentity() {
  const user = getCurrentUser();
  const { isHouseMode, activeTenantId, activeTenantName } = useHouseMode();

  const orgDisplayName = isHouseMode
    ? (activeTenantName || "Tenant")
    : user?.tenant_id
      ? user.tenant_id.replace(/-[a-z0-9]{6}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "My Organization";

  const viewAs = isHouseMode ? activeTenantId : null;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/my/identity", viewAs],
    queryFn: () => fetchWithAuth(appendViewAs("/api/my/identity?limit=100", viewAs)),
    refetchInterval: 5000,
  });

  const logs = data?.logs || [];

  return (
    <div className="p-6 space-y-6" data-testid="my-identity-page">
      <div className="flex items-center gap-3 mb-2">
        <Users className="h-6 w-6 text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{orgDisplayName}</h1>
          <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">Identity Logs</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs" data-testid="badge-identity-count">
          {logs.length} log{logs.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : logs.length === 0 ? (
        <Card className="hover-elevate">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 text-purple-400 mx-auto mb-3 opacity-60" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-identity">
              No identity logs for your organization yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="hover-elevate">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Identity & Access Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-identity">
                <thead>
                  <tr className="border-b border-card-border text-[10px] uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2">User</th>
                    <th className="text-left py-2 px-2">Dataset</th>
                    <th className="text-left py-2 px-2">Source IP</th>
                    <th className="text-left py-2 px-2">Action</th>
                    <th className="text-left py-2 px-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr
                      key={log.id}
                      className="border-b border-card-border/50 hover:bg-muted/30"
                      data-testid={`row-identity-${log.id}`}
                    >
                      <td className="py-2 px-2 font-mono text-xs font-medium">
                        {log.user_name || "—"}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">{log.event_dataset}</td>
                      <td className="py-2 px-2 font-mono text-xs">{log.source_ip || "—"}</td>
                      <td className="py-2 px-2">
                        <Badge className={`text-[9px] ${actionColor(log.event_action)}`}>
                          {log.event_action?.replace(/_/g, " ") || "—"}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-[10px] text-muted-foreground font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
