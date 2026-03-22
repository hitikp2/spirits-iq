import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheDelete } from "@/lib/db/redis";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const action = searchParams.get("action") || "all";

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    if (action === "all" || action === "store") {
      const [store, settings, storefrontConfig, loyaltyConfig] = await Promise.all([
        db.store.findUnique({ where: { id: storeId } }),
        db.storeSettings.findUnique({ where: { storeId } }),
        db.storefrontConfig.findUnique({ where: { storeId } }),
        db.loyaltyConfig.findUnique({ where: { storeId }, include: { tiers: true, rewards: true } }),
      ]);

      return NextResponse.json({
        success: true,
        data: { store, settings, storefrontConfig, loyaltyConfig },
      } satisfies ApiResponse);
    }

    if (action === "changelog") {
      const changes = await db.settingsChange.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ success: true, data: changes } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, storeId } = body;

    if (!storeId) return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });

    if (action === "update-store") {
      const { name, address, city, state, zip, phone, email, operatingHours } = body;
      const store = await db.store.update({
        where: { id: storeId },
        data: { name, address, city, state, zip, phone, email, operatingHours },
      });
      await cacheDelete(`dashboard:${storeId}:*`);
      return NextResponse.json({ success: true, data: store } satisfies ApiResponse);
    }

    if (action === "update-settings") {
      const { settings, changedBy } = body;
      const current = await db.storeSettings.findUnique({ where: { storeId } });

      // Log changes
      for (const [key, value] of Object.entries(settings)) {
        const oldVal = current ? (current as any)[key] : null;
        if (String(oldVal) !== String(value)) {
          await db.settingsChange.create({
            data: {
              storeId,
              changedBy: changedBy || "system",
              field: key,
              oldValue: oldVal != null ? String(oldVal) : null,
              newValue: String(value),
            },
          });
        }
      }

      const updated = await db.storeSettings.upsert({
        where: { storeId },
        update: settings,
        create: { storeId, ...settings },
      });

      await cacheDelete(`settings:${storeId}:*`);
      return NextResponse.json({ success: true, data: updated } satisfies ApiResponse);
    }

    if (action === "update-storefront") {
      const { config } = body;
      const updated = await db.storefrontConfig.upsert({
        where: { storeId },
        update: config,
        create: { storeId, ...config },
      });
      await cacheDelete(`storefront:${storeId}:*`);
      return NextResponse.json({ success: true, data: updated } satisfies ApiResponse);
    }

    if (action === "update-loyalty") {
      const { config, tiers, rewards } = body;
      const updated = await db.loyaltyConfig.upsert({
        where: { storeId },
        update: config || {},
        create: { storeId, ...(config || {}) },
      });

      // Update tiers if provided
      if (tiers) {
        await db.loyaltyTier.deleteMany({ where: { configId: updated.id } });
        for (const [i, tier] of tiers.entries()) {
          await db.loyaltyTier.create({
            data: { ...tier, configId: updated.id, sortOrder: i },
          });
        }
      }

      return NextResponse.json({ success: true, data: updated } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
