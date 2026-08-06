import { GoogleGenAI } from "@google/genai";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cxCustomerProfilesTable,
  cxFeedbackTable,
  cxTicketMessagesTable,
  cxTicketsTable,
  cxUsersTable,
} from "@workspace/db/schema";
import {
  CreateCxTicketBody,
  GetCxCopilotBody,
  GetCxCustomer360Params,
  GetCxInsightsResponse,
  GetCxTicketParams,
  GetCxTicketResponse,
  ListCxCustomersResponse,
  ListCxTicketsResponse,
  SendCxChatBody,
  SendCxChatResponse,
  UpdateCxTicketStatusBody,
  UpdateCxTicketStatusParams,
} from "@workspace/api-zod";
import { generateJson } from "../lib/ai";
import { logger } from "../lib/logger";
import { requireCxRole } from "../middlewares/cxAuth";

const router: IRouter = Router();
const staff = requireCxRole("agent", "admin");
const admin = requireCxRole("admin");

type UserRow = typeof cxUsersTable.$inferSelect;
type TicketRow = typeof cxTicketsTable.$inferSelect;
type MessageRow = typeof cxTicketMessagesTable.$inferSelect;

function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function displayName(user?: UserRow | null): string {
  return user?.fullName ?? "Customer";
}

function ticketView(ticket: TicketRow, customer?: UserRow | null) {
  return {
    id: ticket.id,
    number: ticket.ticketNumber,
    subject: ticket.subject,
    customer: displayName(customer),
    customerId: ticket.customerId,
    status: ticket.status,
    priority: ticket.priority,
    sentiment: ticket.sentimentLabel,
    category: ticket.domainCategory,
    channel: ticket.channel,
    updatedAt: relativeTime(ticket.updatedAt),
    sla: ticket.sla,
    summary: ticket.aiSummary ?? ticket.description,
  };
}

function messageView(message: MessageRow) {
  return {
    id: message.id,
    sender: message.senderName,
    senderType: message.senderType,
    text: message.message,
    time: message.createdAt.toISOString(),
    sentiment: undefined,
  };
}

async function getTicket(id: string, user: UserRow): Promise<{ ticket: TicketRow; customer: UserRow | undefined } | null> {
  const [result] = await db
    .select({ ticket: cxTicketsTable, customer: cxUsersTable })
    .from(cxTicketsTable)
    .leftJoin(cxUsersTable, eq(cxTicketsTable.customerId, cxUsersTable.id))
    .where(
      and(
        eq(cxTicketsTable.id, id),
        user.role === "customer" ? eq(cxTicketsTable.customerId, user.id) : undefined,
      ),
    )
    .limit(1);
  return result ? { ticket: result.ticket, customer: result.customer ?? undefined } : null;
}

async function aiJson<T>(prompt: string, fallback: T, feature: string): Promise<T> {
  try {
    return await generateJson<T>(prompt);
  } catch (error) {
    logger.warn(
      { feature, err: error instanceof Error ? error.message : String(error) },
      "Using CX AI fallback response",
    );
    return fallback;
  }
}

function chatFallback(message: string) {
  const normalized = message.toLowerCase();

  if (/(refund|charge|billing|invoice|payment|price|subscription)/.test(normalized)) {
    return {
      message: "I can help with billing questions. Tell me whether you need to understand a charge, update your plan, or request a refund, and I’ll point you to the right next step.",
      intent: "billing",
      suggestedActions: ["Review billing details", "Ask about a refund", "Talk to an agent"],
    };
  }

  if (/(password|login|sign in|signin|access|account)/.test(normalized)) {
    return {
      message: "For account access, first try the password reset option on the sign-in screen. If you’re still blocked, share the exact step where it fails and I’ll help narrow it down.",
      intent: "account_access",
      suggestedActions: ["Reset my password", "Troubleshoot sign-in", "Talk to an agent"],
    };
  }

  if (/(ship|shipping|delivery|deliver|order|tracking)/.test(normalized)) {
    return {
      message: "I can help track an order or clarify delivery timing. Share the order number if you have it, or tell me what delivery update you expected.",
      intent: "order_delivery",
      suggestedActions: ["Find an order", "Check delivery status", "Talk to an agent"],
    };
  }

  if (/(ticket|case|support request|issue|problem|bug|broken)/.test(normalized)) {
    return {
      message: `I understand you need help with: “${message}”. I can help you open a support ticket, or you can share what happened and what outcome you want so we can capture the right details.`,
      intent: "support_request",
      suggestedActions: ["Open a ticket", "Add more details", "Talk to an agent"],
    };
  }

  return {
    message: `Thanks for reaching out about “${message}”. I’m ready to help. Add a little more context—what are you trying to do, and what happened instead?`,
    intent: "general_support",
    suggestedActions: ["Open a ticket", "Add more details", "Talk to an agent"],
  };
}

