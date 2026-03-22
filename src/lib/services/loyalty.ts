import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/db/redis";
import { nanoid } from "nanoid";

// ─── Get Customer Loyalty Profile ────────────────────────
export async function getLoyaltyProfile(customerId: string, storeId: string) {
  const cacheKey = `loyalty:${customerId}:profile`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const [customer, config, transactions, redemptions] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId } }),
    db.loyaltyConfig.findUnique({
      where: { storeId },
      include: { tiers: { orderBy: { sortOrder: "asc" } }, rewards: { where: { isActive: true } } },
    }),
    db.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.loyaltyRedemption.findMany({
      where: { customerId, status: { in: ["PENDING", "ACTIVE"] } },
      include: { reward: true },
    }),
  ]);

  if (!customer || !config) return null;

  // Determine current tier
  const annualSpend = Number(customer.totalSpent);
  const tiers = config.tiers;
  const currentTier = tiers.reduce((best, t) =>
    annualSpend >= Number(t.minAnnualSpend) ? t : best, tiers[0]);
  const currentTierIndex = tiers.findIndex((t) => t.id === currentTier.id);
  const nextTier = currentTierIndex < tiers.length - 1 ? tiers[currentTierIndex + 1] : null;

  // Calculate lifetime stats
  const lifetimeEarned = await db.loyaltyTransaction.aggregate({
    where: { customerId, points: { gt: 0 } },
    _sum: { points: true },
  });
  const lifetimeRedeemed = await db.loyaltyTransaction.aggregate({
    where: { customerId, points: { lt: 0 } },
    _sum: { points: true },
  });

  const profile = {
    customer: {
      id: customer.id,
      name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
      phone: customer.phone,
      tier: customer.tier,
    },
    points: {
      current: customer.loyaltyPoints,
      lifetimeEarned: lifetimeEarned._sum.points || 0,
      lifetimeRedeemed: Math.abs(lifetimeRedeemed._sum.points || 0),
    },
    tier: {
      current: {
        name: currentTier.name,
        color: currentTier.color,
        multiplier: Number(currentTier.pointsMultiplier),
        discount: Number(currentTier.discountPercent),
        perks: currentTier.perks,
      },
      next: nextTier ? {
        name: nextTier.name,
        minSpend: Number(nextTier.minAnnualSpend),
        remaining: Number(nextTier.minAnnualSpend) - annualSpend,
        multiplier: Number(nextTier.pointsMultiplier),
      } : null,
      progress: nextTier
        ? ((annualSpend - Number(currentTier.minAnnualSpend)) /
            (Number(nextTier.minAnnualSpend) - Number(currentTier.minAnnualSpend))) * 100
        : 100,
      allTiers: tiers.map((t) => ({
        name: t.name,
        minSpend: Number(t.minAnnualSpend),
        multiplier: Number(t.pointsMultiplier),
        discount: Number(t.discountPercent),
        perks: t.perks,
        color: t.color,
        isCurrent: t.id === currentTier.id,
      })),
    },
    availableRewards: config.rewards.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      pointsCost: r.pointsCost,
      type: r.type,
      canAfford: customer.loyaltyPoints >= r.pointsCost,
    })),
    activeRedemptions: redemptions.map((r) => ({
      id: r.id,
      rewardName: r.reward.name,
      couponCode: r.couponCode,
      expiresAt: r.expiresAt.toISOString(),
      status: r.status,
    })),
    recentHistory: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      points: t.points,
      balance: t.balance,
      description: t.description,
      multiplier: Number(t.multiplier),
      createdAt: t.createdAt.toISOString(),
    })),
  };

  await cacheSet(cacheKey, profile, 120);
  return profile;
}

