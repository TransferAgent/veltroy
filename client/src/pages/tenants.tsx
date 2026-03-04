import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getCurrentUser, getToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Pencil,
  Trash2,
  CalendarPlus,
  Plus,
  Building2,
  Shield,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface TenantUser {
  id: number;
  email: string;
  role: string;
  is_parent: boolean;
  status: string;
  created_at: string;
}

interface TenantData {
  tenant_id: string;
  name: string;
  tier: string;
  status: string;
  is_trial: number;
  trial_expires_at: string | null;
  created_at: string;
  users: TenantUser[];
  user_count: number;
}

interface ChildData {
  id: number;
  email: string;
  role: string;
  is_parent: boolean;
  status: string;
  created_at: string;
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

function SuperAdminView() {
  const { toast } = useToast();
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);
  const [editTenant, setEditTenant] = useState<TenantData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "user" | "tenant"; id: number | string; label: string } | null>(null);
  const [extendTarget, setExtendTarget] = useState<TenantData | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [editForm, setEditForm] = useState({ email: "", role: "", status: "" });
  const [tenantEditForm, setTenantEditForm] = useState({ name: "", tier: "", status: "" });

  const { data, isLoading } = useQuery<{ tenants: TenantData[] }>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load tenants");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const updateUserMut = useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: any }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "User updated" });
      setEditUser(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteUserMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "User deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTenantMut = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const extendTrialMut = useMutation({
    mutationFn: async ({ tenantId, days }: { tenantId: string; days: number }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/extend-trial`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extend failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Trial extended", description: `New expiry: ${new Date(data.trial_expires_at).toLocaleDateString()}` });
      setExtendTarget(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateTenantMut = useMutation({
    mutationFn: async ({ tenantId, fields }: { tenantId: string; fields: any }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant updated" });
      setEditTenant(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const tenants = data?.tenants || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-tenants-title">All Tenants</h2>
            <p className="text-sm text-muted-foreground">
              {tenants.length} organization{tenants.length !== 1 ? "s" : ""} on the platform
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {tenants.map((tenant) => {
            const isExpanded = expandedTenant === tenant.tenant_id;
            return (
              <Card key={tenant.tenant_id} className="overflow-hidden" data-testid={`card-tenant-${tenant.tenant_id}`}>
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedTenant(isExpanded ? null : tenant.tenant_id)}
                  data-testid={`button-expand-tenant-${tenant.tenant_id}`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{tenant.name}</span>
                      <Badge variant={tenant.is_trial ? "secondary" : "default"} className="text-[10px] px-1.5 py-0 h-4">
                        {tenant.tier}
                      </Badge>
                      <Badge variant={tenant.status === "active" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                        {tenant.status}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">{tenant.tenant_id}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{tenant.user_count} user{tenant.user_count !== 1 ? "s" : ""}</span>
                    {tenant.is_trial === 1 && tenant.trial_expires_at && (
                      <span className="text-[10px] text-amber-400 font-mono">
                        exp {new Date(tenant.trial_expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {tenant.is_trial === 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setExtendTarget(tenant); setExtendDays("30"); }}
                        data-testid={`button-extend-trial-${tenant.tenant_id}`}
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditTenant(tenant);
                        setTenantEditForm({ name: tenant.name, tier: tenant.tier, status: tenant.status });
                      }}
                      data-testid={`button-edit-tenant-${tenant.tenant_id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteTarget({ type: "tenant", id: tenant.tenant_id, label: tenant.name })}
                      data-testid={`button-delete-tenant-${tenant.tenant_id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Role</TableHead>
                          <TableHead className="text-xs">Parent</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Created</TableHead>
                          <TableHead className="text-xs w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tenant.users.map((user) => (
                          <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                            <TableCell className="text-xs font-mono">{user.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{user.role}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{user.is_parent ? "Yes" : "No"}</TableCell>
                            <TableCell>
                              <Badge variant={user.status === "active" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {new Date(user.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setEditUser(user);
                                    setEditForm({ email: user.email, role: user.role, status: user.status });
                                  }}
                                  data-testid={`button-edit-user-${user.id}`}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => setDeleteTarget({ type: "user", id: user.id, label: user.email })}
                                  data-testid={`button-delete-user-${user.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {tenant.users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">
                              No users in this tenant
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Modify user account details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                data-testid="input-edit-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger data-testid="select-edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="support">SOC Analyst</SelectItem>
                  <SelectItem value="billing_admin">Billing Admin</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger data-testid="select-edit-user-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} data-testid="button-cancel-edit-user">Cancel</Button>
            <Button
              onClick={() => editUser && updateUserMut.mutate({ id: editUser.id, fields: editForm })}
              disabled={updateUserMut.isPending}
              data-testid="button-save-edit-user"
            >
              {updateUserMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTenant} onOpenChange={() => setEditTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>Modify organization details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input
                value={tenantEditForm.name}
                onChange={(e) => setTenantEditForm({ ...tenantEditForm, name: e.target.value })}
                data-testid="input-edit-tenant-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <Select value={tenantEditForm.tier} onValueChange={(v) => setTenantEditForm({ ...tenantEditForm, tier: v })}>
                <SelectTrigger data-testid="select-edit-tenant-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={tenantEditForm.status} onValueChange={(v) => setTenantEditForm({ ...tenantEditForm, status: v })}>
                <SelectTrigger data-testid="select-edit-tenant-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTenant(null)} data-testid="button-cancel-edit-tenant">Cancel</Button>
            <Button
              onClick={() => editTenant && updateTenantMut.mutate({ tenantId: editTenant.tenant_id, fields: tenantEditForm })}
              disabled={updateTenantMut.isPending}
              data-testid="button-save-edit-tenant"
            >
              {updateTenantMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extendTarget} onOpenChange={() => setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Trial</DialogTitle>
            <DialogDescription>
              Extend trial for <span className="font-medium">{extendTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Days to Extend</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                data-testid="input-extend-days"
              />
            </div>
            {extendTarget?.trial_expires_at && (
              <p className="text-xs text-muted-foreground">
                Current expiry: {new Date(extendTarget.trial_expires_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)} data-testid="button-cancel-extend">Cancel</Button>
            <Button
              onClick={() => extendTarget && extendTrialMut.mutate({ tenantId: extendTarget.tenant_id, days: parseInt(extendDays) || 30 })}
              disabled={extendTrialMut.isPending}
              data-testid="button-confirm-extend"
            >
              {extendTrialMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Extend Trial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget?.type === "tenant" ? "tenant" : "user"}{" "}
              <span className="font-medium text-foreground">{deleteTarget?.label}</span>?
              {deleteTarget?.type === "tenant" && " This will also delete all users in this tenant."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "user") {
                  deleteUserMut.mutate(deleteTarget.id as number);
                } else {
                  deleteTenantMut.mutate(deleteTarget.id as string);
                }
              }}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ParentOwnerView() {
  const { toast } = useToast();
  const [editChild, setEditChild] = useState<ChildData | null>(null);
  const [editForm, setEditForm] = useState({ email: "", role: "", status: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", role: "customer", password: "" });

  const { data, isLoading } = useQuery<{ children: ChildData[]; max_children: number; remaining: number; tenant_name: string }>({
    queryKey: ["/api/admin/children"],
    queryFn: async () => {
      const res = await fetch("/api/admin/children", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load children");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const addChildMut = useMutation({
    mutationFn: async (body: { email: string; role: string; password: string }) => {
      const res = await fetch("/api/admin/children", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Add failed");
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/children"] });
      toast({
        title: "Child account created",
        description: `${result.user.email} — temp password: ${result.temp_password}`,
      });
      setShowAdd(false);
      setAddForm({ email: "", role: "customer", password: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateChildMut = useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: any }) => {
      const res = await fetch(`/api/admin/children/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/children"] });
      toast({ title: "Account updated" });
      setEditChild(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteChildMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/children/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/children"] });
      toast({ title: "Account deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const children = data?.children || [];
  const remaining = data?.remaining ?? 5;
  const tenantName = data?.tenant_name || "Your Organization";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-children-title">{tenantName} — Team Members</h2>
            <p className="text-sm text-muted-foreground">
              {children.length} of 5 seats used ({remaining} remaining)
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            disabled={remaining <= 0}
            data-testid="button-add-child"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Member
          </Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
                <TableHead className="text-xs w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((child) => (
                <TableRow key={child.id} data-testid={`row-child-${child.id}`}>
                  <TableCell className="text-xs font-mono">{child.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{child.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={child.status === "active" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                      {child.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {new Date(child.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditChild(child);
                          setEditForm({ email: child.email, role: child.role, status: child.status });
                        }}
                        data-testid={`button-edit-child-${child.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => setDeleteTarget({ id: child.id, email: child.email })}
                        data-testid={`button-delete-child-${child.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {children.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No team members yet. Click "Add Member" to invite up to 5 people.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={showAdd} onOpenChange={() => setShowAdd(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Invite a new member to your organization ({remaining} seat{remaining !== 1 ? "s" : ""} remaining)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="user@example.com"
                data-testid="input-add-child-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
                <SelectTrigger data-testid="select-add-child-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">SOC Analyst</SelectItem>
                  <SelectItem value="billing_admin">Billing Admin</SelectItem>
                  <SelectItem value="customer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <Input
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                placeholder="Leave blank to auto-generate"
                data-testid="input-add-child-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} data-testid="button-cancel-add-child">Cancel</Button>
            <Button
              onClick={() => addChildMut.mutate(addForm)}
              disabled={addChildMut.isPending || !addForm.email}
              data-testid="button-confirm-add-child"
            >
              {addChildMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editChild} onOpenChange={() => setEditChild(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>Modify team member details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                data-testid="input-edit-child-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger data-testid="select-edit-child-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">SOC Analyst</SelectItem>
                  <SelectItem value="billing_admin">Billing Admin</SelectItem>
                  <SelectItem value="customer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger data-testid="select-edit-child-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChild(null)} data-testid="button-cancel-edit-child">Cancel</Button>
            <Button
              onClick={() => editChild && updateChildMut.mutate({ id: editChild.id, fields: editForm })}
              disabled={updateChildMut.isPending}
              data-testid="button-save-edit-child"
            >
              {updateChildMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-medium text-foreground">{deleteTarget?.email}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-child">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteChildMut.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-child"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function TenantsPage() {
  const user = getCurrentUser();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {isSuperAdmin ? (
            <Shield className="h-6 w-6 text-primary" />
          ) : (
            <Users className="h-6 w-6 text-primary" />
          )}
          <div>
            <h1 className="text-xl font-bold" data-testid="text-tenants-page-title">
              {isSuperAdmin ? "Platform Tenants" : "Team Management"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSuperAdmin
                ? "Manage all organizations and users across the platform"
                : "Manage your team members (up to 5 seats)"}
            </p>
          </div>
        </div>

        {isSuperAdmin ? <SuperAdminView /> : <ParentOwnerView />}
      </div>
    </ScrollArea>
  );
}
