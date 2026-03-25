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

// ─── Download + validate image ────────────────────────────────────────────
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    // Reject tiny images (logos/icons) and huge files
    if (buf.length < 5000 || buf.length > 5 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

// ─── Strategy 1: Open Food Facts ──────────────────────────────────────────
// Free API, no key needed, has images for many beverage products
async function searchOpenFoodFacts(product: ProductIdentification): Promise<Buffer | null> {
  try {
    const query = `${product.brand} ${product.name}`.trim();
    console.log(`[OFF] Searching: ${query}`);

    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,image_url,image_front_url`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.log(`[OFF] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const products = data.products || [];
    console.log(`[OFF] Found ${products.length} results`);

    for (const p of products) {
      const imgUrl = p.image_front_url || p.image_url;
      if (!imgUrl) continue;

      console.log(`[OFF] Trying: ${imgUrl.slice(0, 100)}`);
      const buf = await downloadImage(imgUrl);
      if (buf) {
        console.log(`[OFF] SUCCESS: ${buf.length} bytes`);
        return buf;
      }
    }
  } catch (error) {
    console.error("[OFF] Exception:", error);
  }
  return null;
}

// ─── Strategy 2: UPC Item DB ──────────────────────────────────────────────
// Free trial API — 100 requests/day, returns product images
async function searchUpcItemDb(product: ProductIdentification): Promise<Buffer | null> {
  try {
    const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
    console.log(`[UPCDB] Searching: ${query}`);

    const url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&match_mode=0&type=product`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.log(`[UPCDB] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const items = data.items || [];
    console.log(`[UPCDB] Found ${items.length} results`);

    for (const item of items) {
      const images: string[] = item.images || [];
      for (const imgUrl of images.slice(0, 3)) {
        const buf = await downloadImage(imgUrl);
        if (buf) {
          console.log(`[UPCDB] SUCCESS: ${buf.length} bytes`);
          return buf;
        }
      }
    }
  } catch (error) {
    console.error("[UPCDB] Exception:", error);
  }
  return null;
}

// ─── Strategy 3: Gemini grounding → direct image URLs from CDNs ──────────
// Ask Gemini to find direct image URLs (not pages to scrape)
async function searchWithGrounding(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
    console.log(`[Grounding] Searching for: ${query}`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `I need a product image URL for: "${query}"

Search for this product and find direct image URLs (CDN links ending in .jpg, .png, or .webp) showing this specific product.

Look on sites like totalwine.com, wine.com, drizly.com, vivino.com, thewhiskyexchange.com.

Return ONLY the direct image URLs, one per line. No other text.`
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
    const allUrls: string[] = [];

    // Extract URLs from response text
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts?.length) {
      const responseText = parts.map((p: any) => p.text || "").join(" ");
      console.log(`[Grounding] Response: ${responseText.slice(0, 300)}`);
      const textUrls = responseText.match(/https?:\/\/[^\s"'<>\)\],]+/gi) || [];
      allUrls.push(...textUrls);
    }

    // Extract URLs from grounding metadata
    const grounding = data.candidates?.[0]?.groundingMetadata;
    if (grounding?.groundingChunks) {
      for (const chunk of grounding.groundingChunks) {
        if (chunk.web?.uri) allUrls.push(chunk.web.uri);
      }
    }

    // Filter to image URLs and product pages
    const imageUrls = allUrls.filter(u =>
      /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) &&
      !u.includes("logo") && !u.includes("icon") && !u.includes("banner")
    );
    const pageUrls = allUrls.filter(u =>
      !imageUrls.includes(u) &&
      !u.includes("google.com") &&
      (u.includes("totalwine.com") || u.includes("wine.com") || u.includes("drizly.com") ||
       u.includes("vivino.com") || u.includes("thewhiskyexchange.com") || u.includes("caskers.com") ||
       u.includes("reservebar.com") || u.includes("minibar"))
    );

    console.log(`[Grounding] Image URLs: ${imageUrls.length}, Page URLs: ${pageUrls.length}`);

    // Try direct image URLs first
    for (const imgUrl of imageUrls.slice(0, 5)) {
      console.log(`[Grounding] Trying image: ${imgUrl.slice(0, 100)}`);
      const buf = await downloadImage(imgUrl);
      if (buf) {
        console.log(`[Grounding] SUCCESS from direct image URL`);
        return buf;
      }
    }

    // Try extracting og:image from product pages
    for (const pageUrl of pageUrls.slice(0, 3)) {
      try {
        console.log(`[Grounding] Trying page: ${pageUrl.slice(0, 100)}`);
        const pageRes = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html",
          },
          signal: AbortSignal.timeout(6000),
          redirect: "follow",
        });
        if (!pageRes.ok) continue;

        const html = await pageRes.text();

        // Only use og:image if it looks like a product image (not a site logo/banner)
        const ogMatch = html.match(/<meta\s+(?:property|content)="og:image"\s+(?:content|property)="([^"]+)"/i)
          || html.match(/<meta\s+(?:property)="og:image"\s+content="([^"]+)"/i)
          || html.match(/content="([^"]+)"\s+property="og:image"/i);

        if (ogMatch?.[1]) {
          const ogUrl = ogMatch[1];
          // Reject if it's clearly a site-wide banner/logo
          if (ogUrl.includes("logo") || ogUrl.includes("banner") || ogUrl.includes("hero") ||
              ogUrl.includes("social-share") || ogUrl.includes("og-default")) {
            console.log(`[Grounding] Skipping site banner: ${ogUrl.slice(0, 80)}`);
            continue;
          }
          const buf = await downloadImage(ogUrl);
          if (buf) {
            console.log(`[Grounding] SUCCESS from og:image`);
            return buf;
          }
        }

        // Try JSON-LD Product schema
        const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (const block of ldBlocks) {
          try {
            const content = block.replace(/<\/?script[^>]*>/gi, "");
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
              if (!item["@type"]?.toString().includes("Product")) continue;
              const img = typeof item.image === "string" ? item.image :
                Array.isArray(item.image) ? item.image[0] :
                item.image?.url || item.image?.contentUrl;
              if (img) {
                const buf = await downloadImage(img);
                if (buf) return buf;
              }
            }
          } catch { /* skip */ }
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error("[Grounding] Exception:", error);
    return null;
  }
}

