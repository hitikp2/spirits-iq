import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export function getModel(options?: {
  maxOutputTokens?: number;
  systemInstruction?: string;
}) {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
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
  const model = getModel(options);
  const result = await model.generateContent(prompt);
  return result.response.text();
}
