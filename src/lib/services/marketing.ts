import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { generateText } from "@/lib/ai/gemini";

// ═══ REVIEW AUTOMATION ════════════════════════════════════

export async function sendReviewRequest(customerId: string, storeId: string, transactionId: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!customer || !store || !customer.smsOptedIn) return null;

  const name = customer.firstName || "there";
  const message = `Hi ${name}! Thanks for shopping at ${store.name}. We'd love your feedback — leave a quick review and earn 50 bonus points! 🌟\n\nGoogle: https://g.page/${store.slug}/review\nYelp: https://yelp.com/biz/${store.slug}`;

  const sid = await sendSms(customer.phone, message, customerId, { aiGenerated: false });

  await db.reviewRequest.create({
    data: { customerId, storeId, transactionId, status: "SENT", twilioSid: sid || undefined },
  });

  return sid;
}

// Auto-send review requests 24hrs after purchase
export async function processReviewQueue(storeId: string) {
  const cutoff = new Date(Date.now() - 24 * 3600000); // 24hrs ago
  const cutoffEnd = new Date(Date.now() - 23 * 3600000); // 23hrs ago

  const eligibleTxns = await db.transaction.findMany({
    where: {
      storeId,
      paymentStatus: "COMPLETED",
      customerId: { not: null },
      createdAt: { gte: cutoff, lt: cutoffEnd },
    },
    include: { customer: true },
  });

  let sent = 0;
  for (const txn of eligibleTxns) {
    if (!txn.customerId) continue;
    const existing = await db.reviewRequest.findFirst({
      where: { customerId: txn.customerId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    });
    if (existing) continue; // Don't spam — max 1 request per 30 days

    await sendReviewRequest(txn.customerId, storeId, txn.id);
    sent++;
  }

  return { sent };
}

export async function getReviewStats(storeId: string) {
  const thirtyDays = new Date(Date.now() - 30 * 86400000);
  const [totalSent, completed] = await Promise.all([
    db.reviewRequest.count({ where: { storeId, createdAt: { gte: thirtyDays } } }),
    db.reviewRequest.count({ where: { storeId, status: "COMPLETED", createdAt: { gte: thirtyDays } } }),
  ]);

  return {
    sent: totalSent,
    completed,
    completionRate: totalSent > 0 ? Math.round((completed / totalSent) * 100) : 0,
  };
}

// ═══ SOCIAL MEDIA AUTO-POSTING ════════════════════════════

export async function createSocialPost(params: {
  storeId: string; platform: string; type: string;
  content?: string; scheduledFor?: string; productIds?: string[];
}) {
  let content = params.content;

  // AI-generate content if not provided
  if (!content && params.productIds?.length) {
    const products = await db.product.findMany({
      where: { id: { in: params.productIds } },
      include: { category: true },
    });

    const prompt = `Write a short, engaging ${params.platform} post for a liquor store.
Post type: ${params.type}
Products: ${products.map((p) => `${p.name} (${p.category.name}, $${p.retailPrice})`).join(", ")}
Keep it under 200 characters. Include 2-3 relevant emojis. No hashtag spam — max 3 tasteful hashtags.`;

    content = await generateText(prompt, { maxOutputTokens: 150 }) || "";
  }

  return db.socialPost.create({
    data: {
      storeId: params.storeId,
      platform: params.platform,
      postType: params.type,
      content: content || "",
      status: params.scheduledFor ? "SCHEDULED" : "DRAFT",
      scheduledFor: params.scheduledFor ? new Date(params.scheduledFor) : null,
    },
  });
}

export async function getSocialPosts(storeId: string) {
  return db.socialPost.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

// Auto-post for new arrivals
export async function autoPostNewArrival(storeId: string, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (!product) return null;

  for (const platform of ["Instagram", "Facebook"]) {
    await createSocialPost({
      storeId,
      platform,
      type: "New Arrival",
      productIds: [productId],
      scheduledFor: new Date(Date.now() + 2 * 3600000).toISOString(), // 2hrs from now
    });
  }
}

// ═══ EMAIL MARKETING ══════════════════════════════════════

export async function createEmailCampaign(params: {
  storeId: string; name: string; subject?: string;
  targetTier?: string; targetTags?: string[];
  scheduledFor?: string; productIds?: string[];
}) {
  let subject = params.subject;
  let body = "";

  // AI-generate email content
  if (params.productIds?.length) {
    const products = await db.product.findMany({
      where: { id: { in: params.productIds } },
      include: { category: true },
    });

    const prompt = `Write a marketing email for a premium liquor store.
Campaign: ${params.name}
Featured products: ${products.map((p) => `${p.name} (${p.category.name}, $${p.retailPrice})`).join(", ")}

Write:
1. Subject line (compelling, under 50 chars)
2. Preview text (1 sentence)
3. Body (3-4 short paragraphs, warm and inviting tone, mention specific products with prices)
4. CTA button text

Return JSON: {"subject":"...","preview":"...","body":"...","cta":"..."}
Only valid JSON.`;

    const textResult = await generateText(prompt, { maxOutputTokens: 500 });

    try {
      const parsed = JSON.parse(textResult?.replace(/```json|```/g, "").trim() || "{}");
      subject = parsed.subject || params.name;
      body = parsed.body || "";
    } catch {
      subject = params.name;
    }
  }

  // Count recipients
  const where: Record<string, unknown> = { storeId: params.storeId, email: { not: null } };
  if (params.targetTier) where.tier = params.targetTier;
  if (params.targetTags?.length) where.tags = { hasSome: params.targetTags };
  const recipientCount = await db.customer.count({ where: where as any });

  return db.emailCampaign.create({
    data: {
      storeId: params.storeId,
      name: params.name,
      subject: subject || params.name,
      body,
      targetTier: params.targetTier,
      targetTags: params.targetTags || [],
      recipientCount,
      status: params.scheduledFor ? "SCHEDULED" : "DRAFT",
      scheduledFor: params.scheduledFor ? new Date(params.scheduledFor) : null,
    },
  });
}

export async function getEmailCampaigns(storeId: string) {
  return db.emailCampaign.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

// ═══ REFERRAL PROGRAM ═════════════════════════════════════

export async function getReferralStats(storeId: string) {
  const referrals = await db.referral.findMany({
    where: { referrer: { storeId } },
    include: {
      referrer: { select: { firstName: true, lastName: true } },
      _count: { select: { conversions: true } },
    },
  });

  const totalReferrals = referrals.reduce((s, r) => s + r._count.conversions, 0);
  const topReferrers = referrals
    .filter((r) => r._count.conversions > 0)
    .sort((a, b) => b._count.conversions - a._count.conversions)
    .slice(0, 5)
    .map((r) => ({
      name: [r.referrer.firstName, r.referrer.lastName].filter(Boolean).join(" "),
      conversions: r._count.conversions,
      code: r.code,
    }));

  // Estimate revenue from referrals
  const conversions = await db.referralConversion.findMany({
    where: { referral: { referrer: { storeId } } },
    include: { referred: { select: { totalSpent: true } } },
  });
  const referralRevenue = conversions.reduce((s, c) => s + Number(c.referred.totalSpent), 0);

  return {
    totalCodes: referrals.length,
    totalConversions: totalReferrals,
    conversionRate: referrals.length > 0 ? Math.round((totalReferrals / referrals.length) * 100) : 0,
    estimatedRevenue: Math.round(referralRevenue * 100) / 100,
    topReferrers,
  };
}
