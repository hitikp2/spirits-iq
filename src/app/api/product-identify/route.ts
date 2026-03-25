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

// Search Google Images for a professional product photo, download it, return as buffer
async function fetchProductImageFromWeb(product: ProductIdentification): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) {
    console.log("Google CSE not configured (GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID) — skipping web image search");
    return null;
  }

  try {
    // Build a specific product search query
    const query = `${product.brand} ${product.name} ${product.size} product photo white background`;
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&searchType=image&num=5&imgSize=MEDIUM&imgType=photo&safe=active`;

    console.log("Searching Google Images for:", query);
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.error("Google CSE search failed:", searchRes.status, await searchRes.text());
      return null;
    }

    const searchData = await searchRes.json();
    const items = searchData.items;
    if (!items?.length) {
      console.error("Google CSE: no image results");
      return null;
    }

    // Try downloading images in order until one succeeds
    for (const item of items) {
      const imageLink = item.link;
      if (!imageLink) continue;

      try {
        const imgRes = await fetch(imageLink, {
          headers: { "User-Agent": "SpiritsIQ/1.0 Product Image Fetcher" },
          signal: AbortSignal.timeout(8000),
        });

        if (!imgRes.ok) continue;

        const ct = imgRes.headers.get("content-type") || "image/jpeg";
        if (!ct.startsWith("image/")) continue;

        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Skip tiny images (likely thumbnails/icons) or huge ones
        if (buffer.length < 5000 || buffer.length > 5 * 1024 * 1024) continue;

        console.log("Downloaded product image from:", imageLink, `(${buffer.length} bytes)`);
        return { buffer, contentType: ct };
      } catch {
        // This image URL failed, try the next one
        continue;
      }
    }

    console.error("Google CSE: all image downloads failed");
    return null;
  } catch (error) {
    console.error("Web image search error:", error);
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
    // Priority: Google Images → Gemini AI generation → raw camera photo
    const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let imageUrl: string | null = null;

    // Try 1: Fetch real product photo from Google Images
    const webImage = await fetchProductImageFromWeb(product);
    if (webImage) {
      const ext = webImage.contentType.includes("png") ? "png" : "jpg";
      imageUrl = await uploadToSupabase(webImage.buffer, `${fileBase}.${ext}`, webImage.contentType);
      if (imageUrl) console.log("Using Google Images product photo");
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
