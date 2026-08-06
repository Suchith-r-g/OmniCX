import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger";

const model = "gemini-2.5-flash";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}

export async function generateJson<T>(prompt: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.45,
        },
      });
      const text = response.text?.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      if (!text) throw new Error("AI returned an empty response");
      return JSON.parse(text) as T;
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