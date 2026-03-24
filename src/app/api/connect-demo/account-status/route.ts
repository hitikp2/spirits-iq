/**
 * Account Status API — Check onboarding & capability status
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/connect-demo/account-status?accountId=acct_... — Get current status
 *
 * This endpoint fetches the connected account's status directly from the Stripe
 * API (not from a database cache). This ensures we always have the most current
 * onboarding and capability status.
 *
 * Key status indicators:
 *   - card_payments capability status: 'active' means the account can process payments
 *   - requirements.summary.minimum_deadline.status: Indicates if there are outstanding
 *     onboarding requirements that need to be completed
 *
 * We use the V2 API with `include` to fetch merchant configuration and requirements
 * in a single API call, avoiding multiple round-trips.
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "accountId query parameter is required" },
        { status: 400 }
      );
    }

    // ─── Fetch the account with merchant config and requirements ─────────────
    // The `include` parameter tells Stripe to expand these nested objects in the
    // response, so we get capabilities and requirements in one API call.
    const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.merchant", "requirements"],
    });

    // ─── Determine if the account is ready to process payments ───────────────
    // The card_payments capability must be 'active' for the account to accept charges.
    // This becomes active after Stripe verifies the account during onboarding.
    const readyToProcessPayments =
      account?.configuration?.merchant?.capabilities?.card_payments?.status === "active";

    // ─── Check onboarding requirements status ────────────────────────────────
    // The requirements summary tells us if there are outstanding items:
    //   - 'currently_due': Items that must be provided now
    //   - 'past_due': Items that were due but not yet provided (payments may be paused)
    //   - undefined/null: No outstanding requirements — onboarding is complete
    const requirementsStatus =
      account.requirements?.summary?.minimum_deadline?.status;

    // Onboarding is complete when there are no currently_due or past_due requirements
    const onboardingComplete =
      requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

    return NextResponse.json({
      success: true,
      data: {
        accountId: account.id,
        displayName: account.display_name,
        // Whether the account can currently accept card payments
        readyToProcessPayments,
        // Whether onboarding is fully complete (no pending requirements)
        onboardingComplete,
        // Raw requirements status for debugging/display
        requirementsStatus: requirementsStatus || "none",
        // Individual capability statuses
        capabilities: {
          cardPayments:
            account?.configuration?.merchant?.capabilities?.card_payments?.status || "inactive",
        },
      },
    });
  } catch (error: any) {
    console.error("[Connect] Account status check failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check account status" },
      { status: 500 }
    );
  }
}