router.get("/cx/dashboard", staff, async (req, res): Promise<void> => {
  const [openCount, atRiskCount, ticketCount, recentTickets] = await Promise.all([
    db.select({ value: count() }).from(cxTicketsTable).where(inArray(cxTicketsTable.status, ["open", "ai_handling", "in_progress", "escalated"])),
    db.select({ value: count() }).from(cxCustomerProfilesTable).where(sql`${cxCustomerProfilesTable.churnRiskScore} >= 0.7`),
    db.select({ value: count() }).from(cxTicketsTable),
    db
      .select({ ticket: cxTicketsTable, customer: cxUsersTable })
      .from(cxTicketsTable)
      .leftJoin(cxUsersTable, eq(cxTicketsTable.customerId, cxUsersTable.id))
      .orderBy(desc(cxTicketsTable.updatedAt))
      .limit(5),
  ]);
  const open = Number(openCount[0]?.value ?? 0);
  const total = Number(ticketCount[0]?.value ?? 0);
  res.json({
    metrics: [
      { label: "Open conversations", value: String(open), delta: "Live", trend: "up", icon: "inbox" },
      { label: "AI resolution rate", value: total ? `${Math.round((total - open) / total * 100)}%` : "0%", delta: "Live", trend: "up", icon: "sparkles" },
      { label: "Avg. first response", value: "—", delta: "Tracking", trend: "neutral", icon: "clock" },
      { label: "At-risk customers", value: String(atRiskCount[0]?.value ?? 0), delta: "Live", trend: "down", icon: "shield" },
    ],
    sentiment: [],
    volume: [],
    drivers: [],
    recentActivity: recentTickets.map(({ ticket, customer }) => ({
      id: ticket.id,
      title: `Ticket ${ticket.ticketNumber} updated`,
      detail: `${ticket.subject} • ${displayName(customer)}`,
      time: relativeTime(ticket.updatedAt),
      kind: ticket.status,
    })),
  });
});

router.get("/cx/tickets", async (req, res): Promise<void> => {
  const user = req.cxUser!;
  const rows = await db
    .select({ ticket: cxTicketsTable, customer: cxUsersTable })
    .from(cxTicketsTable)
    .leftJoin(cxUsersTable, eq(cxTicketsTable.customerId, cxUsersTable.id))
    .where(user.role === "customer" ? eq(cxTicketsTable.customerId, user.id) : undefined)
    .orderBy(desc(cxTicketsTable.updatedAt));
  res.json(ListCxTicketsResponse.parse(rows.map(({ ticket, customer }) => ticketView(ticket, customer))));
});

router.post("/cx/tickets", async (req, res): Promise<void> => {
  const parsed = CreateCxTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.cxUser!;
  const number = `CX-${Date.now().toString().slice(-7)}`;
  const priority = ["low", "medium", "high", "critical"].includes(parsed.data.priority ?? "") ? parsed.data.priority : "medium";
  const [ticket] = await db
    .insert(cxTicketsTable)
    .values({
      ticketNumber: number,
      customerId: user.id,
      subject: parsed.data.subject,
      description: parsed.data.description,
      domainCategory: parsed.data.category,
      priority: priority as "low" | "medium" | "high" | "critical",
      status: "open",
      sentimentLabel: "neutral",
    })
    .returning();
  await db.insert(cxTicketMessagesTable).values({
    ticketId: ticket.id,
    senderId: user.id,
    senderType: "customer",
    senderName: user.fullName,
    message: parsed.data.description,
  });
  res.status(201).json(ticketView(ticket, user));
});

