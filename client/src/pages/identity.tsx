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
import { Search, UserCheck, UserX, Monitor, Cloud, Terminal } from "lucide-react";
import type { IdentityEvent } from "@shared/schema";

function DatasetBadge({ dataset }: { dataset: string }) {
  const colors: Record<string, string> = {
    "wazuh.linux": "hsl(var(--chart-1))",
    "wazuh.windows": "hsl(var(--chart-3))",
    "aws.cloudtrail": "hsl(var(--chart-5))",
  };
  const labels: Record<string, string> = {
    "wazuh.linux": "linux",
    "wazuh.windows": "windows",
    "aws.cloudtrail": "cloudtrail",
  };
  return (
    <Badge
      className="text-[10px] font-mono"
      style={{ backgroundColor: colors[dataset] || "hsl(var(--primary))", color: "white" }}
    >
      {labels[dataset] || dataset}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity?: number }) {
  if (severity === undefined) return <span className="text-[10px] text-muted-foreground">--</span>;
  if (severity >= 75) {
    return <Badge variant="destructive" className="text-[10px] font-mono">{severity}</Badge>;
  }
  if (severity >= 50) {
    return <Badge className="text-[10px] font-mono" style={{ backgroundColor: "hsl(340, 82%, 48%)", color: "white" }}>{severity}</Badge>;
  }
  if (severity >= 25) {
    return <Badge className="text-[10px] font-mono" style={{ backgroundColor: "hsl(32, 95%, 44%)", color: "white" }}>{severity}</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px] font-mono">{severity}</Badge>;
}

