import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users, LayoutGrid, Calendar, DollarSign,
  Shield, ShieldOff, Trash2, RefreshCw, TrendingUp,
  UserCheck, ChevronDown, ChevronUp, LogOut
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/components/AuthProvider";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

interface AdminStats {
  totalUsers: number;
  totalGroups: number;
  totalSessions: number;
  totalExpenses: number;
  totalRevenue: number;
  newUsersToday: number;
}

interface AdminUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  groupCount: number;
  sessionCount: number;
}

interface AdminGroup {
  id: number;
  name: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  sessionCount: number;
  createdAt: string;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color = "text-primary"
}: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className={cn("text-2xl font-bold", color)} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
              {value}
            </p>
            <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [searchUsers, setSearchUsers] = useState("");
  const [searchGroups, setSearchGroups] = useState("");

  const { data: stats, isLoading: loadingStats, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => apiFetch("/api/admin/stats"),
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: users = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiFetch("/api/admin/users"),
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery<AdminGroup[]>({
    queryKey: ["/api/admin/groups"],
    queryFn: () => apiFetch("/api/admin/groups"),
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ id, isAdmin }: { id: number; isAdmin: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}`, { isAdmin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUsers.toLowerCase())
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchGroups.toLowerCase()) ||
    g.ownerName.toLowerCase().includes(searchGroups.toLowerCase())
  );

  return (
    <AppShell
      title="Admin Panel"
      backHref="/"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchStats(); refetchUsers(); }}
          data-testid="btn-admin-refresh"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      }
    >
      {/* Admin badge */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-primary">Admin Dashboard</span>
        <span className="text-sm text-muted-foreground ml-auto">
          Logged in as <span className="font-medium">{user?.name}</span>
        </span>
      </div>

      {/* Stats grid */}
      {loadingStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <StatCard icon={Users} label="Total Users" value={stats.totalUsers} sub={`${stats.newUsersToday} joined today`} />
          <StatCard icon={LayoutGrid} label="Total Groups" value={stats.totalGroups} />
          <StatCard icon={Calendar} label="Total Sessions" value={stats.totalSessions} />
          <StatCard icon={DollarSign} label="Total Expenses" value={stats.totalExpenses} />
          <StatCard icon={TrendingUp} label="Revenue Tracked" value={`$${stats.totalRevenue.toFixed(2)}`} color="balance-positive" />
          <StatCard icon={UserCheck} label="New Today" value={stats.newUsersToday} color="text-accent-foreground" />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="users" className="flex-1" data-testid="tab-admin-users">
            Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex-1" data-testid="tab-admin-groups">
            Groups ({groups.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Users Tab ── */}
        <TabsContent value="users">
          <div className="mb-3">
            <Input
              placeholder="Search by name or email…"
              value={searchUsers}
              onChange={e => setSearchUsers(e.target.value)}
              data-testid="input-search-users"
            />
          </div>

          {loadingUsers ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No users found</div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(u => (
                <Card key={u.id} data-testid={`card-admin-user-${u.id}`}>
                  <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarFallback className={cn(
                          "text-xs",
                          u.isAdmin ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}>
                          {getInitials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm">{u.name}</span>
                          {u.isAdmin && (
                            <Badge className="text-xs py-0 px-1.5 h-4" data-testid={`badge-admin-${u.id}`}>
                              Admin
                            </Badge>
                          )}
                          {u.id === user?.id && (
                            <Badge variant="outline" className="text-xs py-0 px-1.5 h-4">You</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.groupCount} group{u.groupCount !== 1 ? "s" : ""} · {u.sessionCount} session{u.sessionCount !== 1 ? "s" : ""} · Joined {format(new Date(u.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Toggle admin */}
                      {u.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={u.isAdmin ? "text-destructive" : "text-muted-foreground"}
                          onClick={() => toggleAdminMutation.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                          disabled={toggleAdminMutation.isPending}
                          data-testid={`btn-toggle-admin-${u.id}`}
                        >
                          {u.isAdmin ? (
                            <><ShieldOff className="w-3.5 h-3.5 mr-1" /> Remove admin</>
                          ) : (
                            <><Shield className="w-3.5 h-3.5 mr-1" /> Make admin</>
                          )}
                        </Button>
                      )}
                      {/* Delete */}
                      {u.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(u)}
                          data-testid={`btn-admin-delete-user-${u.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Groups Tab ── */}
        <TabsContent value="groups">
          <div className="mb-3">
            <Input
              placeholder="Search by group name or owner…"
              value={searchGroups}
              onChange={e => setSearchGroups(e.target.value)}
              data-testid="input-search-groups"
            />
          </div>

          {loadingGroups ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No groups found</div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map(g => (
                <Card key={g.id} data-testid={`card-admin-group-${g.id}`}>
                  <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <LayoutGrid className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Owner: <span className="font-medium">{g.ownerName}</span> · {g.ownerEmail}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {g.memberCount} member{g.memberCount !== 1 ? "s" : ""} · {g.sessionCount} session{g.sessionCount !== 1 ? "s" : ""} · Created {format(new Date(g.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-xs">{g.sessionCount} sessions</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete user dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              This will permanently delete the user account for <strong>{deleteTarget?.email}</strong>.
              Their groups, sessions, and expense data will remain but become unowned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteUserMutation.mutate(deleteTarget.id)}
              disabled={deleteUserMutation.isPending}
              data-testid="btn-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? "Deleting…" : "Yes, delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
