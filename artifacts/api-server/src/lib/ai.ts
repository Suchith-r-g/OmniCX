import { GoogleGenAI } from "@google/genai";

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
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.2 },
      });
      const text = response.text?.trim();
      if (!text) throw new Error("AI returned an empty response");
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}