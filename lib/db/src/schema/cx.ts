import mongoose, { Document, Schema, Types } from "mongoose";

// ─── Types ────────────────────────────────────────────────────────────────

export type CxRole = "customer" | "agent" | "admin";
export type CxTicketStatus = "open" | "ai_handling" | "in_progress" | "escalated" | "resolved" | "closed";
export type CxPriority = "low" | "medium" | "high" | "critical";
export type CxSentiment = "positive" | "neutral" | "negative" | "frustrated";
export type CxSenderType = "customer" | "agent" | "ai_assistant" | "system";

// ─── Workspace ────────────────────────────────────────────────────────────

export interface CxWorkspace {
  _id: Types.ObjectId;
  id: string; // virtual alias
  name: string;
  slug: string;
  createdAt: Date;
}

export interface CxWorkspaceDocument extends Omit<CxWorkspace, "_id" | "id">, Document {}

const cxWorkspaceSchema = new Schema<CxWorkspaceDocument>(
  { name: { type: String, default: "Default Workspace" }, slug: { type: String, default: "default" } },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

export const CxWorkspaceModel = mongoose.models.CxWorkspace || mongoose.model<CxWorkspaceDocument>("CxWorkspace", cxWorkspaceSchema);

// ─── User ─────────────────────────────────────────────────────────────────

export interface CxUser {
  _id: Types.ObjectId;
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string;
  role: CxRole;
  workspaceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CxUserDocument extends Omit<CxUser, "_id" | "id">, Document {}

const cxUserSchema = new Schema<CxUserDocument>(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, enum: ["customer", "agent", "admin"], default: "customer" },
    workspaceId: { type: String, default: null },
  },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);
cxUserSchema.index({ workspaceId: 1 });

export const CxUserModel = mongoose.models.CxUser || mongoose.model<CxUserDocument>("CxUser", cxUserSchema);

// ─── Customer Profile ─────────────────────────────────────────────────────

export interface CxCustomerProfile {
  _id: Types.ObjectId;
  id: string;
  userId: string;
  companyName: string;
  lifetimeValue: number;
  churnRiskScore: number;
  overallSentimentScore: number;
  preferredChannel: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CxCustomerProfileDocument extends Omit<CxCustomerProfile, "_id" | "id">, Document {}

const cxCustomerProfileSchema = new Schema<CxCustomerProfileDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    companyName: { type: String, default: "Personal workspace" },
    lifetimeValue: { type: Number, default: 0 },
    churnRiskScore: { type: Number, default: 0 },
    overallSentimentScore: { type: Number, default: 0.5 },
    preferredChannel: { type: String, default: "web" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

export const CxCustomerProfileModel = mongoose.models.CxCustomerProfile || mongoose.model<CxCustomerProfileDocument>("CxCustomerProfile", cxCustomerProfileSchema);

// ─── Ticket ───────────────────────────────────────────────────────────────

export interface CxTicket {
  _id: Types.ObjectId;
  id: string;
  ticketNumber: string;
  workspaceId?: string | null;
  customerId: string;
  assignedAgentId?: string | null;
  subject: string;
  description: string;
  status: CxTicketStatus;
  priority: CxPriority;
  domainCategory: string;
  sentimentLabel: CxSentiment;
  aiSummary?: string | null;
  channel: string;
  sla: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CxTicketDocument extends Omit<CxTicket, "_id" | "id">, Document {}

const cxTicketSchema = new Schema<CxTicketDocument>(
  {
    ticketNumber: { type: String, required: true, unique: true },
    workspaceId: { type: String, default: null },
    customerId: { type: String, required: true },
    assignedAgentId: { type: String, default: null },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["open", "ai_handling", "in_progress", "escalated", "resolved", "closed"], default: "open" },
    priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
    domainCategory: { type: String, required: true },
    sentimentLabel: { type: String, enum: ["positive", "neutral", "negative", "frustrated"], default: "neutral" },
    aiSummary: { type: String, default: null },
    channel: { type: String, default: "web" },
    sla: { type: String, default: "2h 30m left" },
  },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);
cxTicketSchema.index({ customerId: 1, createdAt: -1 });
cxTicketSchema.index({ workspaceId: 1, status: 1 });
cxTicketSchema.index({ assignedAgentId: 1, status: 1 });
cxTicketSchema.index({ status: 1, updatedAt: -1 });

export const CxTicketModel = mongoose.models.CxTicket || mongoose.model<CxTicketDocument>("CxTicket", cxTicketSchema);

// ─── Ticket Message ───────────────────────────────────────────────────────

export interface CxTicketMessage {
  _id: Types.ObjectId;
  id: string;
  ticketId: string;
  senderId?: string | null;
  senderType: CxSenderType;
  senderName: string;
  message: string;
  sentimentScore?: number | null;
  isInternalNote: boolean;
  createdAt: Date;
}

export interface CxTicketMessageDocument extends Omit<CxTicketMessage, "_id" | "id">, Document {}

const cxTicketMessageSchema = new Schema<CxTicketMessageDocument>(
  {
    ticketId: { type: String, required: true, index: true },
    senderId: { type: String, default: null },
    senderType: { type: String, enum: ["customer", "agent", "ai_assistant", "system"], required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true },
    sentimentScore: { type: Number, default: null },
    isInternalNote: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);
cxTicketMessageSchema.index({ ticketId: 1, createdAt: 1 });
cxTicketMessageSchema.index({ ticketId: 1, isInternalNote: 1 });

export const CxTicketMessageModel = mongoose.models.CxTicketMessage || mongoose.model<CxTicketMessageDocument>("CxTicketMessage", cxTicketMessageSchema);

// ─── Feedback ─────────────────────────────────────────────────────────────

export interface CxFeedback {
  _id: Types.ObjectId;
  id: string;
  ticketId?: string | null;
  workspaceId?: string | null;
  customerId: string;
  csatRating: string;
  npsScore?: string | null;
  qualitativeFeedback?: string | null;
  extractedTopics: string[];
  createdAt: Date;
}

export interface CxFeedbackDocument extends Omit<CxFeedback, "_id" | "id">, Document {}

const cxFeedbackSchema = new Schema<CxFeedbackDocument>(
  {
    ticketId: { type: String, default: null },
    workspaceId: { type: String, default: null },
    customerId: { type: String, required: true },
    csatRating: { type: String, required: true },
    npsScore: { type: String, default: null },
    qualitativeFeedback: { type: String, default: null },
    extractedTopics: { type: [String], default: [] },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);
cxFeedbackSchema.index({ customerId: 1 });
cxFeedbackSchema.index({ workspaceId: 1, createdAt: -1 });

export const CxFeedbackModel = mongoose.models.CxFeedback || mongoose.model<CxFeedbackDocument>("CxFeedback", cxFeedbackSchema);

// ─── Legacy table aliases (for routes that import these names) ─────────────
export const cxWorkspacesTable = CxWorkspaceModel;
export const cxUsersTable = CxUserModel;
export const cxCustomerProfilesTable = CxCustomerProfileModel;
export const cxTicketsTable = CxTicketModel;
export const cxTicketMessagesTable = CxTicketMessageModel;
export const cxFeedbackTable = CxFeedbackModel;