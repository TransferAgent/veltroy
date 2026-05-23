import { useEffect } from "react";
import { useLocation } from "wouter";
import { Crosshair } from "lucide-react";
import GridOperatorView from "@/components/GridOperatorView";
import { getCurrentUser } from "@/lib/auth";

export default function GodModePage() {
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();

  useEffect(() => {
    document.title = "God Mode — Veltroy NDR";
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role !== "super_admin") {
      setLocation("/");
    }
  }, [currentUser, setLocation]);

  if (!currentUser || currentUser.role !== "super_admin") {
    return null;
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4" data-testid="page-god-mode">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Crosshair className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            God Mode
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
            Power Grid Command · Super Admin
          </p>
        </div>
      </div>
      <GridOperatorView />
    </div>
  );
}
