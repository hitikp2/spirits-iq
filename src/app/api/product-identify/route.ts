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

// ─── Download image from URL ──────────────────────────────────────────────
async function downloadImage(url: string, minBytes = 3000): Promise<Buffer | null> {
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
    if (buf.length < minBytes || buf.length > 5 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

// ─── Extract product images from retailer HTML ────────────────────────────
function extractProductImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];

  // og:image — most reliable for product pages
  const ogPatterns = [
    /<meta\s+property="og:image"\s+content="([^"]+)"/i,
    /<meta\s+content="([^"]+)"\s+property="og:image"/i,
    /<meta\s+name="og:image"\s+content="([^"]+)"/i,
  ];
  for (const pat of ogPatterns) {
    const m = html.match(pat);
    if (m?.[1]) { images.push(m[1]); break; }
  }

  // twitter:image
  const twPatterns = [
    /<meta\s+(?:property|name)="twitter:image"\s+content="([^"]+)"/i,
    /<meta\s+content="([^"]+)"\s+(?:property|name)="twitter:image"/i,
  ];
  for (const pat of twPatterns) {
    const m = html.match(pat);
    if (m?.[1]) { images.push(m[1]); break; }
  }

  // JSON-LD structured data — Product schema with image
  const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdBlocks) {
    try {
      const content = block.replace(/<\/?script[^>]*>/gi, "");
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"]?.includes("Product")) {
          const img = item.image;
          if (typeof img === "string") images.push(img);
          else if (Array.isArray(img) && typeof img[0] === "string") images.push(img[0]);
          else if (img?.url) images.push(img.url);
          else if (img?.contentUrl) images.push(img.contentUrl);
        }
      }
    } catch { /* skip invalid JSON-LD */ }
  }

  // Large product images from img tags (common patterns in retailer pages)
  const imgMatches = html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi) || [];
  for (const tag of imgMatches.slice(0, 20)) {
    const srcMatch = tag.match(/src="([^"]+)"/);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    // Prefer large product images — skip tiny icons, avatars, logos
    if (src.includes("logo") || src.includes("icon") || src.includes("avatar")) continue;
    if (src.includes("product") || src.includes("bottle") || src.includes("item")) {
      images.push(src);
    }
  }

  // Resolve relative URLs
  return images.map(url => {
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) {
      try { return new URL(url, baseUrl).href; } catch { return url; }
    }
    return url;
  }).filter(url => url.startsWith("http"));
}

