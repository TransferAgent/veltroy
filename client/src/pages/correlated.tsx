import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GitMerge, Layers, Send, Radar } from "lucide-react";
import type {
  CorrelatedDoc,
  HostCardinality,
  DispatchSurface,
} from "@shared/schema";

const severityColor: Record<string, string> = {
  LOW: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
};

const tierColor: Record<string, string> = {
  TIER1_ISOLATE: "bg-red-500/20 text-red-400 border-red-500/30",
  TIER2_QUARANTINE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  TIER3_INVESTIGATE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  NOMINAL: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export default function CorrelatedPage() {
  const { data: docs, isLoading: docsLoading } = useQuery<CorrelatedDoc[]>({
    queryKey: ["/api/correlated-docs"],
    refetchInterval: 5000,
  });

  const { data: cardinality, isLoading: cardLoading } = useQuery<HostCardinality[]>({
    queryKey: ["/api/host-cardinality"],
    refetchInterval: 5000,
  });

  const { data: dispatch, isLoading: dispatchLoading } = useQuery<DispatchSurface[]>({
    queryKey: ["/api/dispatch-surface"],
    refetchInterval: 5000,
  });

  const loading = docsLoading || cardLoading || dispatchLoading;

  if (loading) {
    return (
      <div className="p-6 space-y-4 h-full overflow-y-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto" data-testid="page-correlated">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">
            Brain — DBT Correlated Surface
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Eng 3 — Master Join | Host Cardinality | Eng4 Dispatch Surface
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-blueprint-version">
            Blueprint v1.2
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono gap-1">
            <GitMerge className="h-3 w-3" />
            {docs?.length ?? 0} joined docs
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono gap-1">
            <Layers className="h-3 w-3" />
            {cardinality?.length ?? 0} cardinality rows
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono gap-1">
            <Send className="h-3 w-3" />
            {dispatch?.length ?? 0} dispatch items
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="join" className="space-y-4">
        <TabsList data-testid="tabs-correlated">
          <TabsTrigger value="join" data-testid="tab-join">
            Master Join ({docs?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="cardinality" data-testid="tab-cardinality">
            Host Cardinality ({cardinality?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="dispatch" data-testid="tab-dispatch">
            Eng4 Dispatch ({dispatch?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="join">
          {!docs || docs.length === 0 ? (
            <EmptyState label="No correlated documents yet — waiting for network + identity data convergence" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Source IP</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Dest IP</TableHead>
                    <TableHead className="text-xs">Port</TableHead>
                    <TableHead className="text-xs">Protocol</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">Community ID</TableHead>
                    <TableHead className="text-xs">Unique Dests</TableHead>
                    <TableHead className="text-xs">Delta (s)</TableHead>
                    <TableHead className="text-xs">Auth Country</TableHead>
                    <TableHead className="text-xs">MFA</TableHead>
                    <TableHead className="text-xs">Action Hint</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.slice(0, 100).map((d) => (
                    <TableRow key={d.eng3_correlation_id} data-testid={`row-join-${d.eng3_correlation_id.slice(0, 8)}`}>
                      <TableCell className="text-[10px] font-mono">{d.source_ip}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.user_name}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.destination_ip}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.destination_port}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.network_protocol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${severityColor[d.severity] || ""}`}>
                          {d.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono max-w-[120px] truncate">{d.network_community_id || "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono text-center">{d.unique_dest_host_count}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.delta_seconds.toFixed(0)}</TableCell>
                      <TableCell className="text-[10px]">{d.auth_country || "—"}</TableCell>
                      <TableCell className="text-[10px]">
                        {d.mfa_used === true ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">YES</Badge>
                        ) : d.mfa_used === false ? (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">NO</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${tierColor[d.alert_type_hint] || ""}`}>
                          {d.alert_type_hint}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cardinality">
          {!cardinality || cardinality.length === 0 ? (
            <EmptyState label="No host cardinality spikes detected — all hosts below 5 unique destination threshold" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Source IP</TableHead>
                    <TableHead className="text-xs">Host</TableHead>
                    <TableHead className="text-xs">Unique Dests</TableHead>
                    <TableHead className="text-xs">Unique Flows</TableHead>
                    <TableHead className="text-xs">Total Conns</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">Eng4 Action</TableHead>
                    <TableHead className="text-xs">KL#2</TableHead>
                    <TableHead className="text-xs">Max Risk</TableHead>
                    <TableHead className="text-xs">Window</TableHead>
                    <TableHead className="text-xs">Protocols</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cardinality.map((c, i) => (
                    <TableRow key={`${c.source_ip}-${c.window_start}-${i}`} data-testid={`row-cardinality-${i}`}>
                      <TableCell className="text-[10px] font-mono">{c.source_ip}</TableCell>
                      <TableCell className="text-[10px] font-mono">{c.host_name || "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono font-bold text-center">{c.unique_dest_hosts}</TableCell>
                      <TableCell className="text-[10px] font-mono text-center">{c.unique_flows}</TableCell>
                      <TableCell className="text-[10px] font-mono text-center">{c.total_connections}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${severityColor[c.cardinality_severity] || ""}`}>
                          {c.cardinality_severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${tierColor[c.eng4_action_tier] || ""}`}>
                          {c.eng4_action_tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {c.kinetic_law2_escalated ? (
                          <Badge variant="destructive" className="text-[10px]">YES</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{c.max_flow_risk_score.toFixed(0)}</TableCell>
                      <TableCell className="text-[10px] font-mono whitespace-nowrap">
                        {new Date(c.window_start).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {c.protocols_used.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dispatch">
          {!dispatch || dispatch.length === 0 ? (
            <EmptyState label="Eng4 dispatch surface is empty — no CRITICAL/HIGH alerts requiring kinetic action" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Host IP</TableHead>
                    <TableHead className="text-xs">Alert Type</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Dest IP</TableHead>
                    <TableHead className="text-xs">Port</TableHead>
                    <TableHead className="text-xs">Protocol</TableHead>
                    <TableHead className="text-xs">Unique Dests</TableHead>
                    <TableHead className="text-xs">Country</TableHead>
                    <TableHead className="text-xs">MFA</TableHead>
                    <TableHead className="text-xs">Generated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatch.map((d, i) => (
                    <TableRow key={`${d.eng3_correlation_id}-${i}`} data-testid={`row-dispatch-${i}`}>
                      <TableCell className="text-[10px] font-mono">{d.host_ip}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${tierColor[d.alert_type] || "bg-blue-500/10 text-blue-400 border-blue-500/30"}`}>
                          {d.alert_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${severityColor[d.severity] || ""}`}>
                          {d.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">{d.user_name || "—"}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.destination_ip}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.destination_port}</TableCell>
                      <TableCell className="text-[10px] font-mono">{d.network_protocol}</TableCell>
                      <TableCell className="text-[10px] font-mono text-center">{d.unique_dest_hosts}</TableCell>
                      <TableCell className="text-[10px]">{d.auth_country || "—"}</TableCell>
                      <TableCell className="text-[10px]">
                        {d.mfa_used === true ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">YES</Badge>
                        ) : d.mfa_used === false ? (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">NO</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono whitespace-nowrap">
                        {new Date(d.surface_generated_at).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-8 text-center">
        <Radar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
          The Brain is structurally wired and ready — waiting for sufficient traffic
        </p>
      </CardContent>
    </Card>
  );
}
