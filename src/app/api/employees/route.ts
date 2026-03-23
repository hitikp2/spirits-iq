import { NextRequest, NextResponse } from "next/server";
import {
  getEmployees, createEmployee, clockIn, clockOut,
  getSchedule, generateAiSchedule, getEmployeePerformance,
} from "@/lib/services/employees";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action") || "list";

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    if (action === "list") {
      const employees = await getEmployees(storeId);
      return NextResponse.json({ success: true, data: employees } satisfies ApiResponse);
    }

    if (action === "schedule") {
      const weekStr = searchParams.get("week");
      const weekStart = weekStr ? new Date(weekStr) : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; })();
      const schedule = await getSchedule(storeId, weekStart);
      return NextResponse.json({ success: true, data: schedule } satisfies ApiResponse);
    }

    if (action === "performance") {
      const days = parseInt(searchParams.get("days") || "30");
      const performance = await getEmployeePerformance(storeId, days);
      return NextResponse.json({ success: true, data: performance } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const employee = await createEmployee(body);
      return NextResponse.json({ success: true, data: employee } satisfies ApiResponse, { status: 201 });
    }

    if (action === "clock-in") {
      const result = await clockIn(body.userId);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "clock-out") {
      const result = await clockOut(body.userId);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "generate-schedule") {
      const { storeId, weekStart } = body;
      const schedule = await generateAiSchedule(storeId, new Date(weekStart));
      return NextResponse.json({ success: true, data: schedule } satisfies ApiResponse);
    }

    if (action === "update") {
      const { userId, ...updates } = body;
      delete updates.action;
      const user = await db.user.update({ where: { id: userId }, data: updates });
      return NextResponse.json({ success: true, data: user } satisfies ApiResponse);
    }

    if (action === "time-off") {
      const { userId, startDate, endDate, reason } = body;
      const request = await db.timeOffRequest.create({
        data: { userId, startDate: new Date(startDate), endDate: new Date(endDate), reason },
      });
      return NextResponse.json({ success: true, data: request } satisfies ApiResponse, { status: 201 });
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
