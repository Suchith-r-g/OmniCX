import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  decimal,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const cxRoleEnum = pgEnum("cx_role", ["customer", "agent", "admin"]);
export const cxTicketStatusEnum = pgEnum("cx_ticket_status", [
  "open",
  "ai_handling",
  "in_progress",
  "escalated",
  "resolved",
  "closed",
]);
export const cxPriorityEnum = pgEnum("cx_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const cxSentimentEnum = pgEnum("cx_sentiment", [
  "positive",
  "neutral",
  "negative",
  "frustrated",
]);
export const cxSenderTypeEnum = pgEnum("cx_sender_type", [
  "customer",
  "agent",
  "ai_assistant",
  "system",
]);

export const cxUsersTable = pgTable("cx_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  role: cxRoleEnum("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cxCustomerProfilesTable = pgTable("cx_customer_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => cxUsersTable.id, { onDelete: "cascade" }).unique(),
  companyName: varchar("company_name", { length: 160 }).notNull().default("Personal workspace"),
  lifetimeValue: decimal("lifetime_value", { precision: 12, scale: 2 }).notNull().default("0"),
  churnRiskScore: decimal("churn_risk_score", { precision: 5, scale: 2 }).notNull().default("0"),
  overallSentimentScore: decimal("overall_sentiment_score", { precision: 5, scale: 2 }).notNull().default("0.5"),
  preferredChannel: varchar("preferred_channel", { length: 30 }).notNull().default("web"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cxTicketsTable = pgTable("cx_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketNumber: varchar("ticket_number", { length: 24 }).notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => cxUsersTable.id, { onDelete: "cascade" }),
  assignedAgentId: uuid("assigned_agent_id").references(() => cxUsersTable.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: cxTicketStatusEnum("status").notNull().default("open"),
  priority: cxPriorityEnum("priority").notNull().default("medium"),
  domainCategory: varchar("domain_category", { length: 80 }).notNull(),
  sentimentLabel: cxSentimentEnum("sentiment_label").notNull().default("neutral"),
  aiSummary: text("ai_summary"),
  channel: varchar("channel", { length: 30 }).notNull().default("web"),
  sla: varchar("sla", { length: 50 }).notNull().default("2h 30m left"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cxTicketMessagesTable = pgTable("cx_ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => cxTicketsTable.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => cxUsersTable.id, { onDelete: "set null" }),
  senderType: cxSenderTypeEnum("sender_type").notNull(),
  senderName: varchar("sender_name", { length: 120 }).notNull(),
  message: text("message").notNull(),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }),
  isInternalNote: boolean("is_internal_note").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cxFeedbackTable = pgTable("cx_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").references(() => cxTicketsTable.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").notNull().references(() => cxUsersTable.id, { onDelete: "cascade" }),
  csatRating: varchar("csat_rating", { length: 2 }).notNull(),
  npsScore: varchar("nps_score", { length: 2 }),
  qualitativeFeedback: text("qualitative_feedback"),
  extractedTopics: jsonb("extracted_topics").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCxUserSchema = createInsertSchema(cxUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCxCustomerProfileSchema = createInsertSchema(cxCustomerProfilesTable).omit({ id: true, createdAt: true });
export const insertCxTicketSchema = createInsertSchema(cxTicketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCxMessageSchema = createInsertSchema(cxTicketMessagesTable).omit({ id: true, createdAt: true });
export const insertCxFeedbackSchema = createInsertSchema(cxFeedbackTable).omit({ id: true, createdAt: true });

export type CxUser = typeof cxUsersTable.$inferSelect;
export type InsertCxUser = z.infer<typeof insertCxUserSchema>;
export type CxCustomerProfile = typeof cxCustomerProfilesTable.$inferSelect;
export type CxTicket = typeof cxTicketsTable.$inferSelect;
export type CxTicketMessage = typeof cxTicketMessagesTable.$inferSelect;
export type CxFeedback = typeof cxFeedbackTable.$inferSelect;