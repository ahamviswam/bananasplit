import { apiFetch } from "@/lib/queryClient";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Download, ArrowRight, CheckCircle, Calendar, DollarSign } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Group, Member, Session, Expense } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

interface ReportData {
  group: Group;
  members: Member[];
  sessions: (Session & { total: number; expenseCount: number })[];
  expenses: Expense[];
  payments: any[];
  net: Record<string, number>;
  transactions: { from: number; to: number; amount: number }[];
  memberMap: Record<string, Member>;
  generatedAt: string;
}

export default function ReportPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const gid = Number(groupId);

  const { data: report, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/groups", gid, "report"],
    queryFn: () => apiFetch(`/api/groups/${gid}/report`),
  });

  const handleDownload = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push(`BANANASPLIT — SETTLE-UP REPORT`);
    lines.push(`Group: ${report.group.name}`);
    lines.push(`Generated: ${format(new Date(report.generatedAt), "MMMM d, yyyy 'at' h:mm a")}`);
    lines.push(`${"─".repeat(50)}`);
    lines.push("");

    lines.push("SESSIONS");
    for (const s of report.sessions) {
      lines.push(`  ${format(new Date(s.date + "T00:00:00"), "EEE MMM d, yyyy")} — ${s.name}`);
      lines.push(`    Court fee: $${s.courtFee.toFixed(2)}  |  Split: ${s.splitMethod}  |  Players: ${JSON.parse(s.participantIds || "[]").length}`);
    }
    lines.push("");

    lines.push("BALANCES");
    for (const m of report.members) {
      const b = Math.round((report.net[m.id] ?? 0) * 100) / 100;
      const status = b > 0.005 ? `+$${b.toFixed(2)} (is owed)` : b < -0.005 ? `-$${Math.abs(b).toFixed(2)} (owes)` : "settled";
      lines.push(`  ${m.name}: ${status}`);
    }
    lines.push("");

    if (report.transactions.length === 0) {
      lines.push("STATUS: All settled up!");
    } else {
      lines.push("PAYMENTS TO MAKE");
      for (const t of report.transactions) {
        const from = report.memberMap[t.from];
        const to = report.memberMap[t.to];
        lines.push(`  ${from?.name ?? "?"} → ${to?.name ?? "?"}: $${t.amount.toFixed(2)}`);
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bananasplit-${report.group.name.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <AppShell title="Settle-Up Report" backHref={`/groups/${gid}`}>
        <Skeleton className="h-48 w-full rounded-xl mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!report) return null;

  const totalCourtFees = report.sessions.reduce((s, sess) => s + sess.courtFee, 0);
  const totalExpenses = report.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <AppShell
      title="Settle-Up Report"
      backHref={`/groups/${gid}`}
      actions={
        <Button size="sm" onClick={handleDownload} data-testid="btn-download-report">
          <Download className="w-4 h-4 mr-1" /> Export
        </Button>
      }
    >
      {/* Header card */}
      <Card className="mb-6 bg-primary/8 border-primary/20">
        <CardContent className="pt-5 pb-5">
          <h2 className="font-bold text-lg text-primary mb-1">{report.group.name}</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Report generated {format(new Date(report.generatedAt), "MMMM d, yyyy 'at' h:mm a")}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-primary" data-testid="report-sessions-count">{report.sessions.length}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-primary" data-testid="report-total-fees">${totalExpenses.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total spent</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-primary" data-testid="report-members-count">{report.members.length}</p>
              <p className="text-xs text-muted-foreground">Players</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settle-up summary */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Settlement Summary</h3>
        {report.transactions.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/8 border border-primary/20">
            <CheckCircle className="w-6 h-6 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm text-primary">All settled up!</p>
              <p className="text-xs text-muted-foreground">Everyone's balances are even.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {report.transactions.map((t, i) => {
              const from = report.memberMap[t.from];
              const to = report.memberMap[t.to];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/50 border"
                  data-testid={`report-transaction-${i}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback style={{ backgroundColor: from?.color ?? "#ccc", fontSize: "9px" }}>
                        {from ? getInitials(from.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">{from?.name}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Avatar className="w-7 h-7">
                      <AvatarFallback style={{ backgroundColor: to?.color ?? "#ccc", fontSize: "9px" }}>
                        {to ? getInitials(to.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">{to?.name}</span>
                  </div>
                  <span className="font-bold text-primary flex-shrink-0">${t.amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-member breakdown */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Member Balances</h3>
        <div className="space-y-2">
          {report.members.map(m => {
            const balance = Math.round((report.net[m.id] ?? 0) * 100) / 100;
            // How much this member paid total
            const paid = report.expenses.filter(e => e.paidByMemberId === m.id).reduce((s, e) => s + e.amount, 0);
            // How much this member owes
            const owed = report.expenses.reduce((s, e) => {
              const split: { memberId: number; amount: number }[] = JSON.parse(e.splitData || "[]");
              const share = split.find(x => x.memberId === m.id);
              return s + (share?.amount ?? 0);
            }, 0);

            return (
              <Card key={m.id} data-testid={`report-member-${m.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback style={{ backgroundColor: m.color }}>
                          {getInitials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-sm">{m.name}</span>
                    </div>
                    <span className={cn(
                      "font-bold text-sm",
                      balance > 0.005 ? "balance-positive" : balance < -0.005 ? "balance-negative" : "text-muted-foreground"
                    )}>
                      {balance > 0.005 ? `+$${balance.toFixed(2)}` : balance < -0.005 ? `-$${Math.abs(balance).toFixed(2)}` : "settled"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Total paid: <span className="text-foreground font-medium">${paid.toFixed(2)}</span></div>
                    <div>Share owed: <span className="text-foreground font-medium">${owed.toFixed(2)}</span></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Session history */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Session History</h3>
        <div className="space-y-2">
          {[...report.sessions].reverse().map(s => {
            const participantIds: number[] = JSON.parse(s.participantIds || "[]");
            return (
              <Card key={s.id} data-testid={`report-session-${s.id}`}>
                <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(s.date + "T00:00:00"), "EEE, MMM d, yyyy")}
                      {" · "}{participantIds.length} players
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">${s.total.toFixed(2)}</p>
                    <Badge variant="secondary" className="text-xs">{s.splitMethod}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment history */}
      {report.payments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recorded Payments</h3>
          <div className="space-y-2">
            {[...report.payments].reverse().map(p => {
              const from = report.memberMap[p.fromMemberId];
              const to = report.memberMap[p.toMemberId];
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`report-payment-${p.id}`}>
                  <p className="text-sm">
                    <span className="font-medium">{from?.name}</span> paid{" "}
                    <span className="font-medium">{to?.name}</span>
                    {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
                  </p>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">${p.amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(p.date + "T00:00:00"), "MMM d")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
