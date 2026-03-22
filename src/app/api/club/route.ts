import { NextRequest, NextResponse } from "next/server";
import { getClubPlans, createSubscription, cancelSubscription, curateMonthlyBox, createShipment, getCustomerShipments } from "@/lib/services/club";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const action = searchParams.get("action") || "plans";
    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    if (action === "plans") return NextResponse.json({ success: true, data: await getClubPlans(storeId) } satisfies ApiResponse);
    if (action === "shipments") { const cid = searchParams.get("customerId"); return NextResponse.json({ success: true, data: await getCustomerShipments(cid!) } satisfies ApiResponse); }
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "subscribe") return NextResponse.json({ success: true, data: await createSubscription(body) } satisfies ApiResponse, { status: 201 });
    if (body.action === "cancel") return NextResponse.json({ success: true, data: await cancelSubscription(body.subscriptionId) } satisfies ApiResponse);
    if (body.action === "curate") return NextResponse.json({ success: true, data: await curateMonthlyBox(body.subscriptionId) } satisfies ApiResponse);
    if (body.action === "ship") return NextResponse.json({ success: true, data: await createShipment(body.subscriptionId, body.items) } satisfies ApiResponse);
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
