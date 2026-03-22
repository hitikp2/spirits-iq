import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/db/redis";
import { generateText } from "@/lib/ai/gemini";

// ─── Default Chart of Accounts ───────────────────────────
const DEFAULT_ACCOUNTS = [
  // Assets (1xxx)
  { code: "1000", name: "Cash & Bank", type: "ASSET", subtype: "current_asset", isSystem: true },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "current_asset", isSystem: true },
  { code: "1200", name: "Inventory", type: "ASSET", subtype: "current_asset", isSystem: true },
  { code: "1300", name: "Prepaid Expenses", type: "ASSET", subtype: "current_asset", isSystem: false },
  { code: "1500", name: "Equipment & Fixtures", type: "ASSET", subtype: "fixed_asset", isSystem: false },
  { code: "1510", name: "Leasehold Improvements", type: "ASSET", subtype: "fixed_asset", isSystem: false },
  { code: "1590", name: "Accumulated Depreciation", type: "ASSET", subtype: "contra_asset", isSystem: false },
  // Liabilities (2xxx)
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "current_liability", isSystem: true },
  { code: "2100", name: "Sales Tax Payable", type: "LIABILITY", subtype: "current_liability", isSystem: true },
  { code: "2200", name: "Credit Card Payable", type: "LIABILITY", subtype: "current_liability", isSystem: false },
  { code: "2300", name: "Accrued Payroll", type: "LIABILITY", subtype: "current_liability", isSystem: false },
  { code: "2500", name: "Long-term Debt", type: "LIABILITY", subtype: "long_term", isSystem: false },
  // Equity (3xxx)
  { code: "3000", name: "Owner's Equity", type: "EQUITY", subtype: "equity", isSystem: true },
  { code: "3100", name: "Retained Earnings", type: "EQUITY", subtype: "equity", isSystem: true },
  // Revenue (4xxx)
  { code: "4000", name: "Sales Revenue", type: "REVENUE", subtype: "revenue", isSystem: true },
  { code: "4100", name: "Delivery Fees", type: "REVENUE", subtype: "revenue", isSystem: true },
  { code: "4200", name: "Tips & Gratuities", type: "REVENUE", subtype: "revenue", isSystem: false },
  { code: "4500", name: "Discounts Given", type: "REVENUE", subtype: "contra_revenue", isSystem: true },
  // COGS (5xxx)
  { code: "5000", name: "Cost of Goods Sold", type: "COST_OF_GOODS", subtype: "cogs", isSystem: true },
  { code: "5100", name: "Shrinkage & Loss", type: "COST_OF_GOODS", subtype: "cogs", isSystem: true },
  // Expenses (6xxx)
  { code: "6000", name: "Payroll & Benefits", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6100", name: "Rent", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6200", name: "Utilities", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6300", name: "Insurance", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6400", name: "Software & Technology", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6500", name: "Marketing & Advertising", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6600", name: "Delivery Costs", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6700", name: "Supplies & Misc", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6800", name: "Professional Fees", type: "EXPENSE", subtype: "expense", isSystem: false },
  { code: "6900", name: "Depreciation", type: "EXPENSE", subtype: "expense", isSystem: false },
];

// ─── Initialize Chart of Accounts ────────────────────────
export async function initializeAccounts(storeId: string) {
  const existing = await db.account.count({ where: { storeId } });
  if (existing > 0) return;

  for (const acct of DEFAULT_ACCOUNTS) {
    await db.account.create({
      data: { storeId, ...acct, type: acct.type as any },
    });
  }
}

// ─── Get Chart of Accounts ───────────────────────────────
export async function getChartOfAccounts(storeId: string) {
  return db.account.findMany({
    where: { storeId, isActive: true },
    orderBy: { code: "asc" },
  });
}

