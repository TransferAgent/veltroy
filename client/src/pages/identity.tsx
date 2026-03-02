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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Search, UserCheck, UserX } from "lucide-react";
import type { IdentityEvent } from "@shared/schema";

export default function Identity() {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const { data: events, isLoading } = useQuery<IdentityEvent[]>({
    queryKey: ["/api/identity"],
    refetchInterval: 5000,
  });

  const filtered = (events || []).filter((event) => {
    if (outcomeFilter !== "all" && event.event.outcome !== outcomeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        event.user.name.toLowerCase().includes(s) ||
        event.source.ip.includes(s) ||
        event.event.action.toLowerCase().includes(s) ||
        (event.user.domain?.toLowerCase().includes(s) ?? false)
      );
    }
    return true;
  });

  const failedCount = (events || []).filter((e) => e.event.outcome === "failure").length;
  const successCount = (events || []).filter((e) => e.event.outcome === "success").length;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Identity Logs
          </h1>
          <p className="text-xs text-muted-foreground">
            ECS 8.11.0 compliant authentication events (Eng 2)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <UserCheck className="h-3 w-3 text-chart-2" />
            <span className="text-[10px] font-mono">{successCount}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <UserX className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-mono">{failedCount}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search users, IPs, actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-9"
            data-testid="input-search-identity"
          />
        </div>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-[130px] text-xs h-9" data-testid="select-outcome-filter">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failure">Failure</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-identity-count">
          {filtered.length} events
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
                    <TableHead className="text-[10px]">User</TableHead>
                    <TableHead className="text-[10px]">Domain</TableHead>
                    <TableHead className="text-[10px]">Action</TableHead>
                    <TableHead className="text-[10px]">Outcome</TableHead>
                    <TableHead className="text-[10px]">Source IP</TableHead>
                    <TableHead className="text-[10px]">Location</TableHead>
                    <TableHead className="text-[10px]">Roles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 50).map((event) => (
                    <TableRow key={event.id} data-testid={`row-identity-${event.id}`}>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">
                        {new Date(event["@timestamp"]).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-[10px] font-medium">
                        {event.user.name}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">
                        {event.user.domain || "--"}
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {event.event.action}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            event.event.outcome === "success"
                              ? "default"
                              : event.event.outcome === "failure"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {event.event.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {event.source.ip}
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {event.source.geo?.country_name || "--"}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {event.user.roles?.join(", ") || "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
