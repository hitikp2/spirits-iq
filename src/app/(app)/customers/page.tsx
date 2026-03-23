"use client";

import { useState } from "react";
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

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (tier) params.tier = tier;
  params.page = String(page);
  params.limit = "25";

  const { data, isLoading, error } = useCustomers(storeId, params);

  const customers = Array.isArray(data) ? data : [];
  const meta = (data as any)?.meta ?? null;

  return (
    <div className="space-y-6">
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

      {/* Customer List */}
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
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-surface-900 border border-surface-600 hover:border-surface-400 transition-colors"
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
  );
}