// ─── Redeem a Reward ─────────────────────────────────────
export async function redeemReward(customerId: string, rewardId: string) {
  const [customer, reward] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId } }),
    db.loyaltyReward.findUnique({ where: { id: rewardId } }),
  ]);

  if (!customer) throw new Error("Customer not found");
  if (!reward || !reward.isActive) throw new Error("Reward not available");
  if (customer.loyaltyPoints < reward.pointsCost) throw new Error("Insufficient points");

  // Check limits
  if (reward.limitPerCustomer) {
    const existing = await db.loyaltyRedemption.count({
      where: { customerId, rewardId },
    });
    if (existing >= reward.limitPerCustomer) throw new Error("Redemption limit reached");
  }
  if (reward.totalLimit && reward.redeemedCount >= reward.totalLimit) {
    throw new Error("Reward sold out");
  }

  const couponCode = `SIQ-${nanoid(8).toUpperCase()}`;
  const newBalance = customer.loyaltyPoints - reward.pointsCost;

  const [redemption] = await db.$transaction([
    db.loyaltyRedemption.create({
      data: {
        customerId,
        rewardId,
        pointsSpent: reward.pointsCost,
        status: "ACTIVE",
        couponCode,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    }),
    db.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newBalance },
    }),
    db.loyaltyTransaction.create({
      data: {
        customerId,
        storeId: customer.storeId,
        type: "SPEND_REDEMPTION",
        points: -reward.pointsCost,
        balance: newBalance,
        description: `Redeemed: ${reward.name}`,
        reference: rewardId,
      },
    }),
    db.loyaltyReward.update({
      where: { id: rewardId },
      data: { redeemedCount: { increment: 1 } },
    }),
  ]);

  return { redemption, couponCode, newBalance };
}

// ─── Apply Coupon at Checkout ────────────────────────────
export async function applyCoupon(couponCode: string, subtotal: number) {
  const redemption = await db.loyaltyRedemption.findUnique({
    where: { couponCode },
    include: { reward: true },
  });

  if (!redemption) return { valid: false, error: "Invalid coupon code" };
  if (redemption.status !== "ACTIVE") return { valid: false, error: "Coupon already used" };
  if (redemption.expiresAt < new Date()) return { valid: false, error: "Coupon expired" };

  let discount = 0;
  const reward = redemption.reward;

  switch (reward.type) {
    case "DISCOUNT_FIXED":
      discount = Number(reward.value || 0);
      break;
    case "DISCOUNT_PERCENT":
      discount = subtotal * (Number(reward.value || 0) / 100);
      break;
    case "FREE_PRODUCT":
    case "FREE_CATEGORY":
      // These would be handled differently at item level
      discount = 0;
      break;
    default:
      discount = 0;
  }

  return {
    valid: true,
    discount: Math.min(discount, subtotal),
    rewardName: reward.name,
    redemptionId: redemption.id,
  };
}

// ─── Mark Coupon as Used ─────────────────────────────────
export async function useCoupon(couponCode: string) {
  return db.loyaltyRedemption.update({
    where: { couponCode },
    data: { status: "USED", usedAt: new Date() },
  });
}

// ─── Award Bonus Points ──────────────────────────────────
export async function awardBonusPoints(
  customerId: string,
  storeId: string,
  points: number,
  reason: string,
  type: "EARN_BONUS" | "EARN_REFERRAL" | "EARN_BIRTHDAY" | "EARN_SIGNUP" = "EARN_BONUS"
) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Customer not found");

  const newBalance = customer.loyaltyPoints + points;

  await db.$transaction([
    db.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newBalance },
    }),
    db.loyaltyTransaction.create({
      data: {
        customerId,
        storeId,
        type,
        points,
        balance: newBalance,
        description: reason,
      },
    }),
  ]);

  return { newBalance, pointsAwarded: points };
}

// ─── Auto-Promote Tiers ──────────────────────────────────
// Run nightly to check if customers should be promoted/demoted
export async function refreshCustomerTiers(storeId: string) {
  const config = await db.loyaltyConfig.findUnique({
    where: { storeId },
    include: { tiers: { orderBy: { minAnnualSpend: "desc" } } },
  });
  if (!config) return;

  const customers = await db.customer.findMany({ where: { storeId } });
  let promoted = 0;
  let demoted = 0;

  for (const customer of customers) {
    const annualSpend = Number(customer.totalSpent);
    const newTier = config.tiers.find((t) => annualSpend >= Number(t.minAnnualSpend));

    if (newTier && newTier.name !== customer.tier) {
      const isPromotion = config.tiers.indexOf(newTier) <
        config.tiers.findIndex((t) => t.name === customer.tier);

      await db.customer.update({
        where: { id: customer.id },
        data: { tier: newTier.name as any },
      });

      if (isPromotion) {
        promoted++;
        // Award bonus points for promotion
        await awardBonusPoints(
          customer.id, storeId, 100,
          `Congratulations! Promoted to ${newTier.name} tier`,
          "EARN_BONUS"
        );
      } else {
        demoted++;
      }
    }
  }

  return { promoted, demoted, total: customers.length };
}
