---
name: Workspace client declarations
description: Monorepo behavior where shared TypeScript package declarations can lag behind generated source exports.
---

When a consuming workspace package reports missing exports from a shared generated client, rebuild the shared package's composite TypeScript declarations before changing application imports.

**Why:** The workspace package may export source files while its declaration output is stale, producing false frontend type errors even though the generated source contains the expected hooks.

**How to apply:** Run the shared package's TypeScript project build with `--build ... --force`, then rerun the consumer typecheck and build.