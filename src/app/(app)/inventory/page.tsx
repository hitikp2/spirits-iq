"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  useInventory,
  useInventoryAlerts,
  useStockAdjust,
  useAiReorder,
  useCreateProduct,
} from "@/hooks/useApi";
import { formatCurrency, cn, getStockStatus, calcMargin } from "@/lib/utils";

type StatusFilter = "all" | "ok" | "low" | "out";
type SortKey = "name" | "quantity" | "retailPrice" | "margin";

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  retailPrice: number;
  costPrice: number;
  quantity: number;
  reorderPoint: number;
  margin: number;
  categoryId: string;
  category: { name: string; icon: string };
  size: string;
  abv: number;
  isActive: boolean;
  tags: string[];
  supplier: { name: string };
}

interface Alert {
  productId: string;
  productName: string;
  status: "out" | "low" | "overstocked";
  currentQty: number;
  reorderPoint: number;
  aiAction: string;
  aiConfidence: number;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";
  const userId = (session?.user as any)?.id ?? "";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState<"add" | "remove" | "set">("add");
  const [adjustReason, setAdjustReason] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "", brand: "", sku: "", categoryId: "",
    costPrice: "", retailPrice: "", quantity: "", reorderPoint: "5",
    size: "", abv: "", tags: "",
  });

  const { data: products, isLoading } = useInventory(storeId);
  const { data: alerts } = useInventoryAlerts(storeId);
  const stockAdjust = useStockAdjust();
  const aiReorder = useAiReorder();
  const createProduct = useCreateProduct();

  const productList = (products as Product[]) || [];
  const alertList = (alerts as Alert[]) || [];
  const criticalAlerts = alertList.filter((a) => a.status === "out" || a.status === "low");

  const filtered = useMemo(() => {
    let items = productList.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.sku.toLowerCase().includes(q) &&
          !p.brand.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter !== "all") {
        const s = getStockStatus(p.quantity, p.reorderPoint);
        if (s.status !== statusFilter) return false;
      }
      return true;
    });

    items.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "quantity":
          return a.quantity - b.quantity;
        case "retailPrice":
          return b.retailPrice - a.retailPrice;
        case "margin":
          return calcMargin(b.retailPrice, b.costPrice) - calcMargin(a.retailPrice, a.costPrice);
        default:
          return 0;
      }
    });

    return items;
  }, [productList, search, statusFilter, sortKey]);

  function handleAdjustSubmit(productId: string) {
    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty <= 0) return;

    // Map UI type to Prisma InventoryAction enum + correct quantity sign
    let dbType: string;
    let dbQty: number;
    if (adjustType === "add") {
      dbType = "RESTOCK";
      dbQty = qty;
    } else if (adjustType === "remove") {
      dbType = "ADJUSTMENT";
      dbQty = -qty;
    } else {
      // "set" — find current stock and compute delta
      const product = productList.find((p: any) => p.id === productId);
      const currentQty = product?.quantity ?? 0;
      dbType = "AUDIT";
      dbQty = qty - currentQty;
    }

    stockAdjust.mutate(
      { productId, quantity: dbQty, type: dbType, reason: adjustReason || `Stock ${adjustType}: ${qty}`, performedBy: userId },
      {
        onSuccess: () => {
          setAdjustingId(null);
          setAdjustQty("");
          setAdjustReason("");
        },
      }
    );
  }

  function handleAiReorder() {
    aiReorder.mutate({ storeId, performedBy: userId });
  }

  function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProduct.name || !newProduct.sku || !newProduct.retailPrice) {
      setAddError("Name, SKU, and Retail Price are required.");
      return;
    }
    setAddError("");
    createProduct.mutate(
      {
        storeId,
        name: newProduct.name,
        brand: newProduct.brand || undefined,
        sku: newProduct.sku,
        categoryId: newProduct.categoryId || undefined,
        costPrice: parseFloat(newProduct.costPrice) || 0,
        retailPrice: parseFloat(newProduct.retailPrice) || 0,
        quantity: parseInt(newProduct.quantity) || 0,
        reorderPoint: parseInt(newProduct.reorderPoint) || 5,
        size: newProduct.size || undefined,
        abv: newProduct.abv ? parseFloat(newProduct.abv) : undefined,
        tags: newProduct.tags ? newProduct.tags.split(",").map((t: string) => t.trim()) : [],
      },
      {
        onSuccess: () => {
          setShowAddForm(false);
          setAddError("");
          setNewProduct({ name: "", brand: "", sku: "", categoryId: "", costPrice: "", retailPrice: "", quantity: "", reorderPoint: "5", size: "", abv: "", tags: "" });
        },
        onError: (err: Error) => {
          setAddError(err.message || "Failed to add product. Please try again.");
        },
      }
    );
  }

  const statusColors: Record<string, string> = {
    success: "bg-emerald-500/15 text-success border border-emerald-500/30",
    brand: "bg-amber-500/15 text-brand border border-amber-500/30",
    danger: "bg-red-500/15 text-danger border border-red-500/30",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-surface-100">Inventory</h1>
          <p className="font-body text-sm text-surface-400 mt-1">
            {productList.length} products tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-display text-sm font-semibold bg-surface-800 border border-surface-600 text-surface-100 hover:border-brand hover:text-brand transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Product
          </button>
          <button
            onClick={handleAiReorder}
            disabled={aiReorder.isPending}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-display text-sm font-semibold transition-all",
              "bg-brand text-surface-950 hover:brightness-110",
              aiReorder.isPending && "opacity-50 cursor-not-allowed"
            )}
          >
            {aiReorder.isPending ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            )}
            AI Reorder
          </button>
        </div>
      </div>

      {/* Add Product Form */}
      {showAddForm && (
        <div className="bg-surface-900 border border-brand/30 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-surface-100">Add New Product</h2>
            <button onClick={() => setShowAddForm(false)} className="text-surface-400 hover:text-surface-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Name *</label>
              <input type="text" required value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-body text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Brand</label>
              <input type="text" value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-body text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">SKU *</label>
              <input type="text" required value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Category</label>
              <select value={newProduct.categoryId} onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-body text-sm focus:outline-none focus:border-brand">
                <option value="">Auto (General)</option>
                {Array.from(new Map(productList.map((p) => [p.categoryId, p.category])).entries()).map(([id, cat]) => (
                  <option key={id} value={id}>{cat.icon} {cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Cost Price</label>
              <input type="number" step="0.01" min="0" value={newProduct.costPrice} onChange={(e) => setNewProduct({ ...newProduct, costPrice: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Retail Price *</label>
              <input type="number" step="0.01" min="0" required value={newProduct.retailPrice} onChange={(e) => setNewProduct({ ...newProduct, retailPrice: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Quantity</label>
              <input type="number" min="0" value={newProduct.quantity} onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Size (e.g. 750ml)</label>
              <input type="text" value={newProduct.size} onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-body text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">ABV %</label>
              <input type="number" step="0.1" min="0" max="100" value={newProduct.abv} onChange={(e) => setNewProduct({ ...newProduct, abv: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block font-body text-xs text-surface-400 mb-1">Tags (comma-separated)</label>
              <input type="text" value={newProduct.tags} onChange={(e) => setNewProduct({ ...newProduct, tags: e.target.value })} placeholder="premium, staff-pick"
                className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-body text-sm focus:outline-none focus:border-brand" />
            </div>
            {addError && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="font-body text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{addError}</p>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddForm(false)}
                className="px-5 py-2.5 rounded-xl font-display text-sm font-semibold bg-surface-800 text-surface-300 hover:text-surface-100 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={createProduct.isPending}
                className="px-5 py-2.5 rounded-xl font-display text-sm font-semibold bg-brand text-surface-950 hover:brightness-110 disabled:opacity-50 transition-all">
                {createProduct.isPending ? "Adding..." : "Add Product"}
              </button>
            </div>
          </form>
        </div>
      )}

      {criticalAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl overflow-hidden">
          <button
            onClick={() => setAlertsExpanded(!alertsExpanded)}
            className="w-full flex items-center justify-between px-5 py-3.5"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <span className="font-display text-sm font-semibold text-danger">
                {criticalAlerts.length} item{criticalAlerts.length !== 1 && "s"} need attention
              </span>
            </div>
            <svg
              className={cn("w-5 h-5 text-surface-400 transition-transform", alertsExpanded && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {alertsExpanded && (
            <div className="px-5 pb-4 space-y-2">
              {criticalAlerts.map((alert) => (
                <div
                  key={alert.productId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface-900/60 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="font-body text-sm font-medium text-surface-100">{alert.productName}</p>
                    <p className="font-body text-xs text-surface-400">
                      {alert.status === "out" ? "Out of stock" : `${alert.currentQty} remaining (reorder at ${alert.reorderPoint})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-surface-300 bg-surface-800 px-2.5 py-1 rounded-lg">
                      {alert.aiAction} ({Math.round(alert.aiConfidence * 100)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, SKU, or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-900 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 font-body text-sm text-surface-100 placeholder:text-surface-400 focus:outline-none focus:border-brand transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "ok", "low", "out"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-4 py-2.5 rounded-xl font-display text-xs font-semibold transition-colors whitespace-nowrap",
                statusFilter === s
                  ? "bg-brand text-surface-950"
                  : "bg-surface-900 text-surface-300 border border-surface-600 hover:border-surface-400"
              )}
            >
              {{ all: "All", ok: "In Stock", low: "Low", out: "Out" }[s]}
            </button>
          ))}
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-surface-900 border border-surface-600 rounded-xl px-4 py-2.5 font-body text-sm text-surface-100 focus:outline-none focus:border-brand transition-colors"
        >
          <option value="name">Sort: Name</option>
          <option value="quantity">Sort: Stock</option>
          <option value="retailPrice">Sort: Price</option>
          <option value="margin">Sort: Margin</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="w-8 h-8 animate-spin text-brand" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-lg text-surface-300">No products found</p>
          <p className="font-body text-sm text-surface-400 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block bg-surface-900 border border-surface-600 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-600">
                  <th className="text-left px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Product</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">SKU</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Category</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Stock</th>
                  <th className="text-right px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Cost</th>
                  <th className="text-right px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Retail</th>
                  <th className="text-right px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Margin</th>
                  <th className="text-left px-5 py-3 font-display text-xs font-semibold text-surface-400 uppercase tracking-wider">Supplier</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtered.map((product) => {
                  const stock = getStockStatus(product.quantity, product.reorderPoint);
                  const margin = calcMargin(product.retailPrice, product.costPrice);
                  const isAdjusting = adjustingId === product.id;

                  return (
                    <tr key={product.id} className="hover:bg-surface-800/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-body text-sm font-medium text-surface-100">{product.name}</p>
                          <p className="font-body text-xs text-surface-400">{product.brand}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-surface-300">{product.sku}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-body text-sm text-surface-300">
                          {product.category?.icon} {product.category?.name}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-surface-100">{product.quantity}</span>
                          <span className={cn("px-2 py-0.5 rounded-lg text-xs font-display font-semibold", statusColors[stock.color])}>
                            {stock.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono text-sm text-surface-300">{formatCurrency(product.costPrice)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono text-sm text-surface-100">{formatCurrency(product.retailPrice)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={cn("font-mono text-sm", margin >= 40 ? "text-success" : margin >= 20 ? "text-brand" : "text-danger")}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-body text-sm text-surface-300">{product.supplier?.name || "—"}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {isAdjusting ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={adjustType}
                              onChange={(e) => setAdjustType(e.target.value as "add" | "remove" | "set")}
                              className="bg-surface-800 border border-surface-600 rounded-lg px-2 py-1.5 font-body text-xs text-surface-100 focus:outline-none"
                            >
                              <option value="add">Add</option>
                              <option value="remove">Remove</option>
                              <option value="set">Set</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              value={adjustQty}
                              onChange={(e) => setAdjustQty(e.target.value)}
                              placeholder="Qty"
                              className="w-16 bg-surface-800 border border-surface-600 rounded-lg px-2 py-1.5 font-mono text-xs text-surface-100 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={adjustReason}
                              onChange={(e) => setAdjustReason(e.target.value)}
                              placeholder="Reason"
                              className="w-24 bg-surface-800 border border-surface-600 rounded-lg px-2 py-1.5 font-body text-xs text-surface-100 focus:outline-none"
                            />
                            <button
                              onClick={() => handleAdjustSubmit(product.id)}
                              disabled={stockAdjust.isPending}
                              className="px-3 py-1.5 rounded-lg bg-brand text-surface-950 font-display text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                            >
                              {stockAdjust.isPending ? "..." : "Save"}
                            </button>
                            <button
                              onClick={() => setAdjustingId(null)}
                              className="px-2 py-1.5 rounded-lg text-surface-400 hover:text-surface-100 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAdjustingId(product.id);
                              setAdjustQty("");
                              setAdjustReason("");
                              setAdjustType("add");
                            }}
                            className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-600 text-surface-300 font-display text-xs font-semibold hover:border-brand hover:text-brand transition-colors"
                          >
                            Adjust
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {filtered.map((product) => {
              const stock = getStockStatus(product.quantity, product.reorderPoint);
              const margin = calcMargin(product.retailPrice, product.costPrice);
              const isAdjusting = adjustingId === product.id;

              return (
                <div key={product.id} className="bg-surface-900 border border-surface-600 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-body text-sm font-medium text-surface-100">{product.name}</p>
                      <p className="font-body text-xs text-surface-400">{product.brand}</p>
                      <p className="font-mono text-xs text-surface-400 mt-0.5">{product.sku}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-lg text-xs font-display font-semibold shrink-0", statusColors[stock.color])}>
                      {stock.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-surface-400">Category</span>
                      <span className="font-body text-xs text-surface-300">{product.category?.icon} {product.category?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-surface-400">Stock</span>
                      <span className="font-mono text-xs text-surface-100">{product.quantity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-surface-400">Cost</span>
                      <span className="font-mono text-xs text-surface-300">{formatCurrency(product.costPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-surface-400">Retail</span>
                      <span className="font-mono text-xs text-surface-100">{formatCurrency(product.retailPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-surface-400">Margin</span>
                      <span className={cn("font-mono text-xs", margin >= 40 ? "text-success" : margin >= 20 ? "text-brand" : "text-danger")}>
                        {margin.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-surface-400">Supplier</span>
                      <span className="font-body text-xs text-surface-300">{product.supplier?.name || "—"}</span>
                    </div>
                  </div>

                  {isAdjusting ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <select
                          value={adjustType}
                          onChange={(e) => setAdjustType(e.target.value as "add" | "remove" | "set")}
                          className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 font-body text-xs text-surface-100 focus:outline-none"
                        >
                          <option value="add">Add</option>
                          <option value="remove">Remove</option>
                          <option value="set">Set</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          value={adjustQty}
                          onChange={(e) => setAdjustQty(e.target.value)}
                          placeholder="Qty"
                          className="w-20 bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 font-mono text-xs text-surface-100 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="Reason"
                          className="flex-1 bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 font-body text-xs text-surface-100 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAdjustSubmit(product.id)}
                          disabled={stockAdjust.isPending}
                          className="flex-1 px-3 py-2 rounded-xl bg-brand text-surface-950 font-display text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                        >
                          {stockAdjust.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setAdjustingId(null)}
                          className="px-3 py-2 rounded-xl bg-surface-800 border border-surface-600 text-surface-300 font-display text-xs font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAdjustingId(product.id);
                        setAdjustQty("");
                        setAdjustReason("");
                        setAdjustType("add");
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-600 text-surface-300 font-display text-xs font-semibold hover:border-brand hover:text-brand transition-colors"
                    >
                      Adjust Stock
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
