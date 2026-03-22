import Stripe from "stripe";
import { db } from "@/lib/db";
import { cacheDelete } from "@/lib/db/redis";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

// ─── Card-Present Payment (Stripe Terminal) ──────────────
export async function createTerminalPaymentIntent(
  amount: number, // in cents
  registerId: string,
  metadata?: Record<string, string>
) {
  const register = await db.register.findUnique({ where: { id: registerId } });
  if (!register?.terminalId) throw new Error("Register has no terminal configured");

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata: {
      registerId,
      storeId: register.storeId,
      ...metadata,
    },
  });

  return paymentIntent;
}

// ─── Process Terminal Payment ────────────────────────────
export async function processTerminalPayment(
  paymentIntentId: string,
  terminalId: string
) {
  // In production, the Stripe Terminal SDK on the device handles
  // collecting the payment method and confirming.
  // This function is called after the device confirms.
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent;
}

// ─── Refund ──────────────────────────────────────────────
export async function processRefund(
  transactionId: string,
  amount?: number // Partial refund amount in cents; omit for full
) {
  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction?.stripePaymentId) {
    throw new Error("No Stripe payment found for this transaction");
  }

  const refund = await stripe.refunds.create({
    payment_intent: transaction.stripePaymentId,
    amount: amount || undefined, // undefined = full refund
  });

  await db.transaction.update({
    where: { id: transactionId },
    data: {
      paymentStatus: amount ? "PARTIALLY_REFUNDED" : "REFUNDED",
    },
  });

  return refund;
}

// ─── Complete Transaction ────────────────────────────────
// This is the main function called after payment is confirmed
export async function completeTransaction(params: {
  storeId: string;
  registerId: string;
  cashierId: string;
  customerId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>;
  paymentMethod: string;
  stripePaymentId?: string;
  cardLast4?: string;
  cardBrand?: string;
  ageVerified?: boolean;
  verificationMethod?: string;
  tip?: number;
}) {
  const { storeId, items, paymentMethod } = params;

  // Calculate totals
  const store = await db.store.findUnique({ where: { id: storeId } });
  const taxRate = Number(store?.taxRate || 0.0975);

  const subtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity - (item.discount || 0),
    0
  );
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount + (params.tip || 0);

  // Generate transaction number
  const todayCount = await db.transaction.count({
    where: {
      storeId,
      createdAt: { gte: startOfDay() },
    },
  });
  const transactionNum = `#${(todayCount + 1).toString().padStart(4, "0")}`;

  // Create transaction with items in a single DB transaction
  const transaction = await db.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        transactionNum,
        storeId,
        registerId: params.registerId,
        cashierId: params.cashierId,
        customerId: params.customerId || null,
        subtotal,
        taxAmount,
        discountAmount: items.reduce((s, i) => s + (i.discount || 0), 0),
        tipAmount: params.tip || 0,
        total,
        paymentMethod: paymentMethod.toUpperCase() as any,
        paymentStatus: "COMPLETED",
        stripePaymentId: params.stripePaymentId || null,
        cardLast4: params.cardLast4 || null,
        cardBrand: params.cardBrand || null,
        ageVerified: params.ageVerified || false,
        verificationMethod: params.verificationMethod || null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discount || 0,
            total: item.unitPrice * item.quantity - (item.discount || 0),
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    // Decrement inventory for each item
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) continue;

      const newQty = product.quantity - item.quantity;
      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: Math.max(0, newQty) },
      });

      await tx.inventoryLog.create({
        data: {
          productId: item.productId,
          type: "SALE",
          quantity: -item.quantity,
          prevQty: product.quantity,
          newQty: Math.max(0, newQty),
          reference: txn.id,
          performedBy: params.cashierId,
        },
      });
    }

    // Update customer stats if applicable
    if (params.customerId) {
      await tx.customer.update({
        where: { id: params.customerId },
        data: {
          totalSpent: { increment: total },
          visitCount: { increment: 1 },
          lastVisit: new Date(),
        },
      });
    }

    return txn;
  });

  // Invalidate caches
  await cacheDelete(`dashboard:${storeId}:*`);
  await cacheDelete(`inventory:${storeId}:*`);

  return transaction;
}

// ─── Helpers ─────────────────────────────────────────────
function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export { stripe };
