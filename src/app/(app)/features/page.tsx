"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Category = "all" | "core" | "ai" | "comms" | "analytics";

const CATEGORIES: { label: string; value: Category }[] = [
  { label: "All", value: "all" },
  { label: "Core", value: "core" },
  { label: "AI Powered", value: "ai" },
  { label: "Communication", value: "comms" },
  { label: "Analytics", value: "analytics" },
];

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: Category;
  status: "active" | "coming-soon";
  details: string[];
  gradient: string;
}

const FEATURES: Feature[] = [
  {
    id: "pos",
    title: "Point of Sale",
    description: "Lightning-fast checkout with product grid, cart management, and multiple payment methods.",
    icon: "💳",
    category: "core",
    status: "active",
    details: [
      "Product grid with category filtering and search",
      "Cart with quantity controls and real-time totals",
      "Cash and card payment processing",
      "Age verification for restricted items",
      "AI-powered upsell suggestions at checkout",
      "Customer loyalty lookup by phone number",
      "Automatic inventory deduction on sale",
      "Tax calculation (configurable per store)",
    ],
    gradient: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    id: "inventory",
    title: "Inventory Management",
    description: "Track stock levels, get low-stock alerts, and let AI generate purchase orders.",
    icon: "📦",
    category: "core",
    status: "active",
    details: [
      "Real-time stock levels with status indicators",
      "Add, edit, and deactivate products",
      "Stock adjustment with audit trail",
      "Low stock and out-of-stock alerts",
      "Filter by status, category, and search",
      "Margin calculation and supplier tracking",
      "Mobile-friendly card layout",
      "Bulk product import via API",
    ],
    gradient: "from-blue-500/20 to-blue-500/5",
  },
  {
    id: "ai-reorder",
    title: "AI Smart Reorder",
    description: "AI analyzes sales velocity and stock levels to generate optimized purchase orders.",
    icon: "🤖",
    category: "ai",
    status: "active",
    details: [
      "Analyzes 30-day sales velocity per product",
      "Factors in current stock vs. reorder points",
      "Generates purchase orders by supplier",
      "Confidence scoring for each recommendation",
      "One-click approval and order generation",
      "Powered by Google Gemini AI",
    ],
    gradient: "from-purple-500/20 to-purple-500/5",
  },
  {
    id: "ai-insights",
    title: "AI Business Insights",
    description: "Get actionable intelligence about trends, pricing opportunities, and demand forecasts.",
    icon: "🧠",
    category: "ai",
    status: "active",
    details: [
      "Demand forecasting from historical data",
      "Pricing optimization recommendations",
      "Trend detection and seasonal patterns",
      "Priority-ranked actionable insights",
      "Confidence scoring for each insight",
      "Apply or dismiss with one click",
      "Auto-generated on schedule via cron",
    ],
    gradient: "from-violet-500/20 to-violet-500/5",
  },
  {
    id: "sms",
    title: "SMS Conversations",
    description: "Two-way SMS with customers via Twilio. AI auto-replies handle common questions.",
    icon: "💬",
    category: "comms",
    status: "active",
    details: [
      "Two-way SMS via Twilio integration",
      "Conversation view with message history",
      "AI auto-reply using customer context + inventory",
      "Opt-in/opt-out compliance (STOP/START)",
      "Customer tier badges (VIP, Gold, Silver)",
      "Unread message indicators",
      "Mobile-optimized chat interface",
    ],
    gradient: "from-cyan-500/20 to-cyan-500/5",
  },
  {
    id: "sms-campaigns",
    title: "SMS Campaigns",
    description: "Broadcast promotions to targeted customer segments with delivery tracking.",
    icon: "📢",
    category: "comms",
    status: "active",
    details: [
      "Create broadcast campaigns with templates",
      "Target by customer tier or tags",
      "Schedule campaigns for future delivery",
      "Delivery tracking and success metrics",
      "Rate-limited sending (Twilio compliant)",
      "Campaign history and analytics",
    ],
    gradient: "from-orange-500/20 to-orange-500/5",
  },
  {
    id: "dashboard",
    title: "Analytics Dashboard",
    description: "Real-time revenue, transaction counts, top sellers, and trend indicators.",
    icon: "📊",
    category: "analytics",
    status: "active",
    details: [
      "Today's revenue with day-over-day change",
      "Transaction count and average basket size",
      "Weekly revenue bar chart",
      "Top sellers with quantity and revenue",
      "SMS subscriber count tracking",
      "AI Pulse section with latest insights",
      "Auto-refreshes every 60 seconds",
    ],
    gradient: "from-amber-500/20 to-amber-500/5",
  },
  {
    id: "customers",
    title: "Customer Management",
    description: "Track customer profiles, purchase history, loyalty tiers, and lifetime value.",
    icon: "👥",
    category: "core",
    status: "active",
    details: [
      "Customer profiles with contact info",
      "Purchase history and total spend",
      "Loyalty tiers: Regular, Bronze, Silver, Gold, VIP",
      "Tag-based segmentation",
      "Phone lookup at POS for quick linking",
      "SMS opt-in tracking and compliance",
      "Visit count and last visit date",
    ],
    gradient: "from-pink-500/20 to-pink-500/5",
  },
  {
    id: "ai-upsell",
    title: "AI Upsell Engine",
    description: "Intelligent product recommendations at checkout based on cart contents and purchase history.",
    icon: "✨",
    category: "ai",
    status: "active",
    details: [
      "Analyzes current cart for pairing opportunities",
      "Uses customer purchase history when available",
      "Shows reason for each suggestion",
      "One-tap add to cart from suggestion",
      "Powered by Google Gemini AI",
    ],
    gradient: "from-yellow-500/20 to-yellow-500/5",
  },
  {
    id: "employees",
    title: "Employee Management",
    description: "Manage team members, roles, PIN access, scheduling, and clock in/out.",
    icon: "🏷️",
    category: "core",
    status: "active",
    details: [
      "Role-based access: Owner, Manager, Cashier",
      "4-digit PIN for quick POS login",
      "Clock in/out tracking",
      "AI-assisted schedule generation",
      "Performance metrics per employee",
      "Time-off request management",
    ],
    gradient: "from-teal-500/20 to-teal-500/5",
  },
  {
    id: "ecommerce",
    title: "E-Commerce Storefront",
    description: "Online store for customers to browse products and place orders.",
    icon: "🛒",
    category: "core",
    status: "coming-soon",
    details: [
      "Configurable storefront with store branding",
      "Product catalog synced with inventory",
      "Online ordering and checkout",
      "Integration with delivery management",
    ],
    gradient: "from-indigo-500/20 to-indigo-500/5",
  },
  {
    id: "delivery",
    title: "Delivery Management",
    description: "Track and manage delivery orders from online storefront.",
    icon: "🚚",
    category: "core",
    status: "coming-soon",
    details: [
      "Order queue with status tracking",
      "Driver assignment and routing",
      "Customer notifications on delivery status",
      "Integration with e-commerce storefront",
    ],
    gradient: "from-rose-500/20 to-rose-500/5",
  },
];

