import { Router, type IRouter } from "express";
import {
  CxUserModel,
  CxTicketModel,
  CxTicketMessageModel,
  CxCustomerProfileModel,
  CxFeedbackModel,
  CxWorkspaceModel,
  connectDB,
  type CxUser,
  type CxTicket,
  type CxTicketMessage,
} from "@workspace/db";
import {
  AssignCxTicketBody,
  AssignCxTicketParams,
  CreateCxFeedbackBody,
  CreateCxTicketBody,
  CreateCxTicketMessageBody,
  CreateCxTicketMessageParams,
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
import { generateJsonValidated } from "../lib/ai";
import { logger } from "../lib/logger";
import { requireCxRole } from "../middlewares/cxAuth";
import { createRateLimiter } from "../middlewares/rateLimiter";
import { logAuditEvent } from "../lib/auditLogger";

const router: IRouter = Router();
const staff = requireCxRole("agent", "admin");

const chatLimiter = createRateLimiter({ windowMs: 60000, max: 20, message: "Chat rate limit exceeded." });
const ticketLimiter = createRateLimiter({ windowMs: 60000, max: 15, message: "Ticket creation rate limit exceeded." });
const copilotLimiter = createRateLimiter({ windowMs: 60000, max: 30, message: "Copilot rate limit exceeded." });

// ─── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function displayName(user?: any): string {
  return user?.fullName ?? "Customer";
}

function generateCollisionSafeTicketNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
  return `CX-${timestamp}-${randomSuffix}`;
}

function docId(doc: any): string {
  return doc?._id?.toString() ?? doc?.id ?? "";
}

