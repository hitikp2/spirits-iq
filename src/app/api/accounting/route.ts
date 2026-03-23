import { NextRequest, NextResponse } from "next/server";
import {
  initializeAccounts, getChartOfAccounts, getProfitAndLoss,
  getBalanceSheet, getExpenses, recordExpense, getTaxSummary,
  getJournalEntries, generateFinancialInsights,
} from "@/lib/services/accounting";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action") || "pnl";

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    if (action === "accounts") {
      const accounts = await getChartOfAccounts(storeId);
      return NextResponse.json({ success: true, data: accounts } satisfies ApiResponse);
    }

    if (action === "pnl") {
      const start = searchParams.get("start") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const end = searchParams.get("end") || new Date().toISOString();
      const pnl = await getProfitAndLoss(storeId, new Date(start), new Date(end));
      return NextResponse.json({ success: true, data: pnl } satisfies ApiResponse);
    }

    if (action === "balance-sheet") {
      const bs = await getBalanceSheet(storeId);
      return NextResponse.json({ success: true, data: bs } satisfies ApiResponse);
    }

    if (action === "expenses") {
      const result = await getExpenses(storeId, {
        category: searchParams.get("category") || undefined,
        status: searchParams.get("status") || undefined,
        page: parseInt(searchParams.get("page") || "1"),
        limit: parseInt(searchParams.get("limit") || "25"),
      });
      return NextResponse.json({ success: true, ...result } satisfies ApiResponse);
    }

    if (action === "tax") {
      const tax = await getTaxSummary(storeId);
      return NextResponse.json({ success: true, data: tax } satisfies ApiResponse);
    }

    if (action === "journal") {
      const result = await getJournalEntries(storeId, {
        page: parseInt(searchParams.get("page") || "1"),
        limit: parseInt(searchParams.get("limit") || "20"),
        startDate: searchParams.get("start") ? new Date(searchParams.get("start")!) : undefined,
        endDate: searchParams.get("end") ? new Date(searchParams.get("end")!) : undefined,
      });
      return NextResponse.json({ success: true, ...result } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error) {
    console.error("Accounting GET error:", error);
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, storeId } = body;

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    if (action === "init-accounts") {
      await initializeAccounts(storeId);
      return NextResponse.json({ success: true, data: { message: "Accounts initialized" } } satisfies ApiResponse);
    }

    if (action === "record-expense") {
      const expense = await recordExpense(body);
      return NextResponse.json({ success: true, data: expense } satisfies ApiResponse, { status: 201 });
    }

    if (action === "financial-insights") {
      const insights = await generateFinancialInsights(storeId);
      return NextResponse.json({ success: true, data: insights } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    console.error("Accounting POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
