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
  if (buffer.length > 5 * 1024 * 1024) return null;

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

// ─── Discover available image generation models ──────────────────────────
// Calls listModels to find what's actually available on this API key
let cachedImageModels: string[] | null = null;
let cacheTime = 0;

async function getImageGenerationModels(apiKey: string): Promise<string[]> {
  // Cache for 1 hour
  if (cachedImageModels && Date.now() - cacheTime < 3600000) {
    return cachedImageModels;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      console.error("[Discovery] listModels failed:", res.status);
      return [];
    }

    const data = await res.json();
    const models: string[] = [];

    for (const m of data.models || []) {
      const name: string = m.name?.replace("models/", "") || "";
      const methods: string[] = m.supportedGenerationMethods || [];

      // Look for models that support image generation
      const isImageGen = name.includes("image-generation") ||
        name.includes("imagen") ||
        (m.description || "").toLowerCase().includes("image generation");

      const supportsGenerate = methods.includes("generateContent") || methods.includes("predict");

      if (isImageGen && supportsGenerate) {
        models.push(name);
      }
    }

    console.log("[Discovery] Available image gen models:", models.length ? models.join(", ") : "NONE");
    cachedImageModels = models;
    cacheTime = Date.now();
    return models;
  } catch (error) {
    console.error("[Discovery] Exception:", error);
    return [];
  }
}

// ─── Strategy 1: Gemini Native Image Generation ──────────────────────────
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

  // Discover available models, plus hardcoded fallbacks to try
  const discovered = await getImageGenerationModels(apiKey);

  // Prioritize discovered models, then try known model names as fallback
  const modelsToTry = [
    ...discovered,
    // Fallback model names (may or may not exist)
    "gemini-2.5-flash-preview-image-generation",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.0-flash-exp",
  ];

  // Deduplicate
  const models = [...new Set(modelsToTry)];

  for (const model of models) {
    try {
      console.log(`[ImageGen] Trying: ${model}`);

      // Try generateContent (for gemini-* models)
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
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[ImageGen] ${model} → ${res.status}: ${errText.slice(0, 150)}`);
        continue;
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts?.length) {
        console.error(`[ImageGen] ${model}: empty response`);
        continue;
      }

      for (const part of parts) {
        if (part.inlineData?.data) {
          console.log(`[ImageGen] SUCCESS with ${model}`);
          return part.inlineData.data;
        }
      }
      console.error(`[ImageGen] ${model}: response had no image data`);
    } catch (error: any) {
      console.error(`[ImageGen] ${model} exception:`, error?.message || error);
    }
  }

  return null;
}

// ─── Strategy 2: Imagen via predict/generateImages endpoints ─────────────
async function generateImageWithImagen(product: ProductIdentification): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Professional product photo on pure white background: ${product.brand} ${product.name} ${product.size || ""} bottle/can/package as sold in US liquor stores. Studio lighting, centered, no props.`;

  const models = ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"];
  const endpoints = ["predict", "generateImages"]; // Try both endpoint formats

  for (const model of models) {
    for (const endpoint of endpoints) {
      try {
        console.log(`[Imagen] Trying: ${model} via :${endpoint}`);

        const bodyByEndpoint: Record<string, any> = {
          predict: {
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: "1:1" },
          },
          generateImages: {
            prompt,
            config: { numberOfImages: 1 },
          },
        };

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyByEndpoint[endpoint]),
            signal: AbortSignal.timeout(30000),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Imagen] ${model}:${endpoint} → ${res.status}: ${errText.slice(0, 150)}`);
          continue;
        }

        const data = await res.json();

        // predict format
        if (data.predictions?.[0]?.bytesBase64Encoded) {
          console.log(`[Imagen] SUCCESS with ${model}:${endpoint}`);
          return data.predictions[0].bytesBase64Encoded;
        }
        // generateImages format
        if (data.generatedImages?.[0]?.image?.imageBytes) {
          console.log(`[Imagen] SUCCESS with ${model}:${endpoint}`);
          return data.generatedImages[0].image.imageBytes;
        }

        console.error(`[Imagen] ${model}:${endpoint}: unexpected response`, JSON.stringify(data).slice(0, 200));
      } catch (error: any) {
        console.error(`[Imagen] ${model}:${endpoint} exception:`, error?.message || error);
      }
    }
  }

  return null;
}

// ─── Strategy 3: Gemini Search Grounding → Scrape page for images ────────
async function findAndDownloadProductImage(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
    console.log(`[Grounding] Searching for: ${query}`);

    // Ask Gemini to find the product page URL (not image URL — pages are more reliable)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Find product listing URLs for: "${query}"

Search retailers like totalwine.com, drizly.com, wine.com, liquor.com, thewhiskyexchange.com, caskers.com, reservebar.com.

Return up to 5 URLs to product pages where this item is listed. One URL per line, nothing else.`
            }]
          }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      console.error(`[Grounding] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Grounding] Raw response keys:`, JSON.stringify(Object.keys(data)));

    // Collect ALL URLs from every possible location in the response
    const urls: string[] = [];

    // From response text
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts?.length) {
      const responseText = parts.map((p: any) => p.text || "").join(" ");
      console.log(`[Grounding] Response text: ${responseText.slice(0, 300)}`);
      const textUrls = responseText.match(/https?:\/\/[^\s"'<>\)]+/gi) || [];
      urls.push(...textUrls);
    }

    // From grounding metadata
    const grounding = data.candidates?.[0]?.groundingMetadata;
    if (grounding) {
      console.log(`[Grounding] Metadata keys:`, Object.keys(grounding));

      if (grounding.groundingChunks) {
        for (const chunk of grounding.groundingChunks) {
          if (chunk.web?.uri) urls.push(chunk.web.uri);
        }
      }
      if (grounding.webSearchQueries) {
        console.log(`[Grounding] Search queries:`, grounding.webSearchQueries);
      }
      if (grounding.groundingSupports) {
        for (const support of grounding.groundingSupports) {
          if (support.groundingChunkIndices) {
            // These reference the chunks above, already captured
          }
        }
      }
    }

    // Deduplicate
    const uniqueUrls = [...new Set(urls)];
    console.log(`[Grounding] Found ${uniqueUrls.length} unique URLs`);

    // For each product page URL, fetch it and extract og:image or product image
    for (const pageUrl of uniqueUrls.slice(0, 5)) {
      try {
        console.log(`[Grounding] Fetching page: ${pageUrl.slice(0, 100)}`);

        // First check if URL is already a direct image
        if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(pageUrl)) {
          const imgBuf = await downloadImageDirect(pageUrl);
          if (imgBuf) return imgBuf;
          continue;
        }

        // Fetch the page HTML and extract og:image
        const pageRes = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });

        if (!pageRes.ok) {
          console.log(`[Grounding] Page ${pageRes.status}: ${pageUrl.slice(0, 60)}`);
          continue;
        }

        const html = await pageRes.text();

        // Extract image URLs from HTML (og:image, product images, etc.)
        const imageUrls: string[] = [];

        // og:image meta tag (most reliable for product pages)
        const ogMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i)
          || html.match(/content="([^"]+)"\s+(?:property|name)="og:image"/i);
        if (ogMatch) imageUrls.push(ogMatch[1]);

        // twitter:image
        const twMatch = html.match(/<meta\s+(?:property|name)="twitter:image"\s+content="([^"]+)"/i)
          || html.match(/content="([^"]+)"\s+(?:property|name)="twitter:image"/i);
        if (twMatch) imageUrls.push(twMatch[1]);

        // JSON-LD product image
        const jsonLdMatch = html.match(/"image"\s*:\s*"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi);
        if (jsonLdMatch) {
          for (const m of jsonLdMatch) {
            const urlM = m.match(/"(https?:\/\/[^"]+)"/);
            if (urlM) imageUrls.push(urlM[1]);
          }
        }

        console.log(`[Grounding] Found ${imageUrls.length} image URLs on page`);

        // Try downloading each image
        for (const imgUrl of imageUrls.slice(0, 3)) {
          const buf = await downloadImageDirect(imgUrl);
          if (buf) {
            console.log(`[Grounding] Got image from: ${pageUrl.slice(0, 60)}`);
            return buf;
          }
        }
      } catch {
        continue;
      }
    }

    console.log("[Grounding] All attempts failed");
    return null;
  } catch (error) {
    console.error("[Grounding] Exception:", error);
    return null;
  }
}

