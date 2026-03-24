/**
 * Stripe Connect Demo — Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Main dashboard for managing connected accounts. From here, store owners can:
 *   1. Create a new connected account
 *   2. Start or resume the onboarding flow
 *   3. Check their account status (onboarding, capabilities)
 *   4. Create products for their storefront
 *   5. View their storefront link
 *   6. Subscribe to the platform (SaaS billing)
 *   7. Manage their subscription via the billing portal
 *
 * This page demonstrates the full lifecycle of a Stripe Connect integration.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AccountStatus {
  accountId: string;
  displayName: string;
  readyToProcessPayments: boolean;
  onboardingComplete: boolean;
  requirementsStatus: string;
  capabilities: {
    cardPayments: string;
  };
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  priceId: string | null;
  priceInCents: number;
  currency: string;
}

// ─── Helper: Format cents to dollars ─────────────────────────────────────────
function formatPrice(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default function ConnectDemoDashboard() {
  // ─── State ─────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams();

  // Account creation form
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  // Current connected account
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Product creation form
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  // Subscription state
  const [subscribing, setSubscribing] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  // General state
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ─── Check if returning from onboarding ────────────────────────────────────
  // When the user returns from Stripe onboarding, the accountId is in the URL
  useEffect(() => {
    const returnedAccountId = searchParams.get("accountId");
    if (returnedAccountId) {
      setAccountId(returnedAccountId);
    }
    // Show subscription success message
    if (searchParams.get("subscribed") === "true") {
      setSuccess("Subscription activated successfully!");
    }
  }, [searchParams]);

  // ─── Fetch account status when accountId changes ───────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!accountId) return;
    setStatusLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/connect-demo/account-status?accountId=${accountId}`);
      const json = await res.json();
      if (json.success) {
        setStatus(json.data);
      } else {
        setError(json.error || "Failed to fetch status");
      }
    } catch {
      setError("Network error fetching account status");
    } finally {
      setStatusLoading(false);
    }
  }, [accountId]);

  // ─── Fetch products when accountId changes ─────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/connect-demo/products?accountId=${accountId}`);
      const json = await res.json();
      if (json.success) {
        setProducts(json.data);
      }
    } catch {
      // Products fetch is non-critical
    }
  }, [accountId]);

  useEffect(() => {
    if (accountId) {
      fetchStatus();
      fetchProducts();
    }
  }, [accountId, fetchStatus, fetchProducts]);

  // ─── Create Account ────────────────────────────────────────────────────────
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/connect-demo/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email }),
      });
      const json = await res.json();
      if (json.success) {
        setAccountId(json.data.accountId);
        setSuccess(`Account created: ${json.data.accountId}`);
        setDisplayName("");
        setEmail("");
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  // ─── Start Onboarding ──────────────────────────────────────────────────────
  const handleOnboard = async () => {
    if (!accountId) return;
    setError("");

    try {
      const res = await fetch("/api/connect-demo/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json();
      if (json.success) {
        // Redirect to Stripe's hosted onboarding page
        window.location.href = json.data.url;
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to start onboarding");
    }
  };

  // ─── Create Product ────────────────────────────────────────────────────────
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    setCreatingProduct(true);
    setError("");

    try {
      const res = await fetch("/api/connect-demo/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name: productName,
          description: productDesc || undefined,
          priceInCents: Math.round(parseFloat(productPrice) * 100),
          currency: "usd",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProductName("");
        setProductDesc("");
        setProductPrice("");
        setSuccess(`Product "${json.data.name}" created!`);
        fetchProducts();
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to create product");
    } finally {
      setCreatingProduct(false);
    }
  };

  // ─── Subscribe to Platform ─────────────────────────────────────────────────
  const handleSubscribe = async () => {
    if (!accountId) return;
    setSubscribing(true);
    setError("");

    try {
      const res = await fetch("/api/connect-demo/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json();
      if (json.success) {
        // Redirect to Stripe's hosted checkout for subscription
        window.location.href = json.data.checkoutUrl;
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to start subscription");
    } finally {
      setSubscribing(false);
    }
  };

  // ─── Open Billing Portal ───────────────────────────────────────────────────
  const handleBillingPortal = async () => {
    if (!accountId) return;
    setOpeningPortal(true);
    setError("");

    try {
      const res = await fetch("/api/connect-demo/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json();
      if (json.success) {
        // Redirect to Stripe's billing portal
        window.location.href = json.data.portalUrl;
      } else {
        setError(json.error);
      }
    } catch {
      setError("Failed to open billing portal");
    } finally {
      setOpeningPortal(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#e2e8f0",
        backgroundColor: "#0f1117",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Stripe Connect Demo
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", fontSize: "0.875rem" }}>
        Create connected accounts, onboard merchants, manage products, and process payments.
      </p>

      {/* ── Error/Success Messages ──────────────────────────────────────────── */}
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
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            borderRadius: 12,
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#86efac",
            fontSize: "0.875rem",
          }}
        >
          {success}
        </div>
      )}

      {/* ── Section 1: Create Connected Account ─────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>1. Create Connected Account</h2>
        <p style={sectionDescStyle}>
          Create a new connected account using the V2 API. The account will need to complete
          onboarding before they can accept payments.
        </p>
        <form onSubmit={handleCreateAccount} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Downtown Spirits"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., owner@example.com"
              required
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={creating} style={primaryButtonStyle}>
            {creating ? "Creating..." : "Create Account"}
          </button>
        </form>

        {/* Manual account ID entry for returning users */}
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #1e293b" }}>
          <label style={labelStyle}>Or enter an existing Account ID</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="acct_..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={fetchStatus}
              disabled={!accountId || statusLoading}
              style={secondaryButtonStyle}
            >
              {statusLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      {/* Only show remaining sections if we have an account */}
      {accountId && (
        <>
          {/* ── Section 2: Account Status & Onboarding ─────────────────────── */}
          <section style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>2. Onboarding & Status</h2>
            <p style={sectionDescStyle}>
              Check the account&apos;s onboarding status and capabilities. The status is fetched
              directly from the Stripe API to always show the latest state.
            </p>

            {statusLoading ? (
              <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading status...</p>
            ) : status ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <StatusBadge
                  label="Account ID"
                  value={status.accountId}
                  variant="neutral"
                />
                <StatusBadge
                  label="Display Name"
                  value={status.displayName || "—"}
                  variant="neutral"
                />
                <StatusBadge
                  label="Card Payments"
                  value={status.capabilities.cardPayments}
                  variant={status.readyToProcessPayments ? "success" : "warning"}
                />
                <StatusBadge
                  label="Onboarding"
                  value={status.onboardingComplete ? "Complete" : "Incomplete"}
                  variant={status.onboardingComplete ? "success" : "warning"}
                />
                <StatusBadge
                  label="Requirements"
                  value={status.requirementsStatus}
                  variant={status.requirementsStatus === "none" ? "success" : "warning"}
                />
                <StatusBadge
                  label="Ready to Charge"
                  value={status.readyToProcessPayments ? "Yes" : "No"}
                  variant={status.readyToProcessPayments ? "success" : "warning"}
                />
              </div>
            ) : (
              <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
                Enter an account ID above and click Refresh to check status.
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button onClick={handleOnboard} style={primaryButtonStyle}>
                {status?.onboardingComplete
                  ? "Update Account Details"
                  : "Onboard to Collect Payments"}
              </button>
              <button onClick={fetchStatus} disabled={statusLoading} style={secondaryButtonStyle}>
                Refresh Status
              </button>
            </div>
          </section>

          {/* ── Section 3: Create Products ──────────────────────────────────── */}
          <section style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>3. Create Products</h2>
            <p style={sectionDescStyle}>
              Create products on the connected account. These will appear in their storefront.
              Products are created using the Stripe-Account header to scope them to this account.
            </p>

            <form
              onSubmit={handleCreateProduct}
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <div>
                <label style={labelStyle}>Product Name</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g., Premium Bourbon 750ml"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Description (optional)</label>
                <input
                  type="text"
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="e.g., Aged 12 years, smooth finish"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="e.g., 49.99"
                  required
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={creatingProduct || !status?.readyToProcessPayments}
                style={primaryButtonStyle}
              >
                {creatingProduct ? "Creating..." : "Create Product"}
              </button>
              {!status?.readyToProcessPayments && (
                <p style={{ color: "#fbbf24", fontSize: "0.75rem", margin: 0 }}>
                  Complete onboarding before creating products.
                </p>
              )}
            </form>

            {/* Product list */}
            {products.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Products ({products.length})
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {products.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem 0.75rem",
                        borderRadius: 8,
                        backgroundColor: "#1e293b",
                        fontSize: "0.875rem",
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{ fontFamily: "monospace", color: "#86efac" }}>
                        {formatPrice(p.priceInCents, p.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Section 4: Storefront Link ──────────────────────────────────── */}
          <section style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>4. Storefront</h2>
            <p style={sectionDescStyle}>
              Share this link with customers so they can browse and purchase products.
            </p>
            {/* NOTE: In production, use a slug or custom domain instead of the raw
                account ID in the URL. The account ID is used here for simplicity. */}
            <a
              href={`/connect-demo/storefront/${accountId}`}
              style={{
                display: "inline-block",
                padding: "0.5rem 1rem",
                borderRadius: 8,
                backgroundColor: "#635BFF",
                color: "white",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              View Storefront &rarr;
            </a>
            <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              URL: /connect-demo/storefront/{accountId}
            </p>
          </section>

          {/* ── Section 5: Platform Subscription ────────────────────────────── */}
          <section style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>5. Platform Subscription</h2>
            <p style={sectionDescStyle}>
              Subscribe the connected account to your platform&apos;s SaaS plan.
              The connected account is the customer — they pay you a recurring fee.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                style={primaryButtonStyle}
              >
                {subscribing ? "Loading..." : "Subscribe to Platform"}
              </button>
              <button
                onClick={handleBillingPortal}
                disabled={openingPortal}
                style={secondaryButtonStyle}
              >
                {openingPortal ? "Loading..." : "Manage Subscription"}
              </button>
            </div>
            <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              Requires CONNECT_SUBSCRIPTION_PRICE_ID in .env. &quot;Manage Subscription&quot;
              opens the Stripe Billing Portal.
            </p>
          </section>
        </>
      )}

      {/* ── Webhook Setup Guide ─────────────────────────────────────────────── */}
      <section style={{ ...sectionStyle, borderColor: "#1e293b" }}>
        <h2 style={sectionHeadingStyle}>Webhook Setup</h2>
        <p style={sectionDescStyle}>
          To receive real-time updates about account changes and subscription events, set up
          two webhook endpoints:
        </p>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            padding: "0.75rem",
            borderRadius: 8,
            backgroundColor: "#0f172a",
            color: "#94a3b8",
            lineHeight: 1.8,
            overflowX: "auto",
          }}
        >
          <div style={{ color: "#86efac" }}># Connect V2 thin events (account requirements & capabilities)</div>
          <div>npm run stripe:listen:connect</div>
          <br />
          <div style={{ color: "#86efac" }}># Subscription standard events (renewals, cancellations)</div>
          <div>npm run stripe:listen:subscriptions</div>
        </div>
      </section>
    </div>
  );
}

// ─── Status Badge Component ──────────────────────────────────────────────────
function StatusBadge({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "success" | "warning" | "neutral";
}) {
  const colors = {
    success: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#86efac" },
    warning: { bg: "rgba(251, 191, 36, 0.1)", border: "rgba(251, 191, 36, 0.3)", text: "#fde68a" },
    neutral: { bg: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.2)", text: "#cbd5e1" },
  };
  const c = colors[variant];

  return (
    <div
      style={{
        padding: "0.5rem 0.75rem",
        borderRadius: 8,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: "0.8125rem", fontFamily: "monospace", color: c.text, wordBreak: "break-all" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const sectionStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
  padding: "1.5rem",
  borderRadius: 16,
  backgroundColor: "#1a1d27",
  border: "1px solid #2d3348",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 600,
  marginBottom: "0.25rem",
};

const sectionDescStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.8125rem",
  marginBottom: "1rem",
  lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  color: "#94a3b8",
  marginBottom: "0.25rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderRadius: 10,
  border: "1px solid #2d3348",
  backgroundColor: "#0f1117",
  color: "#e2e8f0",
  fontSize: "0.875rem",
  fontFamily: "monospace",
  outline: "none",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.625rem 1.25rem",
  borderRadius: 10,
  border: "none",
  backgroundColor: "#635BFF",
  color: "white",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.625rem 1.25rem",
  borderRadius: 10,
  border: "1px solid #2d3348",
  backgroundColor: "transparent",
  color: "#cbd5e1",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
};
