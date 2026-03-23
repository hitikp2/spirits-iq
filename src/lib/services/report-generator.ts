import { db } from "@/lib/db";
import { getProfitAndLoss, getBalanceSheet, getTaxSummary } from "@/lib/services/accounting";
import { getTopSellers, getCategoryBreakdown } from "@/lib/services/analytics";
import { getEmployeePerformance } from "@/lib/services/employees";
import { generateText } from "@/lib/ai/gemini";

// ═══ REPORT DATA ASSEMBLY ═════════════════════════════════

interface ReportData {
  store: { name: string; address: string; phone: string };
  period: { type: "daily" | "weekly" | "monthly"; label: string; start: string; end: string };
  revenue: { total: number; prevTotal: number; change: number };
  transactions: { total: number; prevTotal: number; change: number };
  avgTicket: { value: number; prevValue: number; change: number };
  customers: { unique: number; new: number; returning: number; returningRate: number };
  topSellers: Array<{ name: string; category: string; qty: number; revenue: number }>;
  categoryBreakdown: Array<{ category: string; revenue: number; pct: number }>;
  pnl: { revenue: number; cogs: number; grossProfit: number; grossMargin: number; expenses: number; netIncome: number; netMargin: number; revenueLines: Array<{ name: string; amount: number }>; expenseLines: Array<{ name: string; amount: number }> };
  tax: { collected: number; remitted: number; due: number };
  inventory: { totalValue: number; lowStockCount: number; outOfStockCount: number; topAlerts: Array<{ name: string; qty: number }> };
  staffPerformance?: Array<{ name: string; transactions: number; revenue: number; avgTicket: number }>;
  aiSummary?: string;
  onlineOrders?: { count: number; revenue: number; deliveries: number; pickups: number };
  loyaltyStats?: { pointsIssued: number; pointsRedeemed: number; activeMembers: number };
  generatedAt: string;
}

