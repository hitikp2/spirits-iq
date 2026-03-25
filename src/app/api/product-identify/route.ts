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

// ─── Supabase Storage Upload ───────────────────────────────────────────────
async function uploadToSupabase(buffer: Buffer, fileName: string, contentType: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Upload skipped: SUPABASE_URL or SUPABASE_SERVICE_KEY not set");
    return null;
  }
  if (buffer.length > 5 * 1024 * 1024) {
    console.error("Upload skipped: buffer too large", buffer.length);
    return null;
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`;
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": contentType,
    "x-upsert": "true",
  };

  let res = await fetch(uploadUrl, { method: "POST", headers, body: buffer });

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
    if (!res.ok) {
      console.error("Supabase upload failed:", res.status, await res.text());
      return null;
    }
  }

  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
}

// ─── Strategy 1: Gemini Native Image Generation ───────────────────────────
// Uses models that can output images directly via generateContent
async function generateImageWithGemini(product: ProductIdentification): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Generate a professional product photo for an e-commerce listing:

Product: ${product.name}
Brand: ${product.brand}
Size: ${product.size || "standard"}

STRICT requirements:
- Pure white background (#FFFFFF)
- Show the actual retail product packaging/bottle/can exactly as sold in stores
- Clean studio photography lighting, no shadows
- Product perfectly centered, filling ~70% of frame
- NO text overlays, NO watermarks, NO extra objects
- NO hands, NO props, NO surfaces — just the product floating on white
- Square 1:1 aspect ratio`;

  // Models that support image generation via generateContent, in priority order
  const models = [
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp",
  ];

  for (const model of models) {
    try {
      console.log(`[ImageGen] Trying model: ${model}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[ImageGen] ${model} HTTP ${res.status}:`, errText.slice(0, 200));
        continue;
      }

      const data = await res.json();
      const candidates = data.candidates;
      if (!candidates?.length) {
        console.error(`[ImageGen] ${model}: no candidates in response`);
        continue;
      }

      const parts = candidates[0].content?.parts;
      if (!parts?.length) {
        console.error(`[ImageGen] ${model}: no parts in candidate`);
        continue;
      }

      for (const part of parts) {
        if (part.inlineData?.data) {
          console.log(`[ImageGen] Success with ${model} (${part.inlineData.mimeType})`);
          return part.inlineData.data;
        }
      }

      console.error(`[ImageGen] ${model}: response had parts but no image data. Parts:`,
        parts.map((p: any) => Object.keys(p)));
    } catch (error) {
      console.error(`[ImageGen] ${model} exception:`, error);
    }
  }

  return null;
}

// ─── Strategy 2: Imagen 3 Dedicated Image Generation ──────────────────────
// Google's dedicated image generation model with a different API format
async function generateImageWithImagen(product: ProductIdentification): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Professional product photo on pure white background: ${product.brand} ${product.name} ${product.size || ""} bottle/can/package as sold in US liquor stores. Studio lighting, centered, no props.`;

  const models = [
    "imagen-3.0-generate-002",
    "imagen-3.0-fast-generate-001",
  ];

  for (const model of models) {
    try {
      console.log(`[Imagen] Trying model: ${model}`);

      // Try the generateImages endpoint (Google AI format)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: "1:1" },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Imagen] ${model} HTTP ${res.status}:`, errText.slice(0, 200));
        continue;
      }

      const data = await res.json();
      const predictions = data.predictions;
      if (predictions?.[0]?.bytesBase64Encoded) {
        console.log(`[Imagen] Success with ${model}`);
        return predictions[0].bytesBase64Encoded;
      }

      console.error(`[Imagen] ${model}: unexpected response shape`, Object.keys(data));
    } catch (error) {
      console.error(`[Imagen] ${model} exception:`, error);
    }
  }

  return null;
}

