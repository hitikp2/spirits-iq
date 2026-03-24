/**
 * Connect Webhooks — Handle V2 thin events for connected accounts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/webhooks/connect — Receive thin event notifications
 *
 * This endpoint receives "thin events" from Stripe for V2 connected accounts.
 * Thin events are lightweight notifications that only contain the event ID and
 * type — you must fetch the full event data with a separate API call.
 *
 * Why thin events?
 *   - Smaller payload = faster delivery
 *   - No API version pinning (the event payload is unversioned)
 *   - You always get the latest data when you fetch the full event
 *
 * Events handled:
 *   - v2.core.account[requirements].updated
 *     → Account requirements changed (e.g., new KYC requirements from regulators)
 *   - v2.core.account[configuration.merchant].capability_status_updated
 *     → Merchant capability status changed (e.g., card_payments activated/deactivated)
 *   - v2.core.account[configuration.customer].capability_status_updated
 *     → Customer capability status changed
 *   - v2.core.account[.recipient].capability_status_updated
 *     → Recipient capability status changed
 *
 * Setup:
 *   1. In Stripe Dashboard → Developers → Webhooks → Add destination
 *   2. Select "Connected accounts" in the Events from section
 *   3. Select "Show advanced options" → Payload style: "Thin"
 *   4. Search for "v2" event types and select the ones listed above
 *   5. Set the endpoint URL to: https://yourdomain.com/api/connect-demo/webhooks/connect
 *
 * Local development:
 *   Run: npm run stripe:listen:connect
 *   Or: stripe listen --thin-events 'v2.core.account[requirements].updated,...' --forward-thin-to localhost:3000/api/connect-demo/webhooks/connect
 *
 * Environment variable required:
 *   STRIPE_CONNECT_WEBHOOK_SECRET — The webhook signing secret (whsec_...)
 *   Get this from the Stripe Dashboard or from the `stripe listen` CLI output.
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // ─── Step 1: Read the raw request body and signature ─────────────────────
    // Stripe sends the event as a raw string body, along with a signature
    // in the `stripe-signature` header for verification.
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("[Webhook] Missing stripe-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // ─── Validate the webhook secret is configured ───────────────────────────
    // PLACEHOLDER: Set this in your .env file. You get this value from:
    //   - Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret
    //   - Or from the `stripe listen` CLI output (starts with whsec_)
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "[Webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not set.\n" +
        "Add your webhook signing secret to .env:\n" +
        "  STRIPE_CONNECT_WEBHOOK_SECRET=whsec_your_secret_here"
      );
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 503 }
      );
    }

    // ─── Step 2: Parse and verify the thin event ─────────────────────────────
    // parseEventNotification verifies the signature to ensure the event is
    // genuinely from Stripe (not a malicious third party), then returns a
    // strongly-typed EventNotification object.
    //
    // NOTE: In older SDK versions this was called parseThinEvent() — it has been
    // renamed to parseEventNotification() in SDK v20+.
    const eventNotification = stripeClient.parseEventNotification(
      body,
      signature,
      webhookSecret
    );

    // ─── Step 3: Fetch the full event data ───────────────────────────────────
    // Thin events only contain the event ID and type. We need to fetch the
    // complete event to get the actual account data and understand what changed.
    const event = await stripeClient.v2.core.events.retrieve(eventNotification.id);

    // ─── Step 4: Handle each event type ──────────────────────────────────────
    switch (event.type) {
      // ── Requirements Updated ─────────────────────────────────────────────
      // This fires when account requirements change, often due to:
      //   - Regulatory changes (new KYC rules)
      //   - Card network policy updates
      //   - Periodic reverification requirements
      // Action: Check if there are new requirements and notify the store owner
      case "v2.core.account[requirements].updated": {
        const accountId = (event as any).related_object?.id;
        console.log(
          `[Webhook] Requirements updated for account ${accountId}. ` +
          "Check if new onboarding requirements need to be collected."
        );

        // Fetch the latest account status to see what requirements are due
        if (accountId) {
          try {
            const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
              include: ["requirements"],
            });

            const reqStatus = account.requirements?.summary?.minimum_deadline?.status;
            console.log(`[Webhook] Account ${accountId} requirements status: ${reqStatus}`);

            // TODO: If requirements are 'currently_due' or 'past_due', notify the
            // store owner (e.g., send an email, show an alert in the dashboard,
            // or create a new Account Link for them to complete the requirements)

            // Update the integration status in the database if payments are disabled
            await db.storeIntegration.updateMany({
              where: { provider: "stripe-connect-v2", config: { path: ["stripeAccountId"], equals: accountId } },
              data: {
                // If requirements are past_due, the account may not be able to process payments
                isActive: reqStatus !== "past_due",
              },
            });
          } catch (err) {
            console.error(`[Webhook] Failed to fetch account ${accountId}:`, err);
          }
        }
        break;
      }

      // ── Merchant Capability Status Changed ───────────────────────────────
      // This fires when a merchant capability (like card_payments) is activated,
      // deactivated, or its status changes. Common triggers:
      //   - Account completes onboarding → card_payments becomes 'active'
      //   - Account fails verification → card_payments becomes 'inactive'
      //   - Account is disabled for fraud → capabilities are revoked
      case "v2.core.account[configuration.merchant].capability_status_updated": {
        const accountId = (event as any).related_object?.id;
        console.log(`[Webhook] Merchant capability status changed for account ${accountId}`);

        if (accountId) {
          try {
            const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
              include: ["configuration.merchant"],
            });

            const cardPaymentsStatus =
              account?.configuration?.merchant?.capabilities?.card_payments?.status;
            console.log(
              `[Webhook] Account ${accountId} card_payments status: ${cardPaymentsStatus}`
            );

            // Update the database to reflect whether the account can process payments
            // TODO: Update your database to reflect the new capability status
            await db.storeIntegration.updateMany({
              where: { provider: "stripe-connect-v2", config: { path: ["stripeAccountId"], equals: accountId } },
              data: {
                isActive: cardPaymentsStatus === "active",
                ...(cardPaymentsStatus === "active" ? { connectedAt: new Date() } : {}),
              },
            });
          } catch (err) {
            console.error(`[Webhook] Failed to process merchant capability update:`, err);
          }
        }
        break;
      }

      // ── Customer Capability Status Changed ───────────────────────────────
      // This fires when the account's ability to act as a customer changes.
      // This is relevant for platform subscriptions where the connected account
      // is paying you (the platform) a recurring fee.
      case "v2.core.account[configuration.customer].capability_status_updated": {
        const accountId = (event as any).related_object?.id;
        console.log(`[Webhook] Customer capability status changed for account ${accountId}`);
        // TODO: Update your database if needed. This capability must be active
        // for the connected account to pay subscription fees to your platform.
        break;
      }

      // ── Recipient Capability Status Changed ──────────────────────────────
      // This fires when the account's ability to receive payouts changes.
      case "v2.core.account[.recipient].capability_status_updated": {
        const accountId = (event as any).related_object?.id;
        console.log(`[Webhook] Recipient capability status changed for account ${accountId}`);
        // TODO: If payouts are disabled, you may want to alert the store owner
        break;
      }

      default:
        // Log unhandled events for debugging — this helps you discover new
        // event types that you might want to handle in the future
        console.log(`[Webhook] Unhandled thin event type: ${event.type}`);
    }

    // Always return 200 to acknowledge receipt — if you return an error,
    // Stripe will retry the webhook delivery (up to 3 times)
    return NextResponse.json({ received: true });
  } catch (error: any) {
    // If signature verification fails, return 400 — this means the event
    // is not from Stripe (possible forgery attempt)
    console.error("[Webhook] Connect webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 }
    );
  }
}
