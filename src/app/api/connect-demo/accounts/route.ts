/**
 * Connected Accounts API — Create & List
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/accounts — Create a new connected account using the V2 API
 * GET  /api/connect-demo/accounts — List all connected accounts
 *
 * This uses the V2 Core Accounts API which provides a simpler, more modern
 * way to create connected accounts. Key differences from V1:
 *   - No top-level `type` parameter (no 'express', 'standard', 'custom')
 *   - Uses `configuration.merchant` and `configuration.customer` for capabilities
 *   - Uses `defaults.responsibilities` to define who collects fees and handles losses
 *   - `dashboard: 'full'` gives the connected account access to their own Stripe Dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─── POST: Create a new connected account ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displayName, email } = body;

    // Validate required fields from the user
    if (!displayName || !email) {
      return NextResponse.json(
        { success: false, error: "displayName and email are required" },
        { status: 400 }
      );
    }

    // ─── Step 1: Create a V2 connected account ──────────────────────────────
    // The V2 API uses a declarative approach where you specify:
    //   - identity.country: Where the business is located
    //   - dashboard: 'full' gives the account their own Stripe Dashboard
    //   - defaults.responsibilities: Who handles fees & losses (Stripe in this case)
    //   - configuration.merchant.capabilities: What payment methods they can accept
    //   - configuration.customer: Enables the account to be used as a customer too
    //     (important for platform subscriptions where the connected account pays you)
    const account = await stripeClient.v2.core.accounts.create({
      display_name: displayName,
      contact_email: email,
      identity: {
        country: "us",
      },
      // 'full' dashboard means the connected account can log into their own
      // Stripe Dashboard to view payments, payouts, etc.
      dashboard: "full",
      defaults: {
        responsibilities: {
          // 'stripe' means Stripe collects the processing fees from the connected account
          // (as opposed to 'application' where you'd handle fee collection yourself)
          fees_collector: "stripe",
          // 'stripe' means Stripe handles dispute losses
          losses_collector: "stripe",
        },
      },
      configuration: {
        // Enable the customer configuration — this allows the connected account
        // to also act as a customer of your platform (e.g., for subscriptions)
        customer: {},
        merchant: {
          capabilities: {
            // Request card payment capability — Stripe will verify the account
            // and enable this once onboarding requirements are met
            card_payments: {
              requested: true,
            },
          },
        },
      },
    });

    // ─── Step 2: Store the account mapping in the database ───────────────────
    // We save the Stripe account ID in our StoreIntegration table so we can
    // look it up later. In a production app, you'd map this to your user/store model.
    const storeId = request.headers.get("x-store-id");
    if (storeId) {
      await db.storeIntegration.upsert({
        where: { storeId_provider: { storeId, provider: "stripe-connect-v2" } },
        create: {
          storeId,
          provider: "stripe-connect-v2",
          isActive: false, // Will be set to true after onboarding completes
          config: {
            stripeAccountId: account.id,
            displayName,
            email,
          },
        },
        update: {
          config: {
            stripeAccountId: account.id,
            displayName,
            email,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        accountId: account.id,
        displayName: account.display_name,
        // The account is created but not yet onboarded — the store owner needs
        // to complete onboarding via Account Links before they can accept payments
      },
    });
  } catch (error: any) {
    console.error("[Connect] Account creation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create account" },
      { status: 500 }
    );
  }
}

// ─── GET: List all connected accounts ────────────────────────────────────────
export async function GET() {
  try {
    // List connected accounts from Stripe
    // In production, you'd typically query your own database for the mapping
    // and only fetch specific accounts from Stripe as needed
    const accounts = await stripeClient.accounts.list({ limit: 20 });

    const data = accounts.data.map((acct) => ({
      id: acct.id,
      displayName: (acct as any).display_name || acct.business_profile?.name || acct.email || "Unknown",
      email: acct.email,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
      detailsSubmitted: acct.details_submitted,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[Connect] List accounts failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list accounts" },
      { status: 500 }
    );
  }
}
