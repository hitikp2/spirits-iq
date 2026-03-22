import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Get Club Plans ──────────────────────────────────────
export async function getClubPlans(storeId: string) {
  return db.clubPlan.findMany({ where: { storeId, isActive: true }, orderBy: { price: "asc" } });
}

// ─── Subscribe Customer ──────────────────────────────────
export async function createSubscription(params: {
  customerId: string; storeId: string; planId: string;
  stripeSubscriptionId?: string; preferences?: Record<string, unknown>;
}) {
  const plan = await db.clubPlan.findUnique({ where: { id: params.planId } });
  if (!plan) throw new Error("Plan not found");

  const sub = await db.clubSubscription.create({
    data: {
      customerId: params.customerId,
      storeId: params.storeId,
      planId: params.planId,
      status: "ACTIVE",
      stripeSubscriptionId: params.stripeSubscriptionId,
      preferences: params.preferences || {},
      nextShipmentDate: getNextShipmentDate(),
    },
  });

  // Apply member discount to customer
  if (plan.discountPercent > 0) {
    await db.customer.update({
      where: { id: params.customerId },
      data: { tags: { push: `club-${plan.slug}` } },
    });
  }

  return sub;
}

// ─── Cancel Subscription ─────────────────────────────────
export async function cancelSubscription(subscriptionId: string) {
  return db.clubSubscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

// ─── AI Curate Monthly Box ───────────────────────────────
export async function curateMonthlyBox(subscriptionId: string) {
  const sub = await db.clubSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, customer: true },
  });
  if (!sub) throw new Error("Subscription not found");

  // Get past shipments to avoid repeats
  const pastShipments = await db.clubShipment.findMany({
    where: { subscriptionId },
    include: { items: true },
    take: 6,
  });
  const pastProductIds = pastShipments.flatMap((s) => s.items.map((i) => i.productId));

  // Get available products
  const products = await db.product.findMany({
    where: {
      storeId: sub.storeId, isActive: true, quantity: { gt: 0 },
      id: { notIn: pastProductIds },
      retailPrice: { gte: sub.plan.minBottlePrice || 0, lte: sub.plan.maxBottlePrice || 9999 },
    },
    include: { category: true },
  });

  // Use AI to curate the selection
  const prefs = sub.preferences as Record<string, unknown> || {};
  const prompt = `Select ${sub.plan.bottlesPerMonth} bottles for a spirits club member.

MEMBER PREFERENCES: ${JSON.stringify(prefs)}
PLAN: ${sub.plan.name} ($${sub.plan.price}/mo, ${sub.plan.bottlesPerMonth} bottles)
AVOID (already sent): ${pastProductIds.join(", ")}

AVAILABLE PRODUCTS:
${products.slice(0, 30).map((p) => `- ${p.id}: ${p.name} (${p.category.name}, $${p.retailPrice}, ${p.abv}% ABV)`).join("\n")}

Return JSON array of product IDs with tasting notes:
[{"productId": "...", "notes": "Brief tasting note and pairing suggestion"}]
Only valid JSON.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "[]";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    // Fallback: pick random products
    const shuffled = products.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sub.plan.bottlesPerMonth).map((p) => ({
      productId: p.id, notes: `A fine ${p.category.name.toLowerCase()} selection.`,
    }));
  }
}

// ─── Create Shipment ─────────────────────────────────────
export async function createShipment(subscriptionId: string, items: Array<{ productId: string; notes?: string }>) {
  const sub = await db.clubSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (!sub) throw new Error("Subscription not found");

  const products = await db.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
  });

  const totalValue = products.reduce((s, p) => s + Number(p.retailPrice), 0);

  const shipment = await db.clubShipment.create({
    data: {
      subscriptionId,
      storeId: sub.storeId,
      status: "PREPARING",
      totalValue,
      items: {
        create: items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          return {
            productId: item.productId,
            price: Number(product?.retailPrice || 0),
            tastingNotes: item.notes,
          };
        }),
      },
    },
    include: { items: { include: { product: true } } },
  });

  // Decrement inventory
  for (const item of items) {
    await db.product.update({
      where: { id: item.productId },
      data: { quantity: { decrement: 1 } },
    });
  }

  // Update next shipment date
  await db.clubSubscription.update({
    where: { id: subscriptionId },
    data: { nextShipmentDate: getNextShipmentDate() },
  });

  return shipment;
}

// ─── Get Customer Shipments ──────────────────────────────
export async function getCustomerShipments(customerId: string) {
  const subs = await db.clubSubscription.findMany({ where: { customerId } });
  const subIds = subs.map((s) => s.id);

  return db.clubShipment.findMany({
    where: { subscriptionId: { in: subIds } },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
}

// ─── Helper ──────────────────────────────────────────────
function getNextShipmentDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1); // 1st of next month
  return d;
}
