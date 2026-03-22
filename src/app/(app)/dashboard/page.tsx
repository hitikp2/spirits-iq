"use client";

import { useDashboard } from "@/hooks/useApi";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, Receipt,
  ShoppingCart, Smartphone, Brain, ArrowRight,
} from "lucide-react";

// Placeholder storeId — in production this comes from session
const STORE_ID = "demo-store";

export default function DashboardPage() {
  const { data, isLoading } = useDashboard(STORE_ID);

  const statCards = [
    {
      label: "Today's Revenue",
      value: data ? formatCurrency(data.stats.todayRevenue) : "$—",
      change: data ? formatPercent(data.stats.revenueChange) : "",
      up: data ? data.stats.revenueChange >= 0 : true,
      icon: DollarSign,
    },
    {
      label: "Transactions",
      value: data ? String(data.stats.todayTransactions) : "—",
      change: data ? formatPercent(data.stats.transactionChange) : "",
      up: data ? data.stats.transactionChange >= 0 : true,
      icon: Receipt,
    },
    {
      label: "Avg Basket",
      value: data ? formatCurrency(data.stats.avgBasketSize) : "$—",
      change: data ? formatPercent(data.stats.basketChange) : "",
      up: data ? data.stats.basketChange >= 0 : true,
      icon: ShoppingCart,
    },
    {
      label: "SMS Subscribers",
      value: data ? data.stats.activeSmsSubscribers.toLocaleString() : "—",
      change: data ? `+${data.stats.subscriberChange}` : "",
      up: true,
      icon: Smartphone,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="bg-surface-800 border border-surface-600 rounded-2xl p-5 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/5 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="font-body text-xs uppercase tracking-wider text-surface-300">
                  {stat.label}
                </span>
                <Icon size={18} className="text-surface-400" />
              </div>
              <div className="font-display text-3xl font-bold text-surface-100 mb-2">
                {isLoading ? (
                  <div className="h-9 w-24 rounded-lg bg-surface-700 animate-pulse" />
                ) : (
                  stat.value
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {stat.up ? (
                  <TrendingUp size={14} className="text-success" />
                ) : (
                  <TrendingDown size={14} className="text-danger" />
                )}
                <span
                  className={`font-mono text-xs ${stat.up ? "text-success" : "text-danger"}`}
                >
                  {stat.change}
                </span>
                <span className="font-mono text-[10px] text-surface-400 ml-1">
                  vs yesterday
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue Chart + Top Sellers Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-3 bg-surface-800 border border-surface-600 rounded-2xl p-6">
          <h3 className="font-display text-lg font-bold text-surface-100 mb-5">
            Weekly Revenue
          </h3>
          {isLoading ? (
            <div className="h-40 rounded-xl bg-surface-700 animate-pulse" />
          ) : (
            <div className="flex items-end gap-2 h-40">
              {(data?.revenue || []).map((d: any, i: number) => {
                const maxRev = Math.max(...(data?.revenue || []).map((r: any) => r.revenue));
                const pct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <span className="font-mono text-[10px] text-brand mb-1.5">
                      {formatCurrency(d.revenue).replace(".00", "")}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-brand/20 to-brand min-h-[4px] transition-all duration-500"
                      style={{ height: `${pct}%` }}
                    />
                    <span className="font-mono text-[10px] text-surface-400 mt-2">
                      {new Date(d.date).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Sellers */}
        <div className="lg:col-span-2 bg-surface-800 border border-surface-600 rounded-2xl p-6">
          <h3 className="font-display text-lg font-bold text-surface-100 mb-4">
            Top Sellers Today
          </h3>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-surface-700 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {(data?.topSellers || []).map((item: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 border-b border-surface-600/30 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs text-surface-400 w-5 text-center">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-body text-sm text-surface-100">
                        {item.productName}
                      </div>
                      <div className="font-mono text-[10px] text-surface-400">
                        {item.category} · {item.quantitySold} sold
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm text-brand font-semibold">
                      {formatCurrency(item.revenue)}
                    </span>
                    {item.trend === "hot" && (
                      <span className="ml-1.5 text-xs">🔥</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Pulse Section */}
      <div className="bg-gradient-to-r from-brand/10 to-surface-900 border border-brand/15 rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Brain size={20} className="text-brand" />
          <h3 className="font-display text-lg font-bold text-surface-100">
            AI Pulse
          </h3>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-success/15 text-success">
            3 new insights
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: "📊", title: "Weekend Forecast", text: "Predicted 38% revenue increase Saturday" },
            { icon: "💡", title: "Margin Opportunity", text: "Clase Azul priced $12 below local avg" },
            { icon: "📈", title: "Trending Now", text: "Japanese whisky searches up 340% in area" },
          ].map((ins, i) => (
            <div
              key={i}
              className="bg-surface-800/60 border border-surface-600 rounded-xl p-4 hover:border-brand/20 transition-colors"
            >
              <div className="text-lg mb-2">{ins.icon}</div>
              <div className="font-body text-sm font-semibold text-surface-100 mb-1">
                {ins.title}
              </div>
              <div className="font-body text-xs text-surface-300 leading-relaxed">
                {ins.text}
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 flex items-center gap-2 text-brand font-body text-sm font-semibold hover:gap-3 transition-all">
          View all insights <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
