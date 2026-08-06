---
name: Gemini credential validation
description: Gemini API credential failures and assistant fallback behavior.
---

Validate a Gemini credential with a real server-side `generateContent` call before treating the AI integration as live. Google may reject a saved value as `API_KEY_INVALID`, `ACCESS_TOKEN_TYPE_UNSUPPORTED`, or `PERMISSION_DENIED` when the associated project is blocked.

**Why:** The original assistant masked all provider failures with one static response, making every user prompt appear to receive the same answer and hiding the actual credential or project-access problem.

**How to apply:** Log provider failures server-side, keep a prompt-aware fallback for degraded operation, and never display or repeat credential values.