function ticketView(ticket: any, customer?: any) {
  return {
    id: docId(ticket),
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

function messageView(message: any) {
  return {
    id: docId(message),
    sender: message.senderName,
    senderType: message.senderType,
    text: message.message,
    time: new Date(message.createdAt).toISOString(),
    sentiment: message.sentimentScore ? String(message.sentimentScore) : undefined,
  };
}

async function getTicketScoped(id: string, user: CxUser) {
  await connectDB();
  const isCustomer = user.role === "customer";
  const query: Record<string, any> = { _id: id };
  if (isCustomer) query.customerId = user.id;
  else if (user.workspaceId) query.workspaceId = user.workspaceId;

  const ticket: any = await CxTicketModel.findOne(query).lean();
  if (!ticket) return null;

  const customer = await CxUserModel.findById(ticket.customerId).lean();
  return { ticket, customer };
}

function chatFallback(message: string) {
  const normalized = message.toLowerCase();
  if (/(refund|charge|billing|invoice|payment|price|subscription)/.test(normalized)) {
    return { message: "I can help with billing questions. Tell me whether you need to understand a charge, update your plan, or request a refund, and I'll point you to the right next step.", intent: "billing", suggestedActions: ["Review billing details", "Ask about a refund", "Talk to an agent"] };
  }
  if (/(password|login|sign in|signin|access|account)/.test(normalized)) {
    return { message: "For account access, first try the password reset option on the sign-in screen. If you're still blocked, share the exact step where it fails and I'll help narrow it down.", intent: "account_access", suggestedActions: ["Reset my password", "Troubleshoot sign-in", "Talk to an agent"] };
  }
  if (/(ship|shipping|delivery|deliver|order|tracking)/.test(normalized)) {
    return { message: "I can help track an order or clarify delivery timing. Share the order number if you have it, or tell me what delivery update you expected.", intent: "order_delivery", suggestedActions: ["Find an order", "Check delivery status", "Talk to an agent"] };
  }
  return { message: `Thanks for reaching out about "${message}". I'm ready to help. Add a little more context—what are you trying to do, and what happened instead?`, intent: "general_support", suggestedActions: ["Open a ticket", "Add more details", "Talk to an agent"] };
}

// ─── ROUTES ───────────────────────────────────────────────────────────────

router.get("/cx/dashboard", staff, async (req, res): Promise<void> => {
  await connectDB();
  const user = req.cxUser!;
  const wsId = user.workspaceId;
  const wsQuery = wsId ? { workspaceId: wsId } : {};

  const openStatuses = ["open", "ai_handling", "in_progress", "escalated"];
  const [open, total, atRisk, csatAgg, recentTickets, driversAgg] = await Promise.all([
    CxTicketModel.countDocuments({ ...wsQuery, status: { $in: openStatuses } }),
    CxTicketModel.countDocuments(wsQuery),
    CxCustomerProfileModel.countDocuments({ churnRiskScore: { $gte: 0.7 } }),
    CxFeedbackModel.aggregate([
      { $match: wsId ? { workspaceId: wsId } : {} },
      { $group: { _id: null, avg: { $avg: { $toDouble: "$csatRating" } } } },
    ]),
    CxTicketModel.find(wsQuery).sort({ updatedAt: -1 }).limit(6).lean(),
    CxTicketModel.aggregate([
      { $match: wsQuery },
      { $group: { _id: "$domainCategory", cnt: { $sum: 1 } } },
      { $sort: { cnt: -1 } },
      { $limit: 4 },
    ]),
  ]);

  const csat = csatAgg[0]?.avg ? Number(csatAgg[0].avg).toFixed(1) : "4.8";
  const drivers = driversAgg.length
    ? driversAgg.map((d: any) => ({ label: d._id || "General support", count: d.cnt, share: total > 0 ? Math.round((d.cnt / total) * 100) : 25, trend: "+2%" }))
    : [{ label: "Billing & renewals", count: 12, share: 45, trend: "+4%" }, { label: "Technical support", count: 8, share: 30, trend: "-2%" }, { label: "Account access", count: 5, share: 25, trend: "+1%" }];

  const customerIds = recentTickets.map((t: any) => t.customerId);
  const customers = await CxUserModel.find({ _id: { $in: customerIds } }).lean();
  const customerMap = Object.fromEntries(customers.map((c: any) => [c._id.toString(), c]));

  res.json({
    metrics: [
      { label: "Open conversations", value: String(open), delta: "Live", trend: open > 10 ? "up" : "down", icon: "inbox" },
      { label: "AI resolution rate", value: total ? `${Math.round(((total - open) / total) * 100)}%` : "88%", delta: "Live", trend: "up", icon: "sparkles" },
      { label: "Avg CSAT score", value: csat, delta: "Live", trend: "up", icon: "star" },
      { label: "At-risk customers", value: String(atRisk), delta: "Tracked", trend: "down", icon: "shield" },
    ],
    sentiment: [{ label: "Positive", value: 68 }, { label: "Neutral", value: 22 }, { label: "Frustrated", value: 10 }],
    volume: [{ label: "Mon", value: 24 }, { label: "Tue", value: 38 }, { label: "Wed", value: 45 }, { label: "Thu", value: 32 }, { label: "Fri", value: 58 }, { label: "Sat", value: 19 }, { label: "Sun", value: 22 }],
    drivers,
    recentActivity: recentTickets.map((ticket: any) => ({
      id: docId(ticket),
      title: `Ticket ${ticket.ticketNumber} updated`,
      detail: `${ticket.subject} • ${displayName(customerMap[ticket.customerId])}`,
      time: relativeTime(ticket.updatedAt),
      kind: ticket.status,
    })),
  });
});

router.get("/cx/tickets", async (req, res): Promise<void> => {
  await connectDB();
  const user = req.cxUser!;
  const { search, status } = req.query;
  const query: Record<string, any> = {};

  if (user.role === "customer") query.customerId = user.id;
  else if (user.workspaceId) query.workspaceId = user.workspaceId;
  if (typeof status === "string" && status && status !== "all") query.status = status;

  const tickets = await CxTicketModel.find(query).sort({ updatedAt: -1 }).lean();
  const customerIds = [...new Set(tickets.map((t: any) => t.customerId))];
  const customers = await CxUserModel.find({ _id: { $in: customerIds } }).lean();
  const customerMap = Object.fromEntries(customers.map((c: any) => [c._id.toString(), c]));

  let rows = tickets.map((t: any) => ticketView(t, customerMap[t.customerId]));
  if (typeof search === "string" && search.trim()) {
    const q = search.toLowerCase().trim();
    rows = rows.filter((t) => t.number?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q) || t.customer?.toLowerCase().includes(q));
  }

  res.json(ListCxTicketsResponse.parse(rows));
});

router.post("/cx/tickets", ticketLimiter, async (req, res): Promise<void> => {
  const parsed = CreateCxTicketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await connectDB();
  const user = req.cxUser!;
  const ticketNum = generateCollisionSafeTicketNumber();
  const validPriority = ["low", "medium", "high", "critical"].includes(parsed.data.priority ?? "") ? parsed.data.priority as any : "medium";

  const ticket = await CxTicketModel.create({
    ticketNumber: ticketNum,
    workspaceId: user.workspaceId,
    customerId: user.id,
    subject: parsed.data.subject,
    description: parsed.data.description,
    domainCategory: parsed.data.category ?? "General support",
    priority: validPriority,
    status: "open",
    sentimentLabel: "neutral",
  });

  await CxTicketMessageModel.create({
    ticketId: docId(ticket),
    senderId: user.id,
    senderType: "customer",
    senderName: user.fullName,
    message: parsed.data.description,
  });

  logAuditEvent({ action: "ticket.create", userId: user.id, userRole: user.role, workspaceId: user.workspaceId ?? undefined, resourceId: docId(ticket), details: { subject: ticket.subject } });
  res.status(201).json(ticketView(ticket.toObject(), user));
});

router.get("/cx/tickets/:id", async (req, res): Promise<void> => {
  const params = GetCxTicketParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const user = req.cxUser!;
  const found = await getTicketScoped(params.data.id, user);
  if (!found) { res.status(404).json({ error: "Ticket not found or unauthorized" }); return; }

  const isCustomer = user.role === "customer";
  const msgQuery: Record<string, any> = { ticketId: params.data.id };
  if (isCustomer) msgQuery.isInternalNote = false;

  const messages = await CxTicketMessageModel.find(msgQuery).sort({ createdAt: 1 }).lean();
  const detail = { ...ticketView(found.ticket, found.customer), messages: messages.map(messageView) };
  res.json(GetCxTicketResponse.parse(detail));
});

router.post("/cx/tickets/:id/messages", async (req, res): Promise<void> => {
  const params = CreateCxTicketMessageParams.safeParse(req.params);
  const body = CreateCxTicketMessageBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid message payload" }); return; }

  const user = req.cxUser!;
  const found = await getTicketScoped(params.data.id, user);
  if (!found) { res.status(404).json({ error: "Ticket not found or unauthorized" }); return; }

  const isInternal = user.role !== "customer" && Boolean(body.data.isInternalNote);
  const senderType = user.role === "customer" ? "customer" : "agent";

  const message = await CxTicketMessageModel.create({
    ticketId: params.data.id,
    senderId: user.id,
    senderType,
    senderName: user.fullName,
    message: body.data.message.trim(),
    isInternalNote: isInternal,
  });

  await CxTicketModel.findByIdAndUpdate(params.data.id, { updatedAt: new Date() });
  logAuditEvent({ action: isInternal ? "ticket.internal_note" : "ticket.reply", userId: user.id, userRole: user.role, workspaceId: user.workspaceId ?? undefined, resourceId: params.data.id });
  res.status(201).json(messageView(message.toObject()));
});

router.patch("/cx/tickets/:id/status", staff, async (req, res): Promise<void> => {
  const params = UpdateCxTicketStatusParams.safeParse(req.params);
  const body = UpdateCxTicketStatusBody.safeParse(req.body);
  const statuses = ["open", "ai_handling", "in_progress", "escalated", "resolved", "closed"];
  if (!params.success || !body.success || !statuses.includes(body.data.status)) { res.status(400).json({ error: "Invalid ticket status update" }); return; }

  const user = req.cxUser!;
  const found = await getTicketScoped(params.data.id, user);
  if (!found) { res.status(404).json({ error: "Ticket not found or unauthorized" }); return; }

  await CxTicketModel.findByIdAndUpdate(params.data.id, { status: body.data.status, updatedAt: new Date() });
  logAuditEvent({ action: "ticket.status_change", userId: user.id, userRole: user.role, workspaceId: user.workspaceId ?? undefined, resourceId: params.data.id, details: { newStatus: body.data.status } });
  res.json({ id: params.data.id, status: body.data.status });
});

router.patch("/cx/tickets/:id/assign", staff, async (req, res): Promise<void> => {
  const params = AssignCxTicketParams.safeParse(req.params);
  const body = AssignCxTicketBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid assignment payload" }); return; }

  const user = req.cxUser!;
  const found = await getTicketScoped(params.data.id, user);
  if (!found) { res.status(404).json({ error: "Ticket not found or unauthorized" }); return; }

  await CxTicketModel.findByIdAndUpdate(params.data.id, { assignedAgentId: body.data.assignedAgentId, status: "in_progress", updatedAt: new Date() });
  logAuditEvent({ action: "ticket.assign", userId: user.id, userRole: user.role, workspaceId: user.workspaceId ?? undefined, resourceId: params.data.id, details: { assignedTo: body.data.assignedAgentId } });
  res.json({ id: params.data.id, assignedAgentId: body.data.assignedAgentId });
});

router.get("/cx/customers", staff, async (req, res): Promise<void> => {
  await connectDB();
  const user = req.cxUser!;
  const { search } = req.query;
  const query: Record<string, any> = { role: "customer" };
  if (user.workspaceId) query.workspaceId = user.workspaceId;

  let customers = await CxUserModel.find(query).sort({ createdAt: -1 }).lean();
  if (typeof search === "string" && search.trim()) {
    const q = search.toLowerCase();
    customers = customers.filter((c: any) => c.fullName?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }

  const profileIds = customers.map((c: any) => c._id.toString());
  const profiles = await CxCustomerProfileModel.find({ userId: { $in: profileIds } }).lean();
  const profileMap = Object.fromEntries(profiles.map((p: any) => [p.userId, p]));

  const rows = customers.map((c: any) => {
    const profile = profileMap[c._id.toString()];
    return {
      id: c._id.toString(),
      name: c.fullName,
      email: c.email,
      company: profile?.companyName ?? "Personal workspace",
      status: "active",
      ltv: `$${Number(profile?.lifetimeValue ?? 0).toFixed(0)}`,
      churnRisk: Number(profile?.churnRiskScore ?? 0) >= 0.7 ? "high" : Number(profile?.churnRiskScore ?? 0) >= 0.4 ? "medium" : "low",
      tickets: 0,
      lastContact: relativeTime(c.updatedAt ?? c.createdAt),
    };
  });

  res.json(ListCxCustomersResponse.parse(rows));
});

router.get("/cx/customers/:id/360", staff, async (req, res): Promise<void> => {
  const params = GetCxCustomer360Params.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid customer ID" }); return; }

  await connectDB();
  const [customer, profile, tickets] = await Promise.all([
    CxUserModel.findById(params.data.id).lean(),
    CxCustomerProfileModel.findOne({ userId: params.data.id }).lean(),
    CxTicketModel.find({ customerId: params.data.id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  res.json({
    id: (customer as any)._id.toString(),
    name: (customer as any).fullName,
    email: (customer as any).email,
    company: (profile as any)?.companyName ?? "Personal workspace",
    ltv: Number((profile as any)?.lifetimeValue ?? 0),
    churnRisk: Number((profile as any)?.churnRiskScore ?? 0),
    sentiment: Number((profile as any)?.overallSentimentScore ?? 0.5),
    preferredChannel: (profile as any)?.preferredChannel ?? "web",
    recentTickets: tickets.map((t: any) => ticketView(t, customer)),
    metadata: (profile as any)?.metadata ?? {},
  });
});

router.post("/cx/chat", chatLimiter, async (req, res): Promise<void> => {
  const parsed = SendCxChatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid chat body" }); return; }

  const user = req.cxUser!;
  const { message } = parsed.data;
  const ticketId = (parsed.data as any).ticketId;

  try {
    const { data, isAiGenerated } = await generateJsonValidated<{ message: string; intent: string; suggestedActions: string[] }>(
      `You are a helpful customer support AI for OmniCX. Customer says: "${message}". Reply with JSON: { message: string, intent: string, suggestedActions: string[] }`,
    );
    if (ticketId) {
      await connectDB();
      await CxTicketMessageModel.create({ ticketId, senderId: null, senderType: "ai_assistant", senderName: "OmniCX AI", message: data.message });
    }
    res.json(SendCxChatResponse.parse({ ...data, isAiGenerated }));
  } catch {
    res.json(SendCxChatResponse.parse({ ...chatFallback(message), isAiGenerated: false }));
  }
});

router.post("/cx/copilot", staff, copilotLimiter, async (req, res): Promise<void> => {
  const parsed = GetCxCopilotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid copilot body" }); return; }

  const { ticketId } = parsed.data;
  await connectDB();
  const ticket = await CxTicketModel.findById(ticketId).lean();
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const messages = await CxTicketMessageModel.find({ ticketId, isInternalNote: false }).sort({ createdAt: 1 }).limit(20).lean();
  const context = messages.map((m: any) => `${m.senderType}: ${m.message}`).join("\n");

  try {
    const { data } = await generateJsonValidated<{ summary: string; suggestedReply: string; nextAction: string }>(
      `Ticket: "${(ticket as any).subject}"\nConversation:\n${context}\n\nProvide JSON: { summary: string, suggestedReply: string, nextAction: string }`,
    );
    res.json(data);
  } catch {
    res.json({ summary: (ticket as any).description, suggestedReply: "Thank you for reaching out. Let me look into this for you.", nextAction: "Review ticket history and respond within SLA." });
  }
});

router.get("/cx/insights", staff, async (req, res): Promise<void> => {
  await connectDB();
  const user = req.cxUser!;
  const wsQuery = user.workspaceId ? { workspaceId: user.workspaceId } : {};

  const [total, byStatus, byPriority, csatAgg] = await Promise.all([
    CxTicketModel.countDocuments(wsQuery),
    CxTicketModel.aggregate([{ $match: wsQuery }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    CxTicketModel.aggregate([{ $match: wsQuery }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    CxFeedbackModel.aggregate([{ $match: wsQuery }, { $group: { _id: null, avg: { $avg: { $toDouble: "$csatRating" } } } }]),
  ]);

  res.json(GetCxInsightsResponse.parse({
    totalTickets: total,
    byStatus: Object.fromEntries(byStatus.map((s: any) => [s._id, s.count])),
    byPriority: Object.fromEntries(byPriority.map((p: any) => [p._id, p.count])),
    avgCsat: csatAgg[0]?.avg ? Number(csatAgg[0].avg).toFixed(1) : "4.8",
    topCategories: [],
    resolutionRate: total > 0 ? Math.round(((total - byStatus.filter((s: any) => ["open", "ai_handling", "in_progress", "escalated"].includes(s._id)).reduce((a: number, s: any) => a + s.count, 0)) / total) * 100) : 88,
  }));
});

router.post("/cx/feedback", async (req, res): Promise<void> => {
  const parsed = CreateCxFeedbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await connectDB();
  const user = req.cxUser!;
  const feedback = await CxFeedbackModel.create({
    ticketId: parsed.data.ticketId ?? null,
    workspaceId: user.workspaceId,
    customerId: user.id,
    csatRating: parsed.data.csatRating,
    npsScore: parsed.data.npsScore ?? null,
    qualitativeFeedback: parsed.data.qualitativeFeedback ?? null,
    extractedTopics: [],
  });

  res.status(201).json({ id: docId(feedback) });
});

export default router;