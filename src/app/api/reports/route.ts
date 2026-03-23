import { NextRequest, NextResponse } from "next/server";
import {
  getReportDashboard, generateDailySnapshot,
  generateMonthlyReport, generateExecutiveSummary,
  calculateCustomerLTV,
} from "@/lib/services/reports";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action") || "dashboard";

    if (!storeId) {
      return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    }

    if (action === "dashboard") {
      const days = parseInt(searchParams.get("days") || "30");
      const data = await getReportDashboard(storeId, days);
      return NextResponse.json({ success: true, data } satisfies ApiResponse);
    }

    if (action === "monthly") {
      const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
      const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());
      const report = await db.monthlyReport.findUnique({
        where: { storeId_year_month: { storeId, year, month } },
      });
      return NextResponse.json({ success: true, data: report } satisfies ApiResponse);
    }

    if (action === "daily") {
      const days = parseInt(searchParams.get("days") || "7");
      const since = new Date();
      since.setDate(since.getDate() - days);
      const snapshots = await db.dailySnapshot.findMany({
        where: { storeId, date: { gte: since } },
        orderBy: { date: "asc" },
      });
      return NextResponse.json({ success: true, data: snapshots } satisfies ApiResponse);
    }

    if (action === "top-customers") {
      const limit = parseInt(searchParams.get("limit") || "10");
      const customers = await db.customerLifetimeValue.findMany({
        where: { storeId },
        include: { customer: true },
        orderBy: { totalRevenue: "desc" },
        take: limit,
      });
      return NextResponse.json({ success: true, data: customers } satisfies ApiResponse);
    }

    if (action === "customer-segments") {
      const segments = await db.customerLifetimeValue.groupBy({
        by: ["segment"],
        where: { storeId },
        _count: true,
        _sum: { totalRevenue: true, predictedLtv: true },
        _avg: { avgOrderValue: true, churnRisk: true },
      });
      return NextResponse.json({ success: true, data: segments } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error) {
    console.error("Reports GET error:", error);
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, storeId } = body;

    if (!storeId) {
      return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    }

    if (action === "generate-daily") {
      const snapshot = await generateDailySnapshot(storeId, body.date ? new Date(body.date) : undefined);
      return NextResponse.json({ success: true, data: snapshot } satisfies ApiResponse);
    }

    if (action === "generate-monthly") {
      const { year, month } = body;
      const report = await generateMonthlyReport(storeId, year, month);
      return NextResponse.json({ success: true, data: report } satisfies ApiResponse);
    }

    if (action === "executive-summary") {
      const { year, month } = body;
      const summary = await generateExecutiveSummary(storeId, month, year);
      return NextResponse.json({ success: true, data: { summary } } satisfies ApiResponse);
    }

    if (action === "calculate-ltv") {
      await calculateCustomerLTV(storeId);
      return NextResponse.json({ success: true, data: { message: "LTV calculation complete" } } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    console.error("Reports POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
