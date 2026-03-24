/**
 * Storefront Page — Customer-facing product listing
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /connect-demo/storefront/[accountId]
 *
 * This is a simple storefront that displays products from a connected account
 * and allows customers to purchase them via Stripe Checkout.
 *
 * NOTE: In production, you should NOT use the raw Stripe account ID (acct_...)
 * in the URL. Instead, use a slug, custom domain, or database lookup to map
 * a friendly URL to the account ID. The account ID is used here for simplicity
 * in this demo.
 *
 * The storefront:
 *   1. Fetches products from the connected account (using the Stripe-Account header)
 *   2. Displays them in a grid
 *   3. Clicking "Buy" creates a Checkout Session with a Direct Charge + application fee
 *   4. Redirects the customer to Stripe's hosted checkout
 */

"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Product {
  id: string;
  name: string;
  description: string | null;
  priceId: string | null;
  priceInCents: number;
  currency: string;
  images: string[];
}

// ─── Format cents to display price ───────────────────────────────────────────
function formatPrice(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default function StorefrontPage() {
  // ─── Get the account ID from the URL ───────────────────────────────────────
  // NOTE: In production, replace this with a slug-based lookup.
  // Example: /store/downtown-spirits → lookup accountId from database
  const params = useParams();
  const accountId = params.accountId as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buyingId, setBuyingId] = useState<string | null>(null);

  // ─── Fetch products from the connected account ─────────────────────────────
  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch(`/api/connect-demo/products?accountId=${accountId}`);
        const json = await res.json();
        if (json.success) {
          setProducts(json.data);
        } else {
          setError(json.error || "Failed to load products");
        }
      } catch {
        setError("Failed to connect to the store");
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [accountId]);

  // ─── Handle purchase — create a Checkout Session ───────────────────────────
  const handleBuy = async (product: Product) => {
    setBuyingId(product.id);
    setError("");

    try {
      const res = await fetch("/api/connect-demo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          productName: product.name,
          priceInCents: product.priceInCents,
          currency: product.currency,
          quantity: 1,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Redirect to Stripe's hosted checkout page
        // The customer will enter their card details there
        window.location.href = json.data.checkoutUrl;
      } else {
        setError(json.error || "Failed to start checkout");
      }
    } catch {
      setError("Checkout failed");
    } finally {
      setBuyingId(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#e2e8f0",
        backgroundColor: "#0f1117",
        minHeight: "100vh",
      }}
    >
      {/* Store header */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Store
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.75rem", fontFamily: "monospace" }}>
          {/* In production, show the store name instead of the account ID */}
          Connected Account: {accountId}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            borderRadius: 12,
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
            fontSize: "0.875rem",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#94a3b8" }}>
          Loading products...
        </div>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#94a3b8" }}>
          <p style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>No products yet</p>
          <p style={{ fontSize: "0.875rem" }}>
            The store owner needs to add products from their dashboard.
          </p>
        </div>
      )}

      {/* Product grid */}
      {products.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: "1rem",
          }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              style={{
                borderRadius: 16,
                backgroundColor: "#1a1d27",
                border: "1px solid #2d3348",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Product image placeholder */}
              <div
                style={{
                  height: 160,
                  backgroundColor: "#0f1117",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2.5rem",
                }}
              >
                {product.images?.[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  "🥃"
                )}
              </div>

              {/* Product details */}
              <div style={{ padding: "1rem", flex: 1, display: "flex", flexDirection: "column" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {product.name}
                </h3>
                {product.description && (
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "0.8125rem",
                      marginBottom: "0.75rem",
                      flex: 1,
                      lineHeight: 1.4,
                    }}
                  >
                    {product.description}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: "#86efac",
                    }}
                  >
                    {formatPrice(product.priceInCents, product.currency)}
                  </span>
                  <button
                    onClick={() => handleBuy(product)}
                    disabled={buyingId === product.id}
                    style={{
                      padding: "0.5rem 1.25rem",
                      borderRadius: 10,
                      border: "none",
                      backgroundColor: "#635BFF",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      opacity: buyingId === product.id ? 0.6 : 1,
                    }}
                  >
                    {buyingId === product.id ? "..." : "Buy"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Back link */}
      <div style={{ textAlign: "center", marginTop: "2rem" }}>
        <a
          href="/connect-demo"
          style={{ color: "#635BFF", fontSize: "0.875rem", textDecoration: "none" }}
        >
          &larr; Back to Dashboard
        </a>
      </div>
    </div>
  );
}
