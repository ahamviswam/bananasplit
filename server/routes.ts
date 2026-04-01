import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertGroupSchema, insertMemberSchema, insertSessionSchema, insertExpenseSchema, insertPaymentSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { signToken, authMiddleware, getUser } from "./auth";

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
    const token = signToken({ userId: user.id, email: user.email, name: user.name });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
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
    const token = signToken({ userId: user.id, email: user.email, name: user.name });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    const user = getUser(req);
    res.json({ id: user.userId, email: user.email, name: user.name });
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

      let splitData: { memberId: number; amount: number }[] = [];

      if (session.splitMethod === "equal" && participantIds.length > 0) {
        const share = session.courtFee / participantIds.length;
        splitData = participantIds.map(id => ({ memberId: id, amount: Math.round(share * 100) / 100 }));
      } else if (session.splitMethod === "playtime" && playtimeData.length > 0) {
        const totalMinutes = playtimeData.reduce((s, p) => s + p.minutes, 0);
        if (totalMinutes > 0) {
          splitData = playtimeData.map(p => ({
            memberId: p.memberId,
            amount: Math.round((p.minutes / totalMinutes) * session.courtFee * 100) / 100,
          }));
        }
      }

      if (splitData.length > 0 && participantIds.length > 0) {
        const primaryPayer = session.courtFeePaidByMemberId ?? participantIds[0];
        const coPayer = session.courtFeeCoPayerId;

        if (coPayer && coPayer !== primaryPayer) {
          // Split court fee into two separate expense entries — one per payer
          const half = Math.round((session.courtFee / 2) * 100) / 100;
          const half2 = Math.round((session.courtFee - half) * 100) / 100;

          // Each payer's expense: they paid their half, everyone still owes their share of the TOTAL
          storage.createExpense({
            sessionId: session.id,
            groupId: session.groupId,
            description: `Court fee (shared) — ${session.name}`,
            amount: half,
            paidByMemberId: primaryPayer,
            splitMethod: session.splitMethod,
            splitData: JSON.stringify(splitData.map(s => ({ memberId: s.memberId, amount: Math.round((s.amount / 2) * 100) / 100 }))),
            createdAt: new Date().toISOString(),
          });
          storage.createExpense({
            sessionId: session.id,
            groupId: session.groupId,
            description: `Court fee (shared) — ${session.name}`,
            amount: half2,
            paidByMemberId: coPayer,
            splitMethod: session.splitMethod,
            splitData: JSON.stringify(splitData.map(s => ({ memberId: s.memberId, amount: Math.round((s.amount / 2) * 100) / 100 }))),
            createdAt: new Date().toISOString(),
          });
        } else {
          storage.createExpense({
            sessionId: session.id,
            groupId: session.groupId,
            description: `Court fee — ${session.name}`,
            amount: session.courtFee,
            paidByMemberId: primaryPayer,
            splitMethod: session.splitMethod,
            splitData: JSON.stringify(splitData),
            createdAt: new Date().toISOString(),
          });
        }
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
