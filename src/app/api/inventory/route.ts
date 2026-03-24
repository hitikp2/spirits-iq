import { NextRequest, NextResponse } from "next/server";
import { getInventory, getInventoryAlerts, adjustStock, generateAiPurchaseOrder } from "@/lib/services/inventory";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/inventory — List products with filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
    const action = searchParams.get("action");

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    if (action === "alerts") {
      const alerts = await getInventoryAlerts(storeId);
      return NextResponse.json({ success: true, data: alerts } satisfies ApiResponse);
    }

    const result = await getInventory(storeId, {
      categoryId: searchParams.get("categoryId") || undefined,
      status: (searchParams.get("status") as "all" | "ok" | "low" | "out") || "all",
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "50"),
      sortBy: searchParams.get("sortBy") || "name",
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") || "asc",
    });

    return NextResponse.json({
      success: true,
      data: result.products,
      meta: result.meta,
    } satisfies ApiResponse);
  } catch (error) {
    console.error("Inventory GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch inventory" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// POST /api/inventory — Create product or adjust stock
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "adjust") {
      const storeId = request.headers.get("x-store-id") || body.storeId;
      if (!storeId) return NextResponse.json({ success: false, error: "Missing storeId" } satisfies ApiResponse, { status: 400 });
      const { productId, quantity, type, reason, performedBy } = body;
      const result = await adjustStock({ productId, storeId, quantity, type, reason, performedBy });
      return NextResponse.json({ success: true, data: result } satisfies ApiResponse);
    }

    if (action === "ai-reorder") {
      const { storeId, performedBy } = body;
      const orders = await generateAiPurchaseOrder(storeId, performedBy);
      return NextResponse.json({ success: true, data: orders } satisfies ApiResponse);
    }

    if (action === "create") {
      const storeId = request.headers.get("x-store-id") || body.storeId;
      const {
        sku, barcode, name, brand, description,
        costPrice, retailPrice, quantity, reorderPoint, reorderQuantity,
        size, abv, vintage, region, imageUrl, tags, supplierId, isAgeRestricted,
      } = body;
      let { categoryId } = body;

      if (!storeId || !name || !sku) {
        return NextResponse.json(
          { success: false, error: "storeId, name, and sku are required" } satisfies ApiResponse,
          { status: 400 }
        );
      }

      // If no category selected, find or create a default "General" category
      if (!categoryId) {
        let defaultCat = await db.category.findUnique({
          where: { storeId_slug: { storeId, slug: "general" } },
        });
        if (!defaultCat) {
          defaultCat = await db.category.create({
            data: { storeId, name: "General", slug: "general", icon: "📦", sortOrder: 99 },
          });
        }
        categoryId = defaultCat.id;
      }

      const product = await db.product.create({
        data: {
          storeId, sku, barcode, name, brand, description, categoryId,
          costPrice: costPrice || 0, retailPrice: retailPrice || 0,
          quantity: quantity || 0,
          reorderPoint: reorderPoint || 5, reorderQuantity: reorderQuantity || 12,
          size, abv, vintage, region, imageUrl,
          tags: tags || [], supplierId, isAgeRestricted: isAgeRestricted ?? true,
          margin: retailPrice > 0 ? ((retailPrice - (costPrice || 0)) / retailPrice) * 100 : 0,
        },
        include: { category: true, supplier: true },
      });

      return NextResponse.json({ success: true, data: product } satisfies ApiResponse, { status: 201 });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" } satisfies ApiResponse,
      { status: 400 }
    );
  } catch (error) {
    console.error("Inventory POST error:", error);
    return NextResponse.json(
      { success: false, error: "Operation failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// PUT /api/inventory — Update product
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Product id is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    // Recalculate margin if prices changed
    if (updates.retailPrice || updates.costPrice) {
      const existing = await db.product.findUnique({ where: { id } });
      const retail = updates.retailPrice || Number(existing?.retailPrice || 0);
      const cost = updates.costPrice || Number(existing?.costPrice || 0);
      updates.margin = retail > 0 ? ((retail - cost) / retail) * 100 : 0;
    }

    const product = await db.product.update({
      where: { id },
      data: updates,
      include: { category: true, supplier: true },
    });

    return NextResponse.json({ success: true, data: product } satisfies ApiResponse);
  } catch (error) {
    console.error("Inventory PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Update failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

// DELETE /api/inventory — Soft delete (deactivate) product
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Product id is required" } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const product = await db.product.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: { id: product.id } } satisfies ApiResponse);
  } catch (error) {
    console.error("Inventory DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Delete failed" } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
