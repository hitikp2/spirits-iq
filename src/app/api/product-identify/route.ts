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
    // Reject tiny images (logos/icons <5KB) and huge files
    if (buf.length < 5000 || buf.length > 5 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

// ─── Strategy 1: Google Knowledge Graph Search API ────────────────────────
// Free (500 req/day), uses same Google API key, returns entity images
async function searchKnowledgeGraph(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${product.brand} ${product.name}`.trim();
    console.log(`[KG] Searching: ${query}`);

    const url = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(query)}&key=${apiKey}&limit=5&types=Thing`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      console.log(`[KG] HTTP ${res.status}: ${(await res.text()).slice(0, 100)}`);
      return null;
    }

    const data = await res.json();
    const elements = data.itemListElement || [];
    console.log(`[KG] Found ${elements.length} entities`);

    for (const el of elements) {
      const result = el.result;
      const imgUrl = result?.image?.contentUrl || result?.image?.url;
      if (!imgUrl) continue;

      console.log(`[KG] Entity: ${result.name}, Image: ${imgUrl.slice(0, 100)}`);
      const buf = await downloadImage(imgUrl);
      if (buf) {
        console.log(`[KG] SUCCESS: ${buf.length} bytes for "${result.name}"`);
        return buf;
      }
    }

    // Also check detailedDescription for image URLs
    for (const el of elements) {
      const detail = el.result?.detailedDescription;
      if (!detail?.url) continue;
      // Wikipedia article — try to get the main image
      if (detail.url.includes("wikipedia.org")) {
        const wikiImg = await getWikipediaImage(detail.url);
        if (wikiImg) return wikiImg;
      }
    }
  } catch (error) {
    console.error("[KG] Exception:", error);
  }
  return null;
}

