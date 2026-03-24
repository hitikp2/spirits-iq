import { NextRequest, NextResponse } from "next/server";
import { completeTransaction } from "@/lib/payments";
import { getUpsellSuggestions } from "@/lib/ai";
import { getCredentials } from "@/lib/integrations";
import { getApplicationFee } from "@/lib/services/connect";
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

      // Check if this store has a Stripe Connect account for platform fees
      const connectFee = await getApplicationFee(storeId, amount);

      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: { storeId, cashierId: cashierId || "" },
      };

      // If a Connect account is active, route payment through it with an application fee
      if (connectFee) {
        intentParams.application_fee_amount = connectFee.feeAmount;
        intentParams.transfer_data = { destination: connectFee.connectedAccountId };
        intentParams.metadata!.platformFee = String(connectFee.feeAmount);
        intentParams.metadata!.connectedAccountId = connectFee.connectedAccountId;
      }

      const paymentIntent = await stripe.paymentIntents.create(intentParams);

      return NextResponse.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          platformFee: connectFee?.feeAmount || 0,
        },
      } satisfies ApiResponse);
    }

    // ─── Link customer to existing transaction (post-sale) ───
    if (action === "link-customer") {
      const { transactionId, phone } = body;
      if (!transactionId || !phone || !storeId) {
        return NextResponse.json(
          { success: false, error: "transactionId, phone, and storeId required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const cleanPhone = phone.replace(/\D/g, "").slice(-10);

      // Find or create customer
      let customer = await db.customer.findFirst({
        where: { storeId, phone: { endsWith: cleanPhone } },
      });

      if (!customer) {
        customer = await db.customer.create({
          data: {
            storeId,
            phone: cleanPhone,
            firstName: "New",
            lastName: "Customer",
            tier: "REGULAR",
            tags: [],
            smsOptedIn: true,
            smsOptInDate: new Date(),
          },
        });
      }

      // Get the transaction
      const txn = await db.transaction.findUnique({ where: { id: transactionId } });
      if (!txn) {
        return NextResponse.json(
          { success: false, error: "Transaction not found" } satisfies ApiResponse,
          { status: 404 }
        );
      }

      // Only link if not already linked to a customer
      if (txn.customerId) {
        return NextResponse.json({
          success: true,
          data: { customer, alreadyLinked: true },
        } satisfies ApiResponse);
      }

      // Award loyalty points
      const loyaltyConfig = await db.loyaltyConfig.findUnique({ where: { storeId } });
      const pointsPerDollar = loyaltyConfig ? Number(loyaltyConfig.pointsPerDollar) : 1;
      const total = Number(txn.total);
      const earnedPoints = Math.floor(total * pointsPerDollar);
      const newBalance = customer.loyaltyPoints + earnedPoints;

      await db.$transaction(async (tx) => {
        // Link transaction to customer
        await tx.transaction.update({
          where: { id: transactionId },
          data: { customerId: customer!.id },
        });

        // Update customer stats
        await tx.customer.update({
          where: { id: customer!.id },
          data: {
            totalSpent: { increment: total },
            visitCount: { increment: 1 },
            lastVisit: new Date(),
            loyaltyPoints: newBalance,
          },
        });

        // Record loyalty transaction
        if (earnedPoints > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              customerId: customer!.id,
              storeId: storeId!,
              type: "EARN_PURCHASE",
              points: earnedPoints,
              balance: newBalance,
              description: `Purchase ${txn.transactionNum}`,
              reference: txn.id,
            },
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          customer: { ...customer, loyaltyPoints: newBalance },
          pointsAwarded: earnedPoints,
          linked: true,
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

    // Extract platform fee info from the PaymentIntent metadata if available
    let platformFee: number | undefined;
    let connectedAccountId: string | undefined;
    if (stripePaymentId) {
      try {
        const stripeKey = await getStripeKey(storeId);
        if (stripeKey) {
          const Stripe = (await import("stripe")).default;
          const stripeClient = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
          const pi = await stripeClient.paymentIntents.retrieve(stripePaymentId);
          platformFee = pi.metadata?.platformFee ? parseInt(pi.metadata.platformFee, 10) : undefined;
          connectedAccountId = pi.metadata?.connectedAccountId || undefined;
        }
      } catch {
        // Platform fee tracking is non-critical
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
      platformFee: platformFee ? platformFee / 100 : undefined, // Convert cents to dollars
      connectedAccountId,
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