// ─── Auto-Create Journal Entry for POS Sale ──────────────
export async function createSaleJournalEntry(
  storeId: string,
  transactionId: string,
  data: {
    subtotal: number;
    taxAmount: number;
    total: number;
    costOfGoods: number;
    paymentMethod: string;
    tipAmount?: number;
    discountAmount?: number;
    description: string;
  }
) {
  const accounts = await getAccountMap(storeId);
  const entryNum = await nextEntryNumber(storeId);

  const lines: Array<{ debitAccountId?: string; creditAccountId?: string; amount: number; description?: string }> = [];

  // Debit Cash/Bank for total received
  lines.push({ debitAccountId: accounts["1000"], amount: data.total, description: "Payment received" });

  // Credit Sales Revenue for subtotal
  lines.push({ creditAccountId: accounts["4000"], amount: data.subtotal, description: "Product sales" });

  // Credit Sales Tax Payable
  if (data.taxAmount > 0) {
    lines.push({ creditAccountId: accounts["2100"], amount: data.taxAmount, description: "Sales tax collected" });
  }

  // Debit COGS, Credit Inventory
  if (data.costOfGoods > 0) {
    lines.push({ debitAccountId: accounts["5000"], amount: data.costOfGoods, description: "Cost of goods sold" });
    lines.push({ creditAccountId: accounts["1200"], amount: data.costOfGoods, description: "Inventory reduction" });
  }

  // Tips
  if (data.tipAmount && data.tipAmount > 0) {
    lines.push({ creditAccountId: accounts["4200"], amount: data.tipAmount, description: "Tip received" });
  }

  // Discounts
  if (data.discountAmount && data.discountAmount > 0) {
    lines.push({ debitAccountId: accounts["4500"], amount: data.discountAmount, description: "Discount given" });
  }

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0) / 2; // Debits = Credits

  const entry = await db.journalEntry.create({
    data: {
      storeId,
      entryNumber: entryNum,
      date: new Date(),
      description: data.description,
      reference: transactionId,
      referenceType: "transaction",
      referenceId: transactionId,
      totalAmount,
      isAutomatic: true,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  // Update account balances
  await updateAccountBalances(storeId, lines);

  return entry;
}

// ─── Auto-Create Journal Entry for Online Order ──────────
export async function createOnlineOrderJournalEntry(
  storeId: string,
  orderId: string,
  data: {
    subtotal: number;
    taxAmount: number;
    deliveryFee: number;
    tipAmount: number;
    total: number;
    costOfGoods: number;
    description: string;
  }
) {
  const accounts = await getAccountMap(storeId);
  const entryNum = await nextEntryNumber(storeId);

  const lines: Array<{ debitAccountId?: string; creditAccountId?: string; amount: number; description?: string }> = [];

  lines.push({ debitAccountId: accounts["1000"], amount: data.total, description: "Online payment" });
  lines.push({ creditAccountId: accounts["4000"], amount: data.subtotal, description: "Online sales" });

  if (data.taxAmount > 0) {
    lines.push({ creditAccountId: accounts["2100"], amount: data.taxAmount, description: "Sales tax" });
  }
  if (data.deliveryFee > 0) {
    lines.push({ creditAccountId: accounts["4100"], amount: data.deliveryFee, description: "Delivery fee" });
  }
  if (data.tipAmount > 0) {
    lines.push({ creditAccountId: accounts["4200"], amount: data.tipAmount, description: "Tip" });
  }
  if (data.costOfGoods > 0) {
    lines.push({ debitAccountId: accounts["5000"], amount: data.costOfGoods, description: "COGS" });
    lines.push({ creditAccountId: accounts["1200"], amount: data.costOfGoods, description: "Inventory" });
  }

  const entry = await db.journalEntry.create({
    data: {
      storeId, entryNumber: entryNum, date: new Date(),
      description: data.description, reference: orderId,
      referenceType: "online_order", referenceId: orderId,
      totalAmount: data.total, isAutomatic: true,
      lines: { create: lines },
    },
  });

  await updateAccountBalances(storeId, lines);
  return entry;
}

// ─── Record Expense with Journal Entry ───────────────────
export async function recordExpense(params: {
  storeId: string;
  vendorName: string;
  description: string;
  amount: number;
  taxAmount?: number;
  category: string;
  paymentMethod?: string;
  dueDate?: string;
  isRecurring?: boolean;
  recurringFreq?: string;
  receiptUrl?: string;
  notes?: string;
}) {
  const total = params.amount + (params.taxAmount || 0);

  const expense = await db.expense.create({
    data: {
      storeId: params.storeId,
      vendorName: params.vendorName,
      description: params.description,
      amount: params.amount,
      taxAmount: params.taxAmount || 0,
      total,
      category: params.category as any,
      paymentMethod: params.paymentMethod || "card",
      status: "PAID",
      paidDate: new Date(),
      dueDate: params.dueDate ? new Date(params.dueDate) : null,
      isRecurring: params.isRecurring || false,
      recurringFreq: params.recurringFreq,
      receiptUrl: params.receiptUrl,
      notes: params.notes,
    },
  });

  // Create journal entry
  const accounts = await getAccountMap(params.storeId);
  const entryNum = await nextEntryNumber(params.storeId);

  const expenseAccountCode = categoryToAccountCode(params.category);
  const expenseAccountId = accounts[expenseAccountCode] || accounts["6700"];

  const lines = [
    { debitAccountId: expenseAccountId, amount: params.amount, description: params.description },
    { creditAccountId: accounts["1000"], amount: total, description: `Payment to ${params.vendorName}` },
  ];

  const entry = await db.journalEntry.create({
    data: {
      storeId: params.storeId, entryNumber: entryNum, date: new Date(),
      description: `Expense: ${params.vendorName} — ${params.description}`,
      reference: expense.id, referenceType: "expense", referenceId: expense.id,
      totalAmount: total, isAutomatic: true,
      lines: { create: lines },
    },
  });

  await db.expense.update({ where: { id: expense.id }, data: { journalEntryId: entry.id } });
  await updateAccountBalances(params.storeId, lines);

  return expense;
}

// ─── Purchase Order Journal Entry ────────────────────────
export async function createPurchaseOrderJournalEntry(
  storeId: string,
  poId: string,
  totalCost: number,
  supplierName: string
) {
  const accounts = await getAccountMap(storeId);
  const entryNum = await nextEntryNumber(storeId);

  const lines = [
    { debitAccountId: accounts["1200"], amount: totalCost, description: `Inventory from ${supplierName}` },
    { creditAccountId: accounts["2000"], amount: totalCost, description: `AP — ${supplierName}` },
  ];

  const entry = await db.journalEntry.create({
    data: {
      storeId, entryNumber: entryNum, date: new Date(),
      description: `Purchase Order — ${supplierName}`,
      reference: poId, referenceType: "purchase_order", referenceId: poId,
      totalAmount: totalCost, isAutomatic: true,
      lines: { create: lines },
    },
  });

  await updateAccountBalances(storeId, lines);
  return entry;
}

// ─── Get P&L Statement ───────────────────────────────────
export async function getProfitAndLoss(storeId: string, startDate: Date, endDate: Date) {
  const cacheKey = `accounting:${storeId}:pnl:${startDate.toISOString().split("T")[0]}:${endDate.toISOString().split("T")[0]}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const entries = await db.journalEntry.findMany({
    where: { storeId, date: { gte: startDate, lte: endDate } },
    include: {
      lines: {
        include: { debitAccount: true, creditAccount: true },
      },
    },
  });

  const revenue: Record<string, number> = {};
  const cogs: Record<string, number> = {};
  const expenses: Record<string, number> = {};

  for (const entry of entries) {
    for (const line of entry.lines) {
      const account = line.creditAccount || line.debitAccount;
      if (!account) continue;

      const amount = Number(line.amount);
      const name = account.name;

      if (account.type === "REVENUE") {
        if (account.subtype === "contra_revenue") {
          revenue[name] = (revenue[name] || 0) - amount;
        } else {
          revenue[name] = (revenue[name] || 0) + (line.creditAccountId ? amount : -amount);
        }
      } else if (account.type === "COST_OF_GOODS") {
        cogs[name] = (cogs[name] || 0) + (line.debitAccountId ? amount : -amount);
      } else if (account.type === "EXPENSE") {
        expenses[name] = (expenses[name] || 0) + (line.debitAccountId ? amount : -amount);
      }
    }
  }

  const totalRevenue = Object.values(revenue).reduce((s, v) => s + v, 0);
  const totalCogs = Object.values(cogs).reduce((s, v) => s + v, 0);
  const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);
  const grossProfit = totalRevenue - totalCogs;
  const netIncome = grossProfit - totalExpenses;

  const result = {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    revenue: { total: totalRevenue, lines: Object.entries(revenue).map(([name, amount]) => ({ name, amount, pct: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 1000) / 10 : 0 })).sort((a, b) => b.amount - a.amount) },
    cogs: { total: totalCogs, lines: Object.entries(cogs).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount) },
    grossProfit,
    grossMargin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0,
    expenses: { total: totalExpenses, lines: Object.entries(expenses).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount) },
    netIncome,
    netMargin: totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 1000) / 10 : 0,
  };

  await cacheSet(cacheKey, result, 300);
  return result;
}

// ─── Get Balance Sheet ───────────────────────────────────
export async function getBalanceSheet(storeId: string) {
  const accounts = await db.account.findMany({
    where: { storeId, isActive: true },
    orderBy: { code: "asc" },
  });

  const grouped: Record<string, Array<{ name: string; code: string; balance: number; subtype: string | null }>> = {
    assets: [], liabilities: [], equity: [],
  };

  for (const acct of accounts) {
    const item = { name: acct.name, code: acct.code, balance: Number(acct.balance), subtype: acct.subtype };
    if (acct.type === "ASSET") grouped.assets.push(item);
    else if (acct.type === "LIABILITY") grouped.liabilities.push(item);
    else if (acct.type === "EQUITY") grouped.equity.push(item);
  }

  const totalAssets = grouped.assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = grouped.liabilities.reduce((s, l) => s + l.balance, 0);
  const totalEquity = grouped.equity.reduce((s, e) => s + e.balance, 0);

  return { ...grouped, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 };
}

// ─── Get Expenses ────────────────────────────────────────
export async function getExpenses(storeId: string, options?: { category?: string; status?: string; page?: number; limit?: number }) {
  const { category, status, page = 1, limit = 25 } = options || {};
  const where: Record<string, unknown> = { storeId };
  if (category) where.category = category;
  if (status) where.status = status;

  const [expenses, total] = await Promise.all([
    db.expense.findMany({ where: where as any, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    db.expense.count({ where: where as any }),
  ]);

  return { expenses, meta: { page, limit, total, hasMore: page * limit < total } };
}

// ─── Tax Tracking ────────────────────────────────────────
export async function getTaxSummary(storeId: string) {
  const records = await db.taxRecord.findMany({
    where: { storeId },
    orderBy: { period: "desc" },
    take: 12,
  });

  const current = records[0];
  return {
    current: current ? {
      collected: Number(current.collected),
      remitted: Number(current.remitted),
      due: Number(current.due),
      dueDate: current.dueDate.toISOString(),
      status: current.status,
    } : null,
    history: records.map((r) => ({
      period: r.period,
      collected: Number(r.collected),
      remitted: Number(r.remitted),
      due: Number(r.due),
      status: r.status,
    })),
  };
}

export async function updateTaxCollection(storeId: string, period: string, taxCollected: number) {
  const store = await db.store.findUnique({ where: { id: storeId } });
  const rate = Number(store?.taxRate || 0.0975);

  // Calculate due date (15th of next month)
  const [year, month] = period.split("-").map(Number);
  const dueDate = new Date(year, month, 15); // month is 0-indexed in Date but period is 1-indexed, so month = next month

  return db.taxRecord.upsert({
    where: { storeId_period: { storeId, period } },
    update: { collected: { increment: taxCollected }, due: { increment: taxCollected } },
    create: { storeId, period, collected: taxCollected, due: taxCollected, rate, dueDate },
  });
}

// ─── Get Journal Entries ─────────────────────────────────
export async function getJournalEntries(storeId: string, options?: { page?: number; limit?: number; startDate?: Date; endDate?: Date }) {
  const { page = 1, limit = 20, startDate, endDate } = options || {};
  const where: Record<string, unknown> = { storeId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as any).gte = startDate;
    if (endDate) (where.date as any).lte = endDate;
  }

  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where: where as any,
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.journalEntry.count({ where: where as any }),
  ]);

  return { entries, meta: { page, limit, total, hasMore: page * limit < total } };
}

// ─── AI Financial Analysis ───────────────────────────────
export async function generateFinancialInsights(storeId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pnl = await getProfitAndLoss(storeId, monthStart, now);
  const balance = await getBalanceSheet(storeId);
  const tax = await getTaxSummary(storeId);

  const prompt = `Analyze this liquor store's financials and give 3-4 actionable insights.

P&L (Month to Date):
Revenue: $${pnl.revenue.total.toLocaleString()} | COGS: $${pnl.cogs.total.toLocaleString()} | Gross: ${pnl.grossMargin}%
Expenses: $${pnl.expenses.total.toLocaleString()} | Net Income: $${pnl.netIncome.toLocaleString()} (${pnl.netMargin}%)
Top expense categories: ${pnl.expenses.lines.slice(0, 3).map(l => `${l.name}: $${l.amount}`).join(", ")}

Balance Sheet:
Cash: $${balance.assets.find(a => a.code === "1000")?.balance || 0} | Inventory: $${balance.assets.find(a => a.code === "1200")?.balance || 0}
AP: $${balance.liabilities.find(l => l.code === "2000")?.balance || 0}

Tax: $${tax.current?.due || 0} due ${tax.current?.dueDate || "TBD"}

Return JSON array: [{"type":"FINANCIAL_ALERT","title":"...","description":"...","confidence":0.0-1.0,"priority":1-10}]
Only valid JSON.`;

  const text = await generateText(prompt, { maxOutputTokens: 800 }) || "[]";
  try {
    const insights = JSON.parse(text.replace(/```json|```/g, "").trim());
    for (const insight of insights) {
      await db.aiInsight.create({
        data: {
          storeId, type: "FINANCIAL_ALERT", title: insight.title,
          description: insight.description, confidence: insight.confidence,
          priority: insight.priority, expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
    }
    return insights;
  } catch {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────
async function getAccountMap(storeId: string): Promise<Record<string, string>> {
  const accounts = await db.account.findMany({ where: { storeId }, select: { id: true, code: true } });
  return Object.fromEntries(accounts.map((a) => [a.code, a.id]));
}

async function nextEntryNumber(storeId: string): Promise<string> {
  const count = await db.journalEntry.count({ where: { storeId } });
  return `JE-${(count + 1).toString().padStart(6, "0")}`;
}

async function updateAccountBalances(
  storeId: string,
  lines: Array<{ debitAccountId?: string; creditAccountId?: string; amount: number }>
) {
  for (const line of lines) {
    if (line.debitAccountId) {
      const acct = await db.account.findUnique({ where: { id: line.debitAccountId } });
      if (!acct) continue;
      // Assets & Expenses increase with debits
      const isDebitNormal = ["ASSET", "COST_OF_GOODS", "EXPENSE"].includes(acct.type);
      await db.account.update({
        where: { id: line.debitAccountId },
        data: { balance: { increment: isDebitNormal ? line.amount : -line.amount } },
      });
    }
    if (line.creditAccountId) {
      const acct = await db.account.findUnique({ where: { id: line.creditAccountId } });
      if (!acct) continue;
      // Liabilities, Equity, Revenue increase with credits
      const isCreditNormal = ["LIABILITY", "EQUITY", "REVENUE"].includes(acct.type);
      await db.account.update({
        where: { id: line.creditAccountId },
        data: { balance: { increment: isCreditNormal ? line.amount : -line.amount } },
      });
    }
  }
}

function categoryToAccountCode(category: string): string {
  const map: Record<string, string> = {
    COGS: "5000", PAYROLL: "6000", RENT: "6100", UTILITIES: "6200",
    INSURANCE: "6300", SOFTWARE: "6400", MARKETING: "6500",
    DELIVERY: "6600", SUPPLIES: "6700", PROFESSIONAL_FEES: "6800",
  };
  return map[category] || "6700";
}
