import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertGroupSchema, insertMemberSchema, insertSessionSchema, insertExpenseSchema, insertPaymentSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { signToken, authMiddleware, adminMiddleware, getUser } from "./auth";

// ── Balance calculation helpers ───────────────────────────────────────────────
function computeBalances(groupId: number) {
  const membersList = storage.getMembersByGroup(groupId);
  const allExpenses = storage.getExpensesByGroup(groupId);
  const allPayments = storage.getPaymentsByGroup(groupId);

  // net[memberId] = total paid - total owed (positive = is owed money, negative = owes money)
  const net: Record<number, number> = {};
  for (const m of membersList) net[m.id] = 0;

  for (const expense of allExpenses) {
    const participants = JSON.parse(expense.splitData || "[]") as { memberId: number; amount: number }[];
    // Payer gets credit
    net[expense.paidByMemberId] = (net[expense.paidByMemberId] ?? 0) + expense.amount;
    // Each participant owes their share
    for (const p of participants) {
      net[p.memberId] = (net[p.memberId] ?? 0) - p.amount;
    }
  }

  // Factor in payments already made
  for (const payment of allPayments) {
    net[payment.fromMemberId] = (net[payment.fromMemberId] ?? 0) + payment.amount;
    net[payment.toMemberId] = (net[payment.toMemberId] ?? 0) - payment.amount;
  }

  return net;
}