// Download a direct image URL
async function downloadImageDirect(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    if (!res.ok) return null;

    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000 || buf.length > 5 * 1024 * 1024) return null;

    console.log(`[Download] OK: ${buf.length}b from ${url.slice(0, 80)}`);
    return buf;
  } catch {
    return null;
  }
}

// ─── Main Pipeline ───────────────────────────────────────────────────────
async function findProductImage(product: ProductIdentification): Promise<{ buffer: Buffer; ext: string } | null> {
  // Run ALL strategies in parallel
  const [geminiResult, imagenResult, groundingResult] = await Promise.allSettled([
    generateImageWithGemini(product),
    generateImageWithImagen(product),
    findAndDownloadProductImage(product),
  ]);

  // Priority 1: Gemini image gen
  const geminiBase64 = geminiResult.status === "fulfilled" ? geminiResult.value : null;
  if (geminiBase64) {
    console.log("[Pipeline] Using Gemini-generated image");
    return { buffer: Buffer.from(geminiBase64, "base64"), ext: "png" };
  }

  // Priority 2: Imagen
  const imagenBase64 = imagenResult.status === "fulfilled" ? imagenResult.value : null;
  if (imagenBase64) {
    console.log("[Pipeline] Using Imagen-generated image");
    return { buffer: Buffer.from(imagenBase64, "base64"), ext: "png" };
  }

  // Priority 3: Web-sourced image
  const webImage = groundingResult.status === "fulfilled" ? groundingResult.value : null;
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
