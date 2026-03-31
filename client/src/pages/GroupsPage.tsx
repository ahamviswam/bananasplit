import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Users, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Group } from "@shared/schema";
import { format } from "date-fns";

export default function GroupsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const { toast } = useToast();

  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiRequest("POST", "/api/groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setShowCreate(false);
      setName("");
      setDescription("");
      toast({ title: "Group created", description: "Your pickleball group is ready." });
    },
    onError: () => toast({ title: "Error", description: "Could not create group.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setDeleteTarget(null);
      toast({ title: "Group deleted" });
    },
    onError: () => toast({ title: "Error", description: "Could not delete group.", variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), description: description.trim() });
  };

  return (
    <AppShell
      actions={
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="btn-create-group">
          <Plus className="w-4 h-4 mr-1" /> New Group
        </Button>
      }
    >
      {/* Hero banner */}
      <div className="mb-8 rounded-xl bg-primary/10 border border-primary/20 px-6 py-8 flex items-start gap-4">
        <div className="rounded-lg bg-accent/20 p-3 flex-shrink-0">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="hsl(47,95%,55%)" stroke="hsl(47,80%,38%)" strokeWidth="1.5" />
            <path d="M16 2 C16 2, 10 8, 10 16 C10 24, 16 30, 16 30" stroke="hsl(82,55%,32%)" strokeWidth="1.5" fill="none" />
            <path d="M16 2 C16 2, 22 8, 22 16 C22 24, 16 30, 16 30" stroke="hsl(82,55%,32%)" strokeWidth="1.5" fill="none" />
            <ellipse cx="16" cy="16" rx="14" ry="6" stroke="hsl(82,55%,32%)" strokeWidth="1.2" fill="none" />
            <circle cx="16" cy="16" r="2" fill="hsl(82,55%,32%)" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Your Pickleball Groups</h2>
          <p className="text-sm text-muted-foreground">
            Create a group for your regular crew, log court fees, split expenses, and track who owes what.
          </p>
        </div>
      </div>

      {/* Groups list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="pt-5 pb-5">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groups && groups.length > 0 ? (
        <div className="space-y-3">
          {groups.map(group => (
            // ── Card with delete OUTSIDE the Link ──────────────────────────
            <Card key={group.id} className="hover-elevate" data-testid={`card-group-${group.id}`}>
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                {/* Clickable area → navigate to group */}
                <Link href={`/groups/${group.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" data-testid={`text-group-name-${group.id}`}>
                      {group.name}
                    </p>
                    {group.description && (
                      <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {format(new Date(group.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </Link>

                {/* Delete button — always visible, outside the Link */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => setDeleteTarget(group)}
                  data-testid={`btn-delete-group-${group.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-20 text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-accent" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">No groups yet</h3>
          <p className="text-sm max-w-xs mb-5">
            Create your first group to start tracking pickleball expenses with your crew.
          </p>
          <Button onClick={() => setShowCreate(true)} data-testid="btn-create-first-group">
            <Plus className="w-4 h-4 mr-1" /> Create a Group
          </Button>
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                placeholder="Tuesday Night Pickleballers"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                data-testid="input-group-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-desc">Description (optional)</Label>
              <Textarea
                id="group-desc"
                placeholder="Our weekly 6pm court at Riverside Park"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                data-testid="input-group-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
              data-testid="btn-submit-create-group"
            >
              {createMutation.isPending ? "Creating…" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              This will permanently delete the group, all its members, sessions, expenses, and payment history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="btn-confirm-delete-group"
            >
              {deleteMutation.isPending ? "Deleting…" : "Yes, delete group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