function LinuxTable({ events }: { events: IdentityEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
          <TableHead className="text-[10px]">Kind</TableHead>
          <TableHead className="text-[10px]">User</TableHead>
          <TableHead className="text-[10px]">Host</TableHead>
          <TableHead className="text-[10px]">Action</TableHead>
          <TableHead className="text-[10px]">Outcome</TableHead>
          <TableHead className="text-[10px]">Source IP</TableHead>
          <TableHead className="text-[10px]">Log Path</TableHead>
          <TableHead className="text-[10px]">Severity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} data-testid={`row-linux-${event.id}`}>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {new Date(event["@timestamp"]).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                {event.event.kind}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-medium">{event.user.name}</TableCell>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {event.host?.hostname || "--"}
            </TableCell>
            <TableCell className="text-[10px]">{event.event.action}</TableCell>
            <TableCell>
              <Badge
                variant={event.event.outcome === "success" ? "default" : event.event.outcome === "failure" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {event.event.outcome}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.source.ip}
              {event.source.port ? `:${event.source.port}` : ""}
            </TableCell>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {event.log?.file?.path || "--"}
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.event.severity} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WindowsTable({ events }: { events: IdentityEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
          <TableHead className="text-[10px]">Kind</TableHead>
          <TableHead className="text-[10px]">Event ID</TableHead>
          <TableHead className="text-[10px]">User</TableHead>
          <TableHead className="text-[10px]">Domain</TableHead>
          <TableHead className="text-[10px]">Action</TableHead>
          <TableHead className="text-[10px]">Logon Type</TableHead>
          <TableHead className="text-[10px]">Source IP</TableHead>
          <TableHead className="text-[10px]">Outcome</TableHead>
          <TableHead className="text-[10px]">Severity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} data-testid={`row-windows-${event.id}`}>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {new Date(event["@timestamp"]).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                {event.event.kind}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {event.winlog?.event_id || "--"}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-medium">{event.user.name}</TableCell>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {event.user.domain || "--"}
            </TableCell>
            <TableCell className="text-[10px]">{event.event.action}</TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.winlog?.logon_type !== undefined ? `Type ${event.winlog.logon_type}` : "--"}
            </TableCell>
            <TableCell className="text-[10px] font-mono">{event.source.ip}</TableCell>
            <TableCell>
              <Badge
                variant={event.event.outcome === "success" ? "default" : event.event.outcome === "failure" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {event.event.outcome}
              </Badge>
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.event.severity} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CloudTrailTable({ events }: { events: IdentityEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
          <TableHead className="text-[10px]">Kind</TableHead>
          <TableHead className="text-[10px]">User</TableHead>
          <TableHead className="text-[10px]">User Type</TableHead>
          <TableHead className="text-[10px]">Action</TableHead>
          <TableHead className="text-[10px]">Outcome</TableHead>
          <TableHead className="text-[10px]">Source IP</TableHead>
          <TableHead className="text-[10px]">Region</TableHead>
          <TableHead className="text-[10px]">Account</TableHead>
          <TableHead className="text-[10px]">Severity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} data-testid={`row-cloudtrail-${event.id}`}>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {new Date(event["@timestamp"]).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={event.event.kind === "alert" ? "destructive" : "secondary"} className="text-[10px]">
                {event.event.kind}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-medium">{event.user.name}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {event.user.type || "--"}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-medium">{event.event.action}</TableCell>
            <TableCell>
              <Badge
                variant={event.event.outcome === "success" ? "default" : event.event.outcome === "failure" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {event.event.outcome}
              </Badge>
            </TableCell>
            <TableCell className="text-[10px] font-mono">
              {event.source.ip}
              {event.source.geo?.country_name && (
                <span className="text-muted-foreground ml-1">({event.source.geo.country_name})</span>
              )}
            </TableCell>
            <TableCell className="text-[10px] font-mono text-muted-foreground">
              {event.cloud?.region || "--"}
            </TableCell>
            <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[100px] truncate">
              {event.cloud?.account?.id || "--"}
            </TableCell>
            <TableCell>
              <SeverityBadge severity={event.event.severity} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Identity() {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all");

  const { data: events, isLoading } = useQuery<IdentityEvent[]>({
    queryKey: ["/api/identity"],
    refetchInterval: 5000,
  });

  const allEvents = events || [];
  const linuxEvents = allEvents.filter((e) => e.event.dataset === "wazuh.linux");
  const windowsEvents = allEvents.filter((e) => e.event.dataset === "wazuh.windows");
  const cloudtrailEvents = allEvents.filter((e) => e.event.dataset === "aws.cloudtrail");

  const applyFilters = (list: IdentityEvent[]) =>
    list.filter((event) => {
      if (outcomeFilter !== "all" && event.event.outcome !== outcomeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          event.user.name.toLowerCase().includes(s) ||
          event.source.ip.includes(s) ||
          event.event.action.toLowerCase().includes(s) ||
          (event.user.domain?.toLowerCase().includes(s) ?? false) ||
          (event.host?.hostname?.toLowerCase().includes(s) ?? false) ||
          (event.cloud?.region?.toLowerCase().includes(s) ?? false) ||
          (event.message?.toLowerCase().includes(s) ?? false)
        );
      }
      return true;
    });

  const filteredAll = applyFilters(allEvents);
  const filteredLinux = applyFilters(linuxEvents);
  const filteredWindows = applyFilters(windowsEvents);
  const filteredCloudtrail = applyFilters(cloudtrailEvents);

  const failedCount = allEvents.filter((e) => e.event.outcome === "failure").length;
  const successCount = allEvents.filter((e) => e.event.outcome === "success").length;

  const currentCount =
    activeTab === "all" ? filteredAll.length :
    activeTab === "linux" ? filteredLinux.length :
    activeTab === "windows" ? filteredWindows.length :
    filteredCloudtrail.length;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Identity Logs
          </h1>
          <p className="text-xs text-muted-foreground">
            ECS 8.11.0 compliant authentication events — Engineer 2 (Wazuh + CloudTrail)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-mono" data-testid="badge-blueprint-version">
            Blueprint v1.2.1
          </Badge>
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <UserCheck className="h-3 w-3 text-chart-2" />
            <span className="text-[10px] font-mono" data-testid="text-success-count">{successCount}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1">
            <UserX className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-mono" data-testid="text-failure-count">{failedCount}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search users, IPs, actions, hosts..."
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
          {currentCount} events
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="text-xs gap-1.5" data-testid="tab-all">
            All ({allEvents.length})
          </TabsTrigger>
          <TabsTrigger value="linux" className="text-xs gap-1.5" data-testid="tab-linux">
            <Terminal className="h-3 w-3" />
            Linux ({linuxEvents.length})
          </TabsTrigger>
          <TabsTrigger value="windows" className="text-xs gap-1.5" data-testid="tab-windows">
            <Monitor className="h-3 w-3" />
            Windows ({windowsEvents.length})
          </TabsTrigger>
          <TabsTrigger value="cloudtrail" className="text-xs gap-1.5" data-testid="tab-cloudtrail">
            <Cloud className="h-3 w-3" />
            CloudTrail ({cloudtrailEvents.length})
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
                        <TableHead className="text-[10px] w-[130px]">Timestamp</TableHead>
                        <TableHead className="text-[10px]">Source</TableHead>
                        <TableHead className="text-[10px]">Kind</TableHead>
                        <TableHead className="text-[10px]">User</TableHead>
                        <TableHead className="text-[10px]">Action</TableHead>
                        <TableHead className="text-[10px]">Outcome</TableHead>
                        <TableHead className="text-[10px]">Source IP</TableHead>
                        <TableHead className="text-[10px]">Location</TableHead>
                        <TableHead className="text-[10px]">Severity</TableHead>
                        <TableHead className="text-[10px]">Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAll.slice(0, 50).map((event) => (
                        <TableRow key={event.id} data-testid={`row-identity-${event.id}`}>
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
                          <TableCell className="text-[10px] font-medium">{event.user.name}</TableCell>
                          <TableCell className="text-[10px]">{event.event.action}</TableCell>
                          <TableCell>
                            <Badge
                              variant={event.event.outcome === "success" ? "default" : event.event.outcome === "failure" ? "destructive" : "secondary"}
                              className="text-[10px]"
                            >
                              {event.event.outcome}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">{event.source.ip}</TableCell>
                          <TableCell className="text-[10px]">
                            {event.source.geo?.country_name || "--"}
                          </TableCell>
                          <TableCell>
                            <SeverityBadge severity={event.event.severity} />
                          </TableCell>
                          <TableCell className="text-[10px] max-w-[180px] truncate text-muted-foreground">
                            {event.host?.hostname ||
                             event.cloud?.region ||
                             event.winlog ? `EventID ${event.winlog?.event_id}` :
                             event.event.reason || "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="linux" className="m-0">
                  <LinuxTable events={filteredLinux.slice(0, 50)} />
                </TabsContent>

                <TabsContent value="windows" className="m-0">
                  <WindowsTable events={filteredWindows.slice(0, 50)} />
                </TabsContent>

                <TabsContent value="cloudtrail" className="m-0">
                  <CloudTrailTable events={filteredCloudtrail.slice(0, 50)} />
                </TabsContent>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