export async function assembleReportData(
  storeId: string,
  type: "daily" | "weekly" | "monthly",
  targetDate?: Date
): Promise<ReportData> {
  const now = targetDate || new Date();
  let startDate: Date, endDate: Date, prevStart: Date, prevEnd: Date, label: string;

  if (type === "daily") {
    startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
    prevStart = new Date(startDate); prevStart.setDate(prevStart.getDate() - 1);
    prevEnd = new Date(prevStart); prevEnd.setHours(23, 59, 59, 999);
    label = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } else if (type === "weekly") {
    endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
    startDate = new Date(now); startDate.setDate(startDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
    prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1); prevEnd.setHours(23, 59, 59, 999);
    prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 6); prevStart.setHours(0, 0, 0, 0);
    label = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    label = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error("Store not found");

  // Fetch all data in parallel
  const [currentTxns, prevTxns, pnlData, topSellers, catBreakdown, taxData, lowStock, outStock, onlineOrders, loyaltyTxns] = await Promise.all([
    db.transaction.findMany({ where: { storeId, createdAt: { gte: startDate, lte: endDate }, paymentStatus: "COMPLETED" }, include: { items: { include: { product: true } } } }),
    db.transaction.findMany({ where: { storeId, createdAt: { gte: prevStart, lte: prevEnd }, paymentStatus: "COMPLETED" } }),
    getProfitAndLoss(storeId, startDate, endDate).catch(() => null),
    getTopSellers(storeId, { days: type === "daily" ? 1 : type === "weekly" ? 7 : 30, limit: 10 }).catch(() => []),
    getCategoryBreakdown(storeId, type === "daily" ? 1 : type === "weekly" ? 7 : 30).catch(() => []),
    getTaxSummary(storeId).catch(() => null),
    db.product.findMany({ where: { storeId, isActive: true } }).then(ps => ps.filter(p => p.quantity > 0 && p.quantity <= p.reorderPoint).length),
    db.product.count({ where: { storeId, isActive: true, quantity: 0 } }),
    db.onlineOrder.findMany({ where: { storeId, createdAt: { gte: startDate, lte: endDate }, status: { not: "CANCELLED" } } }),
    db.loyaltyTransaction.findMany({ where: { storeId, createdAt: { gte: startDate, lte: endDate } } }),
  ]);

  const currentRevenue = currentTxns.reduce((s, t) => s + Number(t.total), 0);
  const prevRevenue = prevTxns.reduce((s, t) => s + Number(t.total), 0);
  const uniqueCustomers = new Set(currentTxns.filter(t => t.customerId).map(t => t.customerId));

  // Inventory alerts
  const allActiveProducts = await db.product.findMany({
    where: { storeId, isActive: true },
    orderBy: { quantity: "asc" },
  });
  const alertProducts = allActiveProducts.filter(p => p.quantity <= p.reorderPoint).slice(0, 5);

  // Inventory total value
  const invValue = await db.product.aggregate({
    where: { storeId, isActive: true },
    _sum: { quantity: true },
  });

  const invProducts = await db.product.findMany({
    where: { storeId, isActive: true },
    select: { costPrice: true, quantity: true },
  });
  const totalInventoryValue = invProducts.reduce((s, p) => s + Number(p.costPrice) * p.quantity, 0);

  // Staff performance (weekly + monthly only)
  let staffPerf: ReportData["staffPerformance"];
  if (type !== "daily") {
    staffPerf = (await getEmployeePerformance(storeId, type === "weekly" ? 7 : 30).catch(() => [])) as any;
  }

  // Online order stats
  const onlineRevenue = onlineOrders.reduce((s, o) => s + Number(o.total), 0);
  const deliveries = onlineOrders.filter(o => o.fulfillmentType === "DELIVERY").length;
  const pickups = onlineOrders.filter(o => o.fulfillmentType === "PICKUP").length;

  // Loyalty stats
  const pointsIssued = loyaltyTxns.filter(t => t.points > 0).reduce((s, t) => s + t.points, 0);
  const pointsRedeemed = loyaltyTxns.filter(t => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);

  const data: ReportData = {
    store: { name: store.name, address: `${store.address}, ${store.city}, ${store.state} ${store.zip}`, phone: store.phone },
    period: { type, label, start: startDate.toISOString(), end: endDate.toISOString() },
    revenue: { total: currentRevenue, prevTotal: prevRevenue, change: prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0 },
    transactions: { total: currentTxns.length, prevTotal: prevTxns.length, change: prevTxns.length > 0 ? ((currentTxns.length - prevTxns.length) / prevTxns.length) * 100 : 0 },
    avgTicket: { value: currentTxns.length > 0 ? currentRevenue / currentTxns.length : 0, prevValue: prevTxns.length > 0 ? prevRevenue / prevTxns.length : 0, change: 0 },
    customers: { unique: uniqueCustomers.size, new: 0, returning: 0, returningRate: 0 },
    topSellers: topSellers.map(s => ({ name: s.productName, category: s.category, qty: s.quantitySold, revenue: s.revenue })),
    categoryBreakdown: catBreakdown.map(c => ({ category: c.name, revenue: c.revenue, pct: currentRevenue > 0 ? Math.round((c.revenue / currentRevenue) * 100) : 0 })),
    pnl: {
      revenue: pnlData?.revenue.total || currentRevenue,
      cogs: pnlData?.cogs.total || 0,
      grossProfit: pnlData?.grossProfit || 0,
      grossMargin: pnlData?.grossMargin || 0,
      expenses: pnlData?.expenses.total || 0,
      netIncome: pnlData?.netIncome || 0,
      netMargin: pnlData?.netMargin || 0,
      revenueLines: pnlData?.revenue.lines || [],
      expenseLines: pnlData?.expenses.lines || [],
    },
    tax: { collected: taxData?.current?.collected || 0, remitted: taxData?.current?.remitted || 0, due: taxData?.current?.due || 0 },
    inventory: { totalValue: totalInventoryValue, lowStockCount: lowStock, outOfStockCount: outStock, topAlerts: alertProducts.map(p => ({ name: p.name, qty: p.quantity })) },
    staffPerformance: staffPerf,
    onlineOrders: { count: onlineOrders.length, revenue: onlineRevenue, deliveries, pickups },
    loyaltyStats: { pointsIssued, pointsRedeemed, activeMembers: uniqueCustomers.size },
    generatedAt: new Date().toISOString(),
  };

  data.avgTicket.change = data.avgTicket.prevValue > 0 ? ((data.avgTicket.value - data.avgTicket.prevValue) / data.avgTicket.prevValue) * 100 : 0;

  // Generate AI summary for weekly/monthly
  if (type !== "daily") {
    data.aiSummary = await generateAiReportSummary(data);
  }

  return data;
}