// ─── Strategy 3: Gemini Search Grounding → Download ───────────────────────
// Ask Gemini to search the web for a product image URL, then download it
async function findAndDownloadProductImage(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
    console.log(`[Grounding] Searching for: ${query}`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Search for "${query}" product image. I need a direct URL to the product photo (the actual image file, not a webpage).

Look on: totalwine.com, drizly.com, wine.com, liquor.com, caskers.com, thewhiskyexchange.com, minibardelivery.com

Return ONLY the most likely direct image URL. Nothing else — just the URL on a single line.`
            }]
          }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 300 },
        }),
      }
    );

    if (!res.ok) {
      console.error(`[Grounding] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();

    // Collect ALL URLs: from response text + grounding metadata
    const urls: string[] = [];

    // Extract from response text
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts?.length) {
      const responseText = parts.map((p: any) => p.text || "").join(" ");
      const textUrls = responseText.match(/https?:\/\/[^\s"'<>\)]+/gi) || [];
      urls.push(...textUrls);
    }

    // Extract from grounding metadata (search results)
    const grounding = data.candidates?.[0]?.groundingMetadata;
    if (grounding?.groundingChunks) {
      for (const chunk of grounding.groundingChunks) {
        if (chunk.web?.uri) urls.push(chunk.web.uri);
      }
    }
    if (grounding?.searchEntryPoint?.renderedContent) {
      const rendered = grounding.searchEntryPoint.renderedContent;
      const metaUrls = rendered.match(/https?:\/\/[^\s"'<>\)]+/gi) || [];
      urls.push(...metaUrls);
    }

    console.log(`[Grounding] Found ${urls.length} URLs to try`);

    // Prioritize URLs that look like images
    const sorted = urls.sort((a, b) => {
      const aImg = /\.(jpg|jpeg|png|webp)/i.test(a) || /image|img|photo|cdn|media/i.test(a) ? 0 : 1;
      const bImg = /\.(jpg|jpeg|png|webp)/i.test(b) || /image|img|photo|cdn|media/i.test(b) ? 0 : 1;
      return aImg - bImg;
    });

    // Try downloading each URL
    for (const url of sorted.slice(0, 8)) {
      try {
        console.log(`[Grounding] Trying download: ${url.slice(0, 100)}`);
        const imgRes = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/",
          },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });

        if (!imgRes.ok) {
          console.log(`[Grounding] ${url.slice(0, 60)}... → ${imgRes.status}`);
          continue;
        }

        const ct = imgRes.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) {
          console.log(`[Grounding] Not an image: ${ct}`);
          continue;
        }

        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 5000) {
          console.log(`[Grounding] Too small (${buf.length}b), likely placeholder`);
          continue;
        }
        if (buf.length > 5 * 1024 * 1024) {
          console.log(`[Grounding] Too large (${buf.length}b)`);
          continue;
        }

        console.log(`[Grounding] Downloaded ${buf.length}b from ${url.slice(0, 80)}`);
        return buf;
      } catch {
        continue;
      }
    }

    console.log("[Grounding] All URL downloads failed");
    return null;
  } catch (error) {
    console.error("[Grounding] Exception:", error);
    return null;
  }
}

// ─── Main Pipeline: Find the best product image ──────────────────────────
// Runs strategies in parallel where possible, returns first success
async function findProductImage(product: ProductIdentification): Promise<{ buffer: Buffer; ext: string } | null> {
  // Run Gemini image gen and Imagen in parallel (they're independent)
  const [geminiResult, imagenResult] = await Promise.allSettled([
    generateImageWithGemini(product),
    generateImageWithImagen(product),
  ]);

  // Check Gemini native image gen
  const geminiBase64 = geminiResult.status === "fulfilled" ? geminiResult.value : null;
  if (geminiBase64) {
    console.log("[Pipeline] Using Gemini-generated image");
    return { buffer: Buffer.from(geminiBase64, "base64"), ext: "png" };
  }

  // Check Imagen
  const imagenBase64 = imagenResult.status === "fulfilled" ? imagenResult.value : null;
  if (imagenBase64) {
    console.log("[Pipeline] Using Imagen-generated image");
    return { buffer: Buffer.from(imagenBase64, "base64"), ext: "png" };
  }

  // Fallback: try grounding search
  console.log("[Pipeline] AI generation failed, trying web search...");
  const webImage = await findAndDownloadProductImage(product);
  if (webImage) {
    console.log("[Pipeline] Using web-sourced image");
    return { buffer: webImage, ext: "jpg" };
  }

  console.log("[Pipeline] All strategies failed");
  return null;
}

// ─── POST /api/product-identify ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "AI not configured (GEMINI_API_KEY missing)" } satisfies ApiResponse,
        { status: 503 }
      );
    }

    // ─── Action: refresh-image ────────────────────────────────────────
    if (action === "refresh-image") {
      const { productId, name, brand, size } = body;
      if (!productId || !name) {
        return NextResponse.json(
          { success: false, error: "productId and name are required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      console.log(`[RefreshImage] Starting for: ${brand} ${name} ${size || ""}`);

      const product: ProductIdentification = {
        name, brand: brand || "", category: "", size: size || "",
        abv: "", retailPrice: 0, costPrice: 0, description: "", isAgeRestricted: false,
      };

      const result = await findProductImage(product);
      if (!result) {
        return NextResponse.json(
          { success: false, error: "Could not generate or find a product image. Check server logs for details." } satisfies ApiResponse,
          { status: 422 }
        );
      }

      const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);

      if (!imageUrl) {
        return NextResponse.json(
          { success: false, error: "Image generated but upload to storage failed" } satisfies ApiResponse,
          { status: 500 }
        );
      }

      // Update the product in the database
      const { db } = await import("@/lib/db");
      await db.product.update({ where: { id: productId }, data: { imageUrl } });

      console.log(`[RefreshImage] Success: ${imageUrl}`);
      return NextResponse.json({ success: true, data: { productId, imageUrl } } satisfies ApiResponse);
    }

    // ─── Default: Identify product from camera photo ──────────────────
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

    // Step 2: Find a professional product image (all strategies)
    const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let imageUrl: string | null = null;

    const result = await findProductImage(product);
    if (result) {
      imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);
    }

    // Last resort: upload the raw camera photo
    if (!imageUrl) {
      const rawBuffer = Buffer.from(base64Data, "base64");
      imageUrl = await uploadToSupabase(rawBuffer, `${fileBase}_raw.jpg`, "image/jpeg");
      console.log("[Identify] Fallback: using raw camera photo");
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
