import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateInsights } from "@/lib/ai";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/ai — Fetch existing insights
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const status = searchParams.get("status") || "NEW";

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const insights = await db.aiInsight.findMany({
      where: {
        storeId,
        ...(status !== "all" ? { status: status as any } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 20,
    });

    return NextResponse.json({ success: true, data: insights } satisfies ApiResponse);
  } catch (error) {
    console.error("AI GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch insights" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/ai — Generate new insights or update status
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "generate") {
      const { storeId } = body;
      if (!storeId) {
        return NextResponse.json(
          { success: false, error: "storeId is required" } satisfies ApiResponse,
          { status: 400 }
        );
      }
      const insights = await generateInsights(storeId);
      return NextResponse.json({ success: true, data: insights } satisfies ApiResponse);
    }

    if (action === "update-status") {
      const { insightId, status, actionTaken } = body;
      const insight = await db.aiInsight.update({
        where: { id: insightId },
        data: { status, actionTaken },
      });
      return NextResponse.json({ success: true, data: insight } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error) {
    console.error("AI POST error:", error);
    return NextResponse.json(
      { success: false, error: "Operation failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