// ─── Strategy 4: Google Custom Search Images (if configured) ──────────────
async function searchGoogleImages(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GEMINI_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""} product photo`;
    console.log(`[GoogleCSE] Searching: ${query}`);

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&searchType=image&num=5&imgSize=large`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();
    for (const item of data.items || []) {
      if (!item.link) continue;
      const buf = await downloadImage(item.link);
      if (buf) {
        console.log(`[GoogleCSE] SUCCESS: ${item.link.slice(0, 80)}`);
        return buf;
      }
    }
  } catch (error) {
    console.error("[GoogleCSE] Exception:", error);
  }
  return null;
}

// ─── Main Image Pipeline ──────────────────────────────────────────────────
async function findProductImage(product: ProductIdentification): Promise<{ buffer: Buffer; ext: string } | null> {
  // Run all strategies in parallel
  const [offResult, upcResult, groundingResult, cseResult] = await Promise.allSettled([
    searchOpenFoodFacts(product),
    searchUpcItemDb(product),
    searchWithGrounding(product),
    searchGoogleImages(product),
  ]);

  // Priority 1: Open Food Facts (verified product database, exact matches)
  const offImg = offResult.status === "fulfilled" ? offResult.value : null;
  if (offImg) {
    console.log(`[Pipeline] Using Open Food Facts image`);
    return { buffer: offImg, ext: "jpg" };
  }

  // Priority 2: UPC Item DB (product database with images)
  const upcImg = upcResult.status === "fulfilled" ? upcResult.value : null;
  if (upcImg) {
    console.log(`[Pipeline] Using UPC Item DB image`);
    return { buffer: upcImg, ext: "jpg" };
  }

  // Priority 3: Grounding search (Google-sourced image URLs)
  const groundingImg = groundingResult.status === "fulfilled" ? groundingResult.value : null;
  if (groundingImg) {
    console.log(`[Pipeline] Using grounding image`);
    return { buffer: groundingImg, ext: "jpg" };
  }

  // Priority 4: Google Custom Search (if configured)
  const cseImg = cseResult.status === "fulfilled" ? cseResult.value : null;
  if (cseImg) {
    console.log(`[Pipeline] Using Google CSE image`);
    return { buffer: cseImg, ext: "jpg" };
  }

  console.log("[Pipeline] No product image found from any source");
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
          { success: false, error: "Could not find a product image" } satisfies ApiResponse,
          { status: 422 }
        );
      }

      const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);

      if (!imageUrl) {
        return NextResponse.json(
          { success: false, error: "Image found but upload failed" } satisfies ApiResponse,
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

    // Try to find a real product photo
    const result = await findProductImage(product);
    if (result) {
      imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);
    }

    // Fallback: upload the user's camera photo (always a real photo of the product)
    if (!imageUrl) {
      const rawBuffer = Buffer.from(base64Data, "base64");
      imageUrl = await uploadToSupabase(rawBuffer, `${fileBase}_raw.jpg`, "image/jpeg");
      console.log("[Identify] Using camera photo as product image");
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
