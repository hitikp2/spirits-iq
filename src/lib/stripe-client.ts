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
 * Environment variable required:
 *   STRIPE_SECRET_KEY — Your platform's Stripe secret key (starts with sk_test_ or sk_live_)
 *
 * To get your key:
 *   1. Go to https://dashboard.stripe.com/apikeys
 *   2. Copy your "Secret key"
 *   3. Add it to your .env file as STRIPE_SECRET_KEY=sk_test_...
 */

import Stripe from "stripe";

// ─── Validate that the Stripe secret key is configured ───────────────────────
// We check at module load time so you get a clear error early, rather than
// a cryptic "Invalid API Key" error deep in a request handler.
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    "[Stripe] STRIPE_SECRET_KEY is not set.\n" +
    "Please add your Stripe secret key to your .env file:\n" +
    "  STRIPE_SECRET_KEY=sk_test_your_key_here\n\n" +
    "You can find your key at: https://dashboard.stripe.com/apikeys"
  );
}

// ─── Create the Stripe client ────────────────────────────────────────────────
// This single instance is reused across all API routes. The SDK automatically
// picks up the latest API version, so we don't need to specify it.
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

export default stripeClient;
