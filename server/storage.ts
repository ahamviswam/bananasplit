import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import {
  users, groups, members, sessions, expenses, payments,
  type User, type InsertUser,
  type Group, type InsertGroup,
  type Member, type InsertMember,
  type Session, type InsertSession,
  type Expense, type InsertExpense,
  type Payment, type InsertPayment,
} from "@shared/schema";

const dbPath = process.env.DATABASE_PATH || "bananasplit.db";
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

// Run migrations for new columns (ignore errors if already exist)
const migrations = [
  "ALTER TABLE sessions ADD COLUMN court_fee_paid_by_member_id INTEGER",
  "ALTER TABLE sessions ADD COLUMN court_fee_co_payer_id INTEGER",
  "ALTER TABLE sessions ADD COLUMN num_courts INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE groups ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];
for (const m of migrations) {
  try { sqlite.exec(m); } catch { /* column already exists */ }
}

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    court_fee REAL NOT NULL DEFAULT 0,
    court_fee_paid_by_member_id INTEGER,
    court_fee_co_payer_id INTEGER,
    num_courts INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    split_method TEXT NOT NULL DEFAULT 'equal',
    playtime_data TEXT NOT NULL DEFAULT '[]',
    participant_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_by_member_id INTEGER NOT NULL,
    split_method TEXT NOT NULL DEFAULT 'equal',
    split_data TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    from_member_id INTEGER NOT NULL,
    to_member_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export interface IStorage {
  // Users
  getUserByEmail(email: string): User | undefined;
  getUserById(id: number): User | undefined;
  createUser(data: InsertUser): User;

  // Groups
  getGroups(ownerId: number): Group[];
  getGroup(id: number): Group | undefined;
  createGroup(data: InsertGroup): Group;
  updateGroup(id: number, data: Partial<InsertGroup>): Group | undefined;
  deleteGroup(id: number): void;

  // Members
  getMembersByGroup(groupId: number): Member[];
  getMember(id: number): Member | undefined;
  createMember(data: InsertMember): Member;
  updateMember(id: number, data: Partial<InsertMember>): Member | undefined;
  deleteMember(id: number): void;

  // Sessions
  getSessionsByGroup(groupId: number): Session[];
  getSession(id: number): Session | undefined;
  createSession(data: InsertSession): Session;
  updateSession(id: number, data: Partial<InsertSession>): Session | undefined;
  deleteSession(id: number): void;

  // Expenses
  getExpensesBySession(sessionId: number): Expense[];
  getExpensesByGroup(groupId: number): Expense[];
  createExpense(data: InsertExpense): Expense;
  deleteExpense(id: number): void;

  // Payments
  getPaymentsByGroup(groupId: number): Payment[];
  createPayment(data: InsertPayment): Payment;
  deletePayment(id: number): void;
}

export class Storage implements IStorage {
  // ── Users ────────────────────────────────────────────────────────────────────
  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  createUser(data: InsertUser): User {
    return db.insert(users).values(data).returning().get();
  }

  // ── Groups ───────────────────────────────────────────────────────────────────
  getGroups(ownerId: number): Group[] {
    return db.select().from(groups).where(eq(groups.ownerId, ownerId)).all();
  }

  getGroup(id: number): Group | undefined {
    return db.select().from(groups).where(eq(groups.id, id)).get();
  }

  createGroup(data: InsertGroup): Group {
    return db.insert(groups).values(data).returning().get();
  }

  updateGroup(id: number, data: Partial<InsertGroup>): Group | undefined {
    return db.update(groups).set(data).where(eq(groups.id, id)).returning().get();
  }

  deleteGroup(id: number): void {
    db.delete(groups).where(eq(groups.id, id)).run();
  }

  // ── Members ──────────────────────────────────────────────────────────────────
  getMembersByGroup(groupId: number): Member[] {
    return db.select().from(members).where(eq(members.groupId, groupId)).all();
  }

  getMember(id: number): Member | undefined {
    return db.select().from(members).where(eq(members.id, id)).get();
  }

  createMember(data: InsertMember): Member {
    return db.insert(members).values(data).returning().get();
  }

  updateMember(id: number, data: Partial<InsertMember>): Member | undefined {
    return db.update(members).set(data).where(eq(members.id, id)).returning().get();
  }

  deleteMember(id: number): void {
    db.delete(members).where(eq(members.id, id)).run();
  }

  // ── Sessions ─────────────────────────────────────────────────────────────────
  getSessionsByGroup(groupId: number): Session[] {
    return db.select().from(sessions).where(eq(sessions.groupId, groupId)).all();
  }

  getSession(id: number): Session | undefined {
    return db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  createSession(data: InsertSession): Session {
    return db.insert(sessions).values(data).returning().get();
  }

  updateSession(id: number, data: Partial<InsertSession>): Session | undefined {
    return db.update(sessions).set(data).where(eq(sessions.id, id)).returning().get();
  }

  deleteSession(id: number): void {
    db.delete(sessions).where(eq(sessions.id, id)).run();
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────
  getExpensesBySession(sessionId: number): Expense[] {
    return db.select().from(expenses).where(eq(expenses.sessionId, sessionId)).all();
  }

  getExpensesByGroup(groupId: number): Expense[] {
    return db.select().from(expenses).where(eq(expenses.groupId, groupId)).all();
  }

  createExpense(data: InsertExpense): Expense {
    return db.insert(expenses).values(data).returning().get();
  }

  deleteExpense(id: number): void {
    db.delete(expenses).where(eq(expenses.id, id)).run();
  }

  // ── Payments ─────────────────────────────────────────────────────────────────
  getPaymentsByGroup(groupId: number): Payment[] {
    return db.select().from(payments).where(eq(payments.groupId, groupId)).all();
  }

  createPayment(data: InsertPayment): Payment {
    return db.insert(payments).values(data).returning().get();
  }

  deletePayment(id: number): void {
    db.delete(payments).where(eq(payments.id, id)).run();
  }
}

export const storage = new Storage();
