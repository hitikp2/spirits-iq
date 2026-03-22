import { NextRequest, NextResponse } from "next/server";
import { getPriceComparisons, updateCompetitorPrice, generatePricingRecommendations, getPricingStats } from "@/lib/services/competitor-pricing";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId"); const action = searchParams.get("action") || "comparisons";
    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    if (action === "comparisons") return NextResponse.json({ success: true, data: await getPriceComparisons(storeId) } satisfies ApiResponse);
    if (action === "stats") return NextResponse.json({ success: true, data: await getPricingStats(storeId) } satisfies ApiResponse);
    if (action === "recommendations") return NextResponse.json({ success: true, data: await generatePricingRecommendations(storeId) } satisfies ApiResponse);
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try { const body = await request.json();
    if (body.action === "update-price") return NextResponse.json({ success: true, data: await updateCompetitorPrice(body) } satisfies ApiResponse);
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
