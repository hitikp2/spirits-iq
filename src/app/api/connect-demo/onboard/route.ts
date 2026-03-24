/**
 * Account Onboarding API — Create Account Links
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/onboard — Generate a Stripe Account Link for onboarding
 *
 * After creating a connected account, the account owner must complete Stripe's
 * hosted onboarding flow. This endpoint generates a short-lived URL that
 * redirects the user to Stripe's onboarding pages.
 *
 * The V2 Account Links API requires:
 *   - account: The connected account ID (acct_...)
 *   - use_case.type: 'account_onboarding'
 *   - use_case.account_onboarding.configurations: Which configurations to onboard
 *     (we use both 'merchant' and 'customer' since the account can accept payments
 *      AND be billed as a customer of the platform)
 *   - refresh_url: Where to redirect if the link expires (user needs a new link)
 *   - return_url: Where to redirect after onboarding completes or is exited
 *
 * IMPORTANT: Account Links are single-use and expire. If the user doesn't complete
 * onboarding, you'll need to generate a new link.
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    // Validate that we have an account ID to onboard
    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "accountId is required" },
        { status: 400 }
      );
    }

    // ─── Determine the base URL for redirect URLs ────────────────────────────
    // In production, this should be your actual domain. In development, it will
    // be localhost:3000. The return_url includes the accountId as a query parameter
    // so the dashboard can show the updated status after onboarding.
    const origin = request.headers.get("origin") || "http://localhost:3000";

    // ─── Create a V2 Account Link for onboarding ─────────────────────────────
    // This generates a URL where the connected account owner can:
    //   1. Verify their identity
    //   2. Provide business details
    //   3. Set up their bank account for payouts
    //   4. Accept Stripe's terms of service
    const accountLink = await stripeClient.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          // Onboard for both merchant (accept payments) and customer (be billed) roles
          configurations: ["merchant", "customer"],
          // refresh_url: Where to send the user if the link expires or they
          // need to restart onboarding. We send them back to the dashboard.
          refresh_url: `${origin}/connect-demo`,
          // return_url: Where to send the user after they complete or exit onboarding.
          // We include the accountId so the dashboard can fetch the updated status.
          return_url: `${origin}/connect-demo?accountId=${accountId}`,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        // The URL to redirect the user to — this is a one-time-use link
        url: accountLink.url,
      },
    });
  } catch (error: any) {
    console.error("[Connect] Onboarding link creation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create onboarding link" },
      { status: 500 }
    );
  }
}
