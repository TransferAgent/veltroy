import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import {
  ShieldAlert,
  Zap,
  CheckCircle,
  AlertTriangle,
  ShieldOff,
  Lock,
  KeyRound,
  Brain,
  Bell,
  FileJson,
  RotateCcw,
} from "lucide-react";
import type { KineticExecution, KL002Execution, RollbackExecution } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const tierConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  TIER_0_SUPPRESS: { label: "SUPPRESS", color: "bg-muted text-muted-foreground", icon: ShieldOff },
  TIER_1_ISOLATE: { label: "ISOLATE", color: "bg-chart-4/20 text-chart-4", icon: Lock },
  TIER_2_ESCALATE: { label: "ESCALATE", color: "bg-destructive/20 text-destructive", icon: AlertTriangle },
  TIER_3_EMERGENCY: { label: "EMERGENCY", color: "bg-destructive text-destructive-foreground", icon: ShieldAlert },
};

const stateColors: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-primary/20 text-primary",
  COMPLETE: "bg-chart-2/20 text-chart-2",
  PARTIAL_FAILURE: "bg-destructive/20 text-destructive",
};

export default function KineticPage() {
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [rollbackExecId, setRollbackExecId] = useState("");
  const [rollbackAuthorizer, setRollbackAuthorizer] = useState("");
  const [rollbackDryRun, setRollbackDryRun] = useState(true);
  const { toast } = useToast();

  const { data: executions, isLoading } = useQuery<KineticExecution[]>({
    queryKey: ["/api/kinetic-executions"],
    refetchInterval: 5000,
  });

  const { data: kl002Executions, isLoading: kl002Loading } = useQuery<KL002Execution[]>({
    queryKey: ["/api/kl002-executions"],
    refetchInterval: 5000,
  });

  const { data: contract } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/kinetic-contract"],
  });

  const { data: rollbackExecutions, isLoading: rollbackLoading } = useQuery<RollbackExecution[]>({
    queryKey: ["/api/rollback-executions"],
    refetchInterval: 5000,
  });

  const rollbackMutation = useMutation({
    mutationFn: async (params: { original_execution_id: string; authorized_by: string; dry_run: boolean }) => {
      const res = await apiRequest("POST", "/api/rollback", params);
      return res.json();
    },
    onSuccess: (data: RollbackExecution) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rollback-executions"] });
      toast({
        title: `Rollback ${data.dry_run ? "(DRY RUN)" : ""} ${data.status}`,
        description: `${data.rollback_execution_id} — reversed ${data.original_playbook_id} execution ${data.original_execution_id.slice(0, 16)}...`,
      });
      setRollbackExecId("");
      setRollbackAuthorizer("");
    },
    onError: (err: Error) => {
      toast({ title: "Rollback Failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = (executions || []).filter((e) => {
    if (tierFilter !== "all" && e.response_tier !== tierFilter) return false;
    return true;
  });

  const totalExecutions = (executions || []).length;
  const tier1Count = (executions || []).filter((e) => e.response_tier === "TIER_1_ISOLATE").length;
  const tier2Count = (executions || []).filter((e) => e.response_tier === "TIER_2_ESCALATE").length;
  const tier3Count = (executions || []).filter((e) => e.response_tier === "TIER_3_EMERGENCY").length;
  const avgResponseSec = totalExecutions > 0
    ? (executions || []).reduce((sum, e) => sum + e.labels.eng4_kl001_response_seconds, 0) / totalExecutions
    : 0;
  const slaMetCount = (executions || []).filter((e) => e.timestamps.sla_met).length;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Kinetic Layer
          </h1>
          <p className="text-xs text-muted-foreground">
            Automated Response (Eng 4) — KL-001 Host Isolation + KL-002 IAM Kill Switch + KL-ROLLBACK-001
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-blueprint-version">
            Blueprint v1.2
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-playbook-001">
            KL-001
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-playbook-002">
            KL-002
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-playbook-rollback">
            KL-ROLLBACK-001
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">Total Executions</div>
            <div className="text-xl font-bold font-mono" data-testid="text-total-executions">{totalExecutions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> TIER 1
            </div>
            <div className="text-xl font-bold font-mono text-chart-4" data-testid="text-tier1-count">{tier1Count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> TIER 2
            </div>
            <div className="text-xl font-bold font-mono text-destructive" data-testid="text-tier2-count">{tier2Count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> TIER 3
            </div>
            <div className="text-xl font-bold font-mono text-destructive" data-testid="text-tier3-count">{tier3Count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">Avg Response</div>
            <div className="text-xl font-bold font-mono" data-testid="text-avg-response">{avgResponseSec.toFixed(3)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">SLA Met</div>
            <div className="text-xl font-bold font-mono text-chart-2" data-testid="text-sla-met">
              {totalExecutions > 0 ? `${((slaMetCount / totalExecutions) * 100).toFixed(0)}%` : "--"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="executions" data-testid="tabs-kinetic">
        <TabsList>
          <TabsTrigger value="executions" data-testid="tab-executions">KL-001 Host Isolation</TabsTrigger>
          <TabsTrigger value="kl002" data-testid="tab-kl002">KL-002 IAM Kill Switch</TabsTrigger>
          <TabsTrigger value="rollback" data-testid="tab-rollback">KL-ROLLBACK-001</TabsTrigger>
          <TabsTrigger value="actions" data-testid="tab-actions">Action Detail</TabsTrigger>
          <TabsTrigger value="contract" data-testid="tab-contract">Interface Contract</TabsTrigger>
        </TabsList>

        <TabsContent value="executions" className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[160px] text-xs h-9" data-testid="select-tier-filter">
                <SelectValue placeholder="Response Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="TIER_1_ISOLATE">TIER 1 — ISOLATE</SelectItem>
                <SelectItem value="TIER_2_ESCALATE">TIER 2 — ESCALATE</SelectItem>
                <SelectItem value="TIER_3_EMERGENCY">TIER 3 — EMERGENCY</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-filtered-count">
              {filtered.length} executions
            </Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Kinetic layer armed — awaiting dispatch surface triggers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    KL-001 will execute when Eng3 Brain dispatches CRITICAL/HIGH alerts
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Timestamp</TableHead>
                        <TableHead className="text-[10px]">Execution ID</TableHead>
                        <TableHead className="text-[10px]">Tier</TableHead>
                        <TableHead className="text-[10px]">Host IP</TableHead>
                        <TableHead className="text-[10px]">Alert Type</TableHead>
                        <TableHead className="text-[10px]">Severity</TableHead>
                        <TableHead className="text-[10px]">Admin Session</TableHead>
                        <TableHead className="text-[10px]">State</TableHead>
                        <TableHead className="text-[10px]">Response</TableHead>
                        <TableHead className="text-[10px]">SLA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, 50).map((exec) => {
                        const tier = tierConfig[exec.response_tier] || tierConfig.TIER_1_ISOLATE;
                        const TierIcon = tier.icon;
                        return (
                          <TableRow key={exec.execution_id} data-testid={`row-kinetic-${exec.execution_id}`}>
                            <TableCell className="text-[10px] font-mono text-muted-foreground">
                              {new Date(exec["@timestamp"]).toLocaleTimeString()}
                            </TableCell>
                            <TableCell className="text-[10px] font-mono">
                              {exec.execution_id.slice(0, 16)}...
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${tier.color}`} data-testid={`badge-tier-${exec.execution_id}`}>
                                <TierIcon className="h-3 w-3 mr-1" />
                                {tier.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono">{exec.host_ip}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{exec.alert_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={exec.severity === "CRITICAL" ? "destructive" : "secondary"}
                                className="text-[10px]"
                              >
                                {exec.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px]">
                              {exec.admin_session_active ? (
                                <Badge variant="destructive" className="text-[10px]">ACTIVE</Badge>
                              ) : (
                                <span className="text-muted-foreground">inactive</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${stateColors[exec.state] || ""}`}>
                                {exec.state}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono">
                              {exec.labels.eng4_kl001_response_seconds.toFixed(3)}s
                            </TableCell>
                            <TableCell>
                              {exec.timestamps.sla_met ? (
                                <CheckCircle className="h-3.5 w-3.5 text-chart-2" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kl002" className="space-y-3">
          <Card>
            <CardContent className="p-0">
              {kl002Loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (kl002Executions || []).length === 0 ? (
                <div className="p-8 text-center">
                  <KeyRound className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    KL-002 IAM Kill Switch armed — awaiting IAM-related dispatch triggers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Activates on SUSPICIOUS_IAM_KEY_ROTATION, BRUTE_FORCE_SUCCESS, or CRITICAL severity alerts
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">SLA: 5s</Badge>
                    <Badge variant="outline" className="text-[10px]">Sweep All Keys</Badge>
                    <Badge variant="outline" className="text-[10px]">AWSDenyAll</Badge>
                    <Badge variant="outline" className="text-[10px]">Session Invalidation</Badge>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Timestamp</TableHead>
                        <TableHead className="text-[10px]">Execution ID</TableHead>
                        <TableHead className="text-[10px]">IAM User</TableHead>
                        <TableHead className="text-[10px]">Access Key</TableHead>
                        <TableHead className="text-[10px]">Actions</TableHead>
                        <TableHead className="text-[10px]">Duration</TableHead>
                        <TableHead className="text-[10px]">SLA</TableHead>
                        <TableHead className="text-[10px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(kl002Executions || []).slice(0, 50).map((exec) => (
                        <TableRow key={exec.execution_id} data-testid={`row-kl002-${exec.execution_id}`}>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">
                            {new Date(exec["@timestamp"]).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">
                            {exec.execution_id.slice(0, 18)}...
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">{exec.iam_user}</TableCell>
                          <TableCell className="text-[10px] font-mono">{exec.access_key_id_masked}</TableCell>
                          <TableCell className="text-[10px]">
                            <div className="flex flex-col gap-0.5">
                              {exec.actions_taken.map((a, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <CheckCircle className={`h-2.5 w-2.5 ${a.status === "SUCCESS" || a.status === "SIMULATED" ? "text-chart-2" : a.status === "SKIPPED" ? "text-muted-foreground" : "text-destructive"}`} />
                                  <span className="text-[9px] text-muted-foreground">{a.action}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">
                            {exec.timestamps.duration_ms.toFixed(0)}ms
                          </TableCell>
                          <TableCell>
                            {exec.timestamps.sla_met ? (
                              <Badge className="text-[10px] bg-chart-2/20 text-chart-2">MET</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">MISS</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-[10px] ${exec.status === "SUCCESS" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}
                            >
                              {exec.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rollback" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-chart-4" />
                <CardTitle className="text-sm">Initiate Rollback</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                Human-gated operation — requires CPA/Architect sign-off. Defaults to DRY RUN mode.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Original Execution ID</label>
                  <Input
                    placeholder="KL-001-... or KL-002-IAM-..."
                    value={rollbackExecId}
                    onChange={(e) => setRollbackExecId(e.target.value)}
                    className="text-xs font-mono h-8"
                    data-testid="input-rollback-exec-id"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Authorized By</label>
                  <Input
                    placeholder="CPA / Architect ID"
                    value={rollbackAuthorizer}
                    onChange={(e) => setRollbackAuthorizer(e.target.value)}
                    className="text-xs h-8"
                    data-testid="input-rollback-authorizer"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Mode</label>
                  <div className="flex items-center gap-2">
                    <Select value={rollbackDryRun ? "dry" : "live"} onValueChange={(v) => setRollbackDryRun(v === "dry")}>
                      <SelectTrigger className="w-[120px] text-xs h-8" data-testid="select-rollback-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dry">DRY RUN</SelectItem>
                        <SelectItem value="live">LIVE</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!rollbackExecId || !rollbackAuthorizer || rollbackAuthorizer.length < 2 || rollbackMutation.isPending}
                      onClick={() => rollbackMutation.mutate({
                        original_execution_id: rollbackExecId,
                        authorized_by: rollbackAuthorizer,
                        dry_run: rollbackDryRun,
                      })}
                      data-testid="button-execute-rollback"
                    >
                      {rollbackMutation.isPending ? "Executing..." : "Execute Rollback"}
                    </Button>
                  </div>
                </div>
              </div>
              {!rollbackDryRun && (
                <div className="flex items-center gap-2 text-[10px] text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  LIVE MODE — Rollback actions will execute. Ensure authorization is valid.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rollback History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {rollbackLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (rollbackExecutions || []).length === 0 ? (
                <div className="p-8 text-center">
                  <RotateCcw className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    No rollbacks executed yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the form above to reverse a KL-001 or KL-002 execution
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Timestamp</TableHead>
                        <TableHead className="text-[10px]">Rollback ID</TableHead>
                        <TableHead className="text-[10px]">Original Exec</TableHead>
                        <TableHead className="text-[10px]">Playbook</TableHead>
                        <TableHead className="text-[10px]">Mode</TableHead>
                        <TableHead className="text-[10px]">Authorized By</TableHead>
                        <TableHead className="text-[10px]">Actions</TableHead>
                        <TableHead className="text-[10px]">Duration</TableHead>
                        <TableHead className="text-[10px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rollbackExecutions || []).slice(0, 50).map((rb) => (
                        <TableRow key={rb.rollback_execution_id} data-testid={`row-rollback-${rb.rollback_execution_id}`}>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">
                            {new Date(rb["@timestamp"]).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">
                            {rb.rollback_execution_id}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">
                            {rb.original_execution_id.slice(0, 16)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{rb.original_playbook_id}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${rb.dry_run ? "bg-muted text-muted-foreground" : "bg-destructive/20 text-destructive"}`}>
                              {rb.dry_run ? "DRY RUN" : "LIVE"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[10px]">{rb.authorized_by}</TableCell>
                          <TableCell className="text-[10px]">
                            <div className="flex flex-col gap-0.5">
                              {rb.actions.map((a, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <CheckCircle className={`h-2.5 w-2.5 ${a.status === "SUCCESS" || a.status === "SIMULATED" ? "text-chart-2" : a.status === "SKIPPED" ? "text-muted-foreground" : "text-destructive"}`} />
                                  <span className="text-[9px] text-muted-foreground">{a.action}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">
                            {rb.timestamps.duration_ms.toFixed(0)}ms
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${rb.status === "SUCCESS" ? "bg-chart-2/20 text-chart-2" : "bg-destructive/20 text-destructive"}`}>
                              {rb.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No kinetic actions recorded yet</p>
              </CardContent>
            </Card>
          ) : (
            filtered.slice(0, 10).map((exec) => {
              const tier = tierConfig[exec.response_tier] || tierConfig.TIER_1_ISOLATE;
              return (
                <Card key={exec.execution_id} data-testid={`card-action-${exec.execution_id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-mono">{exec.execution_id}</CardTitle>
                      <Badge className={`text-[10px] ${tier.color}`}>{tier.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{exec.tier_reason}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">Host: </span>
                        <span className="font-mono">{exec.host_ip}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IAM User: </span>
                        <span className="font-mono">{exec.iam_user}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SG: </span>
                        <span className="font-mono">{exec.aws_security_group_id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Correlation: </span>
                        <span className="font-mono">{exec.eng3_correlation_id.slice(0, 12)}...</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-muted-foreground">Isolation Actions</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.sg_isolation.ingress_revoked ? "text-chart-2" : "text-muted-foreground"}`} />
                          SG Ingress Revoked
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.sg_isolation.egress_revoked ? "text-chart-2" : "text-muted-foreground"}`} />
                          SG Egress Revoked
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.sg_isolation.bastion_ssh_permitted ? "text-chart-2" : "text-muted-foreground"}`} />
                          Bastion SSH Permit
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.sg_isolation.sg_tagged ? "text-chart-2" : "text-muted-foreground"}`} />
                          SG Tagged
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.iam_actions.key_deactivated ? "text-chart-2" : "text-muted-foreground"}`} />
                          IAM Key Deactivated
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.iam_actions.deny_all_attached ? "text-chart-2" : "text-muted-foreground"}`} />
                          AWSDenyAll Attached
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.memory_preserved ? "text-chart-2" : "text-muted-foreground"}`} />
                          Memory Preserved
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <CheckCircle className={`h-3 w-3 ${exec.soc_notified ? "text-chart-2" : "text-muted-foreground"}`} />
                          SOC Notified
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-[10px] border-t pt-2">
                      <span className="text-muted-foreground">
                        Response: <span className="font-mono font-bold">{exec.labels.eng4_kl001_response_seconds.toFixed(3)}s</span>
                      </span>
                      <span className="text-muted-foreground">
                        SLA: {exec.timestamps.sla_met ? (
                          <span className="text-chart-2 font-bold">MET</span>
                        ) : (
                          <span className="text-destructive font-bold">MISSED</span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        Actions: <span className="font-mono">{exec.actions_completed.length}/{exec.actions_expected.length}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="contract" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Signed Interface Contract v1.2</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                {contract ? String((contract as any).description) : "14-field signed JSON Schema — Eng3 ↔ Eng4 inbound alert payload contract"}
              </p>
              {contract && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[9px] font-mono">{String((contract as any)["$id"])}</Badge>
                  <Badge variant="outline" className="text-[9px] font-mono">draft-07</Badge>
                  <Badge variant="outline" className="text-[9px] font-mono">additionalProperties: false</Badge>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {contract ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(contract.fields as { name: string; required: boolean }[] || []).map((field) => {
                      const props = contract.properties as Record<string, any> || {};
                      const prop = props[field.name];
                      return (
                        <div
                          key={field.name}
                          className="flex items-start justify-between rounded-md border px-3 py-2 gap-2"
                          data-testid={`field-${field.name}`}
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs font-mono font-semibold">{field.name}</span>
                            {prop && (
                              <div className="flex flex-wrap gap-1">
                                <span className="text-[9px] text-muted-foreground">{prop.type}</span>
                                {prop.format && <Badge variant="secondary" className="text-[8px] h-4">format: {prop.format}</Badge>}
                                {prop.pattern && <Badge variant="secondary" className="text-[8px] h-4 font-mono">{prop.pattern}</Badge>}
                                {prop.enum && <Badge variant="secondary" className="text-[8px] h-4">{prop.enum.join(" | ")}</Badge>}
                                {prop.minLength !== undefined && <Badge variant="secondary" className="text-[8px] h-4">min: {prop.minLength}</Badge>}
                                {prop.description && <span className="text-[9px] text-muted-foreground italic">{prop.description}</span>}
                              </div>
                            )}
                          </div>
                          {field.required ? (
                            <Badge variant="destructive" className="text-[10px] shrink-0">REQUIRED</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] shrink-0">optional</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">Tier Classification</div>
                    {contract.tier_classification && Object.entries(contract.tier_classification as Record<string, string>).map(([tier, desc]) => {
                      const cfg = tierConfig[tier];
                      return (
                        <div key={tier} className="flex items-start gap-2 text-[10px]">
                          <Badge className={`${cfg?.color || "bg-muted"} shrink-0`}>{tier}</Badge>
                          <span className="text-muted-foreground">{desc}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-4 text-[10px] border-t pt-2">
                    <span className="text-muted-foreground">
                      SLA Target: <span className="font-mono font-bold">{String((contract as any).sla_target_ms || 30000)}ms</span>
                    </span>
                    <span className="text-muted-foreground">
                      Playbook: <span className="font-mono">{String((contract as any).playbook_id || "KL-001")}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Version: <span className="font-mono">{String((contract as any).ndr_blueprint_version || "v1.2")}</span>
                    </span>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-40 w-full" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
