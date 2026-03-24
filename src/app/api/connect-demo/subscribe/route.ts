/**
 * Subscription API — Charge subscriptions to connected accounts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/subscribe — Create a subscription checkout session
 *
 * This charges a SUBSCRIPTION to the connected account (the connected account
 * is the customer paying the platform). This is how you monetize your SaaS —
 * the connected account pays YOU a recurring subscription fee.
 *
 * With V2 accounts, the connected account ID (acct_...) can be used as both:
 *   - The connected account (for accepting payments from their customers)
 *   - The customer_account (for billing them as a subscriber to your platform)
 *
 * IMPORTANT: This uses `customer_account` (NOT `customer`). With V2 accounts,
 * you pass the acct_ ID directly — no need to create a separate Customer object.
 *
 * Environment variable required:
 *   CONNECT_SUBSCRIPTION_PRICE_ID — The Price ID for your subscription plan
 *
 * To create a subscription price:
 *   1. Go to https://dashboard.stripe.com/products
 *   2. Create a product (e.g., "Spirits IQ Pro Plan")
 *   3. Add a recurring price (e.g., $199/month)
 *   4. Copy the Price ID (price_...) to your .env file
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "accountId is required" },
        { status: 400 }
      );
    }

    // ─── Validate the subscription price ID ──────────────────────────────────
    // PLACEHOLDER: Create a subscription product in your Stripe Dashboard and
    // set this environment variable to its Price ID.
    //
    // To create one:
    //   1. Go to https://dashboard.stripe.com/products/create
    //   2. Name: "Spirits IQ Pro Plan" (or your plan name)
    //   3. Pricing: Recurring, $199/month (or your price)
    //   4. Save and copy the Price ID (starts with price_)
    //   5. Add to .env: CONNECT_SUBSCRIPTION_PRICE_ID=price_...
    const priceId = process.env.CONNECT_SUBSCRIPTION_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CONNECT_SUBSCRIPTION_PRICE_ID is not set. " +
            "Create a recurring price in your Stripe Dashboard and add the Price ID " +
            "to your .env file as CONNECT_SUBSCRIPTION_PRICE_ID=price_...",
        },
        { status: 503 }
      );
    }

    const origin = request.headers.get("origin") || "http://localhost:3000";

    // ─── Create a Subscription Checkout Session ──────────────────────────────
    // This creates a hosted checkout page where the connected account (the store
    // owner) can enter their payment details and subscribe to your platform.
    //
    // Key difference from regular checkout:
    //   - mode: 'subscription' (not 'payment')
    //   - customer_account: The connected account ID (acct_...) — this is how
    //     V2 accounts work. The acct_ ID serves as both the connected account
    //     AND the customer. Do NOT use .customer — use .customer_account for V2.
    const session = await stripeClient.checkout.sessions.create({
      // customer_account uses the V2 account as the subscriber.
      // With V2 accounts, you don't need a separate cus_ ID — the acct_ ID
      // doubles as the customer identity.
      customer_account: accountId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Where to redirect after successful subscription
      success_url: `${origin}/connect-demo?accountId=${accountId}&subscribed=true&session_id={CHECKOUT_SESSION_ID}`,
      // Where to redirect if the user cancels
      cancel_url: `${origin}/connect-demo?accountId=${accountId}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error: any) {
    console.error("[Connect] Subscription checkout failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create subscription checkout" },
      { status: 500 }
    );
  }
}
