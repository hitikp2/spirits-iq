import { NextRequest, NextResponse } from "next/server";
import { getSecurityEvents, logSecurityEvent, getShrinkageReport, checkDiscrepancies } from "@/lib/services/security";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId"); const action = searchParams.get("action") || "events";
    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    if (action === "events") return NextResponse.json({ success: true, ...(await getSecurityEvents(storeId, { hours: parseInt(searchParams.get("hours") || "24") })) } satisfies ApiResponse);
    if (action === "shrinkage") return NextResponse.json({ success: true, data: await getShrinkageReport(storeId) } satisfies ApiResponse);
    if (action === "discrepancies") return NextResponse.json({ success: true, data: await checkDiscrepancies(storeId) } satisfies ApiResponse);
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try { const body = await request.json();
    if (body.action === "log-event") return NextResponse.json({ success: true, data: await logSecurityEvent(body) } satisfies ApiResponse);
    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) { return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 }); }
}
