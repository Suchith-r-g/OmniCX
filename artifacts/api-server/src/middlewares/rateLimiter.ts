import type { RequestHandler } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { windowMs, max, message = "Too many requests, please try again later." } = options;
  const clients = new Map<string, ClientRecord>();

  // Periodically clean up expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of clients.entries()) {
      if (now > record.resetTime) {
        clients.delete(ip);
      }
    }
  }, Math.max(windowMs, 60000)).unref();

  return (req, res, next) => {
    const clientKey = req.cxUser?.id || req.ip || "global";
    const now = Date.now();

    let record = clients.get(clientKey);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      clients.set(clientKey, record);
    } else {
      record.count += 1;
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - record.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.status(429).json({ error: message, retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) });
      return;
    }

    next();
  };
}
