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

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn("MONGODB_URI is not set in environment variables. Database operations will run in fallback mode.");
    return;
  }
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: Number(process.env.DATABASE_MAX_POOL ?? 20),
    });
    isConnected = true;
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
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
