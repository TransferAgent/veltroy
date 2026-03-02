import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Search, ArrowUpDown } from "lucide-react";
import type { NetworkEvent } from "@shared/schema";

function SeverityBadge({ severity }: { severity: number }) {
  if (severity >= 75) {
    return (
      <Badge variant="destructive" className="text-[10px] font-mono">
        {severity}
      </Badge>
    );
  }
  if (severity >= 50) {
    return (
      <Badge
        className="text-[10px] font-mono"
        style={{ backgroundColor: "hsl(340, 82%, 48%)", color: "white" }}
      >
        {severity}
      </Badge>
    );
  }
  if (severity >= 25) {
    return (
      <Badge
        className="text-[10px] font-mono"
        style={{ backgroundColor: "hsl(32, 95%, 44%)", color: "white" }}
      >
        {severity}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] font-mono">
      {severity}
    </Badge>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const variant = direction === "ingress" ? "default" : direction === "egress" ? "secondary" : "secondary";
  return (
    <Badge variant={variant} className="text-[10px]">
      {direction}
    </Badge>
  );
}

export default function Events() {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const { data: events, isLoading } = useQuery<NetworkEvent[]>({
    queryKey: ["/api/events"],
    refetchInterval: 5000,
  });

  const filtered = (events || []).filter((event) => {
    if (directionFilter !== "all" && event.network.direction !== directionFilter) return false;
    if (kindFilter !== "all" && event.event.kind !== kindFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        event.source.ip.includes(s) ||
        event.destination.ip.includes(s) ||
        event.network.protocol.toLowerCase().includes(s) ||
        event.event.category.some((c) => c.toLowerCase().includes(s)) ||
        (event.rule?.name?.toLowerCase().includes(s) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
          Network Events
        </h1>
        <p className="text-xs text-muted-foreground">
          ECS 8.11.0 compliant packet metadata (Eng 1)
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search IPs, protocols, rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-9"
            data-testid="input-search-events"
          />
        </div>
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[130px] text-xs h-9" data-testid="select-direction-filter">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="ingress">Ingress</SelectItem>
            <SelectItem value="egress">Egress</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[120px] text-xs h-9" data-testid="select-kind-filter">
            <SelectValue placeholder="Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Kinds</SelectItem>
            <SelectItem value="event">Event</SelectItem>
            <SelectItem value="alert">Alert</SelectItem>
            <SelectItem value="signal">Signal</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-event-count">
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
                    <TableHead className="text-[10px] w-[140px]">
                      <div className="flex items-center gap-1">
                        Timestamp <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px]">Kind</TableHead>
                    <TableHead className="text-[10px]">Source</TableHead>
                    <TableHead className="text-[10px]">Destination</TableHead>
                    <TableHead className="text-[10px]">Protocol</TableHead>
                    <TableHead className="text-[10px]">Direction</TableHead>
                    <TableHead className="text-[10px]">Category</TableHead>
                    <TableHead className="text-[10px]">Severity</TableHead>
                    <TableHead className="text-[10px]">Rule</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 50).map((event) => (
                    <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">
                        {new Date(event["@timestamp"]).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={event.event.kind === "alert" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {event.event.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {event.source.ip}:{event.source.port}
                        {event.source.geo?.country_name && (
                          <span className="text-muted-foreground ml-1">
                            ({event.source.geo.country_name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono">
                        {event.destination.ip}:{event.destination.port}
                      </TableCell>
                      <TableCell className="text-[10px] font-mono uppercase">
                        {event.network.protocol}
                      </TableCell>
                      <TableCell>
                        <DirectionBadge direction={event.network.direction} />
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {event.event.category.join(", ")}
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={event.event.severity} />
                      </TableCell>
                      <TableCell className="text-[10px] max-w-[150px] truncate">
                        {event.rule?.name || "--"}
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
