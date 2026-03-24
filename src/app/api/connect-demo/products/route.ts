/**
 * Products API — Create & List products on connected accounts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/connect-demo/products — Create a product on a connected account
 * GET  /api/connect-demo/products?accountId=acct_... — List products
 *
 * Products are created on the CONNECTED account (not the platform) using the
 * `stripeAccount` option. This means:
 *   - The product belongs to the connected account
 *   - The connected account can see it in their own Stripe Dashboard
 *   - When creating checkout sessions, we reference these products
 *
 * The `stripeAccount` option sets the `Stripe-Account` header, which tells
 * Stripe to execute the API call on behalf of the connected account.
 */

import { NextRequest, NextResponse } from "next/server";
import stripeClient from "@/lib/stripe-client";

export const dynamic = "force-dynamic";

// ─── POST: Create a product on a connected account ───────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, name, description, priceInCents, currency } = body;

    // Validate required fields
    if (!accountId || !name || !priceInCents) {
      return NextResponse.json(
        {
          success: false,
          error: "accountId, name, and priceInCents are required",
        },
        { status: 400 }
      );
    }

    // ─── Create the product with a default price ─────────────────────────────
    // We use `default_price_data` to create both the Product and its Price in
    // a single API call. The Price object defines how much to charge.
    //
    // The `stripeAccount` option is CRITICAL — it tells Stripe to create this
    // product on the connected account, not on your platform account.
    const product = await stripeClient.products.create(
      {
        name,
        description: description || undefined,
        // default_price_data creates a Price object automatically and links it
        // as the product's default price. This is convenient for simple products
        // with a single price point.
        default_price_data: {
          // Amount in the smallest currency unit (e.g., cents for USD)
          // $10.00 = 1000 cents
          unit_amount: priceInCents,
          currency: currency || "usd",
        },
      },
      {
        // This sets the Stripe-Account header to make the request on behalf
        // of the connected account. The product will be owned by the connected
        // account, not by your platform.
        stripeAccount: accountId,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        productId: product.id,
        name: product.name,
        description: product.description,
        defaultPriceId: product.default_price,
      },
    });
  } catch (error: any) {
    console.error("[Connect] Product creation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create product" },
      { status: 500 }
    );
  }
}

// ─── GET: List products on a connected account ───────────────────────────────
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

    // ─── Fetch active products with their prices ─────────────────────────────
    // We expand `data.default_price` so each product includes its Price object
    // inline, avoiding a separate API call to fetch prices.
    //
    // Again, `stripeAccount` ensures we're reading from the connected account.
    const products = await stripeClient.products.list(
      {
        limit: 20,
        active: true,
        // Expand the default_price field so we get the full Price object
        // (including unit_amount and currency) instead of just the price ID
        expand: ["data.default_price"],
      },
      {
        stripeAccount: accountId,
      }
    );

    const data = products.data.map((product) => {
      // The expanded default_price is now a full Price object (not just an ID string)
      const price = product.default_price as any;
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        priceId: price?.id || null,
        priceInCents: price?.unit_amount || 0,
        currency: price?.currency || "usd",
        images: product.images,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[Connect] Product list failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list products" },
      { status: 500 }
    );
  }
}