// Simplify debts: minimize transactions
function simplifyDebts(net: Record<number, number>): { from: number; to: number; amount: number }[] {
  const creditors: { id: number; amount: number }[] = [];
  const debtors: { id: number; amount: number }[] = [];

  for (const [id, balance] of Object.entries(net)) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0.005) creditors.push({ id: Number(id), amount: rounded });
    else if (rounded < -0.005) debtors.push({ id: Number(id), amount: Math.abs(rounded) });
  }

  const transactions: { from: number; to: number; amount: number }[] = [];

  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amt = Math.min(c.amount, d.amount);
    const rounded = Math.round(amt * 100) / 100;
    if (rounded > 0.005) {
      transactions.push({ from: d.id, to: c.id, amount: rounded });
    }
    c.amount -= amt;
    d.amount -= amt;
    if (c.amount < 0.005) ci++;
    if (d.amount < 0.005) di++;
  }

  return transactions;
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ── Health check (public — Railway uses this to verify deployment) ────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Auth routes (public — no auth middleware) ────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: "Email, name and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const existing = storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = storage.createUser({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      passwordHash,
      createdAt: new Date().toISOString(),
    });
    const token = signToken({ userId: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin } });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = signToken({ userId: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin } });
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    const user = getUser(req);
    res.json({ id: user.userId, email: user.email, name: user.name });
  });


  // ── Admin routes (authMiddleware + adminMiddleware) ──────────────────────────
  app.get("/api/admin/stats", authMiddleware, adminMiddleware, (req, res) => {
    const allUsers = storage.getAllUsers();
    // Use getAllGroups to include legacy groups (owner_id = 0)
    const allGroups = storage.getAllGroups();
    let totalSessions = 0, totalExpenses = 0, totalRevenue = 0;
    for (const group of allGroups) {
      const sessions = storage.getSessionsByGroup(group.id);
      totalSessions += sessions.length;
      const expenses = storage.getExpensesByGroup(group.id);
      totalExpenses += expenses.length;
      totalRevenue += expenses.reduce((sum, e) => sum + e.amount, 0);
    }
    res.json({
      totalUsers: allUsers.length,
      totalGroups: allGroups.length,
      totalSessions,
      totalExpenses,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      newUsersToday: allUsers.filter(u => u.createdAt.startsWith(new Date().toISOString().split("T")[0])).length,
    });
  });

  app.get("/api/admin/users", authMiddleware, adminMiddleware, (req, res) => {
    const allUsers = storage.getAllUsers();
    const usersWithStats = allUsers.map(u => {
      const groups = storage.getGroups(u.id);
      let sessions = 0;
      for (const g of groups) sessions += storage.getSessionsByGroup(g.id).length;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
        groupCount: groups.length,
        sessionCount: sessions,
      };
    });
    res.json(usersWithStats);
  });

  app.patch("/api/admin/users/:id", authMiddleware, adminMiddleware, (req, res) => {
    const { isAdmin } = req.body;
    storage.setUserAdmin(Number(req.params.id), Boolean(isAdmin));
    res.json({ success: true });
  });

  app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, (req, res) => {
    const id = Number(req.params.id);
    // Prevent deleting yourself
    const caller = (req as any).user;
    if (caller.userId === id) {
      return res.status(400).json({ error: "Cannot delete your own admin account" });
    }
    storage.deleteUser(id);
    res.status(204).send();
  });

  app.get("/api/admin/groups", authMiddleware, adminMiddleware, (req, res) => {
    const allUsers = storage.getAllUsers();
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    // Get ALL groups including legacy (owner_id = 0)
    const allGroups = storage.getAllGroups();
    const result = allGroups.map(g => {
      const sessions = storage.getSessionsByGroup(g.id);
      const members = storage.getMembersByGroup(g.id);
      const owner = userMap[g.ownerId];
      return {
        ...g,
        ownerName: owner?.name ?? "Legacy (no owner)",
        ownerEmail: owner?.email ?? "",
        memberCount: members.length,
        sessionCount: sessions.length,
      };
    });
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(result);
  });

  // ── Admin: reset a user's password via ADMIN_SECRET ─────────────────────────
  app.post("/api/admin/reset-password", async (req, res) => {
    const { email, newPassword, secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(503).json({ error: "Not configured" });
    if (secret !== adminSecret) return res.status(403).json({ error: "Invalid secret" });
    const user = storage.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    storage.updatePassword(user.id, passwordHash);
    res.json({ success: true, message: `Password reset for ${user.name}` });
  });

  // ── First-time admin setup: make a user admin via ADMIN_SECRET env var ────────
  app.post("/api/admin/setup", (req, res) => {
    const { email, secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(503).json({ error: "Admin setup not configured" });
    if (secret !== adminSecret) return res.status(403).json({ error: "Invalid secret" });
    const user = storage.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: "User not found" });
    storage.setUserAdmin(user.id, true);
    res.json({ success: true, message: `${user.name} is now an admin` });
  });

  // ── Groups (protected) ───────────────────────────────────────────────────────
  app.get("/api/groups", authMiddleware, (req, res) => {
    const user = getUser(req);
    const allGroups = storage.getGroups(user.userId);
    res.json(allGroups);
  });

  app.get("/api/groups/:id", authMiddleware, (req, res) => {
    const group = storage.getGroup(Number(req.params.id));
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group);
  });

  app.post("/api/groups", authMiddleware, (req, res) => {
    const user = getUser(req);
    const parsed = insertGroupSchema.safeParse({ ...req.body, ownerId: user.userId, createdAt: new Date().toISOString() });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const group = storage.createGroup(parsed.data);
    res.status(201).json(group);
  });

  app.patch("/api/groups/:id", authMiddleware, (req, res) => {
    const group = storage.updateGroup(Number(req.params.id), req.body);
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group);
  });

  app.delete("/api/groups/:id", authMiddleware, (req, res) => {
    storage.deleteGroup(Number(req.params.id));
    res.status(204).send();
  });

  // ── Members ─────────────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/members", authMiddleware, (req, res) => {
    const membersList = storage.getMembersByGroup(Number(req.params.groupId));
    res.json(membersList);
  });

  app.post("/api/groups/:groupId/members", authMiddleware, (req, res) => {
    const parsed = insertMemberSchema.safeParse({ ...req.body, groupId: Number(req.params.groupId) });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const member = storage.createMember(parsed.data);
    res.status(201).json(member);
  });

  app.patch("/api/members/:id", authMiddleware, (req, res) => {
    const member = storage.updateMember(Number(req.params.id), req.body);
    if (!member) return res.status(404).json({ error: "Member not found" });
    res.json(member);
  });

  app.delete("/api/members/:id", authMiddleware, (req, res) => {
    storage.deleteMember(Number(req.params.id));
    res.status(204).send();
  });

  // ── Sessions ────────────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/sessions", authMiddleware, (req, res) => {
    const sessionList = storage.getSessionsByGroup(Number(req.params.groupId));
    res.json(sessionList);
  });

  app.get("/api/sessions/:id", authMiddleware, (req, res) => {
    const session = storage.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.post("/api/groups/:groupId/sessions", authMiddleware, (req, res) => {
    const parsed = insertSessionSchema.safeParse({
      ...req.body,
      groupId: Number(req.params.groupId),
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const session = storage.createSession(parsed.data);

    // Auto-create expenses from court fee if > 0
    if (session.courtFee > 0) {
      const participantIds: number[] = JSON.parse(session.participantIds || "[]");
      const playtimeData: { memberId: number; minutes: number }[] = JSON.parse(session.playtimeData || "[]");
      const primaryPayer = session.courtFeePaidByMemberId ?? participantIds[0];
      const coPayer = session.courtFeeCoPayerId;
      const payer1IsPlaying = session.payer1IsPlaying !== false; // default true
      const payer2IsPlaying = session.payer2IsPlaying !== false; // default true

      // Determine who owes money:
      // - Players always owe their share
      // - A non-playing payer is excluded from the "owes" side entirely
      // - A playing payer owes their share (balance calc handles the net)
      const owingIds = participantIds; // players always share the cost

      const buildSplit = (ids: number[], total: number) => {
        if (session.splitMethod === "equal" && ids.length > 0) {
          const share = total / ids.length;
          return ids.map(id => ({ memberId: id, amount: Math.round(share * 100) / 100 }));
        }
        if (session.splitMethod === "playtime" && playtimeData.length > 0) {
          const relevant = playtimeData.filter(p => ids.includes(p.memberId));
          const totalMins = relevant.reduce((s, p) => s + p.minutes, 0);
          if (totalMins > 0) {
            return relevant.map(p => ({
              memberId: p.memberId,
              amount: Math.round((p.minutes / totalMins) * total * 100) / 100,
            }));
          }
        }
        return [];
      };

      const addExpense = (desc: string, amount: number, payer: number, split: { memberId: number; amount: number }[]) => {
        if (split.length === 0) return;
        storage.createExpense({ sessionId: session.id, groupId: session.groupId, description: desc, amount, paidByMemberId: payer, splitMethod: session.splitMethod, splitData: JSON.stringify(split), createdAt: new Date().toISOString() });
      };

      if (coPayer && coPayer !== primaryPayer) {
        // Two payers — each pays half
        const half = Math.round((session.courtFee / 2) * 100) / 100;
        const half2 = Math.round((session.courtFee - half) * 100) / 100;
        const halfSplit = buildSplit(owingIds, half);
        const half2Split = buildSplit(owingIds, half2);
        const p1Label = payer1IsPlaying ? "" : " (non-player)";
        const p2Label = payer2IsPlaying ? "" : " (non-player)";
        addExpense(`Court fee — ${session.name}${p1Label}`, half, primaryPayer, halfSplit);
        addExpense(`Court fee — ${session.name}${p2Label}`, half2, coPayer, half2Split);
      } else {
        // Single payer
        const label = payer1IsPlaying ? "" : " (sponsored by non-player)";
        addExpense(`Court fee${label} — ${session.name}`, session.courtFee, primaryPayer, buildSplit(owingIds, session.courtFee));
      }
    }

    res.status(201).json(session);
  });

  app.patch("/api/sessions/:id", authMiddleware, (req, res) => {
    const session = storage.updateSession(Number(req.params.id), req.body);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.delete("/api/sessions/:id", authMiddleware, (req, res) => {
    storage.deleteSession(Number(req.params.id));
    res.status(204).send();
  });

  // ── Expenses ────────────────────────────────────────────────────────────────
  app.get("/api/sessions/:sessionId/expenses", authMiddleware, (req, res) => {
    const expenseList = storage.getExpensesBySession(Number(req.params.sessionId));
    res.json(expenseList);
  });

  app.get("/api/groups/:groupId/expenses", authMiddleware, (req, res) => {
    const expenseList = storage.getExpensesByGroup(Number(req.params.groupId));
    res.json(expenseList);
  });

  app.post("/api/sessions/:sessionId/expenses", authMiddleware, (req, res) => {
    const session = storage.getSession(Number(req.params.sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });

    const parsed = insertExpenseSchema.safeParse({
      ...req.body,
      sessionId: session.id,
      groupId: session.groupId,
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const expense = storage.createExpense(parsed.data);
    res.status(201).json(expense);
  });

  app.delete("/api/expenses/:id", authMiddleware, (req, res) => {
    storage.deleteExpense(Number(req.params.id));
    res.status(204).send();
  });

  // ── Balances ────────────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/balances", authMiddleware, (req, res) => {
    const net = computeBalances(Number(req.params.groupId));
    const transactions = simplifyDebts(net);
    const membersList = storage.getMembersByGroup(Number(req.params.groupId));

    res.json({
      net, // memberId -> net balance
      transactions, // simplified settle-up list
      members: membersList,
    });
  });

  // ── Payments ────────────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/payments", authMiddleware, (req, res) => {
    const paymentList = storage.getPaymentsByGroup(Number(req.params.groupId));
    res.json(paymentList);
  });

  app.post("/api/groups/:groupId/payments", authMiddleware, (req, res) => {
    const parsed = insertPaymentSchema.safeParse({
      ...req.body,
      groupId: Number(req.params.groupId),
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const payment = storage.createPayment(parsed.data);
    res.status(201).json(payment);
  });

  app.delete("/api/payments/:id", authMiddleware, (req, res) => {
    storage.deletePayment(Number(req.params.id));
    res.status(204).send();
  });

  // ── Settle-up report ────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/report", authMiddleware, (req, res) => {
    const groupId = Number(req.params.groupId);
    const group = storage.getGroup(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const membersList = storage.getMembersByGroup(groupId);
    const sessionList = storage.getSessionsByGroup(groupId);
    const allExpenses = storage.getExpensesByGroup(groupId);
    const allPayments = storage.getPaymentsByGroup(groupId);
    const net = computeBalances(groupId);
    const transactions = simplifyDebts(net);

    const memberMap = Object.fromEntries(membersList.map(m => [m.id, m]));

    const sessionSummaries = sessionList.map(s => {
      const sessionExpenses = allExpenses.filter(e => e.sessionId === s.id);
      const total = sessionExpenses.reduce((sum, e) => sum + e.amount, 0);
      return { ...s, total, expenseCount: sessionExpenses.length };
    });

    res.json({
      group,
      members: membersList,
      sessions: sessionSummaries,
      expenses: allExpenses,
      payments: allPayments,
      net,
      transactions,
      memberMap,
      generatedAt: new Date().toISOString(),
    });
  });
}