// ═══ AI SUMMARY GENERATION ════════════════════════════════

async function generateAiReportSummary(data: ReportData): Promise<string> {
  const prompt = `Write a 3-paragraph executive summary for a liquor store ${data.period.type} report.

KEY METRICS:
- Revenue: $${data.revenue.total.toLocaleString()} (${data.revenue.change >= 0 ? "+" : ""}${data.revenue.change.toFixed(1)}% vs prior period)
- Transactions: ${data.transactions.total} (${data.transactions.change >= 0 ? "+" : ""}${data.transactions.change.toFixed(1)}%)
- Avg Ticket: $${data.avgTicket.value.toFixed(2)}
- Gross Margin: ${data.pnl.grossMargin}% | Net Margin: ${data.pnl.netMargin}%
- Net Income: $${data.pnl.netIncome.toLocaleString()}
- Online Orders: ${data.onlineOrders?.count || 0} ($${data.onlineOrders?.revenue?.toLocaleString() || 0})
- Inventory Alerts: ${data.inventory.lowStockCount} low, ${data.inventory.outOfStockCount} out
- Top Category: ${data.categoryBreakdown[0]?.category || "N/A"} (${data.categoryBreakdown[0]?.pct || 0}%)

Be specific with numbers. Highlight wins. Flag concerns. End with 2 recommendations. Professional but conversational tone. No bullet points.`;

  try {
    return await generateText(prompt, { maxOutputTokens: 500 }) || "";
  } catch {
    return "";
  }
}

// ═══ HTML REPORT RENDERER ═════════════════════════════════

