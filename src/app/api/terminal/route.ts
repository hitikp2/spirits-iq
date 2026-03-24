import { NextRequest, NextResponse } from "next/server";
import { getCredentials } from "@/lib/integrations";
import { getApplicationFee } from "@/lib/services/connect";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// POST /api/terminal — Stripe Terminal operations
export async function POST(request: NextRequest) {
  try {
    const storeId = request.headers.get("x-store-id");
    const body = await request.json();
    const { action } = body;

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const creds = await getCredentials(storeId, "stripe");
    if (!creds?.secretKey) {
      return NextResponse.json(
        { success: false, error: "Stripe not configured" } satisfies ApiResponse,
        { status: 503 }
      );
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(creds.secretKey, { apiVersion: "2024-04-10" });

    // ─── Connection Token (required by Terminal JS SDK) ───
    if (action === "connection-token") {
      const token = await stripe.terminal.connectionTokens.create();
      return NextResponse.json({
        success: true,
        data: { secret: token.secret },
      } satisfies ApiResponse);
    }

    // ─── Create PaymentIntent for card-present NFC ────────
    if (action === "create-intent") {
      const { amount, cashierId } = body;
      if (!amount) {
        return NextResponse.json(
          { success: false, error: "amount required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      // Check for Connect platform fee
      const connectFee = await getApplicationFee(storeId, amount);
      const intentParams: any = {
        amount,
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: { storeId, cashierId: cashierId || "" },
      };

      if (connectFee) {
        intentParams.application_fee_amount = connectFee.feeAmount;
        intentParams.transfer_data = { destination: connectFee.connectedAccountId };
        intentParams.metadata.platformFee = String(connectFee.feeAmount);
        intentParams.metadata.connectedAccountId = connectFee.connectedAccountId;
      }

      const paymentIntent = await stripe.paymentIntents.create(intentParams);

      return NextResponse.json({
        success: true,
        data: {
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
        },
      } satisfies ApiResponse);
    }

    // ─── Capture after Terminal SDK confirms ──────────────
    if (action === "capture") {
      const { paymentIntentId } = body;
      if (!paymentIntentId) {
        return NextResponse.json(
          { success: false, error: "paymentIntentId required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      let cardLast4: string | undefined;
      let cardBrand: string | undefined;

      if (pi.latest_charge) {
        const charge = await stripe.charges.retrieve(pi.latest_charge as string);
        cardLast4 = charge.payment_method_details?.card_present?.last4 || undefined;
        cardBrand = charge.payment_method_details?.card_present?.brand || undefined;
      }

      return NextResponse.json({
        success: true,
        data: {
          paymentIntentId: pi.id,
          status: pi.status,
          cardLast4,
          cardBrand,
        },
      } satisfies ApiResponse);
    }

    // ─── Register a Tap to Pay reader (one-time setup) ────
    if (action === "register-reader") {
      const { registrationCode, label } = body;
      if (!registrationCode) {
        return NextResponse.json(
          { success: false, error: "registrationCode required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      // Get or create a location for this store
      const locations = await stripe.terminal.locations.list({ limit: 1 });
      let locationId: string;

      if (locations.data.length > 0) {
        locationId = locations.data[0].id;
      } else {
        const location = await stripe.terminal.locations.create({
          display_name: `Store ${storeId.slice(-6)}`,
          address: {
            line1: "123 Main St",
            city: "Los Angeles",
            state: "CA",
            country: "US",
            postal_code: "90001",
          },
        });
        locationId = location.id;
      }

      const reader = await stripe.terminal.readers.create({
        registration_code: registrationCode,
        label: label || "Tap to Pay",
        location: locationId,
      });

      return NextResponse.json({
        success: true,
        data: { readerId: reader.id, locationId },
      } satisfies ApiResponse);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Terminal API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Terminal operation failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
