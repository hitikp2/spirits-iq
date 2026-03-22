import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/db/redis";
import { generateText } from "@/lib/ai/gemini";

// ─── Get Price Comparisons ───────────────────────────────
export async function getPriceComparisons(storeId: string) {
  const cacheKey = `pricing:${storeId}:comparisons`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const comparisons = await db.competitorPrice.findMany({
    where: { storeId },
    include: { product: { select: { id: true, name: true, retailPrice: true, category: { select: { name: true } } } } },
    orderBy: { updatedAt: "desc" },
  });

  // Group by product
  const grouped = new Map<string, { product: any; competitors: any[] }>();
  for (const cp of comparisons) {
    if (!grouped.has(cp.productId)) {
      grouped.set(cp.productId, { product: cp.product, competitors: [] });
    }
    grouped.get(cp.productId)!.competitors.push({
      competitor: cp.competitorName,
      price: Number(cp.price),
      url: cp.sourceUrl,
      lastChecked: cp.updatedAt.toISOString(),
    });
  }

  const result = Array.from(grouped.values()).map(({ product, competitors }) => {
    const ourPrice = Number(product.retailPrice);
    const prices = competitors.map((c) => c.price);
    const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : ourPrice;
    const low = prices.length > 0 ? Math.min(...prices) : ourPrice;
    const high = prices.length > 0 ? Math.max(...prices) : ourPrice;

    let position: "below" | "above" | "at" = "at";
    if (ourPrice < avg - 1) position = "below";
    else if (ourPrice > avg + 1) position = "above";

    return {
      productId: product.id,
      productName: product.name,
      category: product.category.name,
      ourPrice,
      marketAvg: Math.round(avg * 100) / 100,
      marketLow: low,
      marketHigh: high,
      position,
      priceDiff: Math.round((ourPrice - avg) * 100) / 100,
      competitors,
    };
  });

  await cacheSet(cacheKey, result, 3600); // 1hr cache
  return result;
}

// ─── Update Competitor Price ─────────────────────────────
export async function updateCompetitorPrice(params: {
  storeId: string; productId: string; competitorName: string;
  price: number; sourceUrl?: string;
}) {
  return db.competitorPrice.upsert({
    where: {
      storeId_productId_competitorName: {
        storeId: params.storeId,
        productId: params.productId,
        competitorName: params.competitorName,
      },
    },
    update: { price: params.price, sourceUrl: params.sourceUrl },
    create: {
      storeId: params.storeId,
      productId: params.productId,
      competitorName: params.competitorName,
      price: params.price,
      sourceUrl: params.sourceUrl,
    },
  });
}

// ─── AI Pricing Recommendations ──────────────────────────
export async function generatePricingRecommendations(storeId: string) {
  const comparisons = await getPriceComparisons(storeId);
  const overpriced = comparisons.filter((c) => c.position === "above" && c.priceDiff > 3);
  const underpriced = comparisons.filter((c) => c.position === "below" && Math.abs(c.priceDiff) > 5);

  if (overpriced.length === 0 && underpriced.length === 0) return [];

  const prompt = `Analyze these liquor store pricing opportunities and give 3-5 specific recommendations.

OVERPRICED (above market avg):
${overpriced.map((p) => `${p.productName}: Ours $${p.ourPrice}, Avg $${p.marketAvg}, Diff +$${p.priceDiff}`).join("\n") || "None"}

UNDERPRICED (below market avg):
${underpriced.map((p) => `${p.productName}: Ours $${p.ourPrice}, Avg $${p.marketAvg}, Diff $${p.priceDiff}`).join("\n") || "None"}

For each recommendation, specify: product, suggested price, expected impact on volume, and reasoning.
Return JSON: [{"productId":"...","productName":"...","currentPrice":0,"suggestedPrice":0,"reason":"...","expectedImpact":"...","confidence":0.0-1.0}]
Only valid JSON.`;

  const text = await generateText(prompt, { maxOutputTokens: 600 }) || "[]";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }
}

// ─── Get Pricing Dashboard Stats ─────────────────────────
export async function getPricingStats(storeId: string) {
  const comparisons = await getPriceComparisons(storeId);
  const below = comparisons.filter((c) => c.position === "below").length;
  const above = comparisons.filter((c) => c.position === "above").length;
  const at = comparisons.filter((c) => c.position === "at").length;

  const potentialRevGain = comparisons
    .filter((c) => c.position === "below" && Math.abs(c.priceDiff) > 3)
    .reduce((s, c) => s + Math.abs(c.priceDiff), 0);

  return {
    totalTracked: comparisons.length,
    belowMarket: below,
    aboveMarket: above,
    atMarket: at,
    competitivenessScore: comparisons.length > 0 ? Math.round(((below + at) / comparisons.length) * 100) : 100,
    potentialMonthlyGain: Math.round(potentialRevGain * 10), // rough estimate
  };
}
