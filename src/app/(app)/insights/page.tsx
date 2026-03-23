"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useInsights, useGenerateInsights, useUpdateInsight } from "@/hooks/useApi";
import { cn, timeAgo } from "@/lib/utils";

type FilterTab = "all" | "new" | "applied" | "dismissed";

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Applied", value: "applied" },
  { label: "Dismissed", value: "dismissed" },
];

function TypeIcon({ type }: { type: string }) {
  if (type === "demand_forecast") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 4 4-6" />
      </svg>
    );
  }
  if (type === "pricing") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (type === "trend") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
      <path d="M9 21h6" />
      <path d="M10 24h4" />
    </svg>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const label = priority >= 8 ? "Critical" : priority >= 5 ? "Medium" : "Low";
  const color = priority >= 8 ? "text-danger" : priority >= 5 ? "text-brand" : "text-surface-300";
  return <span className={cn("font-mono text-xs font-semibold uppercase", color)}>{label}</span>;
}

interface Insight {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  priority: number;
  status: "new" | "viewed" | "applied" | "dismissed";
  data?: Record<string, unknown>;
  createdAt: string;
}

export default function Page() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const [filter, setFilter] = useState<FilterTab>("all");
  const { data, isLoading } = useInsights(storeId);
  const generateInsights = useGenerateInsights();
  const updateInsight = useUpdateInsight();

  const insights: Insight[] = (Array.isArray(data) ? data : []) as Insight[];

  const filtered = insights
    .filter((i) => filter === "all" || i.status === filter)
    .sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-surface-100">AI Insights</h1>
          <p className="font-body text-sm text-surface-400 mt-1">
            Actionable intelligence powered by AI analysis
          </p>
        </div>
        <button
          onClick={() => generateInsights.mutate(storeId)}
          disabled={generateInsights.isPending}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl font-body text-sm font-semibold transition-colors",
            generateInsights.isPending
              ? "bg-surface-800 text-surface-400 cursor-not-allowed"
              : "bg-brand text-surface-950 hover:opacity-90"
          )}
        >
          {generateInsights.isPending ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
              <path d="M9 21h6" />
            </svg>
          )}
          {generateInsights.isPending ? "Generating..." : "Generate Insights"}
        </button>
      </div>

      <div className="flex gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              "px-4 py-2 rounded-xl font-body text-sm font-medium transition-colors",
              filter === tab.value
                ? "bg-brand text-surface-950"
                : "bg-surface-800 text-surface-300 hover:text-surface-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-900 border border-surface-600 rounded-2xl p-6 animate-pulse">
              <div className="h-5 w-48 bg-surface-800 rounded mb-3" />
              <div className="h-4 w-full bg-surface-800 rounded mb-2" />
              <div className="h-4 w-2/3 bg-surface-800 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface-900 border border-surface-600 rounded-2xl">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 text-surface-400 mb-4">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            <path d="M9 21h6" />
            <path d="M10 24h4" />
          </svg>
          <h3 className="font-display text-lg font-semibold text-surface-100 mb-1">No insights yet</h3>
          <p className="font-body text-sm text-surface-400 mb-5">
            Generate AI-powered insights to discover opportunities
          </p>
          <button
            onClick={() => generateInsights.mutate(storeId)}
            disabled={generateInsights.isPending}
            className="px-5 py-2.5 rounded-xl bg-brand text-surface-950 font-body text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {generateInsights.isPending ? "Generating..." : "Generate Insights"}
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((insight) => (
            <div
              key={insight.id}
              className="bg-surface-900 border border-surface-600 rounded-2xl p-6 transition-colors hover:border-surface-400"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center text-brand">
                    <TypeIcon type={insight.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-display text-base font-semibold text-surface-100 truncate">
                        {insight.title}
                      </h3>
                      <PriorityBadge priority={insight.priority} />
                    </div>
                    <p className="font-body text-sm text-surface-300 mb-4">{insight.description}</p>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                        <span className="font-mono text-xs text-surface-400">Confidence</span>
                        <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              insight.confidence >= 0.8
                                ? "bg-green-500"
                                : insight.confidence >= 0.5
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            )}
                            style={{ width: `${Math.round(insight.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-surface-300">
                          {Math.round(insight.confidence * 100)}%
                        </span>
                      </div>
                      <span className="font-body text-xs text-surface-400">
                        {timeAgo(insight.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                {insight.status !== "applied" && insight.status !== "dismissed" && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() =>
                        updateInsight.mutate({ insightId: insight.id, status: "applied" })
                      }
                      disabled={updateInsight.isPending}
                      className="px-3 py-1.5 rounded-xl bg-surface-800 text-success font-body text-xs font-medium hover:bg-surface-700 transition-colors disabled:opacity-50"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() =>
                        updateInsight.mutate({ insightId: insight.id, status: "dismissed" })
                      }
                      disabled={updateInsight.isPending}
                      className="px-3 py-1.5 rounded-xl bg-surface-800 text-danger font-body text-xs font-medium hover:bg-surface-700 transition-colors disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
