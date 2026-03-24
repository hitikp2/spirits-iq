import { NextRequest, NextResponse } from "next/server";
import { completeTransaction } from "@/lib/payments";
import { getUpsellSuggestions } from "@/lib/ai";
import { getCredentials } from "@/lib/integrations";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// ─── Resolve Stripe secret key: store integration → env var ───
async function getStripeKey(storeId: string): Promise<string | null> {
  const creds = await getCredentials(storeId, "stripe");
  return creds?.secretKey || null;
}

// POST /api/pos — Process a sale or create payment intent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const storeId = request.headers.get("x-store-id") || body.storeId;
    const cashierId = request.headers.get("x-user-id") || body.cashierId;
    const { action } = body;

    // ─── Create PaymentIntent for web card/wallet payments ───
    if (action === "create-intent") {
      const { amount } = body; // amount in cents
      if (!amount || !storeId) {
        return NextResponse.json(
          { success: false, error: "amount and storeId required" } satisfies ApiResponse,
          { status: 400 }
        );
      }
      const stripeKey = await getStripeKey(storeId);
      if (!stripeKey) {
        return NextResponse.json(
          { success: false, error: "Stripe is not configured. Add your Secret Key in Settings > Integrations." } satisfies ApiResponse,
          { status: 503 }
        );
      }
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: { storeId, cashierId: cashierId || "" },
      });

      return NextResponse.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        },
      } satisfies ApiResponse);
    }

    // ─── Complete sale (after payment or for cash) ───────────
    const {
      customerId,
      items, paymentMethod, tip, ageVerified, verificationMethod,
      stripePaymentId: clientStripeId,
    } = body;

    // Validation
    if (!storeId || !cashierId || !items?.length) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Resolve the store's active register
    const register = await db.register.findFirst({
      where: { storeId, isActive: true },
    });
    const registerId = register?.id || null;

    let stripePaymentId: string | undefined = clientStripeId;
    let cardLast4: string | undefined;
    let cardBrand: string | undefined;

    // If a Stripe PaymentIntent was used, retrieve card details
    if (stripePaymentId) {
      try {
        const stripeKey = await getStripeKey(storeId);
        if (stripeKey) {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
          const pi = await stripe.paymentIntents.retrieve(stripePaymentId);
          if (pi.status === "succeeded" && pi.latest_charge) {
            const charge = await stripe.charges.retrieve(pi.latest_charge as string);
            cardLast4 = charge.payment_method_details?.card?.last4 || undefined;
            cardBrand = charge.payment_method_details?.card?.brand || undefined;
          }
        }
      } catch (err) {
        console.warn("Could not retrieve Stripe card details:", err);
      }
    }

    const transaction = await completeTransaction({
      storeId,
      registerId,
      cashierId,
      customerId,
      items,
      paymentMethod,
      stripePaymentId,
      cardLast4,
      cardBrand,
      ageVerified,
      verificationMethod,
      tip,
    });

    return NextResponse.json({
      success: true,
      data: transaction,
    } satisfies ApiResponse);
  } catch (error) {
    console.error("POS transaction error:", error);
    return NextResponse.json(
      { success: false, error: "Transaction failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// GET /api/pos?action=upsell — Get AI upsell suggestions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");

    if (action === "upsell") {
      const productIds = searchParams.get("productIds")?.split(",") || [];
      const customerId = searchParams.get("customerId");

      if (!storeId || productIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "storeId and productIds are required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const suggestion = await getUpsellSuggestions(productIds, customerId, storeId);
      return NextResponse.json({ success: true, data: suggestion } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error) {
    console.error("POS API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
