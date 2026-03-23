// ─── /api/storefront/route.ts ─────────────────────────────
// E-Commerce API — product browsing, ordering, order management

import { NextRequest, NextResponse } from "next/server";
import {
  getStorefrontProducts, getFeaturedProducts,
  createOnlineOrder, updateOrderStatus,
} from "@/lib/services/ecommerce";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action");

    if (!storeId) {
      return NextResponse.json({ success: false, error: "storeId required" } satisfies ApiResponse, { status: 400 });
    }

    if (action === "featured") {
      const data = await getFeaturedProducts(storeId);
      return NextResponse.json({ success: true, data } satisfies ApiResponse);
    }

    if (action === "categories") {
      const categories = await db.category.findMany({
        where: { storeId },
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json({ success: true, data: categories } satisfies ApiResponse);
    }

    if (action === "orders") {
      const customerId = searchParams.get("customerId");
      const orders = await db.onlineOrder.findMany({
        where: { storeId, ...(customerId ? { customerId } : {}) },
        include: { items: { include: { product: true } }, customer: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return NextResponse.json({ success: true, data: orders } satisfies ApiResponse);
    }

    // Default: product listing
    const products = await getStorefrontProducts(storeId, {
      categoryId: searchParams.get("categoryId") || undefined,
      search: searchParams.get("search") || undefined,
      sortBy: (searchParams.get("sortBy") as any) || "popular",
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
      minPrice: searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")!) : undefined,
      maxPrice: searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined,
    });

    return NextResponse.json({ success: true, ...products } satisfies ApiResponse);
  } catch (error) {
    console.error("Storefront GET error:", error);
    return NextResponse.json({ success: false, error: "Failed" } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create-order") {
      const order = await createOnlineOrder(body);
      return NextResponse.json({ success: true, data: order } satisfies ApiResponse, { status: 201 });
    }

    if (action === "update-status") {
      const { orderId, status } = body;
      const order = await updateOrderStatus(orderId, status);
      return NextResponse.json({ success: true, data: order } satisfies ApiResponse);
    }

    return NextResponse.json({ success: false, error: "Invalid action" } satisfies ApiResponse, { status: 400 });
  } catch (error: any) {
    console.error("Storefront POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed" } satisfies ApiResponse, { status: 500 });
  }
}
