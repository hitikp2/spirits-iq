import { NextRequest, NextResponse } from "next/server";
import { completeTransaction } from "@/lib/payments";
import { getUpsellSuggestions } from "@/lib/ai";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// POST /api/pos — Process a sale
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const storeId = request.headers.get("x-store-id") || body.storeId;
    const cashierId = request.headers.get("x-user-id") || body.cashierId;
    const {
      customerId,
      items, paymentMethod, tip, ageVerified, verificationMethod,
    } = body;

    // Validation
    if (!storeId || !cashierId || !items?.length) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Resolve the store's active register (instead of trusting client-sent ID)
    const register = await db.register.findFirst({
      where: { storeId, isActive: true },
    });
    const registerId = register?.id || null;

    // For card payments via Stripe Terminal, we would create a payment intent.
    // This requires STRIPE_SECRET_KEY and a configured register with a terminal.
    // For now, card payments are recorded without Stripe processing.
    let stripePaymentId: string | undefined;
    let cardLast4: string | undefined;
    let cardBrand: string | undefined;

    if (
      (paymentMethod === "CARD" || paymentMethod === "APPLE_PAY" || paymentMethod === "GOOGLE_PAY") &&
      process.env.STRIPE_SECRET_KEY &&
      registerId
    ) {
      try {
        const { createTerminalPaymentIntent } = await import("@/lib/payments");
        const subtotal = items.reduce(
          (s: number, i: { unitPrice: number; quantity: number }) => s + i.unitPrice * i.quantity,
          0
        );
        const totalCents = Math.round(subtotal * 1.0975 * 100);
        const pi = await createTerminalPaymentIntent(totalCents, registerId, {
          cashierId,
          customerId: customerId || "",
        });
        stripePaymentId = pi.id;
      } catch (stripeErr) {
        console.warn("Stripe Terminal not available, recording card sale without payment processing:", stripeErr);
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
