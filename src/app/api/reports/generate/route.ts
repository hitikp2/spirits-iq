import { NextRequest, NextResponse } from "next/server";
import { generateReport, assembleReportData, renderReportHTML } from "@/lib/services/report-generator";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/reports/generate — Generate and return a report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const type = searchParams.get("type") as "daily" | "weekly" | "monthly";
    const format = searchParams.get("format") || "html"; // "html" or "json"
    const date = searchParams.get("date");

    if (!storeId || !type) {
      return NextResponse.json(
        { success: false, error: "storeId and type (daily|weekly|monthly) required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    if (!["daily", "weekly", "monthly"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "type must be daily, weekly, or monthly" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const targetDate = date ? new Date(date) : new Date();

    if (format === "json") {
      const data = await assembleReportData(storeId, type, targetDate);
      return NextResponse.json({ success: true, data } satisfies ApiResponse);
    }

    // Return full HTML report
    const { html } = await generateReport(storeId, type, targetDate);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error: any) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Report generation failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/reports/generate — Schedule or trigger report generation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, storeId, type, date, email } = body;

    if (!storeId) {
      return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    }

    if (action === "generate") {
      const { html, data } = await generateReport(storeId, type || "daily", date ? new Date(date) : undefined);
      return NextResponse.json({
        success: true,
        data: {
          period: data.period,
          revenue: data.revenue.total,
          netIncome: data.pnl.netIncome,
          transactions: data.transactions.total,
          htmlLength: html.length,
          generatedAt: data.generatedAt,
        },
      } satisfies ApiResponse);
    }

    if (action === "generate-all") {
      // Generate all three report types
      const results: Record<string, unknown> = {};
      for (const reportType of ["daily", "weekly", "monthly"] as const) {
        try {
          const { data } = await generateReport(storeId, reportType);
          results[reportType] = { success: true, revenue: data.revenue.total, period: data.period.label };
        } catch (e: any) {
          results[reportType] = { success: false, error: e.message };
        }
      }
      return NextResponse.json({ success: true, data: results } satisfies ApiResponse);
    }

    if (action === "email-report") {
      // Generate and email the report
      const { html, data } = await generateReport(storeId, type || "monthly");
      
      // In production: integrate with SendGrid/SES to email the HTML report
      // For now, return the data confirming it would be sent
      return NextResponse.json({
        success: true,
        data: {
          message: `${data.period.type} report for ${data.period.label} would be emailed to ${email || "store email"}`,
          period: data.period,
        },
      } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    console.error("Report POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
