import { NextRequest, NextResponse } from "next/server";
import { getModel } from "@/lib/ai/gemini";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

const BUCKET = "product-images";

interface ProductIdentification {
  name: string;
  brand: string;
  category: string;
  size: string;
  abv: string;
  retailPrice: number;
  costPrice: number;
  description: string;
  isAgeRestricted: boolean;
  imageUrl?: string;
}

// Upload a buffer to Supabase Storage, return public URL
async function uploadToSupabase(buffer: Buffer, fileName: string, contentType: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  if (buffer.length > 5 * 1024 * 1024) return null;

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`;

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": contentType,
    "x-upsert": "true",
  };

  let res = await fetch(uploadUrl, { method: "POST", headers, body: buffer });

  // Auto-create bucket if missing
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 404 || err.includes("Bucket not found")) {
      await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      });
      res = await fetch(uploadUrl, { method: "POST", headers, body: buffer });
    }
    if (!res.ok) return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
}

// Generate a clean product photo with white background using Gemini image generation (REST API)
async function generateCleanProductImage(base64Data: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Data,
                  },
                },
                {
                  text: "Edit this product photo: remove the background completely and replace it with a clean, plain white background (#FFFFFF). Keep the product exactly as-is — do not change, distort, or reimagine the product itself. Center the product in the frame with even padding. The result should look like a professional e-commerce product listing thumbnail. Output only the edited image.",
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini image generation failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const candidates = data.candidates;
    if (!candidates?.[0]?.content?.parts) return null;

    // Find the image part in the response
    for (const part of candidates[0].content.parts) {
      if (part.inlineData?.data) {
        return part.inlineData.data; // base64 image data
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini image generation error:", error);
    return null;
  }
}

// POST /api/product-identify — AI-powered product identification from photo
export async function POST(request: NextRequest) {
  try {
    const { imageBase64, barcode } = await request.json();

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { success: false, error: "imageBase64 is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "AI not configured" } satisfies ApiResponse,
        { status: 503 }
      );
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // Run product identification AND AI image generation in parallel
    const identifyPromise = (async () => {
      const model = getModel({
        maxOutputTokens: 500,
        systemInstruction: `You are a liquor store product identification assistant. Analyze the product photo and return ONLY a JSON object with these fields. Be accurate with pricing — use typical US retail prices. If you can't identify the exact product, make your best guess from what's visible.`,
      });

      const result = await model.generateContent([
        { inlineData: { mimeType: "image/jpeg", data: base64Data } },
        `Identify this liquor/beverage product. ${barcode ? `Barcode: ${barcode}.` : ""}
Return ONLY valid JSON (no markdown, no code fences):
{
  "name": "Full product name",
  "brand": "Brand name",
  "category": "spirits|wine|beer|mixer|other",
  "size": "e.g. 750ml, 1L, 12oz, 6-pack",
  "abv": "e.g. 40%, 5%, 13.5%",
  "retailPrice": 0.00,
  "costPrice": 0.00,
  "description": "Brief 1-line product description",
  "isAgeRestricted": true
}`,
      ]);
      return result.response.text().trim();
    })();

    const cleanImagePromise = generateCleanProductImage(base64Data);

    const [text, cleanImageBase64] = await Promise.all([identifyPromise, cleanImagePromise]);

    // Parse product identification
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: "AI could not identify the product" } satisfies ApiResponse,
        { status: 422 }
      );
    }

    const product: ProductIdentification = JSON.parse(jsonMatch[0]);

    // Upload the AI-generated clean image, or fall back to the raw photo
    const fileName = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    let imageUrl: string | null = null;

    if (cleanImageBase64) {
      // Upload the AI-generated white-background image
      const buffer = Buffer.from(cleanImageBase64, "base64");
      imageUrl = await uploadToSupabase(buffer, fileName, "image/png");
      console.log("Uploaded AI-generated clean product image");
    }

    if (!imageUrl) {
      // Fallback: upload the original photo
      const rawBuffer = Buffer.from(base64Data, "base64");
      const fallbackName = fileName.replace(".png", ".jpg");
      imageUrl = await uploadToSupabase(rawBuffer, fallbackName, "image/jpeg");
      console.log("Fallback: uploaded original photo");
    }

    if (imageUrl) {
      product.imageUrl = imageUrl;
    }

    return NextResponse.json({ success: true, data: product } satisfies ApiResponse);
  } catch (error) {
    console.error("Product identify error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to identify product" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
