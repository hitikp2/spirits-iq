import { generateText, getModel } from "@/lib/ai/gemini";
import { db } from "@/lib/db";

// ─── SMS Auto-Response ────────────────────────────────────
// Uses RAG against live inventory to answer customer questions

export async function generateSmsResponse(
  customerMessage: string,
  customerId: string,
  storeId: string
): Promise<string> {
  // Fetch customer context
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      transactions: {
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { items: { include: { product: true } } },
      },
    },
  });

  // Fetch relevant inventory (search by keywords in message)
  const keywords = extractKeywords(customerMessage);
  const matchingProducts = await db.product.findMany({
    where: {
      storeId,
      isActive: true,
      OR: keywords.map((kw) => ({
        OR: [
          { name: { contains: kw, mode: "insensitive" as const } },
          { brand: { contains: kw, mode: "insensitive" as const } },
          { category: { name: { contains: kw, mode: "insensitive" as const } } },
        ],
      })),
    },
    include: { category: true },
    take: 10,
  });

  const store = await db.store.findUnique({ where: { id: storeId } });

  const systemPrompt = `You are the AI assistant for ${store?.name}, a premium liquor store. You respond to customer SMS messages with helpful, friendly, concise answers.

RULES:
- Keep responses under 320 characters (SMS limit)
- Be warm and personal — use the customer's first name
- Always check inventory data before claiming availability
- If out of stock, suggest alternatives from available inventory
- Include prices when mentioning products
- Never make up products or prices — only use the data provided
- For age-restricted purchases, remind about ID requirements
- End with a clear call to action (reserve, visit, reply)

CUSTOMER PROFILE:
- Name: ${customer?.firstName || "there"}
- Tier: ${customer?.tier || "REGULAR"}
- Tags: ${customer?.tags?.join(", ") || "none"}
- Recent purchases: ${customer?.transactions
    .flatMap((t) => t.items.map((i) => i.product.name))
    .join(", ") || "none on file"}

CURRENT INVENTORY (matching query):
${matchingProducts
  .map(
    (p) =>
      `- ${p.name} (${p.category.name}): $${p.retailPrice} | ${p.quantity} in stock${p.quantity === 0 ? " [OUT OF STOCK]" : p.quantity <= 5 ? " [LOW STOCK]" : ""}`
  )
  .join("\n") || "No exact matches found in inventory."}

STORE HOURS: ${JSON.stringify(store?.operatingHours || {})}`;

  const model = getModel({ maxOutputTokens: 200, systemInstruction: systemPrompt });
  const result = await model.generateContent(customerMessage);
  return result.response.text() || "Thanks for reaching out! We'll get back to you shortly.";
}

// ─── AI Insights Generation ──────────────────────────────
export async function generateInsights(storeId: string) {
  // Fetch store data for analysis
  const [recentTransactions, lowStockProducts, topProducts] = await Promise.all([
    db.transaction.findMany({
      where: { storeId, createdAt: { gte: daysAgo(30) } },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.product.findMany({
      where: {
        storeId,
        isActive: true,
        quantity: { lte: db.product.fields.reorderPoint },
      },
    }),
    db.product.findMany({
      where: { storeId, isActive: true },
      orderBy: { velocityScore: "desc" },
      take: 20,
    }),
  ]);

  const analysisPrompt = `Analyze this liquor store data and generate 3-5 actionable business insights.

TRANSACTION SUMMARY (last 30 days):
- Total transactions: ${recentTransactions.length}
- Total revenue: $${recentTransactions.reduce((s, t) => s + Number(t.total), 0).toFixed(2)}
- Average ticket: $${(recentTransactions.reduce((s, t) => s + Number(t.total), 0) / recentTransactions.length).toFixed(2)}

LOW STOCK ITEMS: ${lowStockProducts.map((p) => `${p.name} (${p.quantity} left, reorder at ${p.reorderPoint})`).join("; ")}

TOP SELLERS: ${topProducts.slice(0, 10).map((p) => `${p.name}: velocity ${p.velocityScore}/wk`).join("; ")}

Return a JSON array of insights:
[{
  "type": "DEMAND_FORECAST|PRICING_SUGGESTION|REORDER_ALERT|SHRINKAGE_ALERT|TREND_DETECTION|REVENUE_FORECAST",
  "title": "Short title",
  "description": "Actionable description",
  "confidence": 0.0-1.0,
  "priority": 1-10,
  "data": {}
}]

Only return valid JSON, nothing else.`;

  const text = await generateText(analysisPrompt, { maxOutputTokens: 1500 });
  if (!text) return [];

  try {
    const insights = JSON.parse(text.replace(/```json|```/g, "").trim());
    // Save insights to database
    for (const insight of insights) {
      await db.aiInsight.create({
        data: {
          storeId,
          type: insight.type,
          title: insight.title,
          description: insight.description,
          confidence: insight.confidence,
          priority: insight.priority,
          data: insight.data,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    }
    return insights;
  } catch {
    return [];
  }
}

// ─── AI Product Recommendations ──────────────────────────
export async function getUpsellSuggestions(
  cartProductIds: string[],
  customerId: string | null,
  storeId: string
) {
  const cartProducts = await db.product.findMany({
    where: { id: { in: cartProductIds } },
    include: { category: true },
  });

  let customerHistory = "";
  if (customerId) {
    const pastItems = await db.transactionItem.findMany({
      where: { transaction: { customerId, storeId } },
      include: { product: { include: { category: true } } },
      orderBy: { transaction: { createdAt: "desc" } },
      take: 20,
    });
    customerHistory = pastItems
      .map((i) => `${i.product.name} (${i.product.category.name})`)
      .join(", ");
  }

  const prompt = `Given a customer's cart and history, suggest ONE upsell product.

CURRENT CART: ${cartProducts.map((p) => `${p.name} (${p.category.name}, $${p.retailPrice})`).join(", ")}
PURCHASE HISTORY: ${customerHistory || "No history available"}

Suggest a complementary product (mixer, garnish, related spirit, or upgrade). Return JSON:
{"productName": "...", "reason": "...", "attachRate": 0.68}

Only return valid JSON.`;

  const text = await generateText(prompt, { maxOutputTokens: 200 });
  try {
    return JSON.parse(text?.replace(/```json|```/g, "").trim() || "{}");
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────
function extractKeywords(text: string): string[] {
  const stopWords = new Set(["do", "you", "have", "any", "in", "stock", "the", "a", "an", "is", "are", "what", "which", "can", "i", "get", "me", "some", "my"]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
