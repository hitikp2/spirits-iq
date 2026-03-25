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

// Use Gemini with Google Search grounding to find a real product image URL
async function findProductImageUrl(product: ProductIdentification): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size}`;
    console.log("Searching for product image via Gemini grounding:", query);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Find a direct image URL for this product: ${query}

I need a SINGLE direct URL to a professional product photo (PNG or JPG) showing the product on a white/clean background.

Look for product images from major retailers like drizly.com, totalwine.com, wine.com, binnys.com, thewhiskyexchange.com, minibardelivery.com, or manufacturer sites.

Return ONLY the direct image URL (ending in .jpg, .png, or .webp, or from a CDN/image server). No other text. Just the URL.`
            }]
          }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 200 },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini grounding search failed:", res.status);
      return null;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts?.length) return null;

    // Extract URL from the response text
    const responseText = parts.map((p: any) => p.text || "").join(" ").trim();
    const urlMatch = responseText.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp)(\?[^\s"'<>]*)?/i)
      || responseText.match(/https?:\/\/[^\s"'<>]*(?:image|img|photo|product|cdn|media)[^\s"'<>]*/i)
      || responseText.match(/https?:\/\/[^\s"'<>]+/);

    if (!urlMatch) {
      console.error("Gemini grounding: no URL in response:", responseText);
      return null;
    }

    console.log("Found product image URL:", urlMatch[0]);
    return urlMatch[0];
  } catch (error) {
    console.error("Gemini grounding search error:", error);
    return null;
  }
}

// Download an image from a URL, return as buffer
async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SpiritsIQ/1.0)",
        "Accept": "image/*",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!res.ok) return null;

    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Skip tiny images (icons/placeholders) or oversized ones
    if (buffer.length < 3000 || buffer.length > 5 * 1024 * 1024) return null;

    return { buffer, contentType: ct };
  } catch {
    return null;
  }
}

// Fallback: generate a product photo using Gemini text-to-image
async function generateProductImage(product: ProductIdentification): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Generate a professional e-commerce product photo of: ${product.name} by ${product.brand}, size ${product.size}.

Requirements:
- Plain white background (#FFFFFF), no shadows, no gradients
- Show ONLY the real product packaging/bottle/container as it actually appears in stores
- Photorealistic, high quality, well-lit studio product photography style
- Product centered in frame with even padding on all sides
- No text overlays, no watermarks, no labels added
- No hands, no props, no other objects — just the product itself
- Square aspect ratio, suitable for a product listing thumbnail`;

  const models = [
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash",
  ];

  for (const model of models) {
    try {
      console.log(`Generating product image with model: ${model}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              response_modalities: ["IMAGE", "TEXT"],
              max_output_tokens: 4096,
            },
          }),
        }
      );

      if (!res.ok) {
        console.error(`Image gen (${model}) HTTP ${res.status}:`, await res.text());
        continue;
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      for (const part of parts) {
        if (part.inlineData?.data) {
          console.log(`Product image generated with: ${model}`);
          return part.inlineData.data;
        }
      }
    } catch (error) {
      console.error(`Image gen (${model}) error:`, error);
    }
  }

  return null;
}

// POST /api/product-identify — AI-powered product identification from photo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "AI not configured" } satisfies ApiResponse,
        { status: 503 }
      );
    }

    // ─── Action: refresh-image — find a professional photo for an existing product ───
    if (action === "refresh-image") {
      const { productId, name, brand, size } = body;
      if (!productId || !name) {
        return NextResponse.json(
          { success: false, error: "productId and name are required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const product: ProductIdentification = {
        name, brand: brand || "", category: "", size: size || "",
        abv: "", retailPrice: 0, costPrice: 0, description: "", isAgeRestricted: false,
      };

      const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let imageUrl: string | null = null;

      // Try 1: Real photo via Gemini + Google Search grounding
      const foundUrl = await findProductImageUrl(product);
      if (foundUrl) {
        const downloaded = await downloadImage(foundUrl);
        if (downloaded) {
          const ext = downloaded.contentType.includes("png") ? "png" : "jpg";
          imageUrl = await uploadToSupabase(downloaded.buffer, `${fileBase}.${ext}`, downloaded.contentType);
        }
      }

      // Try 2: AI-generated product image
      if (!imageUrl) {
        const generatedBase64 = await generateProductImage(product);
        if (generatedBase64) {
          const buffer = Buffer.from(generatedBase64, "base64");
          imageUrl = await uploadToSupabase(buffer, `${fileBase}_ai.png`, "image/png");
        }
      }

      if (!imageUrl) {
        return NextResponse.json(
          { success: false, error: "Could not find a product image" } satisfies ApiResponse,
          { status: 422 }
        );
      }

      // Update the product in the database
      const { db } = await import("@/lib/db");
      await db.product.update({ where: { id: productId }, data: { imageUrl } });

      return NextResponse.json({ success: true, data: { productId, imageUrl } } satisfies ApiResponse);
    }

    // ─── Default action: identify product from camera photo ───
    const { imageBase64, barcode } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { success: false, error: "imageBase64 is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // Step 1: Identify the product from the camera photo
    const model = getModel({
      maxOutputTokens: 500,
      systemInstruction: `You are a liquor store product identification assistant. Analyze the product photo and return ONLY a JSON object with these fields. Be accurate with pricing — use typical US retail prices. If you can't identify the exact product, make your best guess from what's visible.`,
    });

    const identifyResult = await model.generateContent([
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

    const text = identifyResult.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: "AI could not identify the product" } satisfies ApiResponse,
        { status: 422 }
      );
    }

    const product: ProductIdentification = JSON.parse(jsonMatch[0]);

    // Step 2: Find a professional product image
    // Priority: Gemini Search grounding (real photo) → AI generation → raw camera photo
    const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let imageUrl: string | null = null;

    // Try 1: Find real product photo via Gemini + Google Search grounding
    const foundUrl = await findProductImageUrl(product);
    if (foundUrl) {
      const downloaded = await downloadImage(foundUrl);
      if (downloaded) {
        const ext = downloaded.contentType.includes("png") ? "png" : "jpg";
        imageUrl = await uploadToSupabase(downloaded.buffer, `${fileBase}.${ext}`, downloaded.contentType);
        if (imageUrl) console.log("Using real product photo from web");
      }
    }

    // Try 2: AI-generated product image
    if (!imageUrl) {
      const generatedBase64 = await generateProductImage(product);
      if (generatedBase64) {
        const buffer = Buffer.from(generatedBase64, "base64");
        imageUrl = await uploadToSupabase(buffer, `${fileBase}_ai.png`, "image/png");
        if (imageUrl) console.log("Using AI-generated product image");
      }
    }

    // Try 3: Fall back to the raw camera photo
    if (!imageUrl) {
      const rawBuffer = Buffer.from(base64Data, "base64");
      imageUrl = await uploadToSupabase(rawBuffer, `${fileBase}_raw.jpg`, "image/jpeg");
      console.log("Fallback: using raw camera photo");
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
