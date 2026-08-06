import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { logger } from "./logger";

const model = "gemini-2.5-flash";
const AI_TIMEOUT_MS = 10000;

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}

export function sanitizePrompt(input: string): string {
  // Redact email addresses and common token patterns to minimize PII exposure
  return input
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/(?:sk|api|bearer)[_a-zA-Z0-9-]{16,}/gi, "[REDACTED_SECRET]");
}

export interface AiGenerationResult<T> {
  data: T;
  isAiGenerated: boolean;
}

export async function generateJsonValidated<T>(
  prompt: string,
  schema?: ZodType<T>,
): Promise<AiGenerationResult<T>> {
  const sanitized = sanitizePrompt(prompt);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("AI generation timed out")), AI_TIMEOUT_MS);
      });

      const generationPromise = client().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: sanitized }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.35,
        },
      });

      const response = await Promise.race([generationPromise, timeoutPromise]);
      const text = response.text?.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

      if (!text) throw new Error("AI returned an empty response");
      const parsed = JSON.parse(text);

      if (schema) {
        const validated = schema.safeParse(parsed);
        if (!validated.success) {
          throw new Error(`AI response schema validation failed: ${validated.error.message}`);
        }
        return { data: validated.data, isAiGenerated: true };
      }

      return { data: parsed as T, isAiGenerated: true };
    } catch (error) {
      lastError = error;
      logger.warn(
        { attempt: attempt + 1, err: error instanceof Error ? error.message : String(error) },
        "AI JSON generation failed",
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

export async function generateJson<T>(prompt: string): Promise<T> {
  const result = await generateJsonValidated<T>(prompt);
  return result.data;
}