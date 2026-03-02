import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  Target,
  Clock,
  Link2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search as SearchIcon,
} from "lucide-react";
import type { Correlation } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const confidenceColors: Record<string, string> = {
  Low: "hsl(142, 76%, 36%)",
  Medium: "hsl(32, 95%, 44%)",
  High: "hsl(340, 82%, 48%)",
  Critical: "hsl(0, 84%, 42%)",
};

const statusIcons: Record<string, React.ElementType> = {
  new: AlertTriangle,
  investigating: SearchIcon,
  resolved: CheckCircle,
  false_positive: XCircle,
};

function ThreatCard({ threat }: { threat: Correlation }) {
  const { toast } = useToast();
  const StatusIcon = statusIcons[threat.status] || AlertTriangle;

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/threats/${threat.id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Threat status updated" });
    },
  });

  return (
    <Card className="hover-elevate" data-testid={`card-threat-${threat.id}`}>
      <CardHeader className="pb-2 p-4">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className="h-4 w-4 shrink-0"
              style={{ color: confidenceColors[threat.threat.indicator.confidence] }}
            />
            <CardTitle className="text-sm font-medium leading-tight">
              {threat.threat.technique.name}
            </CardTitle>
          </div>
          <Badge
            style={{
              backgroundColor: confidenceColors[threat.threat.indicator.confidence],
              color: "white",
            }}
            className="text-[10px] shrink-0"
          >
            {threat.threat.indicator.confidence}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {threat.threat.indicator.description}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">Tactic</p>
              <p className="text-[10px] font-medium">{threat.threat.tactic.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">MITRE ID</p>
              <p className="text-[10px] font-mono">{threat.threat.technique.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">Detected</p>
              <p className="text-[10px] font-mono">
                {new Date(threat["@timestamp"]).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon className="h-3 w-3 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground">Related</p>
              <p className="text-[10px] font-mono">{threat.related_events.length} events</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t">
          <div className="flex items-center gap-1.5">
            <Badge
              variant={
                threat.status === "new"
                  ? "destructive"
                  : threat.status === "investigating"
                    ? "default"
                    : "secondary"
              }
              className="text-[10px]"
            >
              {threat.status.replace("_", " ")}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono">
              Sev: {threat.severity}
            </span>
          </div>
          <Select
            value={threat.status}
            onValueChange={(val) => updateStatus.mutate(val)}
          >
            <SelectTrigger
              className="h-7 w-[120px] text-[10px]"
              data-testid={`select-threat-status-${threat.id}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="false_positive">False Positive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Threats() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");

  const { data: threats, isLoading } = useQuery<Correlation[]>({
    queryKey: ["/api/threats"],
    refetchInterval: 5000,
  });

  const filtered = (threats || []).filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (confidenceFilter !== "all" && t.threat.indicator.confidence !== confidenceFilter) return false;
    return true;
  });

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
          Threat Correlations
        </h1>
        <p className="text-xs text-muted-foreground">
          MITRE ATT&CK mapped detections (Eng 3)
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] text-xs h-9" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="false_positive">False Positive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-[130px] text-xs h-9" data-testid="select-confidence-filter">
            <SelectValue placeholder="Confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-threat-count">
          {filtered.length} threats
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShieldAlert className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No threats match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((threat) => (
            <ThreatCard key={threat.id} threat={threat} />
          ))}
        </div>
      )}
    </div>
  );
}
