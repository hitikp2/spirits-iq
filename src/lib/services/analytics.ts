import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/db/redis";
import type { DashboardStats, RevenueDataPoint, TopSeller } from "@/types";

// ─── Dashboard Stats ─────────────────────────────────────
export async function getDashboardStats(storeId: string): Promise<DashboardStats> {
  const cacheKey = `dashboard:${storeId}:stats`;
  const cached = await cacheGet<DashboardStats>(cacheKey);
  if (cached) return cached;

  const today = startOfDay();
  const yesterday = startOfDay(-1);
  const yesterdayEnd = endOfDay(-1);

  const [todayTxns, yesterdayTxns, smsCount] = await Promise.all([
    db.transaction.findMany({
      where: { storeId, createdAt: { gte: today }, paymentStatus: "COMPLETED" },
    }),
    db.transaction.findMany({
      where: { storeId, createdAt: { gte: yesterday, lt: yesterdayEnd }, paymentStatus: "COMPLETED" },
    }),
    db.customer.count({
      where: { storeId, smsOptedIn: true },
    }),
  ]);

  const todayRevenue = todayTxns.reduce((s, t) => s + Number(t.total), 0);
  const yesterdayRevenue = yesterdayTxns.reduce((s, t) => s + Number(t.total), 0);
  const todayAvg = todayTxns.length > 0 ? todayRevenue / todayTxns.length : 0;
  const yesterdayAvg = yesterdayTxns.length > 0 ? yesterdayRevenue / yesterdayTxns.length : 0;

  const stats: DashboardStats = {
    todayRevenue,
    todayTransactions: todayTxns.length,
    avgBasketSize: todayAvg,
    activeSmsSubscribers: smsCount,
    revenueChange: yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0,
    transactionChange: yesterdayTxns.length > 0 ? ((todayTxns.length - yesterdayTxns.length) / yesterdayTxns.length) * 100 : 0,
    basketChange: yesterdayAvg > 0 ? ((todayAvg - yesterdayAvg) / yesterdayAvg) * 100 : 0,
    subscriberChange: 0,
  };

  await cacheSet(cacheKey, stats, 60); // Cache 1 min
  return stats;
}

// ─── Revenue Over Time ───────────────────────────────────
export async function getRevenueTimeline(
  storeId: string,
  days = 7
): Promise<RevenueDataPoint[]> {
  const cacheKey = `dashboard:${storeId}:revenue:${days}`;
  const cached = await cacheGet<RevenueDataPoint[]>(cacheKey);
  if (cached) return cached;

  const startDate = startOfDay(-days + 1);
  const transactions = await db.transaction.findMany({
    where: { storeId, createdAt: { gte: startDate }, paymentStatus: "COMPLETED" },
    select: { total: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by day
  const byDay = new Map<string, { revenue: number; count: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    byDay.set(key, { revenue: 0, count: 0 });
  }

  for (const txn of transactions) {
    const key = txn.createdAt.toISOString().split("T")[0];
    const existing = byDay.get(key);
    if (existing) {
      existing.revenue += Number(txn.total);
      existing.count++;
    }
  }

  const result: RevenueDataPoint[] = Array.from(byDay.entries()).map(([date, data]) => ({
    date,
    revenue: Math.round(data.revenue * 100) / 100,
    transactions: data.count,
    avgTicket: data.count > 0 ? Math.round((data.revenue / data.count) * 100) / 100 : 0,
  }));

  await cacheSet(cacheKey, result, 120);
  return result;
}

// ─── Top Sellers ─────────────────────────────────────────
export async function getTopSellers(
  storeId: string,
  options?: { days?: number; limit?: number; categoryId?: string }
): Promise<TopSeller[]> {
  const { days = 1, limit = 10, categoryId } = options || {};

  const cacheKey = `dashboard:${storeId}:topsellers:${days}:${limit}:${categoryId || "all"}`;
  const cached = await cacheGet<TopSeller[]>(cacheKey);
  if (cached) return cached;

  const since = startOfDay(-days + 1);

  const items = await db.transactionItem.findMany({
    where: {
      transaction: {
        storeId,
        createdAt: { gte: since },
        paymentStatus: "COMPLETED",
      },
      ...(categoryId ? { product: { categoryId } } : {}),
    },
    include: { product: { include: { category: true } } },
  });

  // Aggregate by product
  const productMap = new Map<string, { name: string; category: string; qty: number; rev: number }>();
  for (const item of items) {
    const key = item.productId;
    const existing = productMap.get(key) || { name: item.product.name, category: item.product.category.name, qty: 0, rev: 0 };
    existing.qty += item.quantity;
    existing.rev += Number(item.total);
    productMap.set(key, existing);
  }

  const result: TopSeller[] = Array.from(productMap.entries())
    .map(([productId, data]) => ({
      productId,
      productName: data.name,
      category: data.category,
      quantitySold: data.qty,
      revenue: Math.round(data.rev * 100) / 100,
      trend: data.qty > 25 ? "hot" : data.qty > 15 ? "rising" : "stable" as TopSeller["trend"],
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, limit);

  await cacheSet(cacheKey, result, 120);
  return result;
}

// ─── Category Breakdown ──────────────────────────────────
export async function getCategoryBreakdown(storeId: string, days = 30) {
  const since = startOfDay(-days + 1);

  const items = await db.transactionItem.findMany({
    where: {
      transaction: { storeId, createdAt: { gte: since }, paymentStatus: "COMPLETED" },
    },
    include: { product: { include: { category: true } } },
  });

  const catMap = new Map<string, { name: string; revenue: number; units: number }>();
  for (const item of items) {
    const cat = item.product.category.name;
    const existing = catMap.get(cat) || { name: cat, revenue: 0, units: 0 };
    existing.revenue += Number(item.total);
    existing.units += item.quantity;
    catMap.set(cat, existing);
  }

  return Array.from(catMap.values()).sort((a, b) => b.revenue - a.revenue);
}

// ─── Helpers ─────────────────────────────────────────────
function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(23, 59, 59, 999);
  return d;
}
