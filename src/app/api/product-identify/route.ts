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

// ─── Build a precise search query for SKU-specific image matching ─────────
// "Ciroc Pineapple 750ml bottle" not just "Ciroc"
function buildImageQuery(product: ProductIdentification): string {
  const parts: string[] = [];
  if (product.brand) parts.push(product.brand);
  if (product.name && product.name !== product.brand) parts.push(product.name);
  if (product.size) parts.push(product.size);
  return parts.join(" ").trim();
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
    if (buf.length < 5000 || buf.length > 5 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

// ─── Strategy 1: Google Custom Search Image API ──────────────────────────
// Best source for SKU-specific product photos (Ciroc Pineapple vs Mango)
// Requires: GOOGLE_CSE_ID env var (free, 100 searches/day)
// Setup: https://programmablesearchengine.google.com → Create → Search entire web → Get ID
async function searchGoogleCSE(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GEMINI_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  try {
    const query = buildImageQuery(product) + " bottle product photo";
    console.log(`[GoogleCSE] Searching: ${query}`);

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&searchType=image&num=10&imgSize=large&imgType=photo&safe=off`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[GoogleCSE] HTTP ${res.status}: ${errText.slice(0, 150)}`);
      return null;
    }

    const data = await res.json();
    const items = data.items || [];
    console.log(`[GoogleCSE] Got ${items.length} image results`);

    // Prefer images from known retailer CDNs (highest quality product photos)
    const preferredDomains = [
      "totalwine.com", "wine.com", "target.com", "walmart.com",
      "kroger.com", "ralphs.com", "bevmo.com", "drizly.com",
      "instacart.com", "liquor.com", "thewhiskyexchange.com",
      "caskers.com", "reservebar.com", "vivino.com",
      // CDN domains used by retailers
      "scene7.com", "cloudinary.com", "shopify.com", "walmartimages.com",
      "target.scene7.com", "media.totalwine.com",
    ];

    // Sort: preferred retailer images first
    const sorted = [...items].sort((a: any, b: any) => {
      const aPreferred = preferredDomains.some(d => a.link?.includes(d) || a.displayLink?.includes(d));
      const bPreferred = preferredDomains.some(d => b.link?.includes(d) || b.displayLink?.includes(d));
      if (aPreferred && !bPreferred) return -1;
      if (!aPreferred && bPreferred) return 1;
      return 0;
    });

    for (const item of sorted) {
      if (!item.link) continue;
      // Skip tiny thumbnails
      if (item.image?.width && item.image.width < 150) continue;
      if (item.image?.height && item.image.height < 150) continue;

      console.log(`[GoogleCSE] Trying: ${item.displayLink} — ${item.link.slice(0, 100)}`);
      const buf = await downloadImage(item.link);
      if (buf) {
        console.log(`[GoogleCSE] SUCCESS from ${item.displayLink}: ${buf.length} bytes`);
        return buf;
      }
    }
  } catch (error) {
    console.error("[GoogleCSE] Exception:", error);
  }
  return null;
}

// ─── Strategy 2: Google Knowledge Graph → Wikipedia ──────────────────────
// Good for brand-level images, less precise for specific SKUs
async function searchKnowledgeGraph(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    // Use full product name for SKU-specific matching
    const query = buildImageQuery(product);
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

      console.log(`[KG] Entity: "${result.name}", Image: ${imgUrl.slice(0, 100)}`);
      const buf = await downloadImage(imgUrl);
      if (buf) {
        console.log(`[KG] SUCCESS: ${buf.length} bytes`);
        return buf;
      }
    }

    // Try Wikipedia from detailedDescription
    for (const el of elements) {
      const wikiUrl = el.result?.detailedDescription?.url;
      if (!wikiUrl?.includes("wikipedia.org")) continue;

      const titleMatch = wikiUrl.match(/\/wiki\/(.+?)(?:#|$)/);
      if (!titleMatch) continue;

      console.log(`[KG→Wiki] Trying: ${titleMatch[1]}`);
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(decodeURIComponent(titleMatch[1]))}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!wikiRes.ok) continue;

      const wikiData = await wikiRes.json();
      const wikiImgUrl = wikiData.originalimage?.source || wikiData.thumbnail?.source;
      if (!wikiImgUrl) continue;

      const buf = await downloadImage(wikiImgUrl);
      if (buf) {
        console.log(`[KG→Wiki] SUCCESS: ${buf.length} bytes`);
        return buf;
      }
    }
  } catch (error) {
    console.error("[KG] Exception:", error);
  }
  return null;
}

