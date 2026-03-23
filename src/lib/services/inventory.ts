import { db } from "@/lib/db";
import { cacheDelete, cacheGet, cacheSet } from "@/lib/db/redis";

// ─── Get Inventory with Smart Caching ────────────────────
export async function getInventory(
  storeId: string,
  options?: {
    categoryId?: string;
    status?: "all" | "low" | "out";
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }
) {
  const { categoryId, status, search, page = 1, limit = 50, sortBy = "name", sortDir = "asc" } = options || {};

  const where: Record<string, unknown> = { storeId, isActive: true };
  if (categoryId) where.categoryId = categoryId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
      { brand: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status === "out") {
    where.quantity = 0;
  }

  // For "low" status, we need to compare quantity vs reorderPoint (column-to-column).
  // Prisma doesn't support field references in where clauses, so we fetch and filter in app code.
  if (status === "low") {
    const allProducts = await db.product.findMany({
      where: where as any,
      include: { category: true, supplier: true },
      orderBy: { [sortBy]: sortDir },
    });
    const lowStock = allProducts.filter((p) => p.quantity > 0 && p.quantity <= p.reorderPoint);
    const total = lowStock.length;
    const products = lowStock.slice((page - 1) * limit, page * limit);
    return { products, meta: { page, limit, total, hasMore: page * limit < total } };
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: where as any,
      include: { category: true, supplier: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.product.count({ where: where as any }),
  ]);

  return {
    products,
    meta: { page, limit, total, hasMore: page * limit < total },
  };
}

// ─── Get Inventory Alerts ────────────────────────────────
export async function getInventoryAlerts(storeId: string) {
  const cacheKey = `inventory:${storeId}:alerts`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Fetch all active products and filter for low/out stock in app code
  // (Prisma doesn't support column-to-column comparisons like quantity <= reorderPoint)
  const allProducts = await db.product.findMany({
    where: { storeId, isActive: true },
    include: { category: true, supplier: true },
    orderBy: { quantity: "asc" },
  });

  const alerts = allProducts.filter((p) => p.quantity === 0 || p.quantity <= p.reorderPoint);

  const result = alerts.map((p) => ({
    productId: p.id,
    productName: p.name,
    category: p.category.name,
    status: p.quantity === 0 ? "out" : "low",
    currentQty: p.quantity,
    reorderPoint: p.reorderPoint,
    reorderQty: p.reorderQuantity,
    supplierName: p.supplier?.name || "No supplier",
    costPrice: Number(p.costPrice),
    estimatedReorderCost: Number(p.costPrice) * p.reorderQuantity,
  }));

  await cacheSet(cacheKey, result, 120); // Cache 2 min
  return result;
}

// ─── Adjust Stock ────────────────────────────────────────
export async function adjustStock(params: {
  productId: string;
  quantity: number; // Positive = add, Negative = remove
  type: "RESTOCK" | "ADJUSTMENT" | "DAMAGE" | "RETURN" | "AUDIT";
  reason?: string;
  performedBy: string;
}) {
  const product = await db.product.findUnique({ where: { id: params.productId } });
  if (!product) throw new Error("Product not found");

  const newQty = Math.max(0, product.quantity + params.quantity);

  const [updated] = await db.$transaction([
    db.product.update({
      where: { id: params.productId },
      data: { quantity: newQty },
    }),
    db.inventoryLog.create({
      data: {
        productId: params.productId,
        type: params.type,
        quantity: params.quantity,
        prevQty: product.quantity,
        newQty,
        reason: params.reason,
        performedBy: params.performedBy,
      },
    }),
  ]);

  // Invalidate cache
  await cacheDelete(`inventory:${product.storeId}:*`);
  return updated;
}

// ─── Receive Purchase Order ──────────────────────────────
export async function receivePurchaseOrder(
  poId: string,
  receivedItems: Array<{ productId: string; receivedQty: number }>,
  performedBy: string
) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: true },
  });
  if (!po) throw new Error("Purchase order not found");

  await db.$transaction(async (tx) => {
    for (const received of receivedItems) {
      const poItem = po.items.find((i) => i.productId === received.productId);
      if (!poItem) continue;

      // Update PO item received qty
      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { receivedQty: received.receivedQty },
      });

      // Adjust stock
      const product = await tx.product.findUnique({ where: { id: received.productId } });
      if (!product) continue;

      const newQty = product.quantity + received.receivedQty;
      await tx.product.update({
        where: { id: received.productId },
        data: { quantity: newQty },
      });

      await tx.inventoryLog.create({
        data: {
          productId: received.productId,
          type: "RESTOCK",
          quantity: received.receivedQty,
          prevQty: product.quantity,
          newQty,
          reference: poId,
          performedBy,
        },
      });
    }

    // Update PO status
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: "RECEIVED", receivedDate: new Date() },
    });
  });

  await cacheDelete(`inventory:${po.storeId}:*`);
}

// ─── AI-Generated Purchase Order ─────────────────────────
export async function generateAiPurchaseOrder(storeId: string, performedBy: string) {
  // Fetch all active products with suppliers, then filter for low stock in app code
  // (Prisma doesn't support column-to-column comparisons like quantity <= reorderPoint)
  const allProducts = await db.product.findMany({
    where: {
      storeId,
      isActive: true,
      supplierId: { not: null },
    },
    include: { supplier: true },
  });

  const lowStockProducts = allProducts.filter((p) => p.quantity <= p.reorderPoint);

  if (lowStockProducts.length === 0) return null;

  // Group by supplier
  const bySupplier = new Map<string, typeof lowStockProducts>();
  for (const p of lowStockProducts) {
    if (!p.supplierId) continue;
    const list = bySupplier.get(p.supplierId) || [];
    list.push(p);
    bySupplier.set(p.supplierId, list);
  }

  const purchaseOrders = [];

  for (const [supplierId, products] of bySupplier) {
    const items = products.map((p) => ({
      productId: p.id,
      quantity: p.reorderQuantity,
      costPrice: Number(p.costPrice),
    }));

    const subtotal = items.reduce((s, i) => s + i.costPrice * i.quantity, 0);
    const poCount = await db.purchaseOrder.count({ where: { storeId } });

    const po = await db.purchaseOrder.create({
      data: {
        orderNumber: `PO-${(poCount + 1).toString().padStart(5, "0")}`,
        supplierId,
        storeId,
        status: "DRAFT",
        subtotal,
        total: subtotal,
        aiGenerated: true,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            costPrice: i.costPrice,
          })),
        },
      },
      include: { items: { include: { product: true } }, supplier: true },
    });

    purchaseOrders.push(po);
  }

  return purchaseOrders;
}
