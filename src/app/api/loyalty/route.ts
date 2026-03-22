import { NextRequest, NextResponse } from "next/server";
import {
  getLoyaltyProfile, redeemReward, applyCoupon,
  awardBonusPoints, refreshCustomerTiers,
} from "@/lib/services/loyalty";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const customerId = searchParams.get("customerId");

    if (!storeId || !customerId) {
      return NextResponse.json({ success: false, error: "storeId and customerId required" } satisfies ApiResponse, { status: 400 });
    }

    const profile = await getLoyaltyProfile(customerId, storeId);
    return NextResponse.json({ success: true, data: profile } satisfies ApiResponse);
  } catch (error) {
    console.error("Loyalty GET error:", error);
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "redeem") {
      const { customerId, rewardId } = body;
      const result = await redeemReward(customerId, rewardId);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "apply-coupon") {
      const { couponCode, subtotal } = body;
      const result = await applyCoupon(couponCode, subtotal);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "bonus-points") {
      const { customerId, storeId, points, reason, type } = body;
      const result = await awardBonusPoints(customerId, storeId, points, reason, type);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "refresh-tiers") {
      const { storeId } = body;
      const result = await refreshCustomerTiers(storeId);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    console.error("Loyalty POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
