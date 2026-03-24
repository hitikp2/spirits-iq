import Stripe from "stripe";
import { db } from "@/lib/db";
import { CONNECT_PLATFORM_FEE_PERCENT } from "@/config/constants";

// ─── Stripe Connect Service ─────────────────────────────
// Spirits IQ acts as a Stripe Connect platform.
// Store owners connect their Stripe accounts via OAuth (Standard accounts).
// The platform earns an application_fee on each PaymentIntent.

const PLATFORM_FEE_PERCENT = CONNECT_PLATFORM_FEE_PERCENT;

function getPlatformStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
}

// ─── Generate OAuth Link for Store Onboarding ───────────
export async function createConnectOnboardingLink(
  storeId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getPlatformStripe();
  if (!stripe) throw new Error("Platform Stripe not configured");

  // Check if store already has a connected account
  const existing = await db.storeIntegration.findUnique({
    where: { storeId_provider: { storeId, provider: "stripe-connect" } },
  });

  let accountId = existing?.config
    ? (existing.config as any).stripeAccountId
    : null;

  // Create a new Standard Connect account if none exists
  if (!accountId) {
    const store = await db.store.findUnique({ where: { id: storeId } });
    const account = await stripe.accounts.create({
      type: "standard",
      business_type: "company",
      company: { name: store?.name || undefined },
      email: store?.email || undefined,
      metadata: { storeId },
    });
    accountId = account.id;

    // Save the account ID
    await db.storeIntegration.upsert({
      where: { storeId_provider: { storeId, provider: "stripe-connect" } },
      create: {
        storeId,
        provider: "stripe-connect",
        isActive: false,
        config: { stripeAccountId: accountId, feePercent: PLATFORM_FEE_PERCENT },
      },
      update: {
        config: { stripeAccountId: accountId, feePercent: PLATFORM_FEE_PERCENT },
      },
    });
  }

  // Create an Account Link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${returnUrl}?connect=refresh`,
    return_url: `${returnUrl}?connect=complete`,
    type: "account_onboarding",
  });

  return accountLink.url;
}

// ─── Check Account Status ────────────────────────────────
export async function getConnectStatus(storeId: string) {
  const stripe = getPlatformStripe();
  if (!stripe) return { connected: false, reason: "Platform Stripe not configured" };

  const integration = await db.storeIntegration.findUnique({
    where: { storeId_provider: { storeId, provider: "stripe-connect" } },
  });

  if (!integration?.config) {
    return { connected: false, reason: "Not started" };
  }

  const accountId = (integration.config as any).stripeAccountId;
  if (!accountId) return { connected: false, reason: "No account" };

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const chargesEnabled = account.charges_enabled;
    const payoutsEnabled = account.payouts_enabled;
    const detailsSubmitted = account.details_submitted;

    // Update isActive based on Stripe account status
    if (chargesEnabled && integration.isActive !== true) {
      await db.storeIntegration.update({
        where: { id: integration.id },
        data: { isActive: true, connectedAt: new Date() },
      });
    }

    return {
      connected: chargesEnabled === true,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      feePercent: (integration.config as any).feePercent || PLATFORM_FEE_PERCENT,
    };
  } catch {
    return { connected: false, reason: "Account retrieval failed" };
  }
}

// ─── Get Connected Account ID for a Store ────────────────
export async function getConnectedAccountId(storeId: string): Promise<string | null> {
  const integration = await db.storeIntegration.findUnique({
    where: { storeId_provider: { storeId, provider: "stripe-connect" } },
  });

  if (!integration?.isActive || !integration.config) return null;
  return (integration.config as any).stripeAccountId || null;
}

// ─── Calculate Application Fee ───────────────────────────
export async function getApplicationFee(
  storeId: string,
  amountCents: number
): Promise<{ feeAmount: number; connectedAccountId: string } | null> {
  const integration = await db.storeIntegration.findUnique({
    where: { storeId_provider: { storeId, provider: "stripe-connect" } },
  });

  if (!integration?.isActive || !integration.config) return null;

  const accountId = (integration.config as any).stripeAccountId;
  if (!accountId) return null;

  const feePercent = (integration.config as any).feePercent || PLATFORM_FEE_PERCENT;
  const feeAmount = Math.round(amountCents * feePercent);

  return { feeAmount, connectedAccountId: accountId };
}

// ─── Create Dashboard Login Link ─────────────────────────
export async function createDashboardLink(storeId: string): Promise<string | null> {
  const stripe = getPlatformStripe();
  if (!stripe) return null;

  const accountId = await getConnectedAccountId(storeId);
  if (!accountId) return null;

  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return loginLink.url;
  } catch {
    return null;
  }
}

// ─── Disconnect a Connected Account ──────────────────────
export async function disconnectAccount(storeId: string): Promise<boolean> {
  try {
    await db.storeIntegration.updateMany({
      where: { storeId, provider: "stripe-connect" },
      data: { isActive: false },
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Get Platform Earnings ───────────────────────────────
export async function getPlatformEarnings(storeId: string, days = 30) {
  const stripe = getPlatformStripe();
  if (!stripe) return null;

  const accountId = await getConnectedAccountId(storeId);
  if (!accountId) return null;

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Query transactions with application fees from this connected account
  const fees = await db.transaction.aggregate({
    where: {
      storeId,
      createdAt: { gte: since },
      paymentStatus: "COMPLETED",
      platformFee: { gt: 0 },
    },
    _sum: { platformFee: true, total: true },
    _count: true,
  });

  return {
    totalFees: Number(fees._sum.platformFee || 0),
    totalVolume: Number(fees._sum.total || 0),
    transactionCount: fees._count,
    periodDays: days,
  };
}
