import { db } from "@/lib/db";
import { nanoid } from "nanoid";

// ─── Customer Order Tracking ─────────────────────────────
export async function getCustomerOrders(customerId: string) {
  const orders = await db.onlineOrder.findMany({
    where: { customerId },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    items: o.items.map((i) => ({ name: i.product.name, qty: i.quantity, price: Number(i.unitPrice) })),
    total: Number(o.total),
    status: o.status,
    fulfillmentType: o.fulfillmentType,
    createdAt: o.createdAt.toISOString(),
    estimatedDelivery: estimateDelivery(o.createdAt, o.status, o.fulfillmentType),
    deliveryAddress: o.deliveryAddress,
    completedAt: o.completedAt?.toISOString() || null,
  }));
}

// ─── AI Reorder Suggestions ──────────────────────────────
export async function getReorderSuggestions(customerId: string) {
  const purchases = await db.transactionItem.findMany({
    where: { transaction: { customerId, paymentStatus: "COMPLETED" } },
    include: { product: true, transaction: { select: { createdAt: true } } },
    orderBy: { transaction: { createdAt: "desc" } },
    take: 100,
  });

  // Group by product and calculate frequency
  const productMap = new Map<string, { name: string; price: number; imageUrl: string | null; purchases: Date[] }>();

  for (const item of purchases) {
    const key = item.productId;
    if (!productMap.has(key)) {
      productMap.set(key, {
        name: item.product.name,
        price: Number(item.product.retailPrice),
        imageUrl: item.product.imageUrl,
        purchases: [],
      });
    }
    productMap.get(key)!.purchases.push(item.transaction.createdAt);
  }

  const suggestions = [];
  const now = Date.now();

  for (const [productId, data] of productMap) {
    if (data.purchases.length < 2) continue;

    // Calculate average days between purchases
    const sorted = data.purchases.sort((a, b) => b.getTime() - a.getTime());
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      gaps.push((sorted[i].getTime() - sorted[i + 1].getTime()) / 86400000);
    }
    const avgGapDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const daysSinceLastPurchase = (now - sorted[0].getTime()) / 86400000;

    // Check if product is in stock
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product || product.quantity <= 0) continue;

    // Suggest if they're near or past their typical reorder time
    if (daysSinceLastPurchase >= avgGapDays * 0.7) {
      suggestions.push({
        productId,
        name: data.name,
        price: data.price,
        imageUrl: data.imageUrl,
        lastPurchased: sorted[0].toISOString(),
        daysSinceLast: Math.round(daysSinceLastPurchase),
        avgFrequencyDays: Math.round(avgGapDays),
        urgency: daysSinceLastPurchase >= avgGapDays ? "due" : "upcoming",
        inStock: product.quantity > 0,
      });
    }
  }

  return suggestions.sort((a, b) => {
    if (a.urgency === "due" && b.urgency !== "due") return -1;
    if (b.urgency === "due" && a.urgency !== "due") return 1;
    return a.daysSinceLast - b.daysSinceLast;
  }).slice(0, 10);
}

// ─── Customer Wallet ─────────────────────────────────────
export async function getCustomerWallet(customerId: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Customer not found");

  const [activeCoupons, referralCode, stampCount] = await Promise.all([
    db.loyaltyRedemption.findMany({
      where: { customerId, status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: { reward: true },
    }),
    getOrCreateReferralCode(customerId),
    db.transaction.count({
      where: { customerId, paymentStatus: "COMPLETED", createdAt: { gte: firstOfMonth() } },
    }),
  ]);

  return {
    points: customer.loyaltyPoints,
    tier: customer.tier,
    totalSpent: Number(customer.totalSpent),
    visitCount: customer.visitCount,
    coupons: activeCoupons.map((c) => ({
      code: c.couponCode,
      rewardName: c.reward.name,
      expiresAt: c.expiresAt.toISOString(),
    })),
    referralCode,
    stampProgress: { current: Math.min(stampCount, 10), target: 10, reward: "Free mixer 4-pack" },
  };
}

// ─── Referral System ─────────────────────────────────────
export async function getOrCreateReferralCode(customerId: string): Promise<string> {
  let referral = await db.referral.findFirst({ where: { referrerId: customerId } });
  if (referral) return referral.code;

  const code = `SIQ-${nanoid(6).toUpperCase()}`;
  await db.referral.create({ data: { referrerId: customerId, code } });
  return code;
}

export async function processReferral(code: string, newCustomerId: string, storeId: string) {
  const referral = await db.referral.findUnique({ where: { code } });
  if (!referral) return { success: false, error: "Invalid referral code" };
  if (referral.referrerId === newCustomerId) return { success: false, error: "Cannot refer yourself" };

  // Check if already referred
  const existing = await db.referralConversion.findFirst({
    where: { referralId: referral.id, referredId: newCustomerId },
  });
  if (existing) return { success: false, error: "Already referred" };

  // Award points to both parties
  const settings = await db.storeSettings.findUnique({ where: { storeId } });
  const bonusPoints = settings?.referralBonusPoints || 250;

  await db.$transaction([
    db.referralConversion.create({
      data: { referralId: referral.id, referredId: newCustomerId },
    }),
    db.referral.update({ where: { id: referral.id }, data: { conversions: { increment: 1 } } }),
  ]);

  // Award referrer
  const referrer = await db.customer.findUnique({ where: { id: referral.referrerId } });
  if (referrer) {
    await db.$transaction([
      db.customer.update({ where: { id: referrer.id }, data: { loyaltyPoints: { increment: bonusPoints } } }),
      db.loyaltyTransaction.create({
        data: { customerId: referrer.id, storeId, type: "EARN_REFERRAL", points: bonusPoints, balance: referrer.loyaltyPoints + bonusPoints, description: `Referral bonus — new customer signed up` },
      }),
    ]);
  }

  // Award new customer
  const newCust = await db.customer.findUnique({ where: { id: newCustomerId } });
  if (newCust) {
    await db.$transaction([
      db.customer.update({ where: { id: newCustomerId }, data: { loyaltyPoints: { increment: bonusPoints } } }),
      db.loyaltyTransaction.create({
        data: { customerId: newCustomerId, storeId, type: "EARN_REFERRAL", points: bonusPoints, balance: newCust.loyaltyPoints + bonusPoints, description: `Welcome bonus — referred by a friend` },
      }),
    ]);
  }

  return { success: true, pointsAwarded: bonusPoints };
}

// ─── Helpers ─────────────────────────────────────────────
function estimateDelivery(createdAt: Date, status: string, type: string): string | null {
  if (type === "PICKUP") return status === "READY" ? "Ready now" : "~15 min";
  if (["DELIVERED", "PICKED_UP", "CANCELLED"].includes(status)) return null;
  const elapsed = (Date.now() - createdAt.getTime()) / 60000;
  const est = { PENDING: 45, CONFIRMED: 40, PREPARING: 30, READY: 20, OUT_FOR_DELIVERY: 10 }[status] || 30;
  return `${Math.max(1, Math.round(est - elapsed))} min`;
}

function firstOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
