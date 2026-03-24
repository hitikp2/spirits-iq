/**
 * Success Page — Post-checkout confirmation
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /connect-demo/success?session_id=cs_...&account_id=acct_...
 *
 * This page is shown after a successful Stripe Checkout. The session_id
 * parameter can be used to fetch the Checkout Session details for display
 * (e.g., amount paid, customer email, etc.).
 *
 * In a production app, you would:
 *   1. Fetch the Checkout Session to verify the payment
 *   2. Create/update order records in your database
 *   3. Send a confirmation email
 *   4. Display order details to the customer
 */

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// ─── Suspense wrapper ────────────────────────────────────────────────────────
// Next.js 14 requires useSearchParams() to be inside a Suspense boundary.
export default function SuccessPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", color: "#94a3b8", textAlign: "center" }}>Loading...</div>}>
      <SuccessPage />
    </Suspense>
  );
}

function SuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const accountId = searchParams.get("account_id");

  return (
    <div
      style={{
        maxWidth: 600,
        margin: "0 auto",
        padding: "4rem 1rem",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#e2e8f0",
        backgroundColor: "#0f1117",
        minHeight: "100vh",
        textAlign: "center",
      }}
    >
      {/* Success icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          border: "2px solid rgba(34, 197, 94, 0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.5rem",
          fontSize: "2rem",
        }}
      >
        ✓
      </div>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Payment Successful!
      </h1>
      <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "2rem", lineHeight: 1.6 }}>
        Your payment has been processed. The merchant will receive the funds
        minus the platform application fee.
      </p>

      {/* Session details for debugging/reference */}
      {sessionId && (
        <div
          style={{
            padding: "1rem",
            borderRadius: 12,
            backgroundColor: "#1a1d27",
            border: "1px solid #2d3348",
            marginBottom: "1.5rem",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: 4 }}>
            Checkout Session
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#cbd5e1", wordBreak: "break-all" }}>
            {sessionId}
          </div>
        </div>
      )}

      {/* Navigation links */}
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
        {accountId && (
          <a
            href={`/connect-demo/storefront/${accountId}`}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: 10,
              backgroundColor: "#635BFF",
              color: "white",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Continue Shopping
          </a>
        )}
        <a
          href="/connect-demo"
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: 10,
            border: "1px solid #2d3348",
            color: "#cbd5e1",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
