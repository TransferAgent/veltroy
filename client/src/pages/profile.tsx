import { useState } from "react";
import { useLocation } from "wouter";
import { getCurrentUser, getToken, storeAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Building2, Shield, Key, ArrowLeft } from "lucide-react";

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const user = getCurrentUser();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const orgName = user?.org_name
    || (user?.tenant_id
      ? user.tenant_id.replace(/-[a-z0-9]{6}$/, "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "—");

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!newPassword || !currentPassword) {
      toast({ title: "Missing fields", description: "Please fill in all password fields.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Mismatch", description: "New password and confirmation do not match.", variant: "destructive" });
      return;
    }

    setIsChanging(true);
    try {
      const res = await fetch("/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error || "Password change failed", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setIsChanging(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6" data-testid="page-profile">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          data-testid="button-profile-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-profile-title">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account settings</p>
        </div>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate" data-testid="text-profile-email">{user?.email || "—"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="text-sm font-medium truncate" data-testid="text-profile-org">{orgName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Role</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" data-testid="text-profile-role">{user?.role || "—"}</p>
                  {user?.is_parent && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Parent</Badge>
                  )}
                  {user?.is_trial && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Trial</Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  data-testid="input-current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 number, 1 special char"
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  data-testid="input-confirm-password"
                />
              </div>
              <Button
                type="submit"
                disabled={isChanging}
                className="w-full"
                data-testid="button-change-password"
              >
                {isChanging ? "Changing..." : "Change Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
