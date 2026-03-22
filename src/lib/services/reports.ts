import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/db/redis";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Generate Daily Snapshot ─────────────────────────────
// Run at end of each business day via cron job
export async function generateDailySnapshot(storeId: string, date?: Date) {
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const transactions = await db.transaction.findMany({
    where: {
      storeId,
      createdAt: { gte: dayStart, lte: dayEnd },
      paymentStatus: "COMPLETED",
    },
    include: { items: { include: { product: { include: { category: true } } } } },
  });

  const revenue = transactions.reduce((s, t) => s + Number(t.total), 0);
  const uniqueCustomerIds = new Set(transactions.filter((t) => t.customerId).map((t) => t.customerId));

  // Category breakdown
  const catBreakdown: Record<string, number> = {};
  const productSales: Record<string, { name: string; qty: number; rev: number }> = {};

  for (const txn of transactions) {
    for (const item of txn.items) {
      const catName = item.product.category.name;
      catBreakdown[catName] = (catBreakdown[catName] || 0) + Number(item.total);

      const pid = item.productId;
      if (!productSales[pid]) productSales[pid] = { name: item.product.name, qty: 0, rev: 0 };
      productSales[pid].qty += item.quantity;
      productSales[pid].rev += Number(item.total);
    }
  }

  // Hourly revenue
  const hourlyRev: Record<string, number> = {};
  for (const txn of transactions) {
    const hour = txn.createdAt.getHours().toString();
    hourlyRev[hour] = (hourlyRev[hour] || 0) + Number(txn.total);
  }

  // Payment breakdown
  const paymentBreakdown: Record<string, number> = {};
  for (const txn of transactions) {
    const method = txn.paymentMethod;
    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + Number(txn.total);
  }

  // Top product
  const topProduct = Object.entries(productSales).sort((a, b) => b[1].rev - a[1].rev)[0];

  // New customers today
  const newCustomers = await db.customer.count({
    where: { storeId, createdAt: { gte: dayStart, lte: dayEnd } },
  });

  const snapshot = await db.dailySnapshot.upsert({
    where: { storeId_date: { storeId, date: dayStart } },
    update: {
      revenue,
      transactions: transactions.length,
      avgTicket: transactions.length > 0 ? revenue / transactions.length : 0,
      uniqueCustomers: uniqueCustomerIds.size,
      newCustomers,
      itemsSold: Object.values(productSales).reduce((s, p) => s + p.qty, 0),
      topProductId: topProduct?.[0] || null,
      categoryBreakdown: catBreakdown,
      hourlyRevenue: hourlyRev,
      paymentBreakdown,
    },
    create: {
      storeId,
      date: dayStart,
      revenue,
      transactions: transactions.length,
      avgTicket: transactions.length > 0 ? revenue / transactions.length : 0,
      uniqueCustomers: uniqueCustomerIds.size,
      newCustomers,
      itemsSold: Object.values(productSales).reduce((s, p) => s + p.qty, 0),
      topProductId: topProduct?.[0] || null,
      categoryBreakdown: catBreakdown,
      hourlyRevenue: hourlyRev,
      paymentBreakdown,
    },
  });

  return snapshot;
}

