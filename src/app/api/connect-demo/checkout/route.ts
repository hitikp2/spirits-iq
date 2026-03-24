/**
 * Checkout API — Create a Stripe Checkout Session for a connected account
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/checkout — Create a checkout session with an application fee
 *
 * This uses a "Direct Charge" model:
 *   - The payment is created directly on the connected account
 *   - The platform collects an application_fee_amount on each transaction
 *   - The connected account sees the full charge in their Stripe Dashboard
 *   - Stripe automatically transfers the application fee to the platform
 *
 * We use Stripe Hosted Checkout for simplicity — Stripe handles the entire
 * payment UI, including card input, validation, 3D Secure, Apple Pay, etc.
 *
 * Application Fee Flow:
 *   Customer pays $10.00 → Connected account receives $10.00 - Stripe fees - app fee
 *   Example: $10.00 - $0.59 (Stripe 2.9%+30c) - $0.50 (5% app fee) = $8.91 to merchant
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";

export const dynamic = "force-dynamic";

// ─── Application fee percentage (5% of the transaction amount) ───────────────
// PLACEHOLDER: Adjust this to your desired platform fee. Common rates are 2-10%.
// This fee is automatically deducted from the connected account's payment and
// deposited into your platform Stripe account.
const APPLICATION_FEE_PERCENT = 0.05; // 5%

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, productName, priceInCents, currency, quantity } = body;

    // Validate required fields
    if (!accountId || !productName || !priceInCents) {
      return NextResponse.json(
        {
          success: false,
          error: "accountId, productName, and priceInCents are required",
        },
        { status: 400 }
      );
    }

    const qty = quantity || 1;
    const origin = request.headers.get("origin") || "http://localhost:3000";

    // ─── Calculate the application fee ───────────────────────────────────────
    // The fee is calculated as a percentage of the total amount.
    // It must be in the smallest currency unit (cents for USD).
    const totalAmount = priceInCents * qty;
    const applicationFee = Math.round(totalAmount * APPLICATION_FEE_PERCENT);

    // ─── Create a Checkout Session on the connected account ──────────────────
    // By passing `stripeAccount`, this Checkout Session is created ON the
    // connected account. The customer interacts with Stripe's hosted checkout,
    // and the payment goes directly to the connected account.
    const session = await stripeClient.checkout.sessions.create(
      {
        // Use price_data for inline pricing (no need to create a Price object first)
        line_items: [
          {
            price_data: {
              currency: currency || "usd",
              product_data: {
                name: productName,
              },
              // Price per unit in cents
              unit_amount: priceInCents,
            },
            quantity: qty,
          },
        ],
        // payment_intent_data lets us attach the application fee to the payment
        payment_intent_data: {
          // This is the fee your platform earns on each transaction.
          // Stripe automatically transfers this amount from the connected
          // account's payment to your platform account.
          application_fee_amount: applicationFee,
        },
        // 'payment' mode is for one-time payments (vs 'subscription' for recurring)
        mode: "payment",
        // {CHECKOUT_SESSION_ID} is a Stripe template variable that gets replaced
        // with the actual session ID when the customer is redirected
        success_url: `${origin}/connect-demo/success?session_id={CHECKOUT_SESSION_ID}&account_id=${accountId}`,
        cancel_url: `${origin}/connect-demo/storefront/${accountId}`,
      },
      {
        // CRITICAL: This creates the checkout session on the connected account,
        // not on your platform account. This is what makes it a "Direct Charge".
        stripeAccount: accountId,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        // The URL to redirect the customer to Stripe's hosted checkout page
        checkoutUrl: session.url,
        sessionId: session.id,
        applicationFee,
      },
    });
  } catch (error: any) {
    console.error("[Connect] Checkout session creation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
