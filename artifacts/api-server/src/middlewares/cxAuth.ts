import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  type CxUser,
} from "@workspace/db";
import {
  cxCustomerProfilesTable,
  cxUsersTable,
} from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Request {
      cxUser?: CxUser;
    }
  }
}

function idsFromEnv(name: string): Set<string> {
  return new Set((process.env[name] ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

export const requireCxUser: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress;
    if (!email) {
      res.status(422).json({ error: "Your account needs a verified email address" });
      return;
    }
    const fullName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      email;
    const adminIds = idsFromEnv("CX_ADMIN_CLERK_USER_IDS");
    const agentIds = idsFromEnv("CX_AGENT_CLERK_USER_IDS");
    const requestedRole = adminIds.has(userId) ? "admin" : agentIds.has(userId) ? "agent" : undefined;

    const existing = await db.select().from(cxUsersTable).where(eq(cxUsersTable.clerkUserId, userId)).limit(1);
    let localUser = existing[0];
    if (!localUser) {
      const [created] = await db
        .insert(cxUsersTable)
        .values({ clerkUserId: userId, email, fullName, role: requestedRole ?? "customer" })
        .returning();
      localUser = created;
      if (localUser.role === "customer") {
        await db.insert(cxCustomerProfilesTable).values({ userId: localUser.id });
      }
    } else {
      const [updated] = await db
        .update(cxUsersTable)
        .set({
          email,
          fullName,
          ...(requestedRole ? { role: requestedRole } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(cxUsersTable.id, localUser.id), eq(cxUsersTable.clerkUserId, userId)))
        .returning();
      localUser = updated ?? localUser;
    }
    req.cxUser = localUser;
    next();
  } catch (error) {
    req.log?.error({ err: error }, "Failed to provision local CX user");
    res.status(503).json({ error: "Account service temporarily unavailable" });
  }
};

export function requireCxRole(...roles: Array<CxUser["role"]>): RequestHandler {
  return (req, res, next) => {
    if (!req.cxUser || !roles.includes(req.cxUser.role)) {
      res.status(403).json({ error: "This action is not available for your role" });
      return;
    }
    next();
  };
}