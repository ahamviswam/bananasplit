/**
 * BananaSplit in-memory store with IndexedDB persistence.
 *
 * - On first load: all data is loaded from IndexedDB into memory.
 * - Every write: immediately mirrored to IndexedDB so data survives refresh.
 * - Reads: always from memory (instant, no async needed).
 *
 * This means the GitHub Pages version (no Express backend) persists data
 * across page refreshes, browser restarts, etc. — just like a real DB.
 */

import { loadAll, putRecord, deleteRecord } from "./db";
import type {
  Group, Member, Session, Expense, Payment,
} from "@shared/schema";

// ── In-memory tables ──────────────────────────────────────────────────────────
// Local users for offline/GitHub Pages mode
type LocalUser = { id: number; email: string; name: string; passwordHash: string };
let localUsers: LocalUser[] = [];
let currentUserId = 1; // default offline user id

let groups: Group[] = [];
let members: Member[] = [];
let sessions: Session[] = [];
let expenses: Expense[] = [];
let payments: Payment[] = [];

let _id = 1;
const nextId = () => _id++;

// ── Initialization ────────────────────────────────────────────────────────────
let _initPromise: Promise<void> | null = null;

export function initStore(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      [groups, members, sessions, expenses, payments] = await Promise.all([
        loadAll<Group>("groups"),
        loadAll<Member>("members"),
        loadAll<Session>("sessions"),
        loadAll<Expense>("expenses"),
        loadAll<Payment>("payments"),
      ]);
      // Restore local offline users (stored with negative IDs)
      localUsers = (groups.filter((g: any) => g.id < 0) as any[]).map((u: any) => ({
        id: -u.id, email: u.email, name: u.name, passwordHash: "offline"
      }));
      groups = groups.filter(g => g.id > 0);
      // Restore currentUserId from saved auth token
      try {
        const token = sessionStorage.getItem("bs_auth_token") || localStorage.getItem("bs_auth_token");
        if (token?.startsWith("offline-")) {
          currentUserId = Number(token.replace("offline-", ""));
        }
      } catch {}
      // Set _id above the max existing id so new records don't clash
      const allIds = [
        ...groups.map(x => x.id),
        ...members.map(x => x.id),
        ...sessions.map(x => x.id),
        ...expenses.map(x => x.id),
        ...payments.map(x => x.id),
      ];
      if (allIds.length > 0) _id = Math.max(...allIds) + 1;
    } catch (e) {
      // IndexedDB unavailable (e.g. private browsing on some browsers) — silent fallback
      console.warn("IndexedDB unavailable, using in-memory only:", e);
    }
  })();
  return _initPromise;
}

// ── Balance helpers ───────────────────────────────────────────────────────────
function computeBalances(groupId: number) {
  const membersList = members.filter(m => m.groupId === groupId);
  const allExpenses = expenses.filter(e => e.groupId === groupId);
  const allPayments = payments.filter(p => p.groupId === groupId);

  const net: Record<number, number> = {};
  for (const m of membersList) net[m.id] = 0;

  for (const expense of allExpenses) {
    const participants = JSON.parse(expense.splitData || "[]") as { memberId: number; amount: number }[];
    net[expense.paidByMemberId] = (net[expense.paidByMemberId] ?? 0) + expense.amount;
    for (const p of participants) {
      net[p.memberId] = (net[p.memberId] ?? 0) - p.amount;
    }
  }
  for (const payment of allPayments) {
    net[payment.fromMemberId] = (net[payment.fromMemberId] ?? 0) + payment.amount;
    net[payment.toMemberId] = (net[payment.toMemberId] ?? 0) - payment.amount;
  }
  return net;
}