router.get("/cx/tickets/:id", async (req, res): Promise<void> => {
  const params = GetCxTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const found = await getTicket(params.data.id, req.cxUser!);
  if (!found) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const messages = await db
    .select()
    .from(cxTicketMessagesTable)
    .where(
      and(
        eq(cxTicketMessagesTable.ticketId, found.ticket.id),
        req.cxUser!.role === "customer" ? eq(cxTicketMessagesTable.isInternalNote, false) : undefined,
      ),
    )
    .orderBy(cxTicketMessagesTable.createdAt);
  const detail = { ...ticketView(found.ticket, found.customer), messages: messages.map(messageView) };
  res.json(GetCxTicketResponse.parse(detail));
});

router.patch("/cx/tickets/:id/status", staff, async (req, res): Promise<void> => {
  const params = UpdateCxTicketStatusParams.safeParse(req.params);
  const body = UpdateCxTicketStatusBody.safeParse(req.body);
  const statuses = ["open", "ai_handling", "in_progress", "escalated", "resolved", "closed"];
  if (!params.success || !body.success || !statuses.includes(body.data.status)) {
    res.status(400).json({ error: "Invalid ticket status update" });
    return;
  }
  const found = await getTicket(params.data.id, req.cxUser!);
  if (!found) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const [updated] = await db
    .update(cxTicketsTable)
    .set({
      status: body.data.status as TicketRow["status"],
      sla: body.data.status === "resolved" || body.data.status === "closed" ? "Resolved" : found.ticket.sla,
      updatedAt: new Date(),
    })
    .where(eq(cxTicketsTable.id, found.ticket.id))
    .returning();
  res.json(ticketView(updated, found.customer));
});

router.get("/cx/customers", staff, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ user: cxUsersTable, profile: cxCustomerProfilesTable })
    .from(cxUsersTable)
    .innerJoin(cxCustomerProfilesTable, eq(cxCustomerProfilesTable.userId, cxUsersTable.id))
    .orderBy(cxUsersTable.fullName);
  const ids = rows.map(({ user }) => user.id);
  const openCounts = ids.length
    ? await db
        .select({ customerId: cxTicketsTable.customerId, value: count() })
        .from(cxTicketsTable)
        .where(and(inArray(cxTicketsTable.customerId, ids), inArray(cxTicketsTable.status, ["open", "ai_handling", "in_progress", "escalated"])))
        .groupBy(cxTicketsTable.customerId)
    : [];
  const counts = new Map(openCounts.map((item) => [item.customerId, Number(item.value)]));
  res.json(ListCxCustomersResponse.parse(rows.map(({ user, profile }) => ({
    id: user.id,
    name: user.fullName,
    company: profile.companyName,
    email: user.email,
    ltv: Number(profile.lifetimeValue),
    sentiment: Number(profile.overallSentimentScore),
    churnRisk: Number(profile.churnRiskScore),
    openTickets: counts.get(user.id) ?? 0,
    lastSeen: relativeTime(user.updatedAt),
    initials: user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  }))));
});

