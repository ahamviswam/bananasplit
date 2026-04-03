import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Trash2, Clock, Users, Receipt,
  ChevronRight, ChevronLeft, Swords, RefreshCw
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import { getRound, type Matchup, type Round } from "@/lib/roundRobin";
import type { Session, Member, Expense } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Player Avatar Stack ────────────────────────────────────────────────────────
function PlayerStack({ ids, memberMap }: { ids: number[]; memberMap: Record<number, Member> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {ids.map((id) => {
        const m = memberMap[id];
        if (!m) return null;
        return (
          <div key={id} className="flex items-center gap-2">
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarFallback style={{ backgroundColor: m.color, fontSize: "10px" }}>
                {getInitials(m.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{m.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Matchup Card ───────────────────────────────────────────────────────────────
function MatchupCard({
  matchup,
  memberMap,
  isDoubles,
}: {
  matchup: Matchup;
  memberMap: Record<number, Member>;
  isDoubles: boolean;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-matchup-${matchup.gameNumber}`}>
      <CardContent className="pt-4 pb-4">
        {/* Game number badge */}
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" className="text-xs font-semibold">
            Game {matchup.gameNumber}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {isDoubles ? "2v2 Doubles" : "1v1 Singles"}
          </Badge>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Team A */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Team A</p>
            <PlayerStack ids={matchup.teamA} memberMap={memberMap} />
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <Swords className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          </div>

          {/* Team B */}
          <div className="flex flex-col gap-1.5 items-end text-right">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1 text-right">Team B</p>
            <div className="flex flex-col gap-1.5 items-end">
              {matchup.teamB.map((id) => {
                const m = memberMap[id];
                if (!m) return null;
                return (
                  <div key={id} className="flex items-center gap-2 flex-row-reverse">
                    <Avatar className="w-7 h-7 flex-shrink-0">
                      <AvatarFallback style={{ backgroundColor: m.color, fontSize: "10px" }}>
                        {getInitials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{m.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Round Robin Scheduler ─────────────────────────────────────────────────────
function RoundRobinScheduler({
  participantIds,
  numCourts,
  memberMap,
}: {
  participantIds: number[];
  numCourts: number;
  memberMap: Record<number, Member>;
}) {
  const [roundIndex, setRoundIndex] = useState(0);
  const isDoubles = participantIds.length >= 4;
  const { round, totalRounds } = getRound(participantIds, numCourts, roundIndex);

  if (participantIds.length < 2) {
    return (
      <div className="flex flex-col items-center text-center py-10 text-muted-foreground">
        <Swords className="w-8 h-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Not enough players</p>
        <p className="text-xs mt-1">Add at least 2 participants to generate matchups.</p>
      </div>
    );
  }

  if (!round) return null;

  const playersPerGame = isDoubles ? 4 : 2;
  const activePlayers = round.matchups.flatMap(m => [...m.teamA, ...m.teamB]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Round {round.roundNumber} · {isDoubles ? "2v2 Doubles" : "Singles"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {round.matchups.length} game{round.matchups.length !== 1 ? "s" : ""} on {numCourts} court{numCourts !== 1 ? "s" : ""}
            {round.sitting.length > 0 && ` · ${round.sitting.length} sitting out`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm"
            onClick={() => setRoundIndex((r) => (r - 1 + totalRounds) % totalRounds)}
            disabled={totalRounds <= 1} data-testid="btn-prev-round">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-1 tabular-nums">
            {roundIndex + 1} / {totalRounds}
          </span>
          <Button variant="outline" size="sm"
            onClick={() => setRoundIndex((r) => (r + 1) % totalRounds)}
            disabled={totalRounds <= 1} data-testid="btn-next-round">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Sitting out — shown prominently when applicable */}
      {round.sitting.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 px-3 py-2.5 rounded-lg bg-muted/60 border border-border">
          <span className="text-xs font-semibold text-muted-foreground">Sitting this round:</span>
          {round.sitting.map(id => {
            const m = memberMap[id];
            return m ? (
              <div key={id} className="flex items-center gap-1.5">
                <Avatar className="w-5 h-5">
                  <AvatarFallback style={{ backgroundColor: m.color, fontSize: "8px" }}>
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium">{m.name}</span>
              </div>
            ) : null;
          })}
          <Badge variant="secondary" className="ml-auto text-xs">Plays next →</Badge>
        </div>
      )}

      {/* Matchup cards */}
      <div className="space-y-3 mb-4">
        {round.matchups.map((m) => (
          <MatchupCard key={m.gameNumber} matchup={m} memberMap={memberMap} isDoubles={isDoubles} />
        ))}
      </div>

      {/* Next round CTA */}
      {totalRounds > 1 && (
        <Button className="w-full" variant="outline"
          onClick={() => setRoundIndex((r) => (r + 1) % totalRounds)}
          data-testid="btn-next-round-bottom">
          <RefreshCw className="w-4 h-4 mr-2" />
          Next Round ({((roundIndex + 1) % totalRounds) + 1} of {totalRounds})
        </Button>
      )}

      <p className="text-center text-xs text-muted-foreground mt-3">
        {participantIds.length} players · {numCourts} court{numCourts !== 1 ? "s" : ""} · {totalRounds} rounds
        {participantIds.length > numCourts * playersPerGame
          ? ` · ${participantIds.length - numCourts * playersPerGame} sit per round, priority rotates`
          : " · all players active every round"}
      </p>
    </div>
  );
}

// ── Add Expense Dialog ─────────────────────────────────────────────────────────
function AddExpenseDialog({
  sessionId, groupId, members, participantIds, open, onClose,
}: {
  sessionId: number;
  groupId: number;
  members: Member[];
  participantIds: number[];
  open: boolean;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [splitMethod, setSplitMethod] = useState<"equal" | "custom">("equal");
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({});
  const { toast } = useToast();

  const participants = members.filter((m) => participantIds.includes(m.id));

  const addMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/sessions/${sessionId}/expenses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
      onClose();
      resetForm();
      toast({ title: "Expense added" });
    },
    onError: () =>
      toast({ title: "Error", description: "Could not add expense.", variant: "destructive" }),
  });

  const resetForm = () => {
    setDescription(""); setAmount(""); setPaidBy("");
    setSplitMethod("equal"); setCustomAmounts({});
  };

  const handleSubmit = () => {
    if (!description.trim() || !amount || !paidBy) return;
    const total = parseFloat(amount);
    let splitData: { memberId: number; amount: number }[] = [];

    if (splitMethod === "equal") {
      const share = total / participants.length;
      splitData = participants.map((m) => ({
        memberId: m.id,
        amount: Math.round(share * 100) / 100,
      }));
    } else {
      splitData = participants
        .filter((m) => parseFloat(customAmounts[m.id] || "0") > 0)
        .map((m) => ({
          memberId: m.id,
          amount: parseFloat(customAmounts[m.id] || "0"),
        }));
    }

    addMutation.mutate({
      description: description.trim(),
      amount: total,
      paidByMemberId: Number(paidBy),
      splitMethod,
      splitData: JSON.stringify(splitData),
    });
  };

  const customTotal = Object.values(customAmounts).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetForm(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              placeholder="Drinks, balls, equipment…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-expense-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                data-testid="input-expense-amount"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger data-testid="select-paid-by">
                  <SelectValue placeholder="Select payer" />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />
          <div className="space-y-2">
            <Label>Split between</Label>
            <RadioGroup
              value={splitMethod}
              onValueChange={(v) => setSplitMethod(v as "equal" | "custom")}
              className="grid grid-cols-2 gap-2"
            >
              {(["equal", "custom"] as const).map((method) => (
                <label
                  key={method}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm",
                    splitMethod === method
                      ? "border-primary bg-primary/8"
                      : "border-border"
                  )}
                  data-testid={`radio-expense-split-${method}`}
                >
                  <RadioGroupItem value={method} />
                  <div>
                    <p className="font-medium capitalize">{method}</p>
                    <p className="text-xs text-muted-foreground">
                      {method === "equal" ? "Divide evenly" : "Specify amounts"}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {splitMethod === "custom" && (
            <div className="space-y-2">
              {participants.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Avatar className="w-6 h-6 flex-shrink-0">
                    <AvatarFallback style={{ backgroundColor: m.color, fontSize: "10px" }}>
                      {getInitials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm flex-1">{m.name}</span>
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    className="w-24"
                    value={customAmounts[m.id] || ""}
                    onChange={(e) =>
                      setCustomAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    data-testid={`input-custom-split-${m.id}`}
                  />
                </div>
              ))}
              {amount && (
                <p
                  className={cn(
                    "text-xs",
                    Math.abs(customTotal - parseFloat(amount)) > 0.01
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  Total: ${customTotal.toFixed(2)} / ${parseFloat(amount || "0").toFixed(2)}
                </p>
              )}
            </div>
          )}

          {splitMethod === "equal" && participants.length > 0 && amount && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1.5">Each pays</p>
              <p className="text-lg font-bold text-primary">
                ${(parseFloat(amount) / participants.length).toFixed(2)}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onClose(); resetForm(); }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || !amount || !paidBy || addMutation.isPending}
            data-testid="btn-submit-expense"
          >
            {addMutation.isPending ? "Adding…" : "Add Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SessionDetailPage() {
  const { groupId, sessionId } = useParams<{ groupId: string; sessionId: string }>();
  const gid = Number(groupId);
  const sid = Number(sessionId);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const { toast } = useToast();

  const { data: session, isLoading: loadingSession } = useQuery<Session>({
    queryKey: ["/api/sessions", sid],
    queryFn: () => apiFetch(`/api/sessions/${sid}`),
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["/api/groups", gid, "members"],
    queryFn: () => apiFetch(`/api/groups/${gid}/members`),
  });

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery<Expense[]>({
    queryKey: ["/api/sessions", sid, "expenses"],
    queryFn: () => apiFetch(`/api/sessions/${sid}/expenses`),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sid, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", gid, "balances"] });
      toast({ title: "Expense deleted" });
    },
  });

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const participantIds: number[] = session
    ? JSON.parse(session.participantIds || "[]")
    : [];
  const playtimeData: { memberId: number; minutes: number }[] = session
    ? JSON.parse(session.playtimeData || "[]")
    : [];
  const totalExpenses = expenses.reduce((s: number, e: Expense) => s + e.amount, 0);

  if (loadingSession) {
    return (
      <AppShell backHref={`/groups/${gid}`}>
        <Skeleton className="h-7 w-48 mb-6" />
        <Skeleton className="h-32 w-full" />
      </AppShell>
    );
  }

  if (!session) return null;

  return (
    <AppShell title={session.name} backHref={`/groups/${gid}`}>
      {/* Session summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-sm font-bold text-primary">
              {format(new Date(session.date + "T00:00:00"), "MMM d")}
            </p>
            <p className="text-xs text-muted-foreground">Date</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-sm font-bold text-primary">{session.numCourts ?? 1}</p>
            <p className="text-xs text-muted-foreground">Court{(session.numCourts ?? 1) !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-sm font-bold text-primary">
              {participantIds.length}
            </p>
            <p className="text-xs text-muted-foreground">Players</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-sm font-bold text-primary">
              ${totalExpenses.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Court fee paid-by info */}
      {session.courtFee > 0 && (() => {
        const payer = session.courtFeePaidByMemberId ? memberMap[session.courtFeePaidByMemberId] : null;
        const coPayer = session.courtFeeCoPayerId ? memberMap[session.courtFeeCoPayerId] : null;
        if (!payer) return null;
        const isNonPlaying = session.payerIsNonPlaying;
        return (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-accent/10 border border-accent/20 text-sm flex-wrap">
            {coPayer ? (
              <>
                <Avatar className="w-6 h-6"><AvatarFallback style={{ backgroundColor: payer.color, fontSize: "9px" }}>{getInitials(payer.name)}</AvatarFallback></Avatar>
                <span className="font-semibold">{payer.name}</span>
                <span className="text-muted-foreground">&amp;</span>
                <Avatar className="w-6 h-6"><AvatarFallback style={{ backgroundColor: coPayer.color, fontSize: "9px" }}>{getInitials(coPayer.name)}</AvatarFallback></Avatar>
                <span className="font-semibold">{coPayer.name}</span>
                <span>each paid <span className="font-semibold text-primary">${(session.courtFee / 2).toFixed(2)}</span> <span className="text-muted-foreground">(total ${session.courtFee.toFixed(2)})</span></span>
              </>
            ) : (
              <>
                <Avatar className="w-6 h-6"><AvatarFallback style={{ backgroundColor: payer.color, fontSize: "9px" }}>{getInitials(payer.name)}</AvatarFallback></Avatar>
                <span>
                  <span className="font-semibold">{payer.name}</span>
                  {isNonPlaying ? " sponsored the court fee of " : " paid the court fee of "}
                  <span className="font-semibold text-primary">${session.courtFee.toFixed(2)}</span>
                </span>
                {isNonPlaying && (
                  <Badge variant="secondary" className="text-xs ml-1">Not playing · owes $0</Badge>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Participants row */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Participants
        </h3>
        <div className="flex flex-wrap gap-2">
          {participantIds.map((id) => {
            const m = memberMap[id];
            if (!m) return null;
            const pt = playtimeData.find((p) => p.memberId === id);
            return (
              <div
                key={id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm"
                data-testid={`participant-${id}`}
              >
                <Avatar className="w-5 h-5">
                  <AvatarFallback
                    style={{ backgroundColor: m.color, fontSize: "8px" }}
                  >
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <span>{m.name}</span>
                {pt && (
                  <span className="text-xs text-muted-foreground">
                    · {pt.minutes}m
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <Badge variant="secondary">
            {session.splitMethod === "playtime" ? (
              <>
                <Clock className="w-3 h-3 mr-1" /> Split by playtime
              </>
            ) : (
              <>
                <Users className="w-3 h-3 mr-1" /> Equal split
              </>
            )}
          </Badge>
        </div>
      </div>

      {/* Tabs: Games | Expenses */}
      <Tabs defaultValue="games">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="games" className="flex-1" data-testid="tab-games">
            🏓 Games
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1" data-testid="tab-expenses">
            💰 Expenses
          </TabsTrigger>
        </TabsList>

        {/* ── Games Tab ── */}
        <TabsContent value="games">
          <RoundRobinScheduler
            participantIds={participantIds}
            numCourts={session.numCourts ?? 1}
            memberMap={memberMap}
          />
        </TabsContent>

        {/* ── Expenses Tab ── */}
        <TabsContent value="expenses">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Expenses
            </h3>
            <Button
              size="sm"
              onClick={() => setShowAddExpense(true)}
              data-testid="btn-add-expense"
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {loadingExpenses ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm">No additional expenses</p>
              {session.courtFee > 0 && (
                <p className="text-xs mt-1">
                  Court fee is already tracked above.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map((e) => {
                const payer = memberMap[e.paidByMemberId];
                const splitData: { memberId: number; amount: number }[] =
                  JSON.parse(e.splitData || "[]");
                return (
                  <Card key={e.id} data-testid={`card-expense-${e.id}`}>
                    <CardContent className="pt-3 pb-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">
                            {e.description}
                          </span>
                          <span className="text-sm font-bold text-primary flex-shrink-0">
                            ${e.amount.toFixed(2)}
                          </span>
                        </div>
                        {payer && (
                          <p className="text-xs text-muted-foreground mb-1.5">
                            Paid by{" "}
                            <span className="font-medium">{payer.name}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {splitData.map((s) => {
                            const m = memberMap[s.memberId];
                            return m ? (
                              <span
                                key={s.memberId}
                                className="text-xs bg-muted px-1.5 py-0.5 rounded-full"
                              >
                                {m.name} · ${s.amount.toFixed(2)}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive flex-shrink-0"
                        onClick={() => {
                          if (confirm("Delete this expense?"))
                            deleteExpenseMutation.mutate(e.id);
                        }}
                        data-testid={`btn-delete-expense-${e.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddExpenseDialog
        sessionId={sid}
        groupId={gid}
        members={members}
        participantIds={participantIds}
        open={showAddExpense}
        onClose={() => setShowAddExpense(false)}
      />
    </AppShell>
  );
}
