/**
 * Subscription Webhooks — Handle standard (snapshot) events for subscriptions
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/webhooks/subscriptions — Receive subscription lifecycle events
 *
 * Unlike the Connect webhook which uses thin events, subscription webhooks use
 * standard "snapshot" events that contain the full object data in the payload.
 *
 * These webhooks are CRITICAL for maintaining accurate subscription state.
 * Without them, you'd have no way to know when a subscription is:
 *   - Upgraded or downgraded
 *   - Canceled (immediately or at period end)
 *   - Paused or resumed
 *   - Successfully renewed (invoice paid)
 *   - Failed to renew (payment failed)
 *
 * IMPORTANT: With V2 accounts, use .customer_account (not .customer) to get
 * the connected account ID from subscription and invoice objects. The shape
 * is acct_... (not cus_...).
 *
 * Setup:
 *   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
 *   2. URL: https://yourdomain.com/api/connect-demo/webhooks/subscriptions
 *   3. Events to listen for:
 *      - customer.subscription.updated
 *      - customer.subscription.deleted
 *      - invoice.paid
 *      - invoice.payment_failed
 *
 * Local development:
 *   Run: npm run stripe:listen:subscriptions
 *
 * Environment variable required:
 *   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET — Webhook signing secret (whsec_...)
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // ─── Step 1: Read and verify the webhook signature ───────────────────────
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // PLACEHOLDER: Set this in your .env file from the Stripe Dashboard
    // or from the `stripe listen` CLI output
    const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "[Webhook] STRIPE_SUBSCRIPTION_WEBHOOK_SECRET is not set.\n" +
        "Add to .env: STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_..."
      );
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 503 }
      );
    }

    // ─── Step 2: Construct and verify the event ──────────────────────────────
    // This verifies the signature and parses the full event object.
    // Unlike thin events, snapshot events contain the complete object data.
    const event = stripeClient.webhooks.constructEvent(body, signature, webhookSecret);

    // ─── Step 3: Handle each event type ──────────────────────────────────────
    switch (event.type) {
      // ── Subscription Updated ─────────────────────────────────────────────
      // Fires when ANY subscription field changes. Common scenarios:
      //   - Plan upgrade/downgrade (check items.data[0].price)
      //   - Quantity change (check items.data[0].quantity)
      //   - Cancellation scheduled (check cancel_at_period_end)
      //   - Reactivation after cancellation (cancel_at_period_end becomes false)
      //   - Trial ended
      //   - Collection paused/resumed
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        // With V2 accounts, the connected account ID comes from customer_account
        // (shape: acct_...), NOT from customer (which would be cus_...)
        const accountId = (subscription as any).customer_account;
        const subscriptionId = subscription.id;
        const status = subscription.status; // 'active', 'past_due', 'canceled', etc.
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        console.log(
          `[Webhook] Subscription ${subscriptionId} updated for account ${accountId}. ` +
          `Status: ${status}, Cancel at period end: ${cancelAtPeriodEnd}`
        );

        // ── Check for plan changes (upgrades/downgrades) ───────────────────
        const currentPrice = subscription.items?.data?.[0]?.price;
        if (currentPrice) {
          console.log(
            `[Webhook] Current plan: ${currentPrice.id} ` +
            `(${currentPrice.nickname || "unnamed"}, ` +
            `${(currentPrice.unit_amount || 0) / 100} ${currentPrice.currency}/` +
            `${currentPrice.recurring?.interval || "unknown"})`
          );
          // TODO: Update the store's plan tier in your database based on the price ID
          // Example: Map price_xxx to 'starter', price_yyy to 'pro', price_zzz to 'enterprise'
        }

        // ── Check for quantity changes ─────────────────────────────────────
        const currentQuantity = subscription.items?.data?.[0]?.quantity;
        if (currentQuantity) {
          console.log(`[Webhook] Subscription quantity: ${currentQuantity}`);
          // TODO: Adjust access level based on quantity (e.g., number of registers)
        }

        // ── Check for cancellation ─────────────────────────────────────────
        if (cancelAtPeriodEnd) {
          console.log(
            `[Webhook] Subscription ${subscriptionId} will cancel at end of billing period`
          );
          // TODO: Show a "subscription ending" banner in the dashboard
          // The user can reactivate before the period ends
        }

        // ── Check for paused collections ───────────────────────────────────
        const pauseCollection = (subscription as any).pause_collection;
        if (pauseCollection) {
          console.log(
            `[Webhook] Subscription ${subscriptionId} is paused. ` +
            `Resumes at: ${pauseCollection.resumes_at || "unknown"}`
          );
          // TODO: Restrict feature access while subscription is paused
        } else if (status === "active") {
          // Subscription is active and not paused — full access
          console.log(`[Webhook] Subscription ${subscriptionId} is active with full access`);
        }

        // ── Update subscription status in the database ─────────────────────
        // TODO: Replace this with your actual database update logic.
        // You should store the subscription status mapped to the store/account.
        if (accountId) {
          await db.storeIntegration.updateMany({
            where: {
              provider: "stripe-connect-v2",
              config: { path: ["stripeAccountId"], equals: accountId },
            },
            data: {
              config: {
                // TODO: Merge with existing config instead of overwriting
                stripeAccountId: accountId,
                subscriptionId,
                subscriptionStatus: status,
                cancelAtPeriodEnd,
              },
            },
          });
        }
        break;
      }

      // ── Subscription Deleted ─────────────────────────────────────────────
      // Fires when a subscription is fully canceled (not just scheduled to cancel).
      // This is the definitive signal to revoke access.
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const accountId = (subscription as any).customer_account;
        const subscriptionId = subscription.id;

        console.log(
          `[Webhook] Subscription ${subscriptionId} DELETED for account ${accountId}. ` +
          "Revoking access."
        );

        // TODO: Revoke the connected account's access to paid features.
        // Common approaches:
        //   1. Downgrade to a free tier
        //   2. Set a grace period before full access revocation
        //   3. Send a "your subscription has ended" email
        if (accountId) {
          await db.storeIntegration.updateMany({
            where: {
              provider: "stripe-connect-v2",
              config: { path: ["stripeAccountId"], equals: accountId },
            },
            data: {
              config: {
                stripeAccountId: accountId,
                subscriptionId,
                subscriptionStatus: "canceled",
                cancelAtPeriodEnd: false,
              },
            },
          });
        }
        break;
      }

      // ── Invoice Paid ─────────────────────────────────────────────────────
      // Fires when an invoice is successfully paid. For subscriptions, this
      // happens at the start of each billing period (monthly/yearly).
      // This is the best signal to "renew" access for the current period.
      case "invoice.paid": {
        const invoice = event.data.object;
        const accountId = (invoice as any).customer_account;
        const subscriptionId = invoice.subscription as string;

        console.log(
          `[Webhook] Invoice ${invoice.id} PAID for account ${accountId}. ` +
          `Amount: $${((invoice.amount_paid || 0) / 100).toFixed(2)}. ` +
          `Subscription: ${subscriptionId}`
        );

        // TODO: Confirm/extend access for the billing period.
        // This is especially important for:
        //   - First payment (subscription just started)
        //   - Renewal payments (subscription continued for another period)
        //   - Reactivation payments (customer re-subscribed)
        break;
      }

      // ── Invoice Payment Failed ───────────────────────────────────────────
      // Fires when a recurring payment fails (e.g., expired card, insufficient funds).
      // Stripe will automatically retry the payment based on your retry settings.
      // You should notify the customer to update their payment method.
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const accountId = (invoice as any).customer_account;

        console.log(
          `[Webhook] Invoice ${invoice.id} PAYMENT FAILED for account ${accountId}. ` +
          `Amount: $${((invoice.amount_due || 0) / 100).toFixed(2)}`
        );

        // TODO: Notify the store owner that their payment failed.
        // Common approaches:
        //   1. Send an email asking them to update their payment method
        //   2. Show a banner in the dashboard
        //   3. Create a billing portal link for easy payment method update
        //   4. Set a grace period before restricting access
        break;
      }

      default:
        console.log(`[Webhook] Unhandled subscription event: ${event.type}`);
    }

    // Always acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[Webhook] Subscription webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 }
    );
  }
}
