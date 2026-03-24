/**
 * Stripe Client Initialization
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a single Stripe client instance for the entire application.
 * This client is used for ALL Stripe API requests — both platform-level
 * operations and requests on behalf of connected accounts.
 *
 * IMPORTANT: The Stripe SDK automatically uses the latest API version
 * (2026-02-25.clover), so we do NOT set apiVersion manually.
 *
 * The client is created lazily (on first use, not at import time) so that
 * Next.js can build successfully without STRIPE_SECRET_KEY set. During
 * Docker builds on Railway, env vars are dummy values — a top-level throw
 * would crash the build. Instead, we throw at request time with a clear
 * error message telling the developer exactly what to do.
 *
 * Environment variable required:
 *   STRIPE_SECRET_KEY — Your platform's Stripe secret key (starts with sk_test_ or sk_live_)
 *
 * To get your key:
 *   1. Go to https://dashboard.stripe.com/apikeys
 *   2. Copy your "Secret key"
 *   3. Add it to your .env file as STRIPE_SECRET_KEY=sk_test_...
 */

import Stripe from "stripe";

// ─── Lazy Stripe client singleton ────────────────────────────────────────────
// We defer creation until the first API call so the build step (which runs
// without real env vars) doesn't crash. The client is cached after first use.
let _stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (_stripeClient) return _stripeClient;

  // ─── Validate that the Stripe secret key is configured ─────────────────
  // This check runs at request time (not build time), giving a clear error
  // message instead of a cryptic "Invalid API Key" deep in a handler.
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "[Stripe] STRIPE_SECRET_KEY is not set.\n" +
      "Please add your Stripe secret key to your .env file:\n" +
      "  STRIPE_SECRET_KEY=sk_test_your_key_here\n\n" +
      "You can find your key at: https://dashboard.stripe.com/apikeys"
    );
  }

  // ─── Create the Stripe client ──────────────────────────────────────────
  // This single instance is reused across all API routes. The SDK
  // automatically picks up the latest API version, so we don't specify it.
  _stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripeClient;
}

// ─── Export a Proxy that lazily initializes on first property access ──────────
// This lets all API routes import `stripeClient` normally (e.g., stripeClient.v2.core...)
// but the actual Stripe instance is only created when a property is first accessed
// at runtime — never during the build.
const stripeClient = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripeClient();
    const value = Reflect.get(client, prop, receiver);
    // Bind methods so `this` points to the real Stripe instance
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default stripeClient;
