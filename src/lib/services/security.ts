import { db } from "@/lib/db";
import { sendNotification } from "@/lib/services/notifications";

// ─── Log Security Event ──────────────────────────────────
export async function logSecurityEvent(params: {
  storeId: string;
  cameraId: string;
  cameraName: string;
  eventType: "THEFT_SUSPECT" | "LOITERING" | "SHELF_GAP" | "UNAUTHORIZED_ACCESS" | "DELIVERY" | "CUSTOMER_COUNT" | "OTHER";
  description: string;
  confidence: number;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  const event = await db.securityEvent.create({
    data: {
      storeId: params.storeId,
      cameraId: params.cameraId,
      cameraName: params.cameraName,
      eventType: params.eventType,
      description: params.description,
      confidence: params.confidence,
      imageUrl: params.imageUrl,
      metadata: params.metadata || {},
      severity: params.confidence > 85 ? "HIGH" : params.confidence > 60 ? "MEDIUM" : "LOW",
    },
  });

  // Auto-notify on high severity
  if (event.severity === "HIGH") {
    await sendNotification(params.storeId, {
      type: "system",
      title: `Security Alert: ${params.eventType.replace(/_/g, " ")}`,
      message: params.description,
      severity: "critical",
      data: { eventId: event.id, camera: params.cameraName },
    });
  }

  return event;
}

// ─── Get Security Events ─────────────────────────────────
export async function getSecurityEvents(storeId: string, options?: {
  type?: string; severity?: string; hours?: number; page?: number; limit?: number;
}) {
  const { type, severity, hours = 24, page = 1, limit = 20 } = options || {};
  const since = new Date(Date.now() - hours * 3600000);

  const where: Record<string, unknown> = { storeId, createdAt: { gte: since } };
  if (type) where.eventType = type;
  if (severity) where.severity = severity;

  const [events, total] = await Promise.all([
    db.securityEvent.findMany({ where: where as any, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    db.securityEvent.count({ where: where as any }),
  ]);

  return { events, meta: { page, limit, total, hasMore: page * limit < total } };
}

// ─── Shrinkage Tracking ──────────────────────────────────
export async function getShrinkageReport(storeId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [thisMonth, lastMonth, ytd] = await Promise.all([
    db.inventoryLog.findMany({ where: { product: { storeId }, type: { in: ["DAMAGE", "ADJUSTMENT"] }, quantity: { lt: 0 }, createdAt: { gte: monthStart } }, include: { product: true } }),
    db.inventoryLog.findMany({ where: { product: { storeId }, type: { in: ["DAMAGE", "ADJUSTMENT"] }, quantity: { lt: 0 }, createdAt: { gte: lastMonthStart, lt: monthStart } }, include: { product: true } }),
    db.inventoryLog.findMany({ where: { product: { storeId }, type: { in: ["DAMAGE", "ADJUSTMENT"] }, quantity: { lt: 0 }, createdAt: { gte: yearStart } }, include: { product: true } }),
  ]);

  const calcValue = (logs: typeof thisMonth) => logs.reduce((s, l) => s + Math.abs(l.quantity) * Number(l.product.retailPrice), 0);

  // Top shrinkage products
  const productLoss = new Map<string, { name: string; value: number; count: number }>();
  for (const log of ytd) {
    const key = log.productId;
    const existing = productLoss.get(key) || { name: log.product.name, value: 0, count: 0 };
    existing.value += Math.abs(log.quantity) * Number(log.product.retailPrice);
    existing.count += Math.abs(log.quantity);
    productLoss.set(key, existing);
  }

  const topItems = Array.from(productLoss.values()).sort((a, b) => b.value - a.value).slice(0, 5);

  return {
    thisMonth: Math.round(calcValue(thisMonth) * 100) / 100,
    lastMonth: Math.round(calcValue(lastMonth) * 100) / 100,
    ytd: Math.round(calcValue(ytd) * 100) / 100,
    changeVsLastMonth: calcValue(lastMonth) > 0 ? ((calcValue(thisMonth) - calcValue(lastMonth)) / calcValue(lastMonth)) * 100 : 0,
    topItems,
    incidentCount: { thisMonth: thisMonth.length, lastMonth: lastMonth.length, ytd: ytd.length },
  };
}

// ─── Inventory Discrepancy Check ─────────────────────────
export async function checkDiscrepancies(storeId: string) {
  // Compare expected vs actual inventory levels
  // Expected = starting qty + restocks - sales - known adjustments
  const products = await db.product.findMany({
    where: { storeId, isActive: true },
    include: { inventoryLogs: { where: { createdAt: { gte: thirtyDaysAgo() } } } },
  });

  const discrepancies = [];
  for (const product of products) {
    const sales = product.inventoryLogs.filter((l) => l.type === "SALE").reduce((s, l) => s + Math.abs(l.quantity), 0);
    const restocks = product.inventoryLogs.filter((l) => l.type === "RESTOCK").reduce((s, l) => s + l.quantity, 0);
    const adjustments = product.inventoryLogs.filter((l) => ["ADJUSTMENT", "DAMAGE"].includes(l.type)).reduce((s, l) => s + l.quantity, 0);
    const firstLog = product.inventoryLogs[0];
    if (!firstLog) continue;

    const expectedQty = firstLog.prevQty + restocks - sales + adjustments;
    const actualQty = product.quantity;
    const diff = actualQty - expectedQty;

    if (Math.abs(diff) >= 2) {
      discrepancies.push({
        productId: product.id,
        productName: product.name,
        expectedQty,
        actualQty,
        discrepancy: diff,
        estimatedLoss: Math.abs(diff) * Number(product.retailPrice),
      });
    }
  }

  return discrepancies.sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
}

function thirtyDaysAgo(): Date { return new Date(Date.now() - 30 * 86400000); }