// ─── Helper: Get main image from a Wikipedia article ──────────────────────
async function getWikipediaImage(wikiUrl: string): Promise<Buffer | null> {
  try {
    // Extract article title from URL
    const titleMatch = wikiUrl.match(/\/wiki\/(.+?)(?:#|$)/);
    if (!titleMatch) return null;
    const title = decodeURIComponent(titleMatch[1]);

    console.log(`[Wiki] Getting image for: ${title}`);

    // Use Wikipedia API to get the page image
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(apiUrl, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const imgUrl = data.originalimage?.source || data.thumbnail?.source;
    if (!imgUrl) return null;

    console.log(`[Wiki] Image URL: ${imgUrl.slice(0, 100)}`);
    return await downloadImage(imgUrl);
  } catch {
    return null;
  }
}

// ─── Strategy 2: Open Food Facts ──────────────────────────────────────────
async function searchOpenFoodFacts(product: ProductIdentification): Promise<Buffer | null> {
  try {
    const query = `${product.brand} ${product.name}`.trim();
    console.log(`[OFF] Searching: ${query}`);

    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,image_url,image_front_url`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();
    for (const p of (data.products || [])) {
      const imgUrl = p.image_front_url || p.image_url;
      if (!imgUrl) continue;
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

// ─── Strategy 3: UPC Item DB ──────────────────────────────────────────────
async function searchUpcItemDb(product: ProductIdentification): Promise<Buffer | null> {
  try {
    const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
    console.log(`[UPCDB] Searching: ${query}`);

    const url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&match_mode=0&type=product`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    for (const item of (data.items || [])) {
      for (const imgUrl of (item.images || []).slice(0, 3)) {
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

// ─── Strategy 4: Gemini grounding → find direct image URLs ───────────────
async function searchWithGrounding(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
    console.log(`[Grounding] Searching for: ${query}`);

    // Ask Gemini to find the DIRECT IMAGE URL (CDN link), not a page URL
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Find me a direct product image URL for: "${query}"

I need a URL that points directly to a .jpg, .png, or .webp image file of this product (the bottle/can/package).
The URL should be from a CDN or image hosting service, NOT a webpage.
Good sources: product image CDNs, Wikipedia commons, retailer CDN domains.

Return ONLY image URLs (one per line), nothing else. Each URL must end with an image extension (.jpg, .jpeg, .png, .webp).`
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

    // From response text
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts?.length) {
      const responseText = parts.map((p: any) => p.text || "").join(" ");
      console.log(`[Grounding] Response: ${responseText.slice(0, 400)}`);
      const textUrls = responseText.match(/https?:\/\/[^\s"'<>\)\],]+/gi) || [];
      allUrls.push(...textUrls);
    }

    // From grounding metadata
    const grounding = data.candidates?.[0]?.groundingMetadata;
    if (grounding?.groundingChunks) {
      for (const chunk of grounding.groundingChunks) {
        if (chunk.web?.uri) allUrls.push(chunk.web.uri);
      }
    }
    console.log(`[Grounding] Total URLs found: ${allUrls.length}`);

    // Separate: direct image URLs vs page URLs
    const imageUrls = allUrls.filter(u =>
      /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)
    );
    const pageUrls = allUrls.filter(u =>
      !imageUrls.includes(u) && !u.includes("google.com")
    );

    console.log(`[Grounding] Direct images: ${imageUrls.length}, Pages: ${pageUrls.length}`);

    // Try direct image URLs first (most reliable, no scraping needed)
    for (const imgUrl of imageUrls.slice(0, 8)) {
      // Skip known bad patterns
      if (/logo|icon|banner|favicon|sprite|avatar/i.test(imgUrl)) continue;
      console.log(`[Grounding] Trying: ${imgUrl.slice(0, 120)}`);
      const buf = await downloadImage(imgUrl);
      if (buf) {
        console.log(`[Grounding] SUCCESS: direct image ${buf.length} bytes`);
        return buf;
      }
    }

    // Try page URLs — but VALIDATE the page is actually a product page
    for (const pageUrl of pageUrls.slice(0, 3)) {
      try {
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

        // Check og:title — if it's just the site name (no product name), skip
        const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
          || html.match(/content="([^"]+)"\s+property="og:title"/i);
        const pageTitle = ogTitleMatch?.[1] || "";
        const brandLower = product.brand.toLowerCase();
        const nameLower = product.name.toLowerCase();
        const titleLower = pageTitle.toLowerCase();

        // Reject if page title doesn't mention the product at all
        if (pageTitle && !titleLower.includes(brandLower) && !titleLower.includes(nameLower.split(" ")[0])) {
          console.log(`[Grounding] Skipping "${pageTitle}" — doesn't match product`);
          continue;
        }

        // Check og:type — "website" means homepage/generic, "product" means product page
        const ogTypeMatch = html.match(/<meta\s+property="og:type"\s+content="([^"]+)"/i);
        if (ogTypeMatch?.[1] === "website") {
          console.log(`[Grounding] Skipping ${new URL(pageUrl).hostname} — og:type=website (homepage)`);
          continue;
        }

        // Extract og:image
        const ogImgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
          || html.match(/content="([^"]+)"\s+property="og:image"/i);
        if (ogImgMatch?.[1]) {
          const buf = await downloadImage(ogImgMatch[1]);
          if (buf) {
            console.log(`[Grounding] SUCCESS: og:image from ${new URL(pageUrl).hostname}`);
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
          } catch { /* skip invalid JSON-LD */ }
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

// ─── Strategy 5: Google Custom Search Images (optional) ───────────────────
async function searchGoogleCSE(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GEMINI_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""} bottle`;
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
  // Run all strategies in parallel for speed
  const [kgResult, offResult, upcResult, groundingResult, cseResult] = await Promise.allSettled([
    searchKnowledgeGraph(product),
    searchOpenFoodFacts(product),
    searchUpcItemDb(product),
    searchWithGrounding(product),
    searchGoogleCSE(product),
  ]);

  // Priority 1: Knowledge Graph (high-quality entity images from Google)
  const kgImg = kgResult.status === "fulfilled" ? kgResult.value : null;
  if (kgImg) {
    console.log(`[Pipeline] Using Knowledge Graph image`);
    return { buffer: kgImg, ext: "jpg" };
  }

  // Priority 2: Open Food Facts (verified product database)
  const offImg = offResult.status === "fulfilled" ? offResult.value : null;
  if (offImg) {
    console.log(`[Pipeline] Using Open Food Facts image`);
    return { buffer: offImg, ext: "jpg" };
  }

  // Priority 3: UPC Item DB
  const upcImg = upcResult.status === "fulfilled" ? upcResult.value : null;
  if (upcImg) {
    console.log(`[Pipeline] Using UPC Item DB image`);
    return { buffer: upcImg, ext: "jpg" };
  }

  // Priority 4: Grounding (with page validation)
  const groundingImg = groundingResult.status === "fulfilled" ? groundingResult.value : null;
  if (groundingImg) {
    console.log(`[Pipeline] Using grounding image`);
    return { buffer: groundingImg, ext: "jpg" };
  }

  // Priority 5: Google Custom Search (if configured)
  const cseImg = cseResult.status === "fulfilled" ? cseResult.value : null;
  if (cseImg) {
    console.log(`[Pipeline] Using Google CSE image`);
    return { buffer: cseImg, ext: "jpg" };
  }

  console.log("[Pipeline] No product image found");
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

    // ─── Action: bulk-refresh — refresh all products missing images ───
    if (action === "bulk-refresh") {
      const storeId = request.headers.get("x-store-id") || body.storeId;
      if (!storeId) {
        return NextResponse.json(
          { success: false, error: "storeId required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const { db } = await import("@/lib/db");
      const products = await db.product.findMany({
        where: {
          storeId,
          isActive: true,
          OR: [
            { imageUrl: null },
            { imageUrl: "" },
          ],
        },
        select: { id: true, name: true, brand: true, size: true },
        take: 20, // Limit to avoid timeout
      });

      console.log(`[BulkRefresh] Found ${products.length} products without images`);

      let updated = 0;
      for (const p of products) {
        const product: ProductIdentification = {
          name: p.name, brand: p.brand || "", category: "", size: p.size || "",
          abv: "", retailPrice: 0, costPrice: 0, description: "", isAgeRestricted: false,
        };

        const result = await findProductImage(product);
        if (!result) continue;

        const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);
        if (!imageUrl) continue;

        await db.product.update({ where: { id: p.id }, data: { imageUrl } });
        updated++;
        console.log(`[BulkRefresh] Updated ${p.brand} ${p.name}`);
      }

      return NextResponse.json({
        success: true,
        data: { total: products.length, updated }
      } satisfies ApiResponse);
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

    // Fallback: upload the user's camera photo (it IS a real photo of the product)
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
