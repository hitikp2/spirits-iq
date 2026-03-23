import { NextRequest, NextResponse } from "next/server";
import { getDashboardStats, getRevenueTimeline, getTopSellers } from "@/lib/services/analytics";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const [stats, revenue, topSellers] = await Promise.all([
      getDashboardStats(storeId),
      getRevenueTimeline(storeId, 7),
      getTopSellers(storeId, { days: 1, limit: 6 }),
    ]);

    return NextResponse.json({
      success: true,
      data: { stats, revenue, topSellers },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard data" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