function simplifyDebts(net: Record<number, number>) {
  const creditors: { id: number; amount: number }[] = [];
  const debtors: { id: number; amount: number }[] = [];
  for (const [id, balance] of Object.entries(net)) {
    const r = Math.round(balance * 100) / 100;
    if (r > 0.005) creditors.push({ id: Number(id), amount: r });
    else if (r < -0.005) debtors.push({ id: Number(id), amount: Math.abs(r) });
  }
  const txns: { from: number; to: number; amount: number }[] = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci], d = debtors[di];
    const amt = Math.round(Math.min(c.amount, d.amount) * 100) / 100;
    if (amt > 0.005) txns.push({ from: d.id, to: c.id, amount: amt });
    c.amount -= amt; d.amount -= amt;
    if (c.amount < 0.005) ci++;
    if (d.amount < 0.005) di++;
  }
  return txns;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export function handleMemoryRequest(method: string, path: string, body?: any): any {
  const now = new Date().toISOString();
  const today = now.split("T")[0];

  // ── Auth (offline mode — simple email+name registration, no real passwords) ————————
  if (method === "POST" && path === "/api/auth/register") {
    const { email, name } = body;
    const existing = localUsers.find(u => u.email === email?.toLowerCase());
    if (existing) throw { status: 409, message: "Email already registered" };
    const user: LocalUser = { id: nextId(), email: email.toLowerCase(), name, passwordHash: "offline" };
    localUsers.push(user);
    putRecord("groups", { id: -user.id, ...user } as any); // persist user id (fire-and-forget)
    currentUserId = user.id;
    return { token: `offline-${user.id}`, user: { id: user.id, email: user.email, name: user.name } };
  }

  if (method === "POST" && path === "/api/auth/login") {
    const { email } = body;
    const user = localUsers.find(u => u.email === email?.toLowerCase());
    if (!user) throw { status: 401, message: "No account found. Please register first." };
    currentUserId = user.id;
    return { token: `offline-${user.id}`, user: { id: user.id, email: user.email, name: user.name } };
  }

  if (method === "GET" && path === "/api/auth/me") {
    const user = localUsers.find(u => u.id === currentUserId);
    if (!user) throw { status: 401, message: "Not authenticated" };
    return { id: user.id, email: user.email, name: user.name };
  }

  // ── Groups ──────────────────────────────────────────────────────────────────
  if (method === "GET" && path === "/api/groups")
    return groups.filter(g => g.ownerId === currentUserId || g.ownerId === 0);

  if (method === "GET" && path.match(/^\/api\/groups\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    const g = groups.find(x => x.id === id);
    if (!g) throw { status: 404, message: "Group not found" };
    return g;
  }

  if (method === "POST" && path === "/api/groups") {
    const g: Group = { id: nextId(), ownerId: currentUserId, name: body.name, description: body.description ?? null, createdAt: now };
    groups.push(g);
    putRecord("groups", g);
    return g;
  }

  if (method === "PATCH" && path.match(/^\/api\/groups\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    const idx = groups.findIndex(x => x.id === id);
    if (idx === -1) throw { status: 404, message: "Group not found" };
    groups[idx] = { ...groups[idx], ...body };
    putRecord("groups", groups[idx]);
    return groups[idx];
  }

  if (method === "DELETE" && path.match(/^\/api\/groups\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    groups = groups.filter(x => x.id !== id);
    deleteRecord("groups", id);
    return null;
  }

  // ── Members ─────────────────────────────────────────────────────────────────
  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/members$/)) {
    const gid = Number(path.split("/")[3]);
    return members.filter(m => m.groupId === gid);
  }

  if (method === "POST" && path.match(/^\/api\/groups\/\d+\/members$/)) {
    const gid = Number(path.split("/")[3]);
    const m: Member = { id: nextId(), groupId: gid, name: body.name, color: body.color };
    members.push(m);
    putRecord("members", m);
    return m;
  }

  if (method === "PATCH" && path.match(/^\/api\/members\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    const idx = members.findIndex(x => x.id === id);
    if (idx === -1) throw { status: 404, message: "Member not found" };
    members[idx] = { ...members[idx], ...body };
    putRecord("members", members[idx]);
    return members[idx];
  }

  if (method === "DELETE" && path.match(/^\/api\/members\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    members = members.filter(x => x.id !== id);
    deleteRecord("members", id);
    return null;
  }

  // ── Sessions ────────────────────────────────────────────────────────────────
  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/sessions$/)) {
    const gid = Number(path.split("/")[3]);
    return sessions.filter(s => s.groupId === gid);
  }

  if (method === "GET" && path.match(/^\/api\/sessions\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    const s = sessions.find(x => x.id === id);
    if (!s) throw { status: 404, message: "Session not found" };
    return s;
  }

  if (method === "POST" && path.match(/^\/api\/groups\/\d+\/sessions$/)) {
    const gid = Number(path.split("/")[3]);
    const s: Session = {
      id: nextId(),
      groupId: gid,
      name: body.name,
      date: body.date,
      courtFee: Number(body.courtFee) || 0,
      courtFeePaidByMemberId: body.courtFeePaidByMemberId ? Number(body.courtFeePaidByMemberId) : null,
      courtFeeCoPayerId: body.courtFeeCoPayerId ? Number(body.courtFeeCoPayerId) : null,
      numCourts: Number(body.numCourts) || 1,
      notes: body.notes ?? null,
      splitMethod: body.splitMethod ?? "equal",
      playtimeData: body.playtimeData ?? "[]",
      participantIds: body.participantIds ?? "[]",
      createdAt: now,
    };
    sessions.push(s);
    putRecord("sessions", s);

    // Auto-create court fee expense(s)
    if (s.courtFee > 0) {
      const participantIds: number[] = JSON.parse(s.participantIds);
      const playtimeData: { memberId: number; minutes: number }[] = JSON.parse(s.playtimeData);
      let splitData: { memberId: number; amount: number }[] = [];

      if (s.splitMethod === "equal" && participantIds.length > 0) {
        const share = s.courtFee / participantIds.length;
        splitData = participantIds.map(id => ({ memberId: id, amount: Math.round(share * 100) / 100 }));
      } else if (s.splitMethod === "playtime" && playtimeData.length > 0) {
        const totalMins = playtimeData.reduce((sum, p) => sum + p.minutes, 0);
        if (totalMins > 0) {
          splitData = playtimeData.map(p => ({
            memberId: p.memberId,
            amount: Math.round((p.minutes / totalMins) * s.courtFee * 100) / 100,
          }));
        }
      }

      if (splitData.length > 0 && participantIds.length > 0) {
        const primaryPayer = s.courtFeePaidByMemberId ?? participantIds[0];
        const coPayer = s.courtFeeCoPayerId;

        const addExpense = (desc: string, amount: number, payer: number, split: { memberId: number; amount: number }[]) => {
          const e: Expense = {
            id: nextId(),
            sessionId: s.id,
            groupId: gid,
            description: desc,
            amount,
            paidByMemberId: payer,
            splitMethod: s.splitMethod,
            splitData: JSON.stringify(split),
            createdAt: now,
          };
          expenses.push(e);
          putRecord("expenses", e);
        };

        if (coPayer && coPayer !== primaryPayer) {
          const half = Math.round((s.courtFee / 2) * 100) / 100;
          const half2 = Math.round((s.courtFee - half) * 100) / 100;
          const halfSplit = splitData.map(x => ({ memberId: x.memberId, amount: Math.round((x.amount / 2) * 100) / 100 }));
          addExpense(`Court fee (shared) — ${s.name}`, half, primaryPayer, halfSplit);
          addExpense(`Court fee (shared) — ${s.name}`, half2, coPayer, halfSplit);
        } else {
          addExpense(`Court fee — ${s.name}`, s.courtFee, primaryPayer, splitData);
        }
      }
    }
    return s;
  }

  if (method === "DELETE" && path.match(/^\/api\/sessions\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    sessions = sessions.filter(x => x.id !== id);
    deleteRecord("sessions", id);
    return null;
  }

  // ── Expenses ────────────────────────────────────────────────────────────────
  if (method === "GET" && path.match(/^\/api\/sessions\/\d+\/expenses$/)) {
    const sid = Number(path.split("/")[3]);
    return expenses.filter(e => e.sessionId === sid);
  }

  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/expenses$/)) {
    const gid = Number(path.split("/")[3]);
    return expenses.filter(e => e.groupId === gid);
  }

  if (method === "POST" && path.match(/^\/api\/sessions\/\d+\/expenses$/)) {
    const sid = Number(path.split("/")[3]);
    const session = sessions.find(x => x.id === sid);
    if (!session) throw { status: 404, message: "Session not found" };
    const e: Expense = {
      id: nextId(),
      sessionId: sid,
      groupId: session.groupId,
      description: body.description,
      amount: Number(body.amount),
      paidByMemberId: Number(body.paidByMemberId),
      splitMethod: body.splitMethod ?? "equal",
      splitData: body.splitData ?? "[]",
      createdAt: now,
    };
    expenses.push(e);
    putRecord("expenses", e);
    return e;
  }

  if (method === "DELETE" && path.match(/^\/api\/expenses\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    expenses = expenses.filter(x => x.id !== id);
    deleteRecord("expenses", id);
    return null;
  }

  // ── Balances ─────────────────────────────────────────────────────────────────
  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/balances$/)) {
    const gid = Number(path.split("/")[3]);
    const net = computeBalances(gid);
    return { net, transactions: simplifyDebts(net), members: members.filter(m => m.groupId === gid) };
  }

  // ── Payments ─────────────────────────────────────────────────────────────────
  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/payments$/)) {
    const gid = Number(path.split("/")[3]);
    return payments.filter(p => p.groupId === gid);
  }

  if (method === "POST" && path.match(/^\/api\/groups\/\d+\/payments$/)) {
    const gid = Number(path.split("/")[3]);
    const p: Payment = {
      id: nextId(),
      groupId: gid,
      fromMemberId: Number(body.fromMemberId),
      toMemberId: Number(body.toMemberId),
      amount: Number(body.amount),
      note: body.note ?? null,
      date: body.date ?? today,
      createdAt: now,
    };
    payments.push(p);
    putRecord("payments", p);
    return p;
  }

  if (method === "DELETE" && path.match(/^\/api\/payments\/\d+$/)) {
    const id = Number(path.split("/")[3]);
    payments = payments.filter(x => x.id !== id);
    deleteRecord("payments", id);
    return null;
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/report$/)) {
    const gid = Number(path.split("/")[3]);
    const group = groups.find(x => x.id === gid);
    if (!group) throw { status: 404, message: "Group not found" };
    const membersList = members.filter(m => m.groupId === gid);
    const sessionList = sessions.filter(s => s.groupId === gid);
    const allExpenses = expenses.filter(e => e.groupId === gid);
    const allPayments = payments.filter(p => p.groupId === gid);
    const net = computeBalances(gid);
    const transactions = simplifyDebts(net);
    const memberMap = Object.fromEntries(membersList.map(m => [m.id, m]));
    const sessionSummaries = sessionList.map(s => {
      const se = allExpenses.filter(e => e.sessionId === s.id);
      return { ...s, total: se.reduce((sum, e) => sum + e.amount, 0), expenseCount: se.length };
    });
    return { group, members: membersList, sessions: sessionSummaries, expenses: allExpenses, payments: allPayments, net, transactions, memberMap, generatedAt: now };
  }

  throw { status: 404, message: `Unknown route: ${method} ${path}` };
}
