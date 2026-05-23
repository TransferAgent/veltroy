import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { HouseModeProvider, useHouseMode } from "@/context/HouseModeContext";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Eye, ArrowLeft } from "lucide-react";
import { isAuthenticated, getCurrentUser } from "@/lib/auth";
import { OrgDropdown } from "@/components/OrgDropdown";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Events from "@/pages/events";
import Identity from "@/pages/identity";
import Threats from "@/pages/threats";
import Responses from "@/pages/responses";
import Pipeline from "@/pages/pipeline";
import AttackPatternsPage from "@/pages/attack-patterns";
import SigmaRulesPage from "@/pages/sigma-rules";
import CorrelatedPage from "@/pages/correlated";
import KineticPage from "@/pages/kinetic";
import ProtectedView from "@/pages/protected";
import LoginPage from "@/pages/login";
import TenantsPage from "@/pages/tenants";
import UpgradePage from "@/pages/upgrade";
import MyDashboard from "@/pages/my-dashboard";
import MyThreats from "@/pages/my-threats";
import MyEvents from "@/pages/my-events";
import MyIdentity from "@/pages/my-identity";
import ToolBelt from "@/pages/tool-belt";
import ProfilePage from "@/pages/profile";
import GodModePage from "@/pages/god-mode";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function ReadOnlyBadge() {
  const user = getCurrentUser();
  if (!user?.is_trial) return null;
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-medium"
      data-testid="badge-read-only"
    >
      <Eye className="h-3 w-3" />
      Read Only
    </div>
  );
}

function HouseModeBanner() {
  const { isHouseMode, activeTenantName, exitHouse } = useHouseMode();
  const [, setLocation] = useLocation();

  if (!isHouseMode) return null;

  return (
    <div
      className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/30"
      data-testid="banner-house-mode"
    >
      <span className="text-sm font-medium text-amber-400" data-testid="text-house-mode-tenant">
        You are viewing as <span className="font-bold">{activeTenantName}</span> — House Mode
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
        onClick={() => {
          exitHouse();
          setLocation("/tenants");
        }}
        data-testid="button-return-city-view"
      >
        <ArrowLeft className="h-3 w-3 mr-1" />
        Return to City View
      </Button>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Redirect to="/login" replace />;
  }
  return <>{children}</>;
}

function AuthRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/events" component={Events} />
      <Route path="/identity" component={Identity} />
      <Route path="/threats" component={Threats} />
      <Route path="/attack-patterns" component={AttackPatternsPage} />
      <Route path="/sigma-rules" component={SigmaRulesPage} />
      <Route path="/correlated" component={CorrelatedPage} />
      <Route path="/kinetic" component={KineticPage} />
      <Route path="/responses" component={Responses} />
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/protected" component={ProtectedView} />
      <Route path="/tenants" component={TenantsPage} />
      <Route path="/upgrade" component={UpgradePage} />
      <Route path="/my/dashboard" component={MyDashboard} />
      <Route path="/my/threats" component={MyThreats} />
      <Route path="/my/events" component={MyEvents} />
      <Route path="/my/identity" component={MyIdentity} />
      <Route path="/tool-belt" component={ToolBelt} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/god-mode" component={GodModePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AppLayout() {
  return (
    <RequireAuth>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-1 p-2 border-b shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-1">
                <ReadOnlyBadge />
                <OrgDropdown />
                <ThemeToggle />
              </div>
            </header>
            <HouseModeBanner />
            <main className="flex-1 overflow-hidden">
              <AuthRouter />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <HouseModeProvider>
            <Switch>
              <Route path="/login" component={LoginPage} />
              <Route>
                <AppLayout />
              </Route>
            </Switch>
            <Toaster />
          </HouseModeProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
