"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { cn, formatCurrency, formatPhone } from "@/lib/utils";
import { useCustomers } from "@/hooks/useApi";

const TIERS = [
  { value: "", label: "All Tiers" },
  { value: "VIP", label: "VIP" },
  { value: "WINE_CLUB", label: "Wine Club" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "PREFERRED", label: "Preferred" },
  { value: "REGULAR", label: "Regular" },
];

const TIER_COLORS: Record<string, string> = {
  VIP: "bg-brand/20 text-brand",
  WINE_CLUB: "bg-purple-500/20 text-purple-400",
  WHOLESALE: "bg-blue-500/20 text-blue-400",
  PREFERRED: "bg-emerald-500/20 text-emerald-400",
  REGULAR: "bg-surface-600/50 text-surface-300",
};

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-800", className)} />;
}

export default function CustomersPage() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (tier) params.tier = tier;
  params.page = String(page);
  params.limit = "25";

  const { data, isLoading, error } = useCustomers(storeId, params);

  const customers = Array.isArray(data) ? data : [];
  const meta = (data as any)?.meta ?? null;

  const openDetail = useCallback(async (customer: any) => {
    setSelectedCustomer(customer);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detail", id: customer.id }),
      });
      const json = await res.json();
      if (json.success) {
        setDetailData(json.data);
      }
    } catch {
      // Keep basic customer data from list
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedCustomer(null);
    setDetailData(null);
  }, []);

  return (
    <div className="flex flex-col h-full -my-4 -mx-4 sm:-my-0 sm:-mx-0">
      {/* Sticky header: title + search + filters */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 sm:px-0 sm:pt-0 bg-surface-950 space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-surface-100">Customers</h1>
          <p className="font-body text-sm text-surface-400 mt-1">
            {meta?.total ? `${meta.total} customers` : "Manage your customer database"}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-600 font-body text-sm text-surface-100 placeholder:text-surface-500 focus:border-brand focus:outline-none"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {TIERS.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setTier(t.value);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-2 rounded-xl font-body text-xs font-medium whitespace-nowrap transition-colors",
                  tier === t.value
                    ? "bg-brand text-surface-950"
                    : "bg-surface-900 text-surface-300 hover:text-surface-100 border border-surface-600"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable customer list */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-0 pb-4" style={{ WebkitOverflowScrolling: "touch" as any }}>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-surface-900">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-16">
          <p className="font-body text-sm text-surface-400">Failed to load customers. Please try again.</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <p className="font-body text-sm text-surface-400">
            {search || tier ? "No customers match your filters" : "No customers yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c: any) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(c)}
              className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-surface-900 border border-surface-600 hover:border-brand/50 active:scale-[0.99] transition-all cursor-pointer"
            >
              {/* Avatar */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-10 w-10 rounded-full bg-surface-800 flex items-center justify-center shrink-0">
                  <span className="font-display text-sm font-bold text-surface-300">
                    {((c.firstName || "?")[0] + (c.lastName || "")[0]).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-surface-100 truncate">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown"}
                  </p>
                  <p className="font-mono text-xs text-surface-400 truncate">
                    {c.phone ? formatPhone(c.phone) : "No phone"}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold text-surface-100">
                    {formatCurrency(Number(c.totalSpent || 0))}
                  </p>
                  <p className="font-mono text-[10px] text-surface-400">lifetime</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-surface-200">{c.visitCount || 0}</p>
                  <p className="font-mono text-[10px] text-surface-400">visits</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-surface-200">{c.loyaltyPoints || 0}</p>
                  <p className="font-mono text-[10px] text-surface-400">pts</p>
                </div>
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
                  TIER_COLORS[c.tier] ?? TIER_COLORS.REGULAR
                )}>
                  {(c.tier || "REGULAR").replace("_", " ")}
                </span>
                {c.smsOptedIn && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400">SMS</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total > meta.limit && (
        <div className="flex items-center justify-between pt-2">
          <p className="font-mono text-xs text-surface-400">
            Page {meta.page} of {Math.ceil(meta.total / meta.limit)}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg font-body text-xs font-medium bg-surface-900 border border-surface-600 text-surface-300 hover:text-surface-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!meta.hasMore}
              className="px-3 py-1.5 rounded-lg font-body text-xs font-medium bg-surface-900 border border-surface-600 text-surface-300 hover:text-surface-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          detail={detailData}
          loading={detailLoading}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

/* ──────────────── Customer Detail Modal ──────────────── */
function CustomerDetailModal({
  customer,
  detail,
  loading,
  onClose,
}: {
  customer: any;
  detail: any;
  loading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"purchases" | "points">("purchases");
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";
  const initials = ((customer.firstName || "?")[0] + (customer.lastName || "")[0]).toUpperCase();
  const transactions = detail?.transactions || [];
  const loyaltyTxns = detail?.loyaltyTxns || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[90vh] bg-surface-950 border border-surface-700 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-surface-700">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-surface-800 flex items-center justify-center">
                <span className="font-display text-base font-bold text-surface-200">{initials}</span>
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-surface-100">{name}</h2>
                <p className="font-mono text-xs text-surface-400">
                  {customer.phone ? formatPhone(customer.phone) : "No phone"}
                  {customer.email ? ` · ${customer.email}` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 text-surface-400 flex items-center justify-center text-sm active:scale-90 transition-transform"
            >
              ✕
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-4">
            <div>
              <p className="font-mono text-base font-bold text-brand">{formatCurrency(Number(customer.totalSpent || 0))}</p>
              <p className="font-mono text-[10px] text-surface-400">lifetime</p>
            </div>
            <div className="w-px h-8 bg-surface-700" />
            <div>
              <p className="font-mono text-base font-bold text-surface-100">{customer.visitCount || 0}</p>
              <p className="font-mono text-[10px] text-surface-400">visits</p>
            </div>
            <div className="w-px h-8 bg-surface-700" />
            <div>
              <p className="font-mono text-base font-bold text-surface-100">{customer.loyaltyPoints || 0}</p>
              <p className="font-mono text-[10px] text-surface-400">points</p>
            </div>
            <div className="w-px h-8 bg-surface-700" />
            <span className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium",
              TIER_COLORS[customer.tier] ?? TIER_COLORS.REGULAR
            )}>
              {(customer.tier || "REGULAR").replace("_", " ")}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setTab("purchases")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                tab === "purchases" ? "bg-brand/15 text-brand" : "text-surface-400 hover:text-surface-200"
              )}
            >
              Purchases ({transactions.length})
            </button>
            <button
              onClick={() => setTab("points")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                tab === "points" ? "bg-brand/15 text-brand" : "text-surface-400 hover:text-surface-200"
              )}
            >
              Points History ({loyaltyTxns.length})
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3" style={{ maxHeight: "50vh" }}>
          {loading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : tab === "purchases" ? (
            transactions.length === 0 ? (
              <p className="text-center font-body text-sm text-surface-400 py-8">No purchases yet</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((txn: any) => (
                  <TransactionCard key={txn.id} txn={txn} />
                ))}
              </div>
            )
          ) : (
            loyaltyTxns.length === 0 ? (
              <p className="text-center font-body text-sm text-surface-400 py-8">No points history</p>
            ) : (
              <div className="space-y-1.5">
                {loyaltyTxns.map((lt: any) => (
                  <div key={lt.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-surface-900 border border-surface-700/50">
                    <div>
                      <p className="font-body text-xs text-surface-200">{lt.description}</p>
                      <p className="font-mono text-[10px] text-surface-500 mt-0.5">
                        {new Date(lt.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-mono text-sm font-bold",
                        lt.points > 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {lt.points > 0 ? "+" : ""}{lt.points}
                      </p>
                      <p className="font-mono text-[10px] text-surface-500">bal: {lt.balance}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-700">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-200 text-sm font-semibold active:scale-[0.97] transition-transform"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Transaction Card ──────────────── */
function TransactionCard({ txn }: { txn: any }) {
  const [expanded, setExpanded] = useState(false);
  const items = txn.items || [];
  const date = new Date(txn.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const time = new Date(txn.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });

  return (
    <div className="rounded-xl bg-surface-900 border border-surface-700/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3.5 text-left active:bg-surface-800 transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-semibold text-surface-100">{txn.transactionNum}</p>
            <span className="font-mono text-[10px] text-surface-500">{date} {time}</span>
          </div>
          <p className="font-body text-[11px] text-surface-400 mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {txn.paymentMethod ? ` · ${txn.paymentMethod}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm font-bold text-brand">{formatCurrency(Number(txn.total))}</p>
          <span className={cn(
            "text-surface-500 text-xs transition-transform",
            expanded && "rotate-180"
          )}>
            ▾
          </span>
        </div>
      </button>

      {expanded && items.length > 0 && (
        <div className="px-3.5 pb-3 pt-0 border-t border-surface-700/50">
          <div className="space-y-1.5 mt-2.5">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="text-surface-300">
                  <span className="font-mono text-brand mr-1">{item.quantity}x</span>
                  {item.product?.name || "Product"}{item.product?.size ? ` (${item.product.size})` : ""}
                </span>
                <span className="font-mono text-surface-300">{formatCurrency(Number(item.total))}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2.5 pt-2 border-t border-surface-700/30">
            <span className="font-body text-[10px] text-surface-400">Subtotal</span>
            <span className="font-mono text-[10px] text-surface-400">{formatCurrency(Number(txn.subtotal))}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-body text-[10px] text-surface-400">Tax</span>
            <span className="font-mono text-[10px] text-surface-400">{formatCurrency(Number(txn.taxAmount))}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-body text-xs font-semibold text-surface-200">Total</span>
            <span className="font-mono text-xs font-bold text-brand">{formatCurrency(Number(txn.total))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