export function renderReportHTML(data: ReportData): string {
  const fmt = (n: number) => n < 0 ? `-$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtShort = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n);
  const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const changeColor = (n: number) => n >= 0 ? "#10B981" : "#F43F5E";
  const changeArrow = (n: number) => n >= 0 ? "▲" : "▼";
  const typeLabel = { daily: "Daily Report", weekly: "Weekly Report", monthly: "Monthly Report" }[data.period.type];

  // Category bar chart (pure CSS)
  const maxCatRev = Math.max(...data.categoryBreakdown.map(c => c.revenue), 1);
  const catColors = ["#F5A623", "#10B981", "#8B5CF6", "#F472B6", "#3B82F6", "#14B8A6", "#F43F5E", "#6366F1"];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.store.name} — ${typeLabel} | ${data.period.label}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Azeret+Mono:wght@400;500;600&display=swap');
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: #FAFAFA; color: #1A1A2E; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; padding: 40px 32px; }
  
  /* Header */
  .header { text-align: center; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #F5A623; }
  .header .brand { font-family: 'Crimson Pro', serif; font-size: 28px; font-weight: 800; color: #1A1A2E; }
  .header .brand span { color: #F5A623; }
  .header .subtitle { font-family: 'Azeret Mono', monospace; font-size: 11px; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
  .header h1 { font-family: 'Crimson Pro', serif; font-size: 32px; font-weight: 700; margin-top: 16px; color: #1A1A2E; }
  .header .period { font-size: 14px; color: #666; margin-top: 4px; }
  .header .meta { font-family: 'Azeret Mono', monospace; font-size: 10px; color: #AAA; margin-top: 12px; }
  
  /* KPI Grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .kpi { background: #FFF; border: 1px solid #E8E8E8; border-radius: 12px; padding: 16px; text-align: center; }
  .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }
  .kpi .value { font-family: 'Crimson Pro', serif; font-size: 24px; font-weight: 800; color: #1A1A2E; }
  .kpi .change { font-family: 'Azeret Mono', monospace; font-size: 11px; margin-top: 4px; }

  /* Sections */
  .section { background: #FFF; border: 1px solid #E8E8E8; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
  .section h2 { font-family: 'Crimson Pro', serif; font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1A1A2E; display: flex; align-items: center; gap: 8px; }
  .section h2 .icon { font-size: 18px; }
  
  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; border-bottom: 1px solid #E8E8E8; }
  td { padding: 10px 0; border-bottom: 1px solid #F0F0F0; }
  td:last-child, th:last-child { text-align: right; }
  .rank { font-family: 'Azeret Mono', monospace; color: #BBB; width: 30px; }
  .amount { font-family: 'Azeret Mono', monospace; font-weight: 600; }
  .amount.green { color: #10B981; }
  .amount.red { color: #F43F5E; }
  .amount.amber { color: #F5A623; }

  /* Bar chart */
  .bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .bar-label { font-size: 12px; width: 100px; flex-shrink: 0; }
  .bar-track { flex: 1; height: 20px; background: #F0F0F0; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
  .bar-value { font-family: 'Azeret Mono', monospace; font-size: 11px; color: #666; width: 70px; text-align: right; flex-shrink: 0; }

  /* P&L */
  .pnl-line { display: flex; justify-content: space-between; padding: 6px 0; }
  .pnl-line.sub { padding-left: 16px; font-size: 12px; color: #666; }
  .pnl-total { display: flex; justify-content: space-between; padding: 12px 0 6px; margin-top: 8px; border-top: 2px solid #E8E8E8; font-weight: 700; }
  .pnl-total .amount { font-size: 16px; }
  .pnl-highlight { background: #FFF7E6; border: 1px solid #F5A62340; border-radius: 10px; padding: 16px; margin: 12px 0; display: flex; justify-content: space-between; align-items: center; }
  .pnl-highlight .label { font-family: 'Crimson Pro', serif; font-size: 16px; font-weight: 700; }

  /* AI Summary */
  .ai-summary { background: linear-gradient(135deg, #FFF7E6, #FFF); border: 1px solid #F5A62325; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
  .ai-summary h2 { color: #F5A623; }
  .ai-summary p { font-size: 13px; line-height: 1.8; color: #444; margin-bottom: 12px; }

  /* Alert */
  .alert { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 12px; }
  .alert .dot { width: 8px; height: 8px; border-radius: 4px; flex-shrink: 0; }
  .alert .dot.red { background: #F43F5E; }
  .alert .dot.amber { background: #F5A623; }

  /* Footer */
  .footer { text-align: center; padding: 24px 0; margin-top: 32px; border-top: 1px solid #E8E8E8; }
  .footer p { font-family: 'Azeret Mono', monospace; font-size: 10px; color: #BBB; }

  /* Print */
  @media print {
    body { background: #FFF; }
    .container { padding: 20px; }
    .section, .kpi { break-inside: avoid; }
  }
  @media (max-width: 600px) {
    .container { padding: 20px 16px; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="header">
    <div class="brand">🥃 ${data.store.name} <span>IQ</span></div>
    <div class="subtitle">${typeLabel}</div>
    <h1>${data.period.label}</h1>
    <div class="period">${data.store.address} · ${data.store.phone}</div>
    <div class="meta">Generated ${new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · Auto-generated by SPIRITS IQ</div>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="label">Revenue</div>
      <div class="value">${fmtShort(data.revenue.total)}</div>
      <div class="change" style="color:${changeColor(data.revenue.change)}">${changeArrow(data.revenue.change)} ${pct(data.revenue.change)}</div>
    </div>
    <div class="kpi">
      <div class="label">Transactions</div>
      <div class="value">${data.transactions.total}</div>
      <div class="change" style="color:${changeColor(data.transactions.change)}">${changeArrow(data.transactions.change)} ${pct(data.transactions.change)}</div>
    </div>
    <div class="kpi">
      <div class="label">Avg Ticket</div>
      <div class="value">${fmt(data.avgTicket.value)}</div>
      <div class="change" style="color:${changeColor(data.avgTicket.change)}">${changeArrow(data.avgTicket.change)} ${pct(data.avgTicket.change)}</div>
    </div>
    <div class="kpi">
      <div class="label">Net Income</div>
      <div class="value" style="color:${data.pnl.netIncome >= 0 ? "#10B981" : "#F43F5E"}">${fmtShort(data.pnl.netIncome)}</div>
      <div class="change" style="color:#888">${data.pnl.netMargin}% margin</div>
    </div>
  </div>

  ${data.aiSummary ? `
  <!-- AI SUMMARY -->
  <div class="ai-summary">
    <h2><span class="icon">🧠</span> AI Executive Summary</h2>
    ${data.aiSummary.split("\n\n").map(p => `<p>${p}</p>`).join("")}
  </div>
  ` : ""}

  <!-- TOP SELLERS -->
  <div class="section">
    <h2><span class="icon">🏆</span> Top Sellers</h2>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Category</th><th>Qty</th><th>Revenue</th></tr></thead>
      <tbody>
        ${data.topSellers.slice(0, 10).map((s, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td><strong>${s.name}</strong></td>
          <td style="color:#888">${s.category}</td>
          <td>${s.qty}</td>
          <td class="amount amber">${fmt(s.revenue)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <!-- CATEGORY BREAKDOWN -->
  <div class="section">
    <h2><span class="icon">📊</span> Sales by Category</h2>
    ${data.categoryBreakdown.map((c, i) => `
    <div class="bar-row">
      <div class="bar-label">${c.category}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c.revenue / maxCatRev) * 100}%;background:${catColors[i % catColors.length]}"></div></div>
      <div class="bar-value">${fmt(c.revenue)} (${c.pct}%)</div>
    </div>`).join("")}
  </div>

  <!-- P&L SUMMARY -->
  <div class="section">
    <h2><span class="icon">💰</span> Profit & Loss</h2>
    
    <div class="pnl-line" style="font-weight:600"><span>Revenue</span><span class="amount green">${fmt(data.pnl.revenue)}</span></div>
    ${data.pnl.revenueLines.slice(0, 5).map(l => `<div class="pnl-line sub"><span>${l.name}</span><span class="amount">${fmt(l.amount)}</span></div>`).join("")}
    
    <div class="pnl-line" style="font-weight:600;margin-top:12px"><span>Cost of Goods Sold</span><span class="amount red">-${fmt(data.pnl.cogs)}</span></div>
    
    <div class="pnl-highlight">
      <span class="label">Gross Profit</span>
      <span><span class="amount green" style="font-family:'Crimson Pro';font-size:20px;font-weight:800">${fmt(data.pnl.grossProfit)}</span> <span style="font-size:12px;color:#888">(${data.pnl.grossMargin}%)</span></span>
    </div>

    <div class="pnl-line" style="font-weight:600"><span>Operating Expenses</span><span class="amount red">-${fmt(data.pnl.expenses)}</span></div>
    ${data.pnl.expenseLines.slice(0, 5).map(l => `<div class="pnl-line sub"><span>${l.name}</span><span class="amount">${fmt(l.amount)}</span></div>`).join("")}

    <div class="pnl-total">
      <span style="font-family:'Crimson Pro';font-size:18px">Net Income</span>
      <span class="amount" style="font-size:20px;font-family:'Crimson Pro';font-weight:800;color:${data.pnl.netIncome >= 0 ? "#10B981" : "#F43F5E"}">${fmt(data.pnl.netIncome)}</span>
    </div>
  </div>

  ${data.onlineOrders && data.onlineOrders.count > 0 ? `
  <!-- ONLINE ORDERS -->
  <div class="section">
    <h2><span class="icon">🛍️</span> Online Orders</h2>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:0">
      <div class="kpi"><div class="label">Orders</div><div class="value">${data.onlineOrders.count}</div></div>
      <div class="kpi"><div class="label">Revenue</div><div class="value">${fmtShort(data.onlineOrders.revenue)}</div></div>
      <div class="kpi"><div class="label">Deliveries</div><div class="value">${data.onlineOrders.deliveries}</div><div class="change" style="color:#888">${data.onlineOrders.pickups} pickups</div></div>
    </div>
  </div>
  ` : ""}

  <!-- INVENTORY -->
  <div class="section">
    <h2><span class="icon">📦</span> Inventory Status</h2>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px">
      <div class="kpi"><div class="label">Inventory Value</div><div class="value">${fmtShort(data.inventory.totalValue)}</div></div>
      <div class="kpi"><div class="label">Low Stock</div><div class="value" style="color:#F5A623">${data.inventory.lowStockCount}</div></div>
      <div class="kpi"><div class="label">Out of Stock</div><div class="value" style="color:#F43F5E">${data.inventory.outOfStockCount}</div></div>
    </div>
    ${data.inventory.topAlerts.length > 0 ? `
    <div style="margin-top:8px">
      ${data.inventory.topAlerts.map(a => `
      <div class="alert">
        <div class="dot ${a.qty === 0 ? "red" : "amber"}"></div>
        <span><strong>${a.name}</strong> — ${a.qty === 0 ? "Out of stock" : `${a.qty} remaining`}</span>
      </div>`).join("")}
    </div>` : ""}
  </div>

  <!-- TAX -->
  <div class="section">
    <h2><span class="icon">🏛️</span> Sales Tax</h2>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:0">
      <div class="kpi"><div class="label">Collected</div><div class="value amount green">${fmt(data.tax.collected)}</div></div>
      <div class="kpi"><div class="label">Remitted</div><div class="value amount">${fmt(data.tax.remitted)}</div></div>
      <div class="kpi"><div class="label">Balance Due</div><div class="value amount red">${fmt(data.tax.due)}</div></div>
    </div>
  </div>

  ${data.staffPerformance && data.staffPerformance.length > 0 ? `
  <!-- STAFF PERFORMANCE -->
  <div class="section">
    <h2><span class="icon">👥</span> Staff Performance</h2>
    <table>
      <thead><tr><th>Employee</th><th>Transactions</th><th>Revenue</th><th>Avg Ticket</th></tr></thead>
      <tbody>
        ${data.staffPerformance.map(s => `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.transactions}</td>
          <td class="amount amber">${fmt(s.revenue)}</td>
          <td class="amount">${fmt(s.avgTicket)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
  ` : ""}

  ${data.loyaltyStats ? `
  <!-- LOYALTY -->
  <div class="section">
    <h2><span class="icon">⭐</span> Loyalty Program</h2>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:0">
      <div class="kpi"><div class="label">Points Issued</div><div class="value">${data.loyaltyStats.pointsIssued.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Points Redeemed</div><div class="value">${data.loyaltyStats.pointsRedeemed.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Active Members</div><div class="value">${data.loyaltyStats.activeMembers}</div></div>
    </div>
  </div>
  ` : ""}

  <!-- FOOTER -->
  <div class="footer">
    <p>🥃 SPIRITS IQ — Auto-Generated ${typeLabel}</p>
    <p>${data.store.name} · ${data.period.label} · Confidential</p>
  </div>

</div>
</body>
</html>`;
}

// ═══ GENERATE & STORE REPORT ══════════════════════════════

export async function generateReport(
  storeId: string,
  type: "daily" | "weekly" | "monthly",
  targetDate?: Date
) {
  const data = await assembleReportData(storeId, type, targetDate);
  const html = renderReportHTML(data);

  // Store the report HTML for later retrieval
  const reportKey = `report:${storeId}:${type}:${data.period.start.split("T")[0]}`;
  await db.$executeRaw`INSERT INTO "ReportArchive" ("id", "storeId", "type", "period", "html", "data", "createdAt") VALUES (${crypto.randomUUID()}, ${storeId}, ${type}, ${data.period.label}, ${html}, ${JSON.stringify(data)}::jsonb, NOW()) ON CONFLICT DO NOTHING`;

  return { html, data };
}
