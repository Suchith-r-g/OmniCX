import { logger } from "./logger";

export interface AuditEvent {
  action:
    | "ticket.create"
    | "ticket.status_change"
    | "ticket.assign"
    | "ticket.reply"
    | "ticket.internal_note"
    | "customer_360.access"
    | "ai.generate"
    | "feedback.create";
  userId: string;
  userRole: string;
  workspaceId?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export function logAuditEvent(event: AuditEvent): void {
  logger.info(
    {
      audit: true,
      action: event.action,
      userId: event.userId,
      userRole: event.userRole,
      workspaceId: event.workspaceId,
      resourceId: event.resourceId,
      details: event.details,
      timestamp: new Date().toISOString(),
    },
    `AUDIT: ${event.action} performed by ${event.userId}`,
  );
}
