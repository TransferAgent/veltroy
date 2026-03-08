import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { getToken, getCurrentUser } from "@/lib/auth";

function fetchWithAuth(url: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  }).then((r) => {
    if (!r.ok) throw new Error("Failed to fetch");
    return r.json();
  });
}

function severityLabel(sev: number | null) {
  if (sev === null || sev === undefined) return { text: "info", color: "bg-blue-600/20 text-blue-300" };
  if (sev >= 4) return { text: "critical", color: "bg-red-600/20 text-red-300" };
  if (sev >= 3) return { text: "high", color: "bg-pink-600/20 text-pink-300" };
  if (sev >= 2) return { text: "medium", color: "bg-orange-600/20 text-orange-300" };
  return { text: "low", color: "bg-green-600/20 text-green-300" };
}

export default function MyEvents() {
  const user = getCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/my/events"],
    queryFn: () => fetchWithAuth("/api/my/events?limit=100"),
    refetchInterval: 5000,
  });

  const events = data?.events || [];

  return (
    <div className="p-6 space-y-6" data-testid="my-events-page">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="h-6 w-6 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Network Events</h1>
          <p className="text-xs text-muted-foreground font-mono">{user?.tenant_id}</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs" data-testid="badge-event-count">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <Card className="hover-elevate">
          <CardContent className="p-8 text-center">
            <Activity className="h-12 w-12 text-blue-400 mx-auto mb-3 opacity-60" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-events">
              No network events for your organization yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="hover-elevate">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Network Event Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-events">
                <thead>
                  <tr className="border-b border-card-border text-[10px] uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2">Dataset</th>
                    <th className="text-left py-2 px-2">Kind</th>
                    <th className="text-left py-2 px-2">Source IP</th>
                    <th className="text-left py-2 px-2">Dest IP</th>
                    <th className="text-left py-2 px-2">Severity</th>
                    <th className="text-left py-2 px-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e: any) => {
                    const sev = severityLabel(e.severity);
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-card-border/50 hover:bg-muted/30"
                        data-testid={`row-event-${e.id}`}
                      >
                        <td className="py-2 px-2 font-mono text-xs">{e.event_dataset}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-[9px]">{e.event_kind}</Badge>
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">{e.source_ip || "—"}</td>
                        <td className="py-2 px-2 font-mono text-xs">{e.destination_ip || "—"}</td>
                        <td className="py-2 px-2">
                          <Badge className={`text-[9px] ${sev.color}`}>{sev.text}</Badge>
                        </td>
                        <td className="py-2 px-2 text-[10px] text-muted-foreground font-mono">
                          {new Date(e.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
