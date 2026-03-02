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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Search, ArrowUpDown, Globe, FileText, Network as NetworkIcon } from "lucide-react";
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
      <Badge className="text-[10px] font-mono" style={{ backgroundColor: "hsl(340, 82%, 48%)", color: "white" }}>
        {severity}
      </Badge>
    );
  }
  if (severity >= 25) {
    return (
      <Badge className="text-[10px] font-mono" style={{ backgroundColor: "hsl(32, 95%, 44%)", color: "white" }}>
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
  const variant = direction === "ingress" ? "default" : "secondary";
  return (
    <Badge variant={variant} className="text-[10px]">
      {direction}
    </Badge>
  );
}

function DatasetBadge({ dataset }: { dataset: string }) {
  const label = dataset.replace("zeek.", "");
  const colors: Record<string, string> = {
    "zeek.conn": "hsl(var(--chart-1))",
    "zeek.dns": "hsl(var(--chart-2))",
    "zeek.http": "hsl(var(--chart-4))",
  };
  return (
    <Badge
      className="text-[10px] font-mono"
      style={{ backgroundColor: colors[dataset] || "hsl(var(--primary))", color: "white" }}
    >
      {label}
    </Badge>
  );
}

function ConnTable({ events }: { events: NetworkEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
          <TableHead className="text-[10px]">Kind</TableHead>
          <TableHead className="text-[10px]">Source</TableHead>
          <TableHead className="text-[10px]">Destination</TableHead>
          <TableHead className="text-[10px]">Protocol</TableHead>
          <TableHead className="text-[10px]">Direction</TableHead>
          <TableHead className="text-[10px]">Community ID</TableHead>
          <TableHead className="text-[10px]">Bytes</TableHead>
          <TableHead className="text-[10px]">Severity</TableHead>
          <TableHead className="text-[10px]">Rule</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {new Date(event["@timestamp"]).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                {event.event.kind}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.source.ip}:{event.source.port}
              {event.source.geo?.country_name && (
                <span className="text-muted-foreground ml-1">({event.source.geo.country_name})</span>
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
            <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[120px] truncate">
              {event.network.community_id || "--"}
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {(event.network.bytes / 1024).toFixed(1)}KB
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.event.severity} />
            </TableCell>
            <TableCell className="text-[10px] max-w-[140px] truncate">
              {event.rule?.name || "--"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DnsTable({ events }: { events: NetworkEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
          <TableHead className="text-[10px]">Kind</TableHead>
          <TableHead className="text-[10px]">Source IP</TableHead>
          <TableHead className="text-[10px]">Query Name</TableHead>
          <TableHead className="text-[10px]">Type</TableHead>
          <TableHead className="text-[10px]">Response</TableHead>
          <TableHead className="text-[10px]">Answer</TableHead>
          <TableHead className="text-[10px]">Severity</TableHead>
          <TableHead className="text-[10px]">Rule</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} data-testid={`row-dns-${event.id}`}>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {new Date(event["@timestamp"]).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                {event.event.kind}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.source.ip}
            </TableCell>
            <TableCell className="text-[10px] font-mono max-w-[200px] truncate">
              {event.dns?.question.name || "--"}
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.dns?.type || "--"}
            </TableCell>
            <TableCell>
              <Badge
                variant={event.dns?.response_code === "NOERROR" ? "secondary" : "destructive"}
                className="text-[10px] font-mono"
              >
                {event.dns?.response_code || "--"}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[120px] truncate">
              {event.dns?.answers?.[0]?.data || "--"}
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.event.severity} />
            </TableCell>
            <TableCell className="text-[10px] max-w-[140px] truncate">
              {event.rule?.name || "--"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HttpTable({ events }: { events: NetworkEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
          <TableHead className="text-[10px]">Kind</TableHead>
          <TableHead className="text-[10px]">Source IP</TableHead>
          <TableHead className="text-[10px]">Method</TableHead>
          <TableHead className="text-[10px]">URL</TableHead>
          <TableHead className="text-[10px]">Status</TableHead>
          <TableHead className="text-[10px]">Direction</TableHead>
          <TableHead className="text-[10px]">Severity</TableHead>
          <TableHead className="text-[10px]">Rule</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} data-testid={`row-http-${event.id}`}>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {new Date(event["@timestamp"]).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                {event.event.kind}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.source.ip}:{event.source.port}
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {event.http?.request.method || "--"}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono max-w-[250px] truncate">
              {event.url?.full || "--"}
            </TableCell>
            <TableCell>
              {event.http?.response?.status_code ? (
                <Badge
                  variant={event.http.response.status_code < 400 ? "secondary" : "destructive"}
                  className="text-[10px] font-mono"
                >
                  {event.http.response.status_code}
                </Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">--</span>
              )}
            </TableCell>
            <TableCell>
              <DirectionBadge direction={event.network.direction} />
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.event.severity} />
            </TableCell>
            <TableCell className="text-[10px] max-w-[140px] truncate">
              {event.rule?.name || "--"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Events() {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all");

  const { data: events, isLoading } = useQuery<NetworkEvent[]>({
    queryKey: ["/api/events"],
    refetchInterval: 5000,
  });

  const allEvents = events || [];

  const connEvents = allEvents.filter((e) => e.event.dataset === "zeek.conn");
  const dnsEvents = allEvents.filter((e) => e.event.dataset === "zeek.dns");
  const httpEvents = allEvents.filter((e) => e.event.dataset === "zeek.http");

  const applyFilters = (list: NetworkEvent[]) =>
    list.filter((event) => {
      if (directionFilter !== "all" && event.network.direction !== directionFilter) return false;
      if (kindFilter !== "all" && event.event.kind !== kindFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          event.source.ip.includes(s) ||
          event.destination.ip.includes(s) ||
          event.network.protocol.toLowerCase().includes(s) ||
          event.event.category.some((c) => c.toLowerCase().includes(s)) ||
          (event.rule?.name?.toLowerCase().includes(s) ?? false) ||
          (event.dns?.question?.name?.toLowerCase().includes(s) ?? false) ||
          (event.url?.full?.toLowerCase().includes(s) ?? false)
        );
      }
      return true;
    });

  const filteredAll = applyFilters(allEvents);
  const filteredConn = applyFilters(connEvents);
  const filteredDns = applyFilters(dnsEvents);
  const filteredHttp = applyFilters(httpEvents);

  const currentCount =
    activeTab === "all" ? filteredAll.length :
    activeTab === "conn" ? filteredConn.length :
    activeTab === "dns" ? filteredDns.length :
    filteredHttp.length;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Network Events
          </h1>
          <p className="text-xs text-muted-foreground">
            ECS 8.11.0 compliant packet metadata — Engineer 1 (Zeek {"\u2192"} ECS Rewriter)
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] font-mono" data-testid="badge-blueprint-version">
            Blueprint v1.2
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search IPs, domains, URLs, rules..."
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
          {currentCount} events
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="text-xs gap-1.5" data-testid="tab-all">
            <NetworkIcon className="h-3 w-3" />
            All ({allEvents.length})
          </TabsTrigger>
          <TabsTrigger value="conn" className="text-xs gap-1.5" data-testid="tab-conn">
            <NetworkIcon className="h-3 w-3" />
            conn.log ({connEvents.length})
          </TabsTrigger>
          <TabsTrigger value="dns" className="text-xs gap-1.5" data-testid="tab-dns">
            <Globe className="h-3 w-3" />
            dns.log ({dnsEvents.length})
          </TabsTrigger>
          <TabsTrigger value="http" className="text-xs gap-1.5" data-testid="tab-http">
            <FileText className="h-3 w-3" />
            http.log ({httpEvents.length})
          </TabsTrigger>
        </TabsList>

        <Card className="mt-3">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <TabsContent value="all" className="m-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] w-[130px]">
                          <div className="flex items-center gap-1">
                            Timestamp <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                        <TableHead className="text-[10px]">Log Source</TableHead>
                        <TableHead className="text-[10px]">Kind</TableHead>
                        <TableHead className="text-[10px]">Source</TableHead>
                        <TableHead className="text-[10px]">Destination</TableHead>
                        <TableHead className="text-[10px]">Protocol</TableHead>
                        <TableHead className="text-[10px]">Direction</TableHead>
                        <TableHead className="text-[10px]">Severity</TableHead>
                        <TableHead className="text-[10px]">Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAll.slice(0, 50).map((event) => (
                        <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">
                            {new Date(event["@timestamp"]).toLocaleTimeString()}
                          </TableCell>
                          <TableCell>
                            <DatasetBadge dataset={event.event.dataset} />
                          </TableCell>
                          <TableCell>
                            <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                              {event.event.kind}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">
                            {event.source.ip}:{event.source.port}
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
                          <TableCell>
                            <SeverityBadge severity={event.event.severity} />
                          </TableCell>
                          <TableCell className="text-[10px] max-w-[200px] truncate text-muted-foreground">
                            {event.dns?.question?.name ||
                             event.url?.full ||
                             event.rule?.name ||
                             event.network.community_id ||
                             "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="conn" className="m-0">
                  <ConnTable events={filteredConn.slice(0, 50)} />
                </TabsContent>

                <TabsContent value="dns" className="m-0">
                  <DnsTable events={filteredDns.slice(0, 50)} />
                </TabsContent>

                <TabsContent value="http" className="m-0">
                  <HttpTable events={filteredHttp.slice(0, 50)} />
                </TabsContent>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
