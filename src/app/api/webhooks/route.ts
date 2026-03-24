import { NextRequest, NextResponse } from "next/server";
import { handleInboundSms } from "@/lib/sms";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─── Stripe Webhook ──────────────────────────────────────
// POST /api/webhooks/stripe
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  if (provider === "stripe") {
    return handleStripeWebhook(request);
  }

  if (provider === "stripe-connect") {
    return handleStripeConnectWebhook(request);
  }

  if (provider === "twilio") {
    return handleTwilioWebhook(request);
  }

  return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
}

async function handleStripeWebhook(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const { stripe } = await import("@/lib/payments");
    if (!stripe) {
      return NextResponse.json({ error: "Stripe not available" }, { status: 503 });
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const transactionId = pi.metadata?.transactionId;
        if (transactionId) {
          await db.transaction.update({
            where: { id: transactionId },
            data: {
              paymentStatus: "COMPLETED",
              stripePaymentId: pi.id,
              cardLast4: (pi.charges?.data?.[0]?.payment_method_details as any)?.card?.last4,
              cardBrand: (pi.charges?.data?.[0]?.payment_method_details as any)?.card?.brand,
            },
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const transactionId = pi.metadata?.transactionId;
        if (transactionId) {
          await db.transaction.update({
            where: { id: transactionId },
            data: { paymentStatus: "FAILED" },
          });
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const pi = charge.payment_intent as string;
        if (pi) {
          const transaction = await db.transaction.findFirst({
            where: { stripePaymentId: pi },
          });
          if (transaction) {
            const isFullRefund = charge.amount_refunded === charge.amount;
            await db.transaction.update({
              where: { id: transaction.id },
              data: {
                paymentStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
              },
            });
          }
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// ─── Stripe Connect Webhook ──────────────────────────────
// Handles events from connected accounts (e.g., account.updated)
async function handleStripeConnectWebhook(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Connect webhook not configured" }, { status: 503 });
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "account.updated": {
        // A connected account's status changed (e.g., completed onboarding)
        const account = event.data.object as any;
        const storeId = account.metadata?.storeId;

        if (storeId && account.charges_enabled) {
          await db.storeIntegration.updateMany({
            where: { storeId, provider: "stripe-connect" },
            data: { isActive: true, connectedAt: new Date() },
          });
        }
        break;
      }

      case "account.application.deauthorized": {
        // Store owner disconnected from their Stripe Dashboard
        const account = event.data.object as any;
        const storeId = account.metadata?.storeId;

        if (storeId) {
          await db.storeIntegration.updateMany({
            where: { storeId, provider: "stripe-connect" },
            data: { isActive: false },
          });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe Connect webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// ─── Twilio Webhook ──────────────────────────────────────
async function handleTwilioWebhook(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get("From") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    if (!from || !body) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await handleInboundSms(from, body, messageSid);

    // Return TwiML empty response (Twilio expects XML)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
