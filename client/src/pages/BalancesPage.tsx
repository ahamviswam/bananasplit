import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle, Plus, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiFetch, queryClient } from "@/lib/queryClient";
import type { Member, Payment } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Log Payment Dialog ─────────────────────────────────────────────────────────
function LogPaymentDialog({
  groupId, members, open, onClose,
  defaultFrom, defaultTo, defaultAmount
}: {
  groupId: number;
  members: Member[];
  open: boolean;
  onClose: () => void;
  defaultFrom?: number;
  defaultTo?: number;
  defaultAmount?: number;
}) {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // Sync defaults when dialog opens
  useEffect(() => {
    if (open) {
      setFromId(defaultFrom ? String(defaultFrom) : "");
      setToId(defaultTo ? String(defaultTo) : "");
      setAmount(defaultAmount ? defaultAmount.toFixed(2) : "");
      setNote("");
    }
  }, [open, defaultFrom, defaultTo, defaultAmount]);
  const [note, setNote] = useState<string>("");
  const { toast } = useToast();

  const payMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", `/api/groups/${groupId}/payments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "payments"] });
      onClose();
      toast({ title: "Payment recorded", description: "Balances have been updated." });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!fromId || !toId || !amount) return;
    payMutation.mutate({
      fromMemberId: Number(fromId),
      toMemberId: Number(toId),
      amount: parseFloat(amount),
      note: note.trim(),
      date: new Date().toISOString().split("T")[0],
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Who paid</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger data-testid="select-payment-from">
                <SelectValue placeholder="Select payer" />
              </SelectTrigger>
              <SelectContent>
                {members.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Who received</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger data-testid="select-payment-to">
                <SelectValue placeholder="Select recipient" />
              </SelectTrigger>
              <SelectContent>
                {members.filter(m => String(m.id) !== fromId).map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount ($)</Label>
            <Input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)}
              data-testid="input-payment-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input placeholder="Venmo, cash, etc." value={note} onChange={e => setNote(e.target.value)} data-testid="input-payment-note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!fromId || !toId || !amount || payMutation.isPending}
            data-testid="btn-submit-payment"
          >
            {payMutation.isPending ? "Saving…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BalancesPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const gid = Number(groupId);
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [quickPay, setQuickPay] = useState<{ from?: number; to?: number; amount?: number } | null>(null);
  const { toast } = useToast();

  const { data: balanceData, isLoading } = useQuery<{
    net: Record<string, number>;
    transactions: { from: number; to: number; amount: number }[];
    members: Member[];
  }>({
    queryKey: ["/api/groups", gid, "balances"],
    queryFn: () => apiFetch(`/api/groups/${gid}/balances`),
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/groups", gid, "payments"],
    queryFn: () => apiFetch(`/api/groups/${gid}/payments`),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", gid, "balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", gid, "payments"] });
      toast({ title: "Payment deleted" });
    },
  });

  const members = balanceData?.members ?? [];
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
  const transactions = balanceData?.transactions ?? [];
  const net = balanceData?.net ?? {};
  const isAllSettled = transactions.length === 0;

  return (
    <AppShell
      title="Balances"
      backHref={`/groups/${gid}`}
      actions={
        <Button size="sm" onClick={() => { setQuickPay(null); setShowLogPayment(true); }} data-testid="btn-log-payment">
          <Plus className="w-4 h-4 mr-1" /> Record Payment
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* All-settled state */}
          {isAllSettled && (
            <div className="flex flex-col items-center text-center py-10 mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-3">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">All settled up!</h3>
              <p className="text-sm text-muted-foreground">Everyone's balances are even. Keep playing!</p>
            </div>
          )}

          {/* Suggested transactions */}
          {transactions.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Settle Up</h3>
              <div className="space-y-2">
                {transactions.map((t, i) => {
                  const from = memberMap[t.from];
                  const to = memberMap[t.to];
                  if (!from || !to) return null;
                  return (
                    <Card key={i} className="hover-elevate" data-testid={`card-transaction-${i}`}>
                      <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="w-9 h-9 flex-shrink-0">
                            <AvatarFallback style={{ backgroundColor: from.color }}>
                              {getInitials(from.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-sm truncate">{from.name}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium text-sm truncate">{to.name}</span>
                          </div>
                          <Avatar className="w-9 h-9 flex-shrink-0">
                            <AvatarFallback style={{ backgroundColor: to.color }}>
                              {getInitials(to.name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-bold text-primary">${t.amount.toFixed(2)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setQuickPay({ from: t.from, to: t.to, amount: t.amount });
                              setShowLogPayment(true);
                            }}
                            data-testid={`btn-quick-settle-${i}`}
                          >
                            Mark paid
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Individual balances */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Individual Balances</h3>
            <div className="space-y-2">
              {members.map(m => {
                const balance = Math.round((net[m.id] ?? 0) * 100) / 100;
                return (
                  <Card key={m.id} data-testid={`card-balance-${m.id}`}>
                    <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarFallback style={{ backgroundColor: m.color }}>
                            {getInitials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{m.name}</span>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-bold text-sm",
                          balance > 0.005 ? "balance-positive" : balance < -0.005 ? "balance-negative" : "text-muted-foreground"
                        )} data-testid={`text-net-${m.id}`}>
                          {balance > 0.005
                            ? `+$${balance.toFixed(2)}`
                            : balance < -0.005
                              ? `-$${Math.abs(balance).toFixed(2)}`
                              : "settled"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {balance > 0.005 ? "is owed" : balance < -0.005 ? "owes" : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Payment History
              </h3>
              <div className="space-y-2">
                {[...payments].reverse().map(p => {
                  const from = memberMap[p.fromMemberId];
                  const to = memberMap[p.toMemberId];
                  return (
                    <Card key={p.id} data-testid={`card-payment-${p.id}`}>
                      <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback style={{ backgroundColor: from?.color ?? "#ccc", fontSize: "9px" }}>
                              {from ? getInitials(from.name) : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">
                            <span className="font-medium">{from?.name ?? "?"}</span>
                            {" paid "}
                            <span className="font-medium">{to?.name ?? "?"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-primary">${p.amount.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(p.date + "T00:00:00"), "MMM d")}</p>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="text-muted-foreground"
                            onClick={() => {
                              if (confirm("Undo this payment?")) deletePaymentMutation.mutate(p.id);
                            }}
                            data-testid={`btn-delete-payment-${p.id}`}
                          >
                            ×
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <LogPaymentDialog
        groupId={gid}
        members={members}
        open={showLogPayment}
        onClose={() => { setShowLogPayment(false); setQuickPay(null); }}
        defaultFrom={quickPay?.from}
        defaultTo={quickPay?.to}
        defaultAmount={quickPay?.amount}
      />
    </AppShell>
  );
}