export default function FeaturesPage() {
  const [category, setCategory] = useState<Category>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = FEATURES.filter(
    (f) => category === "all" || f.category === category
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-surface-100">
          App Features
        </h1>
        <p className="font-body text-sm text-surface-400 mt-1">
          Everything Spirits IQ can do for your store
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={cn(
              "px-4 py-2 rounded-xl font-body text-sm font-medium transition-colors whitespace-nowrap",
              category === cat.value
                ? "bg-brand text-surface-950"
                : "bg-surface-900 text-surface-300 hover:text-surface-100"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-900 border border-surface-600 rounded-xl p-4 text-center">
          <div className="font-display text-2xl font-bold text-brand">{FEATURES.filter((f) => f.status === "active").length}</div>
          <div className="font-body text-xs text-surface-400 mt-1">Active Features</div>
        </div>
        <div className="bg-surface-900 border border-surface-600 rounded-xl p-4 text-center">
          <div className="font-display text-2xl font-bold text-surface-300">{FEATURES.filter((f) => f.status === "coming-soon").length}</div>
          <div className="font-body text-xs text-surface-400 mt-1">Coming Soon</div>
        </div>
        <div className="bg-surface-900 border border-surface-600 rounded-xl p-4 text-center">
          <div className="font-display text-2xl font-bold text-purple-400">{FEATURES.filter((f) => f.category === "ai").length}</div>
          <div className="font-body text-xs text-surface-400 mt-1">AI Powered</div>
        </div>
        <div className="bg-surface-900 border border-surface-600 rounded-xl p-4 text-center">
          <div className="font-display text-2xl font-bold text-cyan-400">{FEATURES.filter((f) => f.category === "comms").length}</div>
          <div className="font-body text-xs text-surface-400 mt-1">Communication</div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((feature) => {
          const isExpanded = expandedId === feature.id;
          return (
            <div
              key={feature.id}
              className={cn(
                "bg-surface-900 border border-surface-600 rounded-2xl overflow-hidden transition-all duration-300 hover:border-surface-400",
                isExpanded && "md:col-span-2"
              )}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : feature.id)}
                className="w-full text-left"
              >
                <div className={cn("bg-gradient-to-r p-5", feature.gradient)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{feature.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-lg font-bold text-surface-100">
                            {feature.title}
                          </h3>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase",
                              feature.status === "active"
                                ? "bg-success/20 text-success"
                                : "bg-surface-600/50 text-surface-300"
                            )}
                          >
                            {feature.status === "active" ? "Live" : "Soon"}
                          </span>
                        </div>
                        <p className="font-body text-sm text-surface-300 mt-1">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                    <svg
                      className={cn(
                        "w-5 h-5 text-surface-400 transition-transform shrink-0 mt-1",
                        isExpanded && "rotate-180"
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="p-5 border-t border-surface-600">
                  <h4 className="font-display text-sm font-semibold text-surface-200 mb-3">
                    What&apos;s Included
                  </h4>
                  <div className={cn(
                    "grid gap-2",
                    feature.details.length > 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                  )}>
                    {feature.details.map((detail, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <svg
                          className="w-4 h-4 text-brand shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                        <span className="font-body text-sm text-surface-300">
                          {detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
