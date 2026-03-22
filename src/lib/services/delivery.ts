import { db } from "@/lib/db";
import { cacheGet, cacheSet, cacheDelete } from "@/lib/db/redis";
import { sendSms } from "@/lib/sms";

// ─── Get Active Deliveries ───────────────────────────────
export async function getActiveDeliveries(storeId: string) {
  const cacheKey = `delivery:${storeId}:active`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const orders = await db.onlineOrder.findMany({
    where: {
      storeId,
      fulfillmentType: "DELIVERY",
      status: { in: ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] },
    },
    include: {
      items: { include: { product: true } },
      customer: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const result = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customer: {
      name: [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" "),
      phone: o.customer.phone,
    },
    address: o.deliveryAddress,
    items: o.items.map((i) => ({ name: i.product.name, qty: i.quantity })),
    total: Number(o.total),
    status: o.status,
    driverId: o.driverId,
    createdAt: o.createdAt.toISOString(),
    estimatedDelivery: calculateEta(o.createdAt, o.status),
  }));

  await cacheSet(cacheKey, result, 30); // Short TTL for real-time data
  return result;
}

// ─── Assign Driver to Order ──────────────────────────────
export async function assignDriver(orderId: string, driverId: string) {
  const order = await db.onlineOrder.update({
    where: { id: orderId },
    data: { driverId, status: "OUT_FOR_DELIVERY" },
    include: { customer: true },
  });

  // Notify customer via SMS
  const customerName = order.customer.firstName || "there";
  await sendSms(
    order.customer.phone,
    `Hi ${customerName}! Your order ${order.orderNumber} is on its way. Estimated arrival: 25-35 minutes. 🚗`,
    order.customerId,
    { aiGenerated: false }
  );

  await cacheDelete(`delivery:${order.storeId}:*`);
  return order;
}

// ─── Mark Order Delivered ────────────────────────────────
export async function markDelivered(orderId: string, metadata?: { signature?: string; photoUrl?: string }) {
  const order = await db.onlineOrder.update({
    where: { id: orderId },
    data: {
      status: "DELIVERED",
      completedAt: new Date(),
      ageVerified: true,
      verifiedAt: new Date(),
    },
    include: { customer: true },
  });

  // Notify customer
  await sendSms(
    order.customer.phone,
    `Your order ${order.orderNumber} has been delivered! Enjoy. 🥂 Rate your experience: https://highland.spirits/rate/${order.id}`,
    order.customerId,
    { aiGenerated: false }
  );

  await cacheDelete(`delivery:${order.storeId}:*`);
  return order;
}

// ─── Delivery Stats ──────────────────────────────────────
export async function getDeliveryStats(storeId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [active, todayOrders, completedToday] = await Promise.all([
    db.onlineOrder.count({
      where: { storeId, fulfillmentType: "DELIVERY", status: { in: ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] } },
    }),
    db.onlineOrder.count({
      where: { storeId, fulfillmentType: "DELIVERY", createdAt: { gte: today } },
    }),
    db.onlineOrder.findMany({
      where: { storeId, fulfillmentType: "DELIVERY", status: "DELIVERED", completedAt: { gte: today } },
    }),
  ]);

  // Calculate avg delivery time
  const deliveryTimes = completedToday
    .filter((o) => o.completedAt && o.createdAt)
    .map((o) => (o.completedAt!.getTime() - o.createdAt.getTime()) / 60000); // minutes
  const avgDeliveryTime = deliveryTimes.length > 0
    ? Math.round(deliveryTimes.reduce((s, t) => s + t, 0) / deliveryTimes.length)
    : 0;

  // On-time rate (under 45 min target)
  const onTime = deliveryTimes.filter((t) => t <= 45).length;
  const onTimeRate = deliveryTimes.length > 0
    ? Math.round((onTime / deliveryTimes.length) * 100)
    : 100;

  return { active, todayTotal: todayOrders, avgDeliveryMinutes: avgDeliveryTime, onTimeRate };
}

// ─── Helper: ETA Calculation ─────────────────────────────
function calculateEta(createdAt: Date, status: string): string {
  const elapsed = (Date.now() - createdAt.getTime()) / 60000;
  const estimates: Record<string, number> = {
    CONFIRMED: 45,
    PREPARING: 35,
    READY: 25,
    OUT_FOR_DELIVERY: 15,
  };
  const remaining = Math.max(0, (estimates[status] || 30) - elapsed);
  return `${Math.round(remaining)} min`;
}
