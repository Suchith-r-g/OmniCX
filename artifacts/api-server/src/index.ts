import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env from this package directory first, then fall back to workspace root
const __dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dir, "../.env"), override: false });
loadEnv({ path: resolve(__dir, "../../.env"), override: false });

import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
