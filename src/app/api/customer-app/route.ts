// ═══ /api/customer-app/route.ts ═══════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { getCustomerOrders, getReorderSuggestions, getCustomerWallet, processReferral } from "@/lib/services/customer-app";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const action = searchParams.get("action") || "orders";
    if (!customerId) return NextResponse.json({ success: false, error: "customerId required" } satisfies ApiResponse, { status: 400 });

    const handlers: Record<string, () => Promise<unknown>> = {
      orders: () => getCustomerOrders(customerId),
      reorder: () => getReorderSuggestions(customerId),
      wallet: () => getCustomerWallet(customerId),
    };

    const handler = handlers[action];
    if (!handler) return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
    return NextResponse.json({ success: true, data: await handler() } satisfies ApiResponse);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "referral") {
      const result = await processReferral(body.code, body.customerId, body.storeId);
      return NextResponse.json({ success: result.success, data: result } satisfies ApiResponse);
    }
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