// ─── Strategy 1: Direct retailer search + scrape ─────────────────────────
// Search known liquor retailers directly by constructing search URLs
async function searchRetailers(product: ProductIdentification): Promise<Buffer | null> {
  const query = `${product.brand} ${product.name} ${product.size || ""}`.trim();
  const encoded = encodeURIComponent(query);

  // Retailers with predictable search URL patterns
  const searchUrls = [
    `https://www.totalwine.com/search/all?text=${encoded}`,
    `https://www.wine.com/search/${encoded}/`,
    `https://www.thewhiskyexchange.com/search?q=${encoded}`,
    `https://www.caskers.com/catalogsearch/result/?q=${encoded}`,
    `https://www.reservebar.com/search?q=${encoded}`,
    `https://www.minibardelivery.com/store/search?q=${encoded}`,
  ];

  for (const searchUrl of searchUrls) {
    try {
      console.log(`[Retailer] Searching: ${searchUrl.slice(0, 80)}`);
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });

      if (!res.ok) continue;
      const html = await res.text();
      const images = extractProductImages(html, searchUrl);

      for (const imgUrl of images.slice(0, 3)) {
        const buf = await downloadImage(imgUrl);
        if (buf) {
          console.log(`[Retailer] Got image from: ${new URL(searchUrl).hostname}`);
          return buf;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Strategy 2: Gemini Search Grounding → find product pages → scrape ───
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
              text: `Where can I buy "${query}" online? List the URLs to product pages on retailer websites like totalwine.com, wine.com, drizly.com, thewhiskyexchange.com, etc.`
            }]
          }],
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 800 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      console.error(`[Grounding] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const urls: string[] = [];

    // From response text
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts?.length) {
      const responseText = parts.map((p: any) => p.text || "").join(" ");
      console.log(`[Grounding] Response: ${responseText.slice(0, 300)}`);
      const textUrls = responseText.match(/https?:\/\/[^\s"'<>\)\]]+/gi) || [];
      urls.push(...textUrls);
    }

    // From grounding metadata chunks
    const grounding = data.candidates?.[0]?.groundingMetadata;
    if (grounding) {
      if (grounding.groundingChunks) {
        for (const chunk of grounding.groundingChunks) {
          if (chunk.web?.uri) urls.push(chunk.web.uri);
        }
      }
      if (grounding.searchEntryPoint?.renderedContent) {
        const hrefMatches = grounding.searchEntryPoint.renderedContent.match(/href="(https?:\/\/[^"]+)"/gi) || [];
        for (const h of hrefMatches) {
          const m = h.match(/href="([^"]+)"/);
          if (m) urls.push(m[1]);
        }
      }
      console.log(`[Grounding] Metadata keys: ${Object.keys(grounding).join(", ")}`);
    }

    // Deduplicate, filter google.com
    const uniqueUrls = [...new Set(urls)].filter(u =>
      !u.includes("google.com/search") && !u.includes("google.com/url")
    );
    console.log(`[Grounding] Found ${uniqueUrls.length} unique URLs`);

    // Fetch each page and extract product images
    for (const pageUrl of uniqueUrls.slice(0, 5)) {
      try {
        // Direct image URL?
        if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(pageUrl)) {
          const buf = await downloadImage(pageUrl);
          if (buf) return buf;
          continue;
        }

        console.log(`[Grounding] Fetching: ${pageUrl.slice(0, 100)}`);
        const pageRes = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });

        if (!pageRes.ok) continue;
        const html = await pageRes.text();
        const images = extractProductImages(html, pageUrl);
        console.log(`[Grounding] Found ${images.length} images on ${new URL(pageUrl).hostname}`);

        for (const imgUrl of images.slice(0, 3)) {
          const buf = await downloadImage(imgUrl);
          if (buf) {
            console.log(`[Grounding] Got image from: ${pageUrl.slice(0, 80)}`);
            return buf;
          }
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

// ─── Strategy 3: Google Custom Search Images (if configured) ──────────────
// Uses Google Programmable Search Engine for direct image results
async function searchGoogleImages(product: ProductIdentification): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GEMINI_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  try {
    const query = `${product.brand} ${product.name} ${product.size || ""} bottle product photo`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&searchType=image&num=5&imgSize=large`;

    console.log(`[GoogleCSE] Searching images for: ${query}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error(`[GoogleCSE] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    for (const item of data.items || []) {
      if (!item.link) continue;
      const buf = await downloadImage(item.link);
      if (buf) {
        console.log(`[GoogleCSE] Got image: ${item.link.slice(0, 80)}`);
        return buf;
      }
    }
  } catch (error) {
    console.error("[GoogleCSE] Exception:", error);
  }

  return null;
}

// ─── Main Image Pipeline ──────────────────────────────────────────────────
// Priority: Real product photos > Camera photo > Nothing
// We do NOT use AI image generation — it produces wrong/hallucinated products
async function findProductImage(product: ProductIdentification): Promise<{ buffer: Buffer; ext: string } | null> {
  // Run web search strategies in parallel
  const [retailerResult, groundingResult, cseResult] = await Promise.allSettled([
    searchRetailers(product),
    searchWithGrounding(product),
    searchGoogleImages(product),
  ]);

  // Priority 1: Direct retailer scrape (most reliable for exact match)
  const retailerImg = retailerResult.status === "fulfilled" ? retailerResult.value : null;
  if (retailerImg) {
    console.log(`[Pipeline] Using retailer image (${retailerImg.length} bytes)`);
    return { buffer: retailerImg, ext: "jpg" };
  }

  // Priority 2: Grounding-based search
  const groundingImg = groundingResult.status === "fulfilled" ? groundingResult.value : null;
  if (groundingImg) {
    console.log(`[Pipeline] Using grounding image (${groundingImg.length} bytes)`);
    return { buffer: groundingImg, ext: "jpg" };
  }

  // Priority 3: Google Custom Search (if configured)
  const cseImg = cseResult.status === "fulfilled" ? cseResult.value : null;
  if (cseImg) {
    console.log(`[Pipeline] Using Google CSE image (${cseImg.length} bytes)`);
    return { buffer: cseImg, ext: "jpg" };
  }

  console.log("[Pipeline] No real product image found");
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
          { success: false, error: "Could not find a product image from any retailer" } satisfies ApiResponse,
          { status: 422 }
        );
      }

      const fileBase = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);

      if (!imageUrl) {
        return NextResponse.json(
          { success: false, error: "Image found but upload to storage failed" } satisfies ApiResponse,
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

    // Try to find a real product photo from retailers
    const result = await findProductImage(product);
    if (result) {
      imageUrl = await uploadToSupabase(result.buffer, `${fileBase}.${result.ext}`, `image/${result.ext}`);
    }

    // Fallback: upload the user's camera photo (it's a real photo of the product!)
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