// ─── Generate Monthly Report ─────────────────────────────
export async function generateMonthlyReport(storeId: string, year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const transactions = await db.transaction.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      paymentStatus: "COMPLETED",
    },
    include: { items: { include: { product: { include: { category: true } } } } },
  });

  const revenue = transactions.reduce((s, t) => s + Number(t.total), 0);
  const cogs = transactions.reduce((s, t) =>
    s + t.items.reduce((is, i) => is + Number(i.product.costPrice) * i.quantity, 0), 0);
  const grossProfit = revenue - cogs;

  const uniqueCustomers = new Set(transactions.filter((t) => t.customerId).map((t) => t.customerId));

  // Returning vs new
  const prevMonthStart = new Date(year, month - 2, 1);
  const prevCustomers = await db.transaction.findMany({
    where: { storeId, createdAt: { gte: prevMonthStart, lt: startDate }, customerId: { not: null } },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const prevCustomerIds = new Set(prevCustomers.map((t) => t.customerId));
  const returningCount = [...uniqueCustomers].filter((id) => prevCustomerIds.has(id)).length;
  const returningRate = uniqueCustomers.size > 0 ? (returningCount / uniqueCustomers.size) * 100 : 0;

  const newCustomers = await db.customer.count({
    where: { storeId, createdAt: { gte: startDate, lte: endDate } },
  });

  // Top products
  const productAgg: Record<string, { name: string; qty: number; rev: number }> = {};
  const categoryAgg: Record<string, number> = {};

  for (const txn of transactions) {
    for (const item of txn.items) {
      const pid = item.productId;
      if (!productAgg[pid]) productAgg[pid] = { name: item.product.name, qty: 0, rev: 0 };
      productAgg[pid].qty += item.quantity;
      productAgg[pid].rev += Number(item.total);

      const cat = item.product.category.name;
      categoryAgg[cat] = (categoryAgg[cat] || 0) + Number(item.total);
    }
  }

  const topProducts = Object.entries(productAgg)
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 10)
    .map(([productId, data]) => ({ productId, ...data }));

  const topCategories = Object.entries(categoryAgg)
    .sort((a, b) => b[1] - a[1])
    .map(([category, rev]) => ({
      category,
      revenue: rev,
      pct: revenue > 0 ? Math.round((rev / revenue) * 100) : 0,
    }));

  // Inventory turns
  const avgInventoryValue = await db.product.aggregate({
    where: { storeId, isActive: true },
    _avg: { costPrice: true },
    _sum: { quantity: true },
  });
  const avgInvValue = Number(avgInventoryValue._avg.costPrice || 0) * Number(avgInventoryValue._sum.quantity || 0);
  const inventoryTurns = avgInvValue > 0 ? (cogs / avgInvValue) * 12 : 0; // Annualized

  // SMS metrics
  const smsMetrics = await db.smsMessage.groupBy({
    by: ["direction"],
    where: { customer: { storeId }, createdAt: { gte: startDate, lte: endDate } },
    _count: true,
  });

  const report = await db.monthlyReport.upsert({
    where: { storeId_year_month: { storeId, year, month } },
    update: {
      revenue, cogs, grossProfit,
      grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      transactions: transactions.length,
      avgTicket: transactions.length > 0 ? revenue / transactions.length : 0,
      uniqueCustomers: uniqueCustomers.size,
      newCustomers,
      returningRate,
      topProducts,
      topCategories,
      inventoryTurns,
      smsMetrics,
    },
    create: {
      storeId, year, month,
      revenue, cogs, grossProfit,
      grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      transactions: transactions.length,
      avgTicket: transactions.length > 0 ? revenue / transactions.length : 0,
      uniqueCustomers: uniqueCustomers.size,
      newCustomers,
      returningRate,
      topProducts,
      topCategories,
      inventoryTurns,
      smsMetrics,
    },
  });

  return report;
}

