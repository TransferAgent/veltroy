import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Network,
  ShieldAlert,
  BrainCircuit,
  Zap,
  Activity,
  Shield,
  UserCheck,
  Flame,
  GitMerge,
  Crosshair,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { DashboardStats } from "@shared/schema";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Network Events", url: "/events", icon: Network },
  { title: "Identity Logs", url: "/identity", icon: UserCheck },
  { title: "Threat Correlations", url: "/threats", icon: ShieldAlert },
  { title: "Attack Patterns", url: "/attack-patterns", icon: BrainCircuit },
  { title: "Sigma Rules", url: "/sigma-rules", icon: Flame },
  { title: "Brain Surface", url: "/correlated", icon: GitMerge },
  { title: "Kinetic Layer", url: "/kinetic", icon: Crosshair },
  { title: "Response Actions", url: "/responses", icon: Zap },
  { title: "Pipeline Monitor", url: "/pipeline", icon: Activity },
  { title: "Protected View", url: "/protected", icon: ShieldCheck },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 3000,
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight" data-testid="text-app-title">
              NDR Platform
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Phase Gate 0
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <a
                      href={item.url}
                      onClick={(e) => {
                        e.preventDefault();
                        setLocation(item.url);
                      }}
                      data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.title === "Threat Correlations" && stats && stats.activeThreats > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 min-h-0 h-4">
                          {stats.activeThreats}
                        </Badge>
                      )}
                      {item.title === "Attack Patterns" && stats && stats.attackPatternCount > 0 && (
                        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 min-h-0 h-4">
                          {stats.attackPatternCount}
                        </Badge>
                      )}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">Pipeline</span>
                <Badge
                  variant={
                    stats?.pipelineStatus === "healthy"
                      ? "default"
                      : stats?.pipelineStatus === "degraded"
                        ? "secondary"
                        : "destructive"
                  }
                  className="text-[10px] px-1.5 py-0 min-h-0 h-4"
                  data-testid="badge-pipeline-status"
                >
                  {stats?.pipelineStatus || "unknown"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">SLA</span>
                <span className="text-xs font-mono" data-testid="text-sla-compliance">
                  {stats?.slaCompliance != null ? `${stats.slaCompliance.toFixed(1)}%` : "--"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">Avg Latency</span>
                <span className="text-xs font-mono" data-testid="text-avg-latency">
                  {stats?.avgLatencyMs != null ? `${stats.avgLatencyMs.toFixed(0)}ms` : "--"}
                </span>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/50 p-2">
          <div className="h-2 w-2 rounded-full bg-chart-2 animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-mono">
            ECS 8.11.0 Compliant
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
