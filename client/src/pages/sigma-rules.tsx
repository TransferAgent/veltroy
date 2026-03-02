import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Flame,
  ShieldCheck,
  AlertTriangle,
  Radar,
  Crosshair,
  Clock,
  Swords,
} from "lucide-react";
import type { SigmaRule, SigmaFiring } from "@shared/schema";

const severityColor: Record<string, string> = {
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
};

const alertTypeIcons: Record<string, typeof Flame> = {
  C2_BEACON: Radar,
  LATERAL_MOVE: Crosshair,
  BRUTE_FORCE_SUCCESS: AlertTriangle,
  SUSPICIOUS_IAM_KEY_ROTATION: ShieldCheck,
  HOST_CARDINALITY_SPIKE: Swords,
};

export default function SigmaRulesPage() {
  const { data: rules, isLoading: rulesLoading } = useQuery<SigmaRule[]>({
    queryKey: ["/api/sigma-rules"],
    refetchInterval: 5000,
  });

  const { data: firings, isLoading: firingsLoading } = useQuery<SigmaFiring[]>({
    queryKey: ["/api/sigma-firings"],
    refetchInterval: 5000,
  });

  if (rulesLoading) {
    return (
      <div className="p-6 space-y-4 h-full overflow-y-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const totalFirings = rules?.reduce((sum, r) => sum + r.fire_count, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto" data-testid="page-sigma-rules">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">
            Sigma Rules — Brain Detection Logic
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Eng 3 — 5 Production Rules | Interface Contract Bound
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-blueprint-version">
            Blueprint v1.2
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono gap-1" data-testid="badge-total-firings">
            <Flame className="h-3 w-3" />
            {totalFirings} total firings
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList data-testid="tabs-sigma">
          <TabsTrigger value="rules" data-testid="tab-rules">
            Rules ({rules?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="firings" data-testid="tab-firings">
            Firings ({firings?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {rules?.map((rule) => {
            const Icon = alertTypeIcons[rule.alert_type] || Flame;
            return (
              <Card key={rule.id} className="border-border/50" data-testid={`card-sigma-rule-${rule.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm leading-tight">
                          {rule.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {rule.id}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] border ${severityColor[rule.severity] || ""}`}
                            data-testid={`badge-severity-${rule.id}`}
                          >
                            {rule.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {rule.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <Flame className="h-3 w-3 text-orange-400" />
                        <span data-testid={`text-fire-count-${rule.id}`}>
                          {rule.fire_count}
                        </span>
                      </div>
                      {rule.last_fired && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(rule.last_fired).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {rule.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border-blue-500/30">
                      alert_type: {rule.alert_type}
                    </Badge>
                    {rule.mitre_technique_ids.map((tid) => (
                      <Badge key={tid} variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-400 border-purple-500/30">
                        {tid}
                      </Badge>
                    ))}
                    {rule.mitre_tactics.map((tactic) => (
                      <Badge key={tactic} variant="outline" className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                        {tactic}
                      </Badge>
                    ))}
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {rule.logsource_index}
                    </Badge>
                  </div>

                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-[10px] font-mono text-muted-foreground leading-relaxed break-all">
                      {rule.detection_summary}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground">Interface Contract:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(rule.fields_to_contract).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="text-[10px] font-mono">
                          {k}: {v}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {rule.false_positives.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="font-medium">False Positives:</span>{" "}
                      {rule.false_positives.join("; ")}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="firings" className="space-y-4">
          {firingsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !firings || firings.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center">
                <Radar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No Sigma rule firings yet — the Brain is listening
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  Rules will fire when matching patterns are detected in live traffic
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Alert Type</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">Host IP</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Escalated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firings.map((f) => (
                    <TableRow key={f.id} data-testid={`row-firing-${f.id}`}>
                      <TableCell className="text-[10px] font-mono whitespace-nowrap">
                        {new Date(f["@timestamp"]).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border-blue-500/30"
                        >
                          {f.alert_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] border ${severityColor[f.severity] || ""}`}
                        >
                          {f.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {f.host_ip}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {f.iam_user || "—"}
                      </TableCell>
                      <TableCell className="text-[10px] max-w-[300px] truncate">
                        {f.description}
                      </TableCell>
                      <TableCell>
                        {f.context_escalation && (
                          <Badge variant="destructive" className="text-[10px]">
                            KL#2
                          </Badge>
                        )}
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
