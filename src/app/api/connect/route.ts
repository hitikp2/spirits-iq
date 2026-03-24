import { NextRequest, NextResponse } from "next/server";
import {
  createConnectOnboardingLink,
  getConnectStatus,
  disconnectAccount,
  createDashboardLink,
  getPlatformEarnings,
} from "@/lib/services/connect";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/connect — Get Connect status or earnings
export async function GET(request: NextRequest) {
  try {
    const storeId = request.headers.get("x-store-id");
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // ─── Get Connect account status ─────────────────────
    if (!action || action === "status") {
      const status = await getConnectStatus(storeId);
      return NextResponse.json({ success: true, data: status } satisfies ApiResponse);
    }

    // ─── Get platform earnings for this store ───────────
    if (action === "earnings") {
      const days = parseInt(searchParams.get("days") || "30", 10);
      const earnings = await getPlatformEarnings(storeId, days);
      return NextResponse.json({ success: true, data: earnings } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Connect GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/connect — Onboarding, disconnect, dashboard link
export async function POST(request: NextRequest) {
  try {
    const storeId = request.headers.get("x-store-id");
    const userRole = request.headers.get("x-user-role");

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    if (userRole !== "OWNER" && userRole !== "MANAGER") {
      return NextResponse.json(
        { success: false, error: "Only owners and managers can manage Connect" } satisfies ApiResponse,
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    // ─── Start or resume onboarding ─────────────────────
    if (action === "onboard") {
      const { returnUrl } = body;
      if (!returnUrl) {
        return NextResponse.json(
          { success: false, error: "returnUrl required" } satisfies ApiResponse,
          { status: 400 }
        );
      }
      const url = await createConnectOnboardingLink(storeId, returnUrl);
      return NextResponse.json({ success: true, data: { url } } satisfies ApiResponse);
    }

    // ─── Get Stripe Dashboard login link ────────────────
    if (action === "dashboard-link") {
      const url = await createDashboardLink(storeId);
      if (!url) {
        return NextResponse.json(
          { success: false, error: "No connected account found" } satisfies ApiResponse,
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: { url } } satisfies ApiResponse);
    }

    // ─── Disconnect ─────────────────────────────────────
    if (action === "disconnect") {
      const success = await disconnectAccount(storeId);
      return NextResponse.json({ success, data: { disconnected: success } } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Connect POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
