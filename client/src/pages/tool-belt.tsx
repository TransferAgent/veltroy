import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useHouseMode } from "@/context/HouseModeContext";
import { getToken, getCurrentUser } from "@/lib/auth";
import {
  Wrench,
  Cloud,
  Server,
  Monitor,
  Database,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const integrationCards = [
  {
    type: "onedrive_m365",
    label: "Connect OneDrive / M365",
    description: "Monitor cloud file activity, detect unauthorized access and data exfiltration from Microsoft 365.",
    icon: Cloud,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    type: "aws_account",
    label: "Connect AWS Account",
    description: "Monitor CloudTrail events, IAM anomalies, and cloud infrastructure security across AWS services.",
    icon: Server,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    type: "endpoint_agent",
    label: "Install Laptop / Mobile Agent",
    description: "Deploy lightweight Veltroy sensor or Wazuh agent for endpoint NDR coverage and lateral movement detection.",
    icon: Monitor,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  {
    type: "cloud_racks",
    label: "Connect Cloud Racks",
    description: "Azure, GCP, and hybrid cloud infrastructure monitoring for multi-cloud security posture.",
    icon: Database,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
];

export default function ToolBelt() {
  const { toast } = useToast();
  const { isHouseMode, activeTenantId, activeTenantName } = useHouseMode();
  const user = getCurrentUser();
  const [installingType, setInstallingType] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  const isSuperAdmin = user?.role === "super_admin";

  async function handleInstall(type: string, label: string) {
    if (!activeTenantId) return;
    setInstallingType(type);
    try {
      const res = await fetch("/api/toolbelt/install", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: activeTenantId,
          integration_type: type,
          integration_label: label,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Install failed");
      setInstalled((prev) => new Set(prev).add(type));
      toast({
        title: "Cable box installed",
        description: `${label} registered for ${activeTenantName}. Tenant can now see real data in My House.`,
      });
    } catch (err: any) {
      toast({
        title: "Install failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setInstallingType(null);
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-toolbelt-title">
              Tool Belt – Install Cable Boxes
            </h1>
            <p className="text-sm text-muted-foreground">
              Power up any house with one click
            </p>
          </div>
        </div>

        {!isSuperAdmin && (
          <Card className="border-destructive/30">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground" data-testid="text-toolbelt-unauthorized">
                Tool Belt is only available to platform administrators.
              </p>
            </CardContent>
          </Card>
        )}

        {isSuperAdmin && !isHouseMode && (
          <Card className="border-amber-500/30">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
              <p className="text-sm text-muted-foreground" data-testid="text-toolbelt-no-house">
                Enter a tenant's house first from the <span className="font-medium text-foreground">Management → Tenants</span> page.
                Click the house icon on any tenant to enter their house, then return here to install cable boxes.
              </p>
            </CardContent>
          </Card>
        )}

        {isSuperAdmin && isHouseMode && (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 px-3 py-1">
                Installing for: {activeTenantName}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground font-mono text-[10px] px-2 py-1">
                {activeTenantId}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {integrationCards.map((card) => {
                const isInstalled = installed.has(card.type);
                const isInstalling = installingType === card.type;
                return (
                  <Card
                    key={card.type}
                    className={`${card.borderColor} transition-all ${isInstalled ? "opacity-75" : "hover:border-primary/40"}`}
                    data-testid={`card-integration-${card.type}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${card.bgColor}`}>
                          <card.icon className={`h-5 w-5 ${card.color}`} />
                        </div>
                        <CardTitle className="text-sm font-semibold">{card.label}</CardTitle>
                        {isInstalled && (
                          <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto" data-testid={`icon-installed-${card.type}`} />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {card.description}
                      </p>
                      <Button
                        className="w-full"
                        size="sm"
                        variant={isInstalled ? "secondary" : "default"}
                        disabled={isInstalling || isInstalled}
                        onClick={() => handleInstall(card.type, card.label)}
                        data-testid={`button-install-${card.type}`}
                      >
                        {isInstalling ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Installing...</>
                        ) : isInstalled ? (
                          <><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Installed</>
                        ) : (
                          "Install"
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
