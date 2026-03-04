import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { isAuthenticated } from "@/lib/auth";
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
import AdminPage from "@/pages/admin";

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
      <Route path="/admin" component={AdminPage} />
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
              <ThemeToggle />
            </header>
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
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route>
              <AppLayout />
            </Route>
          </Switch>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
