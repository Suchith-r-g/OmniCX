import { describe, it, expect, vi } from "vitest";
import { sanitizePrompt } from "../lib/ai";
import { createRateLimiter } from "../middlewares/rateLimiter";
import { logAuditEvent } from "../lib/auditLogger";
import { logger } from "../lib/logger";

vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Production Readiness Unit Tests", () => {
  describe("PII & Secret Sanitizer (AI Security)", () => {
    it("should redact email addresses from prompt input", () => {
      const input = "Please look at customer alice@example.com for domain acme.com";
      const sanitized = sanitizePrompt(input);
      expect(sanitized).toContain("[REDACTED_EMAIL]");
      expect(sanitized).not.toContain("alice@example.com");
    });

    it("should redact standard US phone numbers", () => {
      const input = "Call me back at 555-666-7777 or 123.456.7890 soon";
      const sanitized = sanitizePrompt(input);
      expect(sanitized).toContain("[REDACTED_PHONE]");
      expect(sanitized).not.toContain("555-666-7777");
    });

    it("should redact API secrets and Bearer tokens", () => {
      const input = "My API key is bearer_token_example_1234567890abcdef";
      const sanitized = sanitizePrompt(input);
      expect(sanitized).toContain("[REDACTED_SECRET]");
      expect(sanitized).not.toContain("bearer_token");
    });
  });

  describe("Rate Limiter Middleware", () => {
    it("should allow request under limit and block request exceeding limit", () => {
      const limiter = createRateLimiter({ windowMs: 10000, max: 2 });
      
      const req = { cxUser: { id: "test-user" }, ip: "127.0.0.1" } as any;
      const res = {
        headers: {} as Record<string, any>,
        setHeader(name: string, value: any) {
          this.headers[name] = value;
          return this;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
        statusCode: 200,
        body: null as any,
      } as any;

      const next = vi.fn();

      // First Request -> Allowed
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.headers["X-RateLimit-Remaining"]).toBe(1);

      // Second Request -> Allowed
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(res.headers["X-RateLimit-Remaining"]).toBe(0);

      // Third Request -> Blocked with 429
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2); // Should not increase
      expect(res.statusCode).toBe(429);
      expect(res.body.error).toContain("Too many requests");
    });
  });

  describe("Structured Audit Logging", () => {
    it("should record log audit events correctly with structured flags", () => {
      const event = {
        action: "ticket.internal_note" as const,
        userId: "agent_42",
        userRole: "agent",
        workspaceId: "ws_primary",
        resourceId: "ticket_123",
        details: { noteLength: 120 },
      };

      logAuditEvent(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: true,
          action: "ticket.internal_note",
          userId: "agent_42",
          userRole: "agent",
          workspaceId: "ws_primary",
          resourceId: "ticket_123",
          details: { noteLength: 120 },
          timestamp: expect.any(String),
        }),
        expect.stringContaining("AUDIT: ticket.internal_note performed by agent_42")
      );
    });
  });
});
