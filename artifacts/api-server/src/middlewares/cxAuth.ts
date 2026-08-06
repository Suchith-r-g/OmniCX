import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { connectDB, CxUserModel, CxWorkspaceModel, CxCustomerProfileModel } from "@workspace/db";
import type { CxUser } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      cxUser?: CxUser;
    }
  }
}

function idsFromEnv(name: string): Set<string> {
  return new Set((process.env[name] ?? "").split(",").map((v) => v.trim()).filter(Boolean));
}

function docToUser(doc: any): CxUser {
  const obj = doc.toObject ? doc.toObject() : doc;
  return { ...obj, id: obj._id?.toString() ?? obj.id };
}

export const requireCxUser: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  let { userId } = getAuth(req);
  
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        userId = token;
      }
    }
  }

  // Fallback to demo user if no auth token is provided or Clerk is unconfigured
  if (!userId) {
    userId = "user_demo";
  }

  try {
    await connectDB();
    let email = userId === "user_demo" ? "demo@omnicx.ai" : `${userId}@omnicx.ai`;
    let fullName = userId === "user_demo" ? "Demo Customer" : `Customer (${userId.slice(-6)})`;

    if (userId !== "user_demo" && process.env.CLERK_SECRET_KEY) {
      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        if (clerkUser.primaryEmailAddress?.emailAddress) {
          email = clerkUser.primaryEmailAddress.emailAddress;
        }
        fullName =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
          clerkUser.username ||
          email;
      } catch (clerkErr) {
        req.log?.warn({ err: clerkErr }, "Clerk API lookup failed; using session claims fallback");
      }
    }

    const adminIds = idsFromEnv("CX_ADMIN_CLERK_USER_IDS");
    const agentIds = idsFromEnv("CX_AGENT_CLERK_USER_IDS");
    const requestedRole = adminIds.has(userId) ? "admin" : agentIds.has(userId) ? "agent" : undefined;

    // Ensure default workspace exists
    let defaultWs = await CxWorkspaceModel.findOne();
    if (!defaultWs) {
      defaultWs = await CxWorkspaceModel.create({ name: "Primary Workspace", slug: "primary" });
    }

    let localUserDoc = await CxUserModel.findOne({ clerkUserId: userId });

    if (!localUserDoc) {
      localUserDoc = await CxUserModel.create({
        clerkUserId: userId,
        email,
        fullName,
        role: requestedRole ?? "customer",
        workspaceId: defaultWs._id.toString(),
      });
      if (localUserDoc.role === "customer") {
        await CxCustomerProfileModel.create({ userId: localUserDoc._id.toString() });
      }
    } else {
      await CxUserModel.findByIdAndUpdate(localUserDoc._id, {
        email,
        fullName,
        workspaceId: localUserDoc.workspaceId ?? defaultWs._id.toString(),
        ...(requestedRole ? { role: requestedRole } : {}),
        updatedAt: new Date(),
      });
      localUserDoc = await CxUserModel.findById(localUserDoc._id);
    }

    req.cxUser = docToUser(localUserDoc!);
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