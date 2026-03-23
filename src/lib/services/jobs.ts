// ─── SPIRITS IQ — Background Jobs ────────────────────────
// Run via cron, Vercel Cron, or a job scheduler like BullMQ
// These handle all the automated daily/weekly/monthly tasks

import { db } from "@/lib/db";
import { generateDailySnapshot, generateMonthlyReport, calculateCustomerLTV } from "@/lib/services/reports";
import { generateInsights } from "@/lib/ai";
import { refreshCustomerTiers } from "@/lib/services/loyalty";
import { generateFinancialInsights, updateTaxCollection } from "@/lib/services/accounting";
import { notifyLowStock, notifyTaxDue } from "@/lib/services/notifications";

// ─── End of Day Job (Run at store close) ─────────────────
// Generates daily snapshot, checks inventory, updates tax records
export async function endOfDayJob(storeId: string) {
  console.log(`[EOD] Starting end-of-day job for ${storeId}`);

  // 1. Generate daily snapshot
  const snapshot = await generateDailySnapshot(storeId);
  console.log(`[EOD] Daily snapshot: $${snapshot.revenue} revenue, ${snapshot.transactions} txns`);

  // 2. Check for low stock and send notifications
  const allProducts = await db.product.findMany({
    where: { storeId, isActive: true },
  });
  const lowStockProducts = allProducts.filter(p => p.quantity === 0 || p.quantity <= p.reorderPoint);

  for (const product of lowStockProducts) {
    await notifyLowStock(storeId, product.name, product.quantity);
  }
  console.log(`[EOD] ${lowStockProducts.length} low/out stock alerts`);

  // 3. Update tax collection for current period
  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const todayTax = await db.transaction.aggregate({
    where: {
      storeId,
      createdAt: { gte: startOfDay() },
      paymentStatus: "COMPLETED",
    },
    _sum: { taxAmount: true },
  });

  if (todayTax._sum.taxAmount) {
    await updateTaxCollection(storeId, period, Number(todayTax._sum.taxAmount));
  }
  console.log(`[EOD] Tax collection updated: $${todayTax._sum.taxAmount || 0}`);

  // 4. Update product velocity scores
  await updateVelocityScores(storeId);
  console.log(`[EOD] Velocity scores updated`);

  return { snapshot, lowStockAlerts: lowStockProducts.length };
}

// ─── Daily AI Job (Run overnight) ────────────────────────
// Generates AI insights from business data
export async function dailyAiJob(storeId: string) {
  console.log(`[AI] Starting daily AI job for ${storeId}`);

  // 1. Generate business insights
  const insights = await generateInsights(storeId);
  console.log(`[AI] Generated ${insights.length} business insights`);

  // 2. Generate financial insights
  const finInsights = await generateFinancialInsights(storeId);
  console.log(`[AI] Generated ${finInsights.length} financial insights`);

  // 3. Calculate customer LTV
  await calculateCustomerLTV(storeId);
  console.log(`[AI] Customer LTV calculations updated`);

  return { businessInsights: insights.length, financialInsights: finInsights.length };
}

// ─── Weekly Job (Run Sunday night) ───────────────────────
export async function weeklyJob(storeId: string) {
  console.log(`[WEEKLY] Starting weekly job for ${storeId}`);

  // 1. Refresh customer tiers based on spending
  const tierResult = await refreshCustomerTiers(storeId);
  console.log(`[WEEKLY] Tier refresh: ${tierResult?.promoted} promoted, ${tierResult?.demoted} demoted`);

  // 2. Expire old loyalty points
  await expireLoyaltyPoints(storeId);
  console.log(`[WEEKLY] Loyalty points expiration check complete`);

  // 3. Check for upcoming tax deadlines
  await checkTaxDeadlines(storeId);

  return tierResult;
}

// ─── Monthly Job (Run 1st of month) ──────────────────────
export async function monthlyJob(storeId: string) {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  console.log(`[MONTHLY] Generating report for ${prevYear}-${prevMonth}`);

  // 1. Generate monthly report
  const report = await generateMonthlyReport(storeId, prevYear, prevMonth);
  console.log(`[MONTHLY] Report: $${report.revenue} revenue, ${report.grossMargin}% margin`);

  // 2. Birthday points for customers with birthdays this month
  // (Would need birthday field on customer — placeholder)

  return report;
}

// ─── Helper: Update Velocity Scores ──────────────────────
async function updateVelocityScores(storeId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const productSales = await db.transactionItem.groupBy({
    by: ["productId"],
    where: {
      transaction: { storeId, createdAt: { gte: thirtyDaysAgo }, paymentStatus: "COMPLETED" },
    },
    _sum: { quantity: true },
  });

  for (const ps of productSales) {
    const weeklyVelocity = (ps._sum.quantity || 0) / 4.3; // 30 days ≈ 4.3 weeks
    await db.product.update({
      where: { id: ps.productId },
      data: { velocityScore: Math.round(weeklyVelocity * 10) / 10 },
    });
  }
}

// ─── Helper: Expire Loyalty Points ───────────────────────
async function expireLoyaltyPoints(storeId: string) {
  const settings = await db.storeSettings.findUnique({ where: { storeId } });
  if (!settings?.pointsExpireDays) return;

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() - settings.pointsExpireDays);

  const expiring = await db.loyaltyTransaction.findMany({
    where: {
      storeId,
      type: { in: ["EARN_PURCHASE", "EARN_BONUS", "EARN_REFERRAL"] },
      createdAt: { lte: expirationDate },
      expiresAt: null, // Hasn't been marked expired yet
    },
  });

  for (const txn of expiring) {
    if (txn.points <= 0) continue;
    const customer = await db.customer.findUnique({ where: { id: txn.customerId } });
    if (!customer || customer.loyaltyPoints <= 0) continue;

    const pointsToExpire = Math.min(txn.points, customer.loyaltyPoints);
    const newBalance = customer.loyaltyPoints - pointsToExpire;

    await db.$transaction([
      db.customer.update({ where: { id: txn.customerId }, data: { loyaltyPoints: newBalance } }),
      db.loyaltyTransaction.create({
        data: {
          customerId: txn.customerId, storeId, type: "EXPIRATION",
          points: -pointsToExpire, balance: newBalance,
          description: `Points expired (earned ${txn.createdAt.toLocaleDateString()})`,
        },
      }),
      db.loyaltyTransaction.update({ where: { id: txn.id }, data: { expiresAt: new Date() } }),
    ]);
  }
}

// ─── Helper: Check Tax Deadlines ─────────────────────────
async function checkTaxDeadlines(storeId: string) {
  const upcoming = await db.taxRecord.findMany({
    where: {
      storeId,
      status: "DUE",
      dueDate: { lte: new Date(Date.now() + 14 * 86400000) }, // Due in next 14 days
    },
  });

  for (const tax of upcoming) {
    await notifyTaxDue(storeId, Number(tax.due), tax.dueDate.toLocaleDateString());
  }
}

// ─── Helper ──────────────────────────────────────────────
function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
