import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendSms, sendSmsDirect, sendBroadcastCampaign } from "@/lib/sms";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/sms — List conversations or campaign history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action");

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    if (action === "campaigns") {
      const campaigns = await db.smsCampaign.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return NextResponse.json({ success: true, data: campaigns } satisfies ApiResponse);
    }

    if (action === "ai-stats") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const autoReplies = await db.smsMessage.count({
        where: {
          direction: "OUTBOUND",
          aiGenerated: true,
          createdAt: { gte: todayStart },
          customer: { storeId },
        },
      });
      return NextResponse.json({ success: true, data: { autoReplies } } satisfies ApiResponse);
    }

    // Get conversations — customers with recent messages
    const customers = await db.customer.findMany({
      where: {
        storeId,
        smsMessages: { some: {} },
      },
      include: {
        smsMessages: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const conversations = customers.map((c) => ({
      customerId: c.id,
      customerName: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
      phone: c.phone,
      tier: c.tier,
      tags: c.tags,
      unreadCount: c.smsMessages.filter(
        (m) => m.direction === "INBOUND" && m.status === "RECEIVED"
      ).length,
      lastMessage: c.smsMessages[0]?.body || "",
      lastMessageAt: c.smsMessages[0]?.createdAt?.toISOString() || "",
      messages: c.smsMessages.map((m) => ({
        id: m.id,
        direction: m.direction.toLowerCase(),
        body: m.body,
        aiGenerated: m.aiGenerated,
        status: m.status.toLowerCase(),
        createdAt: m.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({ success: true, data: conversations } satisfies ApiResponse);
  } catch (error) {
    console.error("SMS GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch conversations" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/sms — Send a message or create a campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Check Twilio config upfront for send actions
    const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);

    if (action === "send") {
      if (!twilioConfigured) {
        return NextResponse.json(
          { success: false, error: "SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in environment variables." } satisfies ApiResponse,
          { status: 503 }
        );
      }
      const { customerId, message } = body;
      if (!customerId || !message) {
        return NextResponse.json(
          { success: false, error: "customerId and message are required" } satisfies ApiResponse,
          { status: 400 }
        );
      }
      const storeId = request.headers.get("x-store-id") || "";
      const customer = await db.customer.findUnique({ where: { id: customerId } });
      if (!customer || (storeId && customer.storeId !== storeId)) {
        return NextResponse.json(
          { success: false, error: "Customer not found" } satisfies ApiResponse,
          { status: 404 }
        );
      }
      const sid = await sendSms(customer.phone, message, customerId);
      return NextResponse.json({
        success: !!sid,
        data: { twilioSid: sid },
        error: sid ? undefined : "Twilio failed to deliver the message. Check phone number format.",
      } satisfies ApiResponse);
    }

    if (action === "send-direct") {
      if (!twilioConfigured) {
        return NextResponse.json(
          { success: false, error: "SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in environment variables." } satisfies ApiResponse,
          { status: 503 }
        );
      }
      const { phone, message, mediaUrl } = body;
      if (!phone || (!message && !mediaUrl)) {
        return NextResponse.json(
          { success: false, error: "Phone and message (or mediaUrl) are required" } satisfies ApiResponse,
          { status: 400 }
        );
      }
      // Always use sendSmsDirect for direct sends — it supports mediaUrl for MMS
      const smsOptions = mediaUrl ? { mediaUrl } : undefined;
      const sid = await sendSmsDirect(phone, message || "", smsOptions);
      return NextResponse.json({
        success: !!sid,
        data: { twilioSid: sid },
        error: sid ? undefined : "Twilio failed to deliver the message. Check phone number format (e.g. +15551234567).",
      } satisfies ApiResponse);
    }

    if (action === "campaign-create") {
      const { storeId, name, messageBody, targetTier, targetTags, scheduledFor } = body;

      // Count estimated recipients
      const whereClause: Record<string, unknown> = { storeId, smsOptedIn: true };
      if (targetTier) whereClause.tier = targetTier;
      if (targetTags?.length) whereClause.tags = { hasSome: targetTags };
      const recipientCount = await db.customer.count({ where: whereClause as any });

      const campaign = await db.smsCampaign.create({
        data: {
          storeId,
          name,
          messageBody,
          targetTier: targetTier || null,
          targetTags: targetTags || [],
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
          status: scheduledFor ? "SCHEDULED" : "DRAFT",
          recipientCount,
        },
      });

      return NextResponse.json({
        success: true,
        data: { ...campaign, estimatedRecipients: recipientCount },
      } satisfies ApiResponse, { status: 201 });
    }

    if (action === "campaign-send") {
      const { campaignId } = body;
      // In production, this would be queued via a job processor
      const result = await sendBroadcastCampaign(campaignId);
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error) {
    console.error("SMS POST error:", error);
    return NextResponse.json(
      { success: false, error: "Operation failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
