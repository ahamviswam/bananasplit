import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Trash2, Calendar, DollarSign, Users, BarChart3,
  FileText, ChevronRight, Clock
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import type { Group, Member, Session } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const MEMBER_COLORS = [
  "#4CAF50", "#F9C74F", "#E76F51", "#264653", "#457B9D",
  "#A8DADC", "#E9C46A", "#2A9D8F", "#F4A261", "#6D6875",
];

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Add Member Dialog ──────────────────────────────────────────────────────────
function AddMemberDialog({ groupId, open, onClose }: { groupId: number; open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      apiRequest("POST", `/api/groups/${groupId}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] });
      onClose();
      setName("");
      toast({ title: "Member added" });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) return;
    const colorIndex = Math.floor(Math.random() * MEMBER_COLORS.length);
    addMutation.mutate({ name: name.trim(), color: MEMBER_COLORS[colorIndex] });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>Name</Label>
          <Input
            placeholder="Player name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            data-testid="input-member-name"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || addMutation.isPending} data-testid="btn-submit-add-member">
            {addMutation.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New Session Dialog ─────────────────────────────────────────────────────────
function NewSessionDialog({
  groupId, members, open, onClose
}: { groupId: number; members: Member[]; open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [courtFee, setCourtFee] = useState("");
  const [courtFeePaidBy, setCourtFeePaidBy] = useState<string>("");
  const [courtFeeCoPayerId, setCourtFeeCoPayerId] = useState<string>("");
  const [splitCourtFee, setSplitCourtFee] = useState(false);
  const [payerIsNonPlaying, setPayerIsNonPlaying] = useState(false);
  const [numCourts, setNumCourts] = useState("1");
  const [splitMethod, setSplitMethod] = useState<"equal" | "playtime">("equal");
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [playtimeMap, setPlaytimeMap] = useState<Record<number, string>>({});
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/groups/${groupId}/sessions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
      onClose();
      resetForm();
      toast({ title: "Session logged", description: "Court fee has been split among participants." });
    },
    onError: () => toast({ title: "Error", description: "Could not create session.", variant: "destructive" }),
  });

  const resetForm = () => {
    setName(""); setDate(format(new Date(), "yyyy-MM-dd")); setCourtFee("");
    setCourtFeePaidBy(""); setCourtFeeCoPayerId(""); setSplitCourtFee(false); setPayerIsNonPlaying(false); setNumCourts("1");
    setSplitMethod("equal"); setParticipantIds([]); setPlaytimeMap({});
  };

  const toggleParticipant = (id: number) => {
    setParticipantIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!name.trim() || participantIds.length === 0) return;
    const playtimeData = Object.entries(playtimeMap)
      .filter(([id]) => participantIds.includes(Number(id)))
      .map(([id, mins]) => ({ memberId: Number(id), minutes: Number(mins) || 0 }));

    createMutation.mutate({
      name: name.trim(),
      date,
      courtFee: parseFloat(courtFee) || 0,
      courtFeePaidByMemberId: courtFeePaidBy ? Number(courtFeePaidBy) : null,
      courtFeeCoPayerId: (splitCourtFee && courtFeeCoPayerId) ? Number(courtFeeCoPayerId) : null,
      payerIsNonPlaying: payerIsNonPlaying,
      numCourts: parseInt(numCourts) || 1,
      splitMethod,
      participantIds: JSON.stringify(participantIds),
      playtimeData: JSON.stringify(playtimeData),
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); resetForm(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log Session</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Session name</Label>
              <Input
                placeholder="Tuesday Night"
                value={name}
                onChange={e => setName(e.target.value)}
                data-testid="input-session-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-session-date" />
            </div>
          </div>

          {/* Court fee row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Court fee ($)</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={courtFee} onChange={e => setCourtFee(e.target.value)}
                data-testid="input-court-fee"
              />
            </div>
            <div className="space-y-1.5">
              <Label>No. of courts</Label>
              <Input
                type="number" min="1" max="10" placeholder="1"
                value={numCourts} onChange={e => setNumCourts(e.target.value)}
                data-testid="input-num-courts"
              />
            </div>
          </div>

          {/* Who paid the court fee */}
          {courtFee && Number(courtFee) > 0 && participantIds.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Court Fee Payment</p>

              {/* Toggle: split between 2 people */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Split fee between 2 people</p>
                  <p className="text-xs text-muted-foreground">Each pays ${(Number(courtFee) / 2).toFixed(2)}</p>
                </div>
                <Switch
                  checked={splitCourtFee}
                  onCheckedChange={v => { setSplitCourtFee(v); if (!v) setCourtFeeCoPayerId(""); }}
                  data-testid="switch-split-court-fee"
                />
              </div>

              {/* Non-playing payer toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Payer is not playing today</p>
                  <p className="text-xs text-muted-foreground">Select any group member — they pay but owe $0</p>
                </div>
                <Switch
                  checked={payerIsNonPlaying}
                  onCheckedChange={v => { setPayerIsNonPlaying(v); setCourtFeePaidBy(""); }}
                  data-testid="switch-payer-non-playing"
                />
              </div>

              {/* Primary payer — show ALL members when non-playing, only participants otherwise */}
              <div className="space-y-1">
                <Label>{splitCourtFee ? "First payer" : "Paid by"}</Label>
                <Select value={courtFeePaidBy} onValueChange={setCourtFeePaidBy}>
                  <SelectTrigger data-testid="select-court-fee-paid-by">
                    <SelectValue placeholder={payerIsNonPlaying ? "Any group member" : "Select who paid"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(payerIsNonPlaying ? members : members.filter(m => participantIds.includes(m.id))).map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}{payerIsNonPlaying && !participantIds.includes(m.id) ? " (not playing)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Co-payer (only when split is on) */}
              {splitCourtFee && (
                <div className="space-y-1">
                  <Label>Second payer</Label>
                  <Select value={courtFeeCoPayerId} onValueChange={setCourtFeeCoPayerId}>
                    <SelectTrigger data-testid="select-court-fee-co-payer">
                      <SelectValue placeholder="Select second payer" />
                    </SelectTrigger>
                    <SelectContent>
                      {participantIds
                        .filter(id => String(id) !== courtFeePaidBy)
                        .map(id => {
                          const m = members.find(x => x.id === id);
                          return m ? <SelectItem key={id} value={String(id)}>{m.name}</SelectItem> : null;
                        })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Validation */}
              {!courtFeePaidBy && (
                <p className="text-xs text-destructive">Required — select who paid the court fee</p>
              )}
              {splitCourtFee && !courtFeeCoPayerId && courtFeePaidBy && (
                <p className="text-xs text-destructive">Required — select the second payer</p>
              )}
            </div>
          )}

          {/* Participants */}
          <div className="space-y-2">
            <Label>Participants</Label>
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add members to the group first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {members.map(m => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors",
                      participantIds.includes(m.id)
                        ? "border-primary bg-primary/8 text-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                    data-testid={`checkbox-participant-${m.id}`}
                  >
                    <Checkbox
                      checked={participantIds.includes(m.id)}
                      onCheckedChange={() => toggleParticipant(m.id)}
                    />
                    <Avatar className="w-6 h-6">
                      <AvatarFallback style={{ backgroundColor: m.color, fontSize: "10px" }}>
                        {getInitials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{m.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Split method */}
          {courtFee && Number(courtFee) > 0 && participantIds.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Split method</Label>
                <RadioGroup
                  value={splitMethod}
                  onValueChange={v => setSplitMethod(v as "equal" | "playtime")}
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm",
                      splitMethod === "equal" ? "border-primary bg-primary/8" : "border-border"
                    )}
                    data-testid="radio-split-equal"
                  >
                    <RadioGroupItem value="equal" />
                    <div>
                      <p className="font-medium">Equal split</p>
                      <p className="text-xs text-muted-foreground">Everyone pays the same</p>
                    </div>
                  </label>
                  <label
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm",
                      splitMethod === "playtime" ? "border-primary bg-primary/8" : "border-border"
                    )}
                    data-testid="radio-split-playtime"
                  >
                    <RadioGroupItem value="playtime" />
                    <div>
                      <p className="font-medium">By playtime</p>
                      <p className="text-xs text-muted-foreground">Pay based on minutes played</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {splitMethod === "playtime" && (
                <div className="space-y-2">
                  <Label>Minutes played per player</Label>
                  {participantIds.map(id => {
                    const m = members.find(x => x.id === id);
                    if (!m) return null;
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <Avatar className="w-6 h-6 flex-shrink-0">
                          <AvatarFallback style={{ backgroundColor: m.color, fontSize: "10px" }}>
                            {getInitials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm flex-1 truncate">{m.name}</span>
                        <Input
                          type="number"
                          min="0"
                          placeholder="60"
                          className="w-20"
                          value={playtimeMap[id] || ""}
                          onChange={e => setPlaytimeMap(prev => ({ ...prev, [id]: e.target.value }))}
                          data-testid={`input-playtime-${id}`}
                        />
                        <span className="text-xs text-muted-foreground w-6">min</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Preview split */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Cost preview</p>
                {participantIds.map(id => {
                  const m = members.find(x => x.id === id);
                  if (!m) return null;
                  const total = parseFloat(courtFee) || 0;
                  let share = 0;
                  if (splitMethod === "equal") {
                    share = total / participantIds.length;
                  } else {
                    const totalMins = participantIds.reduce((s, pid) => s + (Number(playtimeMap[pid]) || 0), 0);
                    share = totalMins > 0 ? ((Number(playtimeMap[id]) || 0) / totalMins) * total : 0;
                  }
                  return (
                    <div key={id} className="flex justify-between text-sm">
                      <span>{m.name}</span>
                      <span className="font-medium">${share.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !name.trim() ||
              participantIds.length === 0 ||
              (Number(courtFee) > 0 && !courtFeePaidBy) ||
              (Number(courtFee) > 0 && splitCourtFee && !courtFeeCoPayerId) ||
              createMutation.isPending
            }
            data-testid="btn-submit-session"
          >
            {createMutation.isPending ? "Saving…" : "Log Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const gid = Number(groupId);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const { toast } = useToast();

  const { data: group, isLoading: loadingGroup } = useQuery<Group>({
    queryKey: ["/api/groups", gid],
    queryFn: () => apiFetch(`/api/groups/${gid}`),
  });

  const { data: members = [], isLoading: loadingMembers } = useQuery<Member[]>({
    queryKey: ["/api/groups", gid, "members"],
    queryFn: () => apiFetch(`/api/groups/${gid}/members`),
  });

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<Session[]>({
    queryKey: ["/api/groups", gid, "sessions"],
    queryFn: () => apiFetch(`/api/groups/${gid}/sessions`),
  });

  const { data: balanceData } = useQuery<{ net: Record<string, number>; transactions: any[]; members: Member[] }>({
    queryKey: ["/api/groups", gid, "balances"],
    queryFn: () => apiFetch(`/api/groups/${gid}/balances`),
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", gid, "members"] });
      toast({ title: "Member removed" });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", gid, "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", gid, "balances"] });
      toast({ title: "Session deleted" });
    },
  });

  const totalExpenses = sessions.reduce((s: number, _: Session) => s, 0);
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  if (loadingGroup) {
    return (
      <AppShell backHref="/">
        <Skeleton className="h-7 w-48 mb-6" />
        <Skeleton className="h-32 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={group?.name}
      backHref="/"
      actions={
        <div className="flex items-center gap-1.5">
          <Link href={`/groups/${gid}/balances`}>
            <Button variant="outline" size="sm" data-testid="btn-view-balances">
              <BarChart3 className="w-4 h-4 mr-1" /> Balances
            </Button>
          </Link>
          <Link href={`/groups/${gid}/report`}>
            <Button variant="outline" size="sm" data-testid="btn-view-report">
              <FileText className="w-4 h-4 mr-1" /> Report
            </Button>
          </Link>
        </div>
      }
    >
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xl font-bold text-primary" data-testid="stat-members">{members.length}</p>
            <p className="text-xs text-muted-foreground">Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xl font-bold text-primary" data-testid="stat-sessions">{sessions.length}</p>
            <p className="text-xs text-muted-foreground">Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xl font-bold text-primary" data-testid="stat-pending-txns">
              {balanceData?.transactions?.length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sessions">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="sessions" className="flex-1" data-testid="tab-sessions">Sessions</TabsTrigger>
          <TabsTrigger value="members" className="flex-1" data-testid="tab-members">Members</TabsTrigger>
        </TabsList>

        {/* ── Sessions Tab ── */}
        <TabsContent value="sessions">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Play Sessions</h3>
            <Button size="sm" onClick={() => setShowNewSession(true)} data-testid="btn-new-session">
              <Plus className="w-4 h-4 mr-1" /> Log Session
            </Button>
          </div>

          {loadingSessions ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center text-center py-14 text-muted-foreground">
              <Calendar className="w-10 h-10 mb-3 text-muted-foreground/40" />
              <p className="font-medium text-foreground text-sm">No sessions yet</p>
              <p className="text-xs mt-1 mb-4">Log your first court session to start tracking expenses.</p>
              <Button size="sm" onClick={() => setShowNewSession(true)} data-testid="btn-first-session">
                <Plus className="w-4 h-4 mr-1" /> Log Session
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {[...sessions].reverse().map(session => {
                const participantIds: number[] = JSON.parse(session.participantIds || "[]");
                return (
                  <Card key={session.id} className="hover-elevate" data-testid={`card-session-${session.id}`}>
                    <Link href={`/groups/${gid}/sessions/${session.id}`}>
                      <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{session.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(session.date + "T00:00:00"), "EEE, MMM d, yyyy")}
                              {session.courtFee > 0 && ` · $${session.courtFee.toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Participant avatars */}
                          <div className="flex -space-x-1">
                            {participantIds.slice(0, 3).map(id => {
                              const m = memberMap[id];
                              if (!m) return null;
                              return (
                                <Avatar key={id} className="w-6 h-6 border border-background">
                                  <AvatarFallback style={{ backgroundColor: m.color, fontSize: "9px" }}>
                                    {getInitials(m.name)}
                                  </AvatarFallback>
                                </Avatar>
                              );
                            })}
                            {participantIds.length > 3 && (
                              <div className="w-6 h-6 rounded-full bg-muted border border-background flex items-center justify-center text-[9px] font-medium">
                                +{participantIds.length - 3}
                              </div>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {session.splitMethod === "playtime" ? (
                              <><Clock className="w-3 h-3 mr-1" />Playtime</>
                            ) : "Equal"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (confirm("Delete this session?")) deleteSessionMutation.mutate(session.id);
                            }}
                            data-testid={`btn-delete-session-${session.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Members Tab ── */}
        <TabsContent value="members">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Group Members</h3>
            <Button size="sm" onClick={() => setShowAddMember(true)} data-testid="btn-add-member">
              <Plus className="w-4 h-4 mr-1" /> Add Member
            </Button>
          </div>

          {loadingMembers ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center text-center py-14 text-muted-foreground">
              <Users className="w-10 h-10 mb-3 text-muted-foreground/40" />
              <p className="font-medium text-foreground text-sm">No members yet</p>
              <p className="text-xs mt-1 mb-4">Add your pickleball crew to start splitting costs.</p>
              <Button size="sm" onClick={() => setShowAddMember(true)} data-testid="btn-first-member">
                <Plus className="w-4 h-4 mr-1" /> Add Member
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map(m => {
                const net = balanceData?.net?.[m.id] ?? 0;
                return (
                  <Card key={m.id} data-testid={`card-member-${m.id}`}>
                    <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarFallback style={{ backgroundColor: m.color }}>
                            {getInitials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            net > 0.005 ? "balance-positive" : net < -0.005 ? "balance-negative" : "text-muted-foreground"
                          )}
                          data-testid={`text-balance-${m.id}`}
                        >
                          {net > 0.005 ? `+$${net.toFixed(2)}` : net < -0.005 ? `-$${Math.abs(net).toFixed(2)}` : "settled"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${m.name}?`)) deleteMemberMutation.mutate(m.id);
                          }}
                          data-testid={`btn-delete-member-${m.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddMemberDialog groupId={gid} open={showAddMember} onClose={() => setShowAddMember(false)} />
      <NewSessionDialog groupId={gid} members={members} open={showNewSession} onClose={() => setShowNewSession(false)} />
    </AppShell>
  );
}
