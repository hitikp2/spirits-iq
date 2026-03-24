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

// Upload product photo to Supabase Storage, return public URL
async function uploadProductImage(base64: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 5 * 1024 * 1024) return null;

  const fileName = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`;

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "image/jpeg",
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

    // Upload the photo in parallel with AI identification
    const uploadPromise = uploadProductImage(imageBase64);

    // Send photo to Gemini Vision for identification
    const model = getModel({
      maxOutputTokens: 500,
      systemInstruction: `You are a liquor store product identification assistant. Analyze the product photo and return ONLY a JSON object with these fields. Be accurate with pricing — use typical US retail prices. If you can't identify the exact product, make your best guess from what's visible.`,
    });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      },
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

    const text = result.response.text().trim();
    // Extract JSON from response (handle markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: "AI could not identify the product" } satisfies ApiResponse,
        { status: 422 }
      );
    }

    const product: ProductIdentification = JSON.parse(jsonMatch[0]);

    // Wait for image upload
    const imageUrl = await uploadPromise;
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
