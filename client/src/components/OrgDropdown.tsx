import { Building2, Plus, LogOut, ChevronDown } from "lucide-react";
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
import { getCurrentUser, logout } from "@/lib/auth";

export function OrgDropdown() {
  const user = getCurrentUser();
  const orgName = user?.tenant_id
    ? user.tenant_id.replace(/-[a-z0-9]{6}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : "Organization";

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
              <Building2 className="h-4 w-4" />
              <span className="max-w-[140px] truncate hidden sm:inline">{orgName}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>+ Organization</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56" data-testid="menu-org-dropdown">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Current Organization
        </DropdownMenuLabel>
        <DropdownMenuItem className="gap-2 font-medium" data-testid="menu-item-current-org">
          <Building2 className="h-4 w-4" />
          {orgName}
        </DropdownMenuItem>
        {user?.role && (
          <div className="px-2 py-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {user.role} {user.is_parent ? "(Parent)" : ""}
            </span>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-blue-400 focus:text-blue-300"
          data-testid="menu-item-add-org"
        >
          <Plus className="h-4 w-4" />
          Add Organization
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-red-400 focus:text-red-300"
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
