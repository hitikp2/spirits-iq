import { db } from "@/lib/db";
import { cacheGet, cacheSet, cacheDelete } from "@/lib/db/redis";
import { getUpsellSuggestions } from "@/lib/ai";

// ─── Storefront Product Browsing ─────────────────────────
export async function getStorefrontProducts(
  storeId: string,
  options?: {
    categoryId?: string;
    search?: string;
    sortBy?: "popular" | "price-asc" | "price-desc" | "newest" | "rating";
    page?: number;
    limit?: number;
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
  }
) {
  const {
    categoryId, search, sortBy = "popular", page = 1, limit = 20,
    minPrice, maxPrice, tags,
  } = options || {};

  const cacheKey = `storefront:${storeId}:${JSON.stringify(options)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {
    storeId,
    isActive: true,
    quantity: { gt: 0 }, // Only show in-stock items
  };

  if (categoryId) where.categoryId = categoryId;
  if (minPrice || maxPrice) {
    where.retailPrice = {};
    if (minPrice) (where.retailPrice as any).gte = minPrice;
    if (maxPrice) (where.retailPrice as any).lte = maxPrice;
  }
  if (tags?.length) where.tags = { hasSome: tags };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { brand: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy = {
    popular: { velocityScore: "desc" as const },
    "price-asc": { retailPrice: "asc" as const },
    "price-desc": { retailPrice: "desc" as const },
    newest: { createdAt: "desc" as const },
    rating: { velocityScore: "desc" as const }, // Would use avg rating in production
  }[sortBy];

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: where as any,
      include: {
        category: true,
        _count: { select: { lineItems: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.product.count({ where: where as any }),
  ]);

  const result = {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category.name,
      categoryId: p.categoryId,
      price: Number(p.retailPrice),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
      size: p.size,
      abv: p.abv ? Number(p.abv) : null,
      vintage: p.vintage,
      region: p.region,
      imageUrl: p.imageUrl,
      tags: p.tags,
      inStock: p.quantity > 0,
      lowStock: p.quantity > 0 && p.quantity <= p.reorderPoint,
      salesCount: p._count.lineItems,
    })),
    meta: { page, limit, total, hasMore: page * limit < total },
  };

  await cacheSet(cacheKey, result, 180);
  return result;
}

// ─── Get Featured / Curated Collections ──────────────────
export async function getFeaturedProducts(storeId: string) {
  const cacheKey = `storefront:${storeId}:featured`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const config = await db.storefrontConfig.findUnique({
    where: { storeId },
  });

  const [staffPicks, bestSellers, newArrivals] = await Promise.all([
    db.product.findMany({
      where: { storeId, isActive: true, tags: { has: "staff-pick" }, quantity: { gt: 0 } },
      include: { category: true },
      take: 6,
    }),
    db.product.findMany({
      where: { storeId, isActive: true, quantity: { gt: 0 } },
      include: { category: true },
      orderBy: { velocityScore: "desc" },
      take: 6,
    }),
    db.product.findMany({
      where: { storeId, isActive: true, quantity: { gt: 0 } },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const result = {
    config,
    collections: [
      { title: "Staff Picks", slug: "staff-picks", products: staffPicks },
      { title: "Best Sellers", slug: "best-sellers", products: bestSellers },
      { title: "Just Arrived", slug: "new-arrivals", products: newArrivals },
    ],
  };

  await cacheSet(cacheKey, result, 300);
  return result;
}

// ─── Create Online Order ─────────────────────────────────
export async function createOnlineOrder(params: {
  storeId: string;
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
  fulfillmentType: "PICKUP" | "DELIVERY";
  deliveryAddress?: string;
  deliveryNotes?: string;
  couponCode?: string;
  tip?: number;
  stripePaymentId?: string;
}) {
  const store = await db.store.findUnique({ where: { id: params.storeId } });
  if (!store) throw new Error("Store not found");

  const storefrontConfig = await db.storefrontConfig.findUnique({
    where: { storeId: params.storeId },
  });

  // Validate and price items
  const productIds = params.items.map((i) => i.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds }, storeId: params.storeId, isActive: true },
  });

  const pricedItems = params.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);
    if (product.quantity < item.quantity) throw new Error(`${product.name} only has ${product.quantity} in stock`);
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: Number(product.retailPrice),
      total: Number(product.retailPrice) * item.quantity,
    };
  });

  const subtotal = pricedItems.reduce((s, i) => s + i.total, 0);
  const taxRate = Number(store.taxRate);
  const taxAmount = subtotal * taxRate;

  let deliveryFee = 0;
  if (params.fulfillmentType === "DELIVERY") {
    const freeMin = Number(storefrontConfig?.freeDeliveryMin || 75);
    deliveryFee = subtotal >= freeMin ? 0 : Number(storefrontConfig?.deliveryFee || 5.99);
  }

  const total = subtotal + taxAmount + deliveryFee + (params.tip || 0);

  // Generate order number
  const orderCount = await db.onlineOrder.count({ where: { storeId: params.storeId } });
  const orderNumber = `ORD-${(orderCount + 1).toString().padStart(6, "0")}`;

  // Get AI recommendations for confirmation page
  const aiRecs = await getUpsellSuggestions(productIds, params.customerId, params.storeId);

  const order = await db.$transaction(async (tx) => {
    const ord = await tx.onlineOrder.create({
      data: {
        orderNumber,
        storeId: params.storeId,
        customerId: params.customerId,
        subtotal,
        taxAmount,
        deliveryFee,
        tipAmount: params.tip || 0,
        total,
        fulfillmentType: params.fulfillmentType,
        status: "PENDING",
        deliveryAddress: params.deliveryAddress,
        deliveryNotes: params.deliveryNotes,
        stripePaymentId: params.stripePaymentId,
        paymentStatus: params.stripePaymentId ? "COMPLETED" : "PENDING",
        couponCode: params.couponCode,
        aiRecommendations: aiRecs,
        items: {
          create: pricedItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
        },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    // Decrement inventory
    for (const item of pricedItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: item.quantity } },
      });
    }

    return ord;
  });

  // Award loyalty points
  await awardLoyaltyPoints(params.customerId, params.storeId, subtotal, order.id);

  await cacheDelete(`storefront:${params.storeId}:*`);
  await cacheDelete(`inventory:${params.storeId}:*`);

  return order;
}

// ─── Update Order Status ─────────────────────────────────
export async function updateOrderStatus(
  orderId: string,
  status: string,
  metadata?: Record<string, unknown>
) {
  const updateData: Record<string, unknown> = { status };

  if (status === "PREPARING") updateData.preparedAt = new Date();
  if (status === "DELIVERED" || status === "PICKED_UP") updateData.completedAt = new Date();
  if (status === "CANCELLED") {
    // Restore inventory
    const order = await db.onlineOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (order) {
      for (const item of order.items) {
        await db.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }
    }
  }

  return db.onlineOrder.update({
    where: { id: orderId },
    data: updateData,
    include: { items: { include: { product: true } }, customer: true },
  });
}

// ─── Helper: Award Loyalty Points ────────────────────────
async function awardLoyaltyPoints(
  customerId: string,
  storeId: string,
  amount: number,
  reference: string
) {
  const config = await db.loyaltyConfig.findUnique({
    where: { storeId },
    include: { tiers: { orderBy: { sortOrder: "asc" } } },
  });
  if (!config?.isActive) return;

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return;

  // Determine tier multiplier
  const annualSpend = Number(customer.totalSpent);
  const tier = config.tiers.reduce((best, t) =>
    annualSpend >= Number(t.minAnnualSpend) ? t : best, config.tiers[0]);
  const multiplier = Number(tier?.pointsMultiplier || 1);

  const basePoints = Math.floor(amount * Number(config.pointsPerDollar));
  const points = Math.floor(basePoints * multiplier);

  const newBalance = customer.loyaltyPoints + points;

  await db.$transaction([
    db.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newBalance },
    }),
    db.loyaltyTransaction.create({
      data: {
        customerId,
        storeId,
        type: "EARN_PURCHASE",
        points,
        balance: newBalance,
        description: `Purchase: ${points} pts (${multiplier}x ${tier?.name || "base"})`,
        reference,
        multiplier,
      },
    }),
  ]);

  return { points, multiplier, tier: tier?.name, newBalance };
}
