import { NextRequest, NextResponse } from "next/server";
import { endOfDayJob, dailyAiJob, weeklyJob, monthlyJob } from "@/lib/services/jobs";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// POST /api/cron — Triggered by Vercel Cron or external scheduler
// Secured by CRON_SECRET header
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { job } = body;

    // Get all active stores
    const stores = await db.store.findMany({ select: { id: true, name: true } });
    const results: Record<string, unknown> = {};

    for (const store of stores) {
      try {
        if (job === "end-of-day") {
          results[store.id] = await endOfDayJob(store.id);
        } else if (job === "daily-ai") {
          results[store.id] = await dailyAiJob(store.id);
        } else if (job === "weekly") {
          results[store.id] = await weeklyJob(store.id);
        } else if (job === "monthly") {
          results[store.id] = await monthlyJob(store.id);
        }
      } catch (error: any) {
        results[store.id] = { error: error.message };
      }
    }

    return NextResponse.json({ success: true, data: { job, stores: results } } satisfies ApiResponse);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message } satisfies ApiResponse, { status: 500 });
  }
}
