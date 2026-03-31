import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Groups ────────────────────────────────────────────────────────────────────
export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const insertGroupSchema = createInsertSchema(groups).omit({ id: true });
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

// ── Members ───────────────────────────────────────────────────────────────────
export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(), // hex color for avatar
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;

// ── Sessions ──────────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull(),
  name: text("name").notNull(),
  date: text("date").notNull(), // ISO date string
  courtFee: real("court_fee").notNull().default(0),
  courtFeePaidByMemberId: integer("court_fee_paid_by_member_id"),
  courtFeeCoPayerId: integer("court_fee_co_payer_id"), // second person who splits the court fee
  numCourts: integer("num_courts").notNull().default(1),
  notes: text("notes"),
  splitMethod: text("split_method").notNull().default("equal"), // "equal" | "playtime"
  // JSON array of { memberId, minutes } for playtime split
  playtimeData: text("playtime_data").notNull().default("[]"),
  // JSON array of memberIds who participated
  participantIds: text("participant_ids").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ── Expenses ──────────────────────────────────────────────────────────────────
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  groupId: integer("group_id").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  paidByMemberId: integer("paid_by_member_id").notNull(),
  splitMethod: text("split_method").notNull().default("equal"), // "equal" | "playtime" | "custom"
  // JSON array of { memberId, amount } for custom splits
  splitData: text("split_data").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// ── Payments (settle-up) ──────────────────────────────────────────────────────
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull(),
  fromMemberId: integer("from_member_id").notNull(),
  toMemberId: integer("to_member_id").notNull(),
  amount: real("amount").notNull(),
  note: text("note"),
  date: text("date").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
