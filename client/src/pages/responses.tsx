import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import {
  Zap,
  Ban,
  Monitor,
  UserX,
  FileWarning,
  Bell,
  CheckCircle,
  Loader2,
  XCircle,
  RotateCcw,
  Clock,
} from "lucide-react";
import type { ResponseAction } from "@shared/schema";

const actionIcons: Record<string, React.ElementType> = {
  block_ip: Ban,
  isolate_host: Monitor,
  disable_account: UserX,
  quarantine: FileWarning,
  alert_only: Bell,
};

const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground" },
  executing: { icon: Loader2, color: "text-primary" },
  completed: { icon: CheckCircle, color: "text-chart-2" },
  failed: { icon: XCircle, color: "text-destructive" },
  rolled_back: { icon: RotateCcw, color: "text-chart-4" },
};

export default function Responses() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: responses, isLoading } = useQuery<ResponseAction[]>({
    queryKey: ["/api/responses"],
    refetchInterval: 5000,
  });

  const filtered = (responses || []).filter((r) => {
    if (statusFilter !== "all" && r.action.status !== statusFilter) return false;
    if (typeFilter !== "all" && r.action.type !== typeFilter) return false;
    return true;
  });

  const completedCount = (responses || []).filter((r) => r.action.status === "completed").length;
  const avgLatency = (responses || []).length > 0
    ? (responses || []).reduce((sum, r) => sum + r.latency_ms, 0) / (responses || []).length
    : 0;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Response Actions
          </h1>
          <p className="text-xs text-muted-foreground">
            Automated response orchestration (Eng 4)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <CheckCircle className="h-3 w-3 text-chart-2" />
            <span className="text-[10px] font-mono">{completedCount} completed</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <Zap className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-mono">{avgLatency.toFixed(0)}ms avg</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] text-xs h-9" data-testid="select-response-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="executing">Executing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="rolled_back">Rolled Back</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px] text-xs h-9" data-testid="select-response-type">
            <SelectValue placeholder="Action Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="block_ip">Block IP</SelectItem>
            <SelectItem value="isolate_host">Isolate Host</SelectItem>
            <SelectItem value="disable_account">Disable Account</SelectItem>
            <SelectItem value="quarantine">Quarantine</SelectItem>
            <SelectItem value="alert_only">Alert Only</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-response-count">
          {filtered.length} actions
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Timestamp</TableHead>
                    <TableHead className="text-[10px]">Action</TableHead>
                    <TableHead className="text-[10px]">Target</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px]">Latency</TableHead>
                    <TableHead className="text-[10px]">Correlation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 50).map((response) => {
                    const ActionIcon = actionIcons[response.action.type] || Zap;
                    const status = statusConfig[response.action.status];
                    const StatusIcon = status?.icon || Clock;

                    return (
                      <TableRow key={response.id} data-testid={`row-response-${response.id}`}>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">
                          {new Date(response["@timestamp"]).toLocaleTimeString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ActionIcon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px]">
                              {response.action.type.replace(/_/g, " ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {response.action.target}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon
                              className={`h-3 w-3 ${status?.color || ""} ${
                                response.action.status === "executing" ? "animate-spin" : ""
                              }`}
                            />
                            <Badge
                              variant={
                                response.action.status === "completed"
                                  ? "default"
                                  : response.action.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {response.action.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {response.latency_ms}ms
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[100px] truncate">
                          {response.correlation_id.slice(0, 8)}...
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
    </div>
  );
}
