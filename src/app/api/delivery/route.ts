// ─── /api/delivery/route.ts ───────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getActiveDeliveries, assignDriver, markDelivered, getDeliveryStats } from "@/lib/services/delivery";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action") || "active";

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    if (action === "stats") {
      const stats = await getDeliveryStats(storeId);
      return NextResponse.json({ success: true, data: stats } satisfies ApiResponse);
    }

    if (action === "drivers") {
      const drivers = await db.driver.findMany({ where: { storeId, isActive: true }, orderBy: { status: "asc" } });
      return NextResponse.json({ success: true, data: drivers } satisfies ApiResponse);
    }

    const deliveries = await getActiveDeliveries(storeId);
    return NextResponse.json({ success: true, data: deliveries } satisfies ApiResponse);
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "assign-driver") {
      const { orderId, driverId } = body;
      const result = await assignDriver(orderId, driverId);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "mark-delivered") {
      const { orderId, signature, photoUrl } = body;
      const result = await markDelivered(orderId, { signature, photoUrl });
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "update-driver-status") {
      const { driverId, status } = body;
      const driver = await db.driver.update({ where: { id: driverId }, data: { status } });
      return NextResponse.json({ success: true, data: driver } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