// ─── Get Report Dashboard ────────────────────────────────
export async function getReportDashboard(storeId: string, days = 30) {
  const cacheKey = `reports:${storeId}:dashboard:${days}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const prevSince = new Date();
  prevSince.setDate(prevSince.getDate() - days * 2);
  prevSince.setHours(0, 0, 0, 0);

  const [currentSnapshots, prevSnapshots] = await Promise.all([
    db.dailySnapshot.findMany({
      where: { storeId, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    db.dailySnapshot.findMany({
      where: { storeId, date: { gte: prevSince, lt: since } },
    }),
  ]);

  const currentRev = currentSnapshots.reduce((s, d) => s + Number(d.revenue), 0);
  const prevRev = prevSnapshots.reduce((s, d) => s + Number(d.revenue), 0);
  const currentTxns = currentSnapshots.reduce((s, d) => s + d.transactions, 0);
  const prevTxns = prevSnapshots.reduce((s, d) => s + d.transactions, 0);
  const currentCustomers = new Set(currentSnapshots.reduce((s, d) => s + d.uniqueCustomers, 0));

  const result = {
    kpis: {
      revenue: { value: currentRev, prevValue: prevRev, change: prevRev > 0 ? ((currentRev - prevRev) / prevRev) * 100 : 0 },
      transactions: { value: currentTxns, prevValue: prevTxns, change: prevTxns > 0 ? ((currentTxns - prevTxns) / prevTxns) * 100 : 0 },
      avgTicket: { value: currentTxns > 0 ? currentRev / currentTxns : 0, prevValue: prevTxns > 0 ? prevRev / prevTxns : 0 },
    },
    dailyRevenue: currentSnapshots.map((d) => ({
      date: d.date.toISOString().split("T")[0],
      revenue: Number(d.revenue),
      transactions: d.transactions,
      avgTicket: Number(d.avgTicket),
    })),
    categoryBreakdown: mergeCategoryBreakdowns(currentSnapshots),
  };

  (result.kpis.avgTicket as any).change = result.kpis.avgTicket.prevValue > 0
    ? ((result.kpis.avgTicket.value - result.kpis.avgTicket.prevValue) / result.kpis.avgTicket.prevValue) * 100 : 0;

  await cacheSet(cacheKey, result, 300);
  return result;
}

// ─── Customer Lifetime Value Calculation ─────────────────
export async function calculateCustomerLTV(storeId: string) {
  const customers = await db.customer.findMany({
    where: { storeId },
    include: {
      transactions: {
        where: { paymentStatus: "COMPLETED" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  for (const customer of customers) {
    if (customer.transactions.length === 0) continue;

    const totalRevenue = customer.transactions.reduce((s, t) => s + Number(t.total), 0);
    const firstPurchase = customer.transactions[0].createdAt;
    const lastPurchase = customer.transactions[customer.transactions.length - 1].createdAt;
    const daysSinceFirst = Math.max(1, Math.floor((Date.now() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24)));
    const monthsSinceFirst = daysSinceFirst / 30;
    const purchaseFreq = monthsSinceFirst > 0 ? customer.transactions.length / monthsSinceFirst : 0;
    const avgOrderValue = customer.transactions.length > 0 ? totalRevenue / customer.transactions.length : 0;

    // Simple LTV prediction: avgOrderValue * frequency * 36 months
    const predictedLtv = avgOrderValue * purchaseFreq * 36;

    // Churn risk: based on recency
    const daysSinceLast = Math.floor((Date.now() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24));
    const avgGap = daysSinceFirst / Math.max(1, customer.transactions.length);
    const churnRisk = Math.min(1, daysSinceLast / (avgGap * 3));

    // Segment
    let segment = "regular";
    if (churnRisk > 0.7) segment = "at-risk";
    else if (daysSinceFirst < 30) segment = "new";
    else if (totalRevenue > 2000) segment = "high-value";
    else if (daysSinceLast > 60) segment = "dormant";

    await db.customerLifetimeValue.upsert({
      where: { customerId: customer.id },
      update: {
        totalRevenue, totalOrders: customer.transactions.length,
        avgOrderValue, firstPurchase, lastPurchase,
        daysSinceFirst, purchaseFreq, predictedLtv, churnRisk, segment,
      },
      create: {
        customerId: customer.id, storeId,
        totalRevenue, totalOrders: customer.transactions.length,
        avgOrderValue, firstPurchase, lastPurchase,
        daysSinceFirst, purchaseFreq, predictedLtv, churnRisk, segment,
      },
    });
  }
}

// ─── AI Executive Summary ────────────────────────────────
export async function generateExecutiveSummary(storeId: string, month: number, year: number) {
  const report = await db.monthlyReport.findUnique({
    where: { storeId_year_month: { storeId, year, month } },
  });
  if (!report) throw new Error("Report not found");

  const prevReport = await db.monthlyReport.findUnique({
    where: { storeId_year_month: { storeId, year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 } },
  });

  const prompt = `Write a concise executive summary (3-4 paragraphs) for a liquor store monthly report.

CURRENT MONTH:
- Revenue: $${Number(report.revenue).toLocaleString()}
- Gross Margin: ${Number(report.grossMargin).toFixed(1)}%
- Transactions: ${report.transactions}
- Avg Ticket: $${Number(report.avgTicket).toFixed(2)}
- Unique Customers: ${report.uniqueCustomers}
- New Customers: ${report.newCustomers}
- Returning Rate: ${Number(report.returningRate).toFixed(1)}%
- Top Categories: ${JSON.stringify(report.topCategories)}

${prevReport ? `PREVIOUS MONTH:
- Revenue: $${Number(prevReport.revenue).toLocaleString()}
- Transactions: ${prevReport.transactions}
- Avg Ticket: $${Number(prevReport.avgTicket).toFixed(2)}` : "No previous month data."}

Write in a professional but conversational tone. Include specific numbers. Highlight wins and concerns. End with 2-3 actionable recommendations.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "Unable to generate summary.";
}

// ─── Helpers ─────────────────────────────────────────────
function mergeCategoryBreakdowns(snapshots: Array<{ categoryBreakdown: unknown }>) {
  const merged: Record<string, number> = {};
  for (const snap of snapshots) {
    const breakdown = snap.categoryBreakdown as Record<string, number> | null;
    if (!breakdown) continue;
    for (const [cat, rev] of Object.entries(breakdown)) {
      merged[cat] = (merged[cat] || 0) + rev;
    }
  }
  const total = Object.values(merged).reduce((s, v) => s + v, 0);
  return Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      pct: total > 0 ? Math.round((revenue / total) * 100) : 0,
    }));
}
