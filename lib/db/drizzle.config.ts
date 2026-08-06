import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config as loadEnv } from "dotenv";

// Load env from workspace root so DATABASE_URL is available in drizzle-kit
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: join(__dirname, "../../.env"), override: false });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
