import { db } from "@/lib/db";
import { redis } from "@/lib/db/redis";
import { sendSms } from "@/lib/sms";

export interface Notification {
  id: string;
  type: "low_stock" | "out_of_stock" | "large_order" | "ai_insight" | "delivery_update" | "payment" | "employee" | "tax_due" | "system";
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// ─── Send In-App Notification ────────────────────────────
export async function sendNotification(
  storeId: string,
  notification: Omit<Notification, "id" | "read" | "createdAt">
) {
  const notif: Notification = {
    ...notification,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  };

  // Store in Redis list (latest 100 notifications)
  await redis.lpush(`notifications:${storeId}`, JSON.stringify(notif));
  await redis.ltrim(`notifications:${storeId}`, 0, 99);

  // Check settings for external notifications
  const settings = await db.storeSettings.findUnique({ where: { storeId } });

  if (settings?.slackWebhookUrl && notification.severity !== "info") {
    await sendSlackNotification(settings.slackWebhookUrl, notif);
  }

  if (settings?.emailNotifications && notification.severity === "critical") {
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (store?.email) {
      // Would integrate with SendGrid/SES here
      console.log(`[EMAIL] ${store.email}: ${notification.title}`);
    }
  }

  return notif;
}

// ─── Get Notifications ───────────────────────────────────
export async function getNotifications(storeId: string, limit = 20): Promise<Notification[]> {
  const raw = await redis.lrange(`notifications:${storeId}`, 0, limit - 1);
  return raw.map((r) => JSON.parse(r));
}

// ─── Mark as Read ────────────────────────────────────────
export async function markNotificationRead(storeId: string, notificationId: string) {
  const all = await redis.lrange(`notifications:${storeId}`, 0, -1);
  for (let i = 0; i < all.length; i++) {
    const notif = JSON.parse(all[i]);
    if (notif.id === notificationId) {
      notif.read = true;
      await redis.lset(`notifications:${storeId}`, i, JSON.stringify(notif));
      break;
    }
  }
}

// ─── Pre-built Notification Triggers ─────────────────────

export async function notifyLowStock(storeId: string, productName: string, qty: number) {
  return sendNotification(storeId, {
    type: "low_stock",
    title: `Low Stock: ${productName}`,
    message: `Only ${qty} units remaining. Auto-reorder threshold reached.`,
    severity: qty === 0 ? "critical" : "warning",
    data: { productName, qty },
  });
}

export async function notifyLargeOrder(storeId: string, orderNum: string, total: number, customerName: string) {
  return sendNotification(storeId, {
    type: "large_order",
    title: `Large Order: $${total.toFixed(2)}`,
    message: `${customerName} placed order ${orderNum} for $${total.toFixed(2)}.`,
    severity: "info",
    data: { orderNum, total, customerName },
  });
}

export async function notifyDeliveryUpdate(storeId: string, orderNum: string, status: string) {
  return sendNotification(storeId, {
    type: "delivery_update",
    title: `Delivery ${status}: ${orderNum}`,
    message: `Order ${orderNum} is now ${status.toLowerCase().replace(/_/g, " ")}.`,
    severity: "info",
    data: { orderNum, status },
  });
}

export async function notifyTaxDue(storeId: string, amount: number, dueDate: string) {
  return sendNotification(storeId, {
    type: "tax_due",
    title: `Sales Tax Due: $${amount.toFixed(2)}`,
    message: `$${amount.toFixed(2)} in sales tax is due by ${dueDate}. File on time to avoid penalties.`,
    severity: "warning",
    data: { amount, dueDate },
  });
}

// ─── Slack Integration ───────────────────────────────────
async function sendSlackNotification(webhookUrl: string, notif: Notification) {
  try {
    const emoji = { info: "ℹ️", warning: "⚠️", critical: "🚨" }[notif.severity];
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${emoji} *${notif.title}*\n${notif.message}`,
      }),
    });
  } catch (error) {
    console.error("Slack notification failed:", error);
  }
}
