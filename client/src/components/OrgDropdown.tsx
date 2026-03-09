import { Building2, LogOut, ChevronDown, Globe, Home } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, logout } from "@/lib/auth";
import { useLocation } from "wouter";

export function OrgDropdown() {
  const user = getCurrentUser();
  const [location, setLocation] = useLocation();

  const isMyOrgView = location.startsWith("/my/");

  const orgName = user?.org_name
    || (user?.tenant_id
      ? user.tenant_id.replace(/-[a-z0-9]{6}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "Organization");

  const hasOrg = !!user?.tenant_id;

  const displayLabel = isMyOrgView ? orgName : "Apex NDR";
  const displaySublabel = isMyOrgView ? "Command Center" : "Sandbox";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-xs font-medium"
              data-testid="button-org-dropdown"
            >
              {isMyOrgView ? (
                <Home className="h-4 w-4" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="max-w-[140px] truncate text-xs font-semibold">{displayLabel}</span>
                <span className="text-[9px] text-muted-foreground">{displaySublabel}</span>
              </div>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{displayLabel} · {displaySublabel}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60" data-testid="menu-org-dropdown">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Switch View
        </DropdownMenuLabel>

        <DropdownMenuItem
          className="gap-2 font-medium cursor-pointer"
          data-testid="menu-item-sandbox-view"
          onClick={() => setLocation("/")}
        >
          <Globe className="h-4 w-4 text-blue-400" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm">Apex NDR</span>
            <span className="text-[10px] text-muted-foreground">Sandbox</span>
          </div>
          {!isMyOrgView && (
            <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0 h-4">Active</Badge>
          )}
        </DropdownMenuItem>

        {hasOrg && (
          <DropdownMenuItem
            className="gap-2 font-medium cursor-pointer"
            data-testid="menu-item-org-view"
            onClick={() => setLocation("/my/dashboard")}
          >
            <Home className="h-4 w-4 text-green-400" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm">{orgName}</span>
              <span className="text-[10px] text-muted-foreground">Command Center</span>
            </div>
            {isMyOrgView && (
              <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0 h-4">Active</Badge>
            )}
          </DropdownMenuItem>
        )}

        {user?.role && (
          <div className="px-2 py-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {user.role} {user.is_parent ? "(Parent)" : ""}
            </span>
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-red-400 focus:text-red-300 cursor-pointer"
          onClick={() => logout()}
          data-testid="menu-item-logout"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