router.get("/cx/customers/:id/360", staff, async (req, res): Promise<void> => {
  const params = GetCxCustomer360Params.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db
    .select({ user: cxUsersTable, profile: cxCustomerProfilesTable })
    .from(cxUsersTable)
    .innerJoin(cxCustomerProfilesTable, eq(cxCustomerProfilesTable.userId, cxUsersTable.id))
    .where(eq(cxUsersTable.id, params.data.id))
    .limit(1);
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const tickets = await db.select().from(cxTicketsTable).where(eq(cxTicketsTable.customerId, customer.user.id));
  const messages = tickets.length
    ? await db.select().from(cxTicketMessagesTable).where(inArray(cxTicketMessagesTable.ticketId, tickets.map((ticket) => ticket.id))).orderBy(cxTicketMessagesTable.createdAt)
    : [];
  const feedback = await db.select().from(cxFeedbackTable).where(eq(cxFeedbackTable.customerId, customer.user.id)).orderBy(desc(cxFeedbackTable.createdAt)).limit(20);
  res.json({
    id: customer.user.id,
    name: customer.user.fullName,
    company: customer.profile.companyName,
    email: customer.user.email,
    ltv: Number(customer.profile.lifetimeValue),
    sentiment: Number(customer.profile.overallSentimentScore),
    churnRisk: Number(customer.profile.churnRiskScore),
    openTickets: tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length,
    lastSeen: relativeTime(customer.user.updatedAt),
    initials: customer.user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    timeline: messages.map(messageView),
    feedback: feedback.map((item) => item.qualitativeFeedback).filter((item): item is string => Boolean(item)),
  });
});

router.get("/cx/insights", staff, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ category: cxTicketsTable.domainCategory, value: count() })
    .from(cxTicketsTable)
    .groupBy(cxTicketsTable.domainCategory)
    .orderBy(desc(count()));
  const themes = rows.map((row) => ({
    label: row.category,
    description: `${row.category} is a recurring customer conversation category.`,
    impact: Number(row.value) >= 10 ? "High" : "Medium",
    volume: Number(row.value),
  }));
  const data = {
    summary: themes.length ? `The largest current source of customer contact is ${themes[0].label}. Review the conversation details before changing policy or product.` : "Insights will appear after customers create conversations.",
    themes,
    opportunities: themes.slice(0, 3).map((theme) => ({
      title: `Review ${theme.label} workflows`,
      description: `Use recent tickets in ${theme.label} to identify a clear owner and next experiment.`,
      owner: "CX Operations",
      confidence: 0.7,
    })),
  };
  res.json(GetCxInsightsResponse.parse(data));
});

router.post("/cx/chat", async (req, res): Promise<void> => {
  const parsed = SendCxChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.cxUser!;
  const ownTickets = await db
    .select({ subject: cxTicketsTable.subject, status: cxTicketsTable.status })
    .from(cxTicketsTable)
    .where(eq(cxTicketsTable.customerId, user.id))
    .orderBy(desc(cxTicketsTable.updatedAt))
    .limit(10);
  const fallback = chatFallback(parsed.data.message);
  const reply = await aiJson<typeof fallback>(
    `You are OmniCX customer support assistant. Return only JSON with message, intent, and suggestedActions (string array). Never claim you completed an action. User: ${user.fullName}. Their tickets: ${JSON.stringify(ownTickets)}. Message: ${parsed.data.message}`,
    fallback,
    "chat",
  );
  res.json(SendCxChatResponse.parse(reply));
});

router.post("/cx/copilot", staff, async (req, res): Promise<void> => {
  const parsed = GetCxCopilotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const found = await getTicket(parsed.data.ticketId, req.cxUser!);
  if (!found) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const messages = await db.select().from(cxTicketMessagesTable).where(eq(cxTicketMessagesTable.ticketId, found.ticket.id)).orderBy(cxTicketMessagesTable.createdAt);
  const fallback = {
    suggestedReplies: [{ tone: parsed.data.tone, replyText: "I’m reviewing this with the team and will follow up with a clear next step." }],
    handoverNotes: `${found.ticket.subject} requires an agent review.`,
    recommendedNextActions: ["Review the conversation", "Confirm ownership", "Send a clear update"],
  };
  const result = await aiJson<typeof fallback>(
    `You are a support agent copilot. Return only JSON with suggestedReplies (tone and replyText), handoverNotes, and recommendedNextActions. Do not invent account facts. Ticket: ${JSON.stringify(found.ticket)} Messages: ${JSON.stringify(messages)} Requested tone: ${parsed.data.tone}`,
    fallback,
    "copilot",
  );
  res.json(result);
});

export default router;