// ─── Strategy 3: Open Food Facts ──────────────────────────────────────────
async function searchOpenFoodFacts(product: ProductIdentification): Promise<Buffer | null> {
  try {
    const query = buildImageQuery(product);
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

// ─── Strategy 4: UPC Item DB ──────────────────────────────────────────────
async function searchUpcItemDb(product: ProductIdentification): Promise<Buffer | null> {
  try {
    const query = buildImageQuery(product);
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

// ─── Strategy 5: Gemini grounding → direct image URLs ────────────────────
async function searchWithGrounding(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const query = buildImageQuery(product);
    console.log(`[Grounding] Searching for: ${query}`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Find a product image URL for: "${query}"

I need a direct URL to an image file (.jpg/.png/.webp) showing this exact product variant/flavor.
Search retailer sites like totalwine.com, target.com, walmart.com, ralphs.com.
Return ONLY direct image file URLs, one per line.`
            }]
          }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const allUrls: string[] = [];

    // From response text
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts?.length) {
      const responseText = parts.map((p: any) => p.text || "").join(" ");
      console.log(`[Grounding] Response: ${responseText.slice(0, 300)}`);
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

    // Try direct image URLs first
    const imageUrls = allUrls.filter(u =>
      /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) &&
      !/logo|icon|banner|favicon|sprite/i.test(u)
    );

    for (const imgUrl of imageUrls.slice(0, 8)) {
      const buf = await downloadImage(imgUrl);
      if (buf) {
        console.log(`[Grounding] SUCCESS: ${buf.length} bytes`);
        return buf;
      }
    }

    // Try product page URLs (with validation)
    const pageUrls = allUrls.filter(u =>
      !imageUrls.includes(u) && !u.includes("google.com")
    );

    for (const pageUrl of pageUrls.slice(0, 3)) {
      try {
        const pageRes = await fetch(pageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Accept": "text/html" },
          signal: AbortSignal.timeout(6000),
          redirect: "follow",
        });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();

        // Validate: page title must mention the product
        const titleMatch = html.match(/<title[^>]*>([^<]+)</i)
          || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
        const titleText = (titleMatch?.[1] || "").toLowerCase();
        const brandLower = product.brand.toLowerCase();
        if (titleText && !titleText.includes(brandLower) && !titleText.includes(product.name.toLowerCase().split(" ")[0])) {
          console.log(`[Grounding] Skip: "${titleMatch?.[1]?.slice(0, 50)}" — not product page`);
          continue;
        }

        // Reject homepage og:type
        const ogType = html.match(/<meta\s+property="og:type"\s+content="([^"]+)"/i)?.[1];
        if (ogType === "website") continue;

        // Get og:image
        const ogImg = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
          || html.match(/content="([^"]+)"\s+property="og:image"/i)?.[1];
        if (ogImg) {
          const buf = await downloadImage(ogImg);
          if (buf) return buf;
        }

        // Try JSON-LD Product image
        const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (const block of ldBlocks) {
          try {
            const parsed = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ""));
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
              if (!item["@type"]?.toString().includes("Product")) continue;
              const img = typeof item.image === "string" ? item.image :
                Array.isArray(item.image) ? item.image[0] : item.image?.url;
              if (img) {
                const buf = await downloadImage(img);
                if (buf) return buf;
              }
            }
          } catch { /* skip */ }
        }
      } catch { continue; }
    }

    return null;
  } catch (error) {
    console.error("[Grounding] Exception:", error);
    return null;
  }
}

// ─── Main Image Pipeline ──────────────────────────────────────────────────
async function findProductImage(product: ProductIdentification): Promise<{ buffer: Buffer; ext: string } | null> {
  // Run all strategies in parallel
  const [cseResult, kgResult, offResult, upcResult, groundingResult] = await Promise.allSettled([
    searchGoogleCSE(product),
    searchKnowledgeGraph(product),
    searchOpenFoodFacts(product),
    searchUpcItemDb(product),
    searchWithGrounding(product),
  ]);

  // Priority 1: Google Custom Search (SKU-specific, retailer quality)
  const cseImg = cseResult.status === "fulfilled" ? cseResult.value : null;
  if (cseImg) {
    console.log(`[Pipeline] Using Google CSE image (best quality)`);
    return { buffer: cseImg, ext: "jpg" };
  }

  // Priority 2: Knowledge Graph + Wikipedia
  const kgImg = kgResult.status === "fulfilled" ? kgResult.value : null;
  if (kgImg) {
    console.log(`[Pipeline] Using Knowledge Graph image`);
    return { buffer: kgImg, ext: "jpg" };
  }

  // Priority 3: Open Food Facts
  const offImg = offResult.status === "fulfilled" ? offResult.value : null;
  if (offImg) {
    console.log(`[Pipeline] Using Open Food Facts image`);
    return { buffer: offImg, ext: "jpg" };
  }

  // Priority 4: UPC Item DB
  const upcImg = upcResult.status === "fulfilled" ? upcResult.value : null;
  if (upcImg) {
    console.log(`[Pipeline] Using UPC Item DB image`);
    return { buffer: upcImg, ext: "jpg" };
  }

  // Priority 5: Grounding
  const groundingImg = groundingResult.status === "fulfilled" ? groundingResult.value : null;
  if (groundingImg) {
    console.log(`[Pipeline] Using grounding image`);
    return { buffer: groundingImg, ext: "jpg" };
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

    // ─── Action: bulk-refresh ─────────────────────────────────────────
    if (action === "bulk-refresh") {
      const storeId = request.headers.get("x-store-id") || body.storeId;
      if (!storeId) {
        return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
      }

      const { db } = await import("@/lib/db");
      const products = await db.product.findMany({
        where: { storeId, isActive: true, OR: [{ imageUrl: null }, { imageUrl: "" }] },
        select: { id: true, name: true, brand: true, size: true },
        take: 20,
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
        console.log(`[BulkRefresh] ✓ ${p.brand} ${p.name}`);
      }

      return NextResponse.json({ success: true, data: { total: products.length, updated } } satisfies ApiResponse);
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
      systemInstruction: `You are a liquor store product identification assistant. Analyze the product photo and return ONLY a JSON object. Be precise about the EXACT variant/flavor — distinguish between e.g. "Ciroc Pineapple" vs "Ciroc Mango", "Hennessy XO" vs "Hennessy VS". Include the full specific product name.`,
    });

    const identifyResult = await model.generateContent([
      { inlineData: { mimeType: "image/jpeg", data: base64Data } },
      `Identify this product precisely. ${barcode ? `Barcode: ${barcode}.` : ""}
Include the EXACT variant, flavor, or sub-type (e.g. "Hennessy XO Cognac" not just "Hennessy", "Ciroc Pineapple Vodka" not just "Ciroc").
Return ONLY valid JSON (no markdown, no code fences):
{
  "name": "Full specific product name including variant/flavor",
  "brand": "Brand name",
  "category": "spirits|wine|beer|mixer|other",
  "size": "e.g. 750ml, 1L, 12oz, 6-pack",
  "abv": "e.g. 40%, 5%, 13.5%",
  "retailPrice": 0.00,
  "costPrice": 0.00,
  "description": "Brief 1-line description",
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

    // Fallback: user's camera photo
    if (!imageUrl) {
      const rawBuffer = Buffer.from(base64Data, "base64");
      imageUrl = await uploadToSupabase(rawBuffer, `${fileBase}_raw.jpg`, "image/jpeg");
      console.log("[Identify] Using camera photo as product image");
    }

    if (imageUrl) product.imageUrl = imageUrl;

    return NextResponse.json({ success: true, data: product } satisfies ApiResponse);
  } catch (error) {
    console.error("Product identify error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to identify product" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
