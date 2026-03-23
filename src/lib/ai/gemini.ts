import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export function getModel(options?: {
  maxOutputTokens?: number;
  systemInstruction?: string;
}) {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      maxOutputTokens: options?.maxOutputTokens,
    },
    ...(options?.systemInstruction
      ? { systemInstruction: options.systemInstruction }
      : {}),
  });
}

export async function generateText(
  prompt: string,
  options?: { maxOutputTokens?: number; systemInstruction?: string }
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set — skipping AI generation");
    return "";
  }
  try {
    const model = getModel(options);
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini AI error:", error);
    return "";
  }
}
