/**
 * Billing Portal API — Manage connected account subscriptions
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/billing-portal — Create a billing portal session
 *
 * The Stripe Billing Portal provides a pre-built UI where connected accounts
 * (your customers) can:
 *   - View their current subscription
 *   - Upgrade or downgrade plans
 *   - Update their payment method
 *   - Cancel their subscription
 *   - View billing history and download invoices
 *
 * With V2 accounts, we use `customer_account` instead of `customer`.
 * The acct_ ID serves as the customer identity — no separate cus_ ID needed.
 *
 * IMPORTANT: Before using the Billing Portal, you must configure it in your
 * Stripe Dashboard: https://dashboard.stripe.com/settings/billing/portal
 * Enable at minimum: subscription cancellation and payment method updates.
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

    const origin = request.headers.get("origin") || "http://localhost:3000";

    // ─── Create a Billing Portal session ─────────────────────────────────────
    // This generates a short-lived URL to Stripe's hosted billing portal.
    // The connected account can manage their subscription there.
    //
    // customer_account: The connected account ID (acct_...). With V2 accounts,
    // this replaces the traditional `customer` parameter. Do NOT pass a cus_ ID.
    //
    // return_url: Where to redirect the user when they click "Return" in the portal.
    const session = await stripeClient.billingPortal.sessions.create({
      // Use the connected account ID as the customer — V2 accounts unify
      // the account and customer concepts into a single ID
      customer_account: accountId,
      // Where to send the user when they're done managing their subscription
      return_url: `${origin}/connect-demo?accountId=${accountId}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        // Redirect the user to this URL to open the billing portal
        portalUrl: session.url,
      },
    });
  } catch (error: any) {
    console.error("[Connect] Billing portal creation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
