"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { cn, formatCurrency } from "@/lib/utils";
import { useReportDashboard, useReportDaily, useGenerateMonthlyReport } from "@/hooks/useApi";

type Tab = "overview" | "daily" | "monthly";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-800", className)} />;
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState(30);

  const { data: dashboard, isLoading: dashLoading, error: dashError } = useReportDashboard(storeId, days);
  const { data: dailyData, isLoading: dailyLoading } = useReportDaily(storeId, 14);
  const generateMonthly = useGenerateMonthlyReport();

  const daily = Array.isArray(dailyData) ? dailyData : [];

  const handleGenerateMonthly = () => {
    const now = new Date();
    generateMonthly.mutate({
      storeId,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-surface-100">Reports</h1>
          <p className="font-body text-sm text-surface-400 mt-1">Business performance and analytics</p>
        </div>
        <button
          onClick={handleGenerateMonthly}
          disabled={generateMonthly.isPending}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-medium bg-brand text-surface-950 hover:bg-brand/90 transition-colors disabled:opacity-50 self-start"
        >
          {generateMonthly.isPending ? "Generating..." : "Generate Monthly Report"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-600 pb-px overflow-x-auto scrollbar-hide">
        {([
          { key: "overview", label: "Overview" },
          { key: "daily", label: "Daily Snapshots" },
          { key: "monthly", label: "Monthly" },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 font-body text-sm font-medium rounded-xl transition-colors whitespace-nowrap",
              tab === t.key
                ? "bg-surface-800 text-brand"
                : "text-surface-400 hover:text-surface-100 hover:bg-surface-900"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Period Selector */}
      {tab === "overview" && (
        <div className="flex gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1.5 rounded-lg font-mono text-xs transition-colors",
                days === d
                  ? "bg-brand/20 text-brand"
                  : "bg-surface-900 text-surface-400 hover:text-surface-100"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      )}

      {/* Overview Tab */}
      {tab === "overview" && (
        <div>
          {dashLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-4 rounded-2xl bg-surface-900">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : dashError ? (
            <div className="flex items-center justify-center py-16">
              <p className="font-body text-sm text-surface-400">Failed to load report data. Please try again.</p>
            </div>
          ) : dashboard ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Revenue" value={formatCurrency(Number(dashboard.revenue ?? 0))} />
                <StatCard label="Transactions" value={String(dashboard.transactionCount ?? 0)} />
                <StatCard label="Avg Basket" value={formatCurrency(Number(dashboard.avgBasket ?? 0))} />
                <StatCard label="Unique Customers" value={String(dashboard.uniqueCustomers ?? 0)} />
                <StatCard label="Items Sold" value={String(dashboard.itemsSold ?? 0)} />
                <StatCard label="New Customers" value={String(dashboard.newCustomers ?? 0)} />
                <StatCard label="Gross Margin" value={dashboard.grossMargin ? `${(Number(dashboard.grossMargin) * 100).toFixed(1)}%` : "—"} />
                <StatCard label="Top Category" value={dashboard.topCategory ?? "—"} />
              </div>

              {/* Top Products */}
              {dashboard.topProducts && dashboard.topProducts.length > 0 && (
                <div className="rounded-2xl bg-surface-900 border border-surface-600 p-5">
                  <h3 className="font-display text-lg font-semibold text-surface-100 mb-4">Top Products</h3>
                  <div className="space-y-3">
                    {dashboard.topProducts.slice(0, 10).map((p: any, i: number) => (
                      <div key={p.id || i} className="flex items-center justify-between py-2 border-b border-surface-800 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-surface-500 w-5">#{i + 1}</span>
                          <span className="font-body text-sm text-surface-200">{p.name || p.productName || "Unknown"}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-xs text-surface-400">{p.quantity || p.totalQty || 0} sold</span>
                          <span className="font-mono text-sm font-semibold text-surface-100">
                            {formatCurrency(Number(p.revenue || p.totalRevenue || 0))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <p className="font-body text-sm text-surface-400">No report data available</p>
            </div>
          )}
        </div>
      )}

      {/* Daily Snapshots Tab */}
      {tab === "daily" && (
        <div>
          {dailyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-surface-900">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                </div>
              ))}
            </div>
          ) : daily.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="font-body text-sm text-surface-400">No daily snapshots yet. Data generates automatically.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {daily.map((snap: any) => (
                <div
                  key={snap.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-surface-900 border border-surface-600"
                >
                  <div className="font-mono text-sm text-surface-200 sm:w-28 shrink-0">
                    {new Date(snap.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap flex-1">
                    <div>
                      <p className="font-mono text-sm font-semibold text-surface-100">{formatCurrency(Number(snap.revenue || 0))}</p>
                      <p className="font-mono text-[10px] text-surface-400">revenue</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm text-surface-200">{snap.transactionCount || 0}</p>
                      <p className="font-mono text-[10px] text-surface-400">txns</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm text-surface-200">{snap.itemsSold || 0}</p>
                      <p className="font-mono text-[10px] text-surface-400">items</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm text-surface-200">{formatCurrency(Number(snap.avgBasket || 0))}</p>
                      <p className="font-mono text-[10px] text-surface-400">avg basket</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly Tab */}
      {tab === "monthly" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand/5 border border-brand/20 p-4">
            <p className="font-body text-sm text-surface-300">
              <span className="font-semibold text-brand">AI-generated monthly reports</span>{" "}
              include revenue analysis, top sellers, customer trends, and executive summaries.
            </p>
          </div>
          {generateMonthly.isSuccess && (
            <div className="rounded-2xl bg-success/10 border border-success/20 p-4">
              <p className="font-body text-sm text-success">Monthly report generated successfully.</p>
            </div>
          )}
          {generateMonthly.isError && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="font-body text-sm text-red-400">Failed to generate report. Please try again.</p>
            </div>
          )}
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="font-body text-sm text-surface-400 mb-3">
                Generate a comprehensive monthly report with AI analysis
              </p>
              <button
                onClick={handleGenerateMonthly}
                disabled={generateMonthly.isPending}
                className="px-6 py-3 rounded-xl font-body text-sm font-medium bg-brand text-surface-950 hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {generateMonthly.isPending ? "Generating..." : "Generate This Month's Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-900 border border-surface-600 p-4">
      <p className="font-body text-xs text-surface-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-display text-xl font-bold text-surface-100">{value}</p>
    </div>
  );
}
