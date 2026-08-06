import dns from "dns";
import mongoose from "mongoose";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Configure DNS resolver for Node.js SRV queries
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

const __dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dir, "../../../.env"), override: false });
loadEnv({ path: resolve(__dir, "../../../../.env"), override: false });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI must be set in environment variables");
}
const mongoUri: string = MONGODB_URI;

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: Number(process.env.DATABASE_MAX_POOL ?? 20),
  });
  isConnected = true;
}

// Compatibility shim — expose mongoose connection as "db" for health checks
export const db = {
  execute: async (query: unknown) => {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB not connected");
    }
    return true;
  },
};

// Re-export models for convenience
export * from "./schema/index";
export type { CxUser } from "./schema/cx";
