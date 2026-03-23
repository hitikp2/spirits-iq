import twilio from "twilio";
import { db } from "@/lib/db";
import { generateSmsResponse } from "@/lib/ai";

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// ─── Send SMS ────────────────────────────────────────────
export async function sendSms(
  to: string,
  body: string,
  customerId: string,
  options?: { campaignId?: string; aiGenerated?: boolean }
): Promise<string | null> {
  if (!client) {
    console.warn("Twilio not configured — skipping SMS send");
    return null;
  }
  try {
    const message = await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    });

    // Log to database
    await db.smsMessage.create({
      data: {
        customerId,
        direction: "OUTBOUND",
        body,
        twilioSid: message.sid,
        status: "SENT",
        aiGenerated: options?.aiGenerated || false,
        campaignId: options?.campaignId,
      },
    });

    return message.sid;
  } catch (error) {
    console.error("SMS send failed:", error);
    return null;
  }
}

// ─── Handle Inbound SMS (Twilio Webhook) ─────────────────
export async function handleInboundSms(
  from: string,
  body: string,
  twilioSid: string
) {
  // Normalize phone number
  const phone = from.replace(/\D/g, "").slice(-10);

  // Find or create customer
  // We need a storeId — for now find the first store (multi-store would use a phone-to-store mapping)
  const store = await db.store.findFirst();
  if (!store) throw new Error("No store configured");

  let customer = await db.customer.findFirst({
    where: { phone: { endsWith: phone }, storeId: store.id },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        phone: from,
        storeId: store.id,
        smsOptedIn: true,
        smsOptInDate: new Date(),
      },
    });
  }

  // Log inbound message
  await db.smsMessage.create({
    data: {
      customerId: customer.id,
      direction: "INBOUND",
      body,
      twilioSid,
      status: "RECEIVED",
    },
  });

  // Check for opt-out keywords
  const optOutKeywords = ["stop", "unsubscribe", "cancel", "quit"];
  if (optOutKeywords.includes(body.toLowerCase().trim())) {
    await db.customer.update({
      where: { id: customer.id },
      data: { smsOptedIn: false },
    });
    await sendSms(from, "You've been unsubscribed. Reply START to re-subscribe.", customer.id);
    return;
  }

  // Check for opt-in keyword
  if (body.toLowerCase().trim() === "start") {
    await db.customer.update({
      where: { id: customer.id },
      data: { smsOptedIn: true, smsOptInDate: new Date() },
    });
    await sendSms(from, `Welcome back to ${store.name}! You'll receive updates on new arrivals, deals, and more. Reply STOP to unsubscribe.`, customer.id);
    return;
  }

  // Check if AI auto-response is enabled
  const settings = store.settings as Record<string, boolean> | null;
  if (settings?.aiSmsAutoResponse !== false) {
    const aiResponse = await generateSmsResponse(body, customer.id, store.id);
    await sendSms(from, aiResponse, customer.id, { aiGenerated: true });
  }
}

// ─── Broadcast Campaign ──────────────────────────────────
export async function sendBroadcastCampaign(campaignId: string) {
  const campaign = await db.smsCampaign.findUnique({
    where: { id: campaignId },
    include: { store: true },
  });

  if (!campaign) throw new Error("Campaign not found");

  // Get target recipients
  const whereClause: Record<string, unknown> = {
    storeId: campaign.storeId,
    smsOptedIn: true,
  };
  if (campaign.targetTier) whereClause.tier = campaign.targetTier;
  if (campaign.targetTags && campaign.targetTags.length > 0) {
    whereClause.tags = { hasSome: campaign.targetTags };
  }

  const recipients = await db.customer.findMany({ where: whereClause });

  // Update campaign status
  await db.smsCampaign.update({
    where: { id: campaignId },
    data: {
      status: "SENDING",
      sentAt: new Date(),
      recipientCount: recipients.length,
    },
  });

  let deliveredCount = 0;
  for (const customer of recipients) {
    const sid = await sendSms(customer.phone, campaign.messageBody, customer.id, {
      campaignId: campaign.id,
    });
    if (sid) deliveredCount++;

    // Rate limit: Twilio recommends max 1 msg/sec for long codes
    await new Promise((r) => setTimeout(r, 1100));
  }

  await db.smsCampaign.update({
    where: { id: campaignId },
    data: { status: "COMPLETED", deliveredCount },
  });

  return { sent: recipients.length, delivered: deliveredCount };
}
