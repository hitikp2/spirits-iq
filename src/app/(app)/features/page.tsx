"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Category = "all" | "core" | "ai" | "comms" | "analytics" | "system";

const CATEGORIES: { label: string; value: Category }[] = [
  { label: "All", value: "all" },
  { label: "Core", value: "core" },
  { label: "AI Powered", value: "ai" },
  { label: "Communication", value: "comms" },
  { label: "Analytics", value: "analytics" },
  { label: "System Map", value: "system" },
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
          {category === "system" ? "System Architecture" : "App Features"}
        </h1>
        <p className="font-body text-sm text-surface-400 mt-1">
          {category === "system"
            ? "Visual map of how every component connects"
            : "Everything Spirits IQ can do for your store"}
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

      {category === "system" ? (
        <SystemMap />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}

// ─── System Architecture Map ──────────────────────────────
const ARCH_LAYERS = [
  {
    label: "Frontend",
    color: "brand",
    items: ["Dashboard", "POS", "Inventory", "SMS", "AI Insights", "Settings"],
    tech: "Next.js 14 App Router + React Query + Tailwind CSS",
  },
  {
    label: "Middleware",
    color: "purple-400",
    items: ["JWT Auth Guard", "Role-Based Access", "Header Injection (x-store-id, x-user-id, x-user-role)"],
    tech: "next-auth/jwt + NextResponse headers",
  },
  {
    label: "API Layer",
    color: "cyan-400",
    items: ["26 API Routes", "All force-dynamic", "Header + query param storeId"],
    tech: "Next.js Route Handlers → 17 Service Modules",
  },
  {
    label: "Data Layer",
    color: "emerald-400",
    items: ["PostgreSQL (Supabase)", "Prisma ORM (50+ models)", "Redis Cache (optional)"],
    tech: "PgBouncer :6543 (pooled) + Direct :5432 (migrations)",
  },
];

const DATA_FLOWS = [
  {
    title: "POS Sale",
    steps: [
      { label: "POS Page", sub: "useSession() → storeId" },
      { label: "useProcessSale()", sub: "React Query mutation" },
      { label: "POST /api/pos", sub: "resolve register from DB" },
      { label: "completeTransaction()", sub: "create txn + decrement stock" },
      { label: "PostgreSQL", sub: "Transaction + Items + InventoryLog" },
    ],
    color: "emerald",
  },
  {
    title: "SMS Auto-Reply",
    steps: [
      { label: "Customer SMS", sub: "inbound to Twilio number" },
      { label: "Twilio Webhook", sub: "POST /api/webhooks?provider=twilio" },
      { label: "handleInboundSms()", sub: "find/create customer + log" },
      { label: "generateSmsResponse()", sub: "RAG: customer + inventory context" },
      { label: "Gemini AI → Twilio", sub: "AI reply sent back (≤320 chars)" },
    ],
    color: "cyan",
  },
  {
    title: "AI Insights",
    steps: [
      { label: "Insights Page", sub: "or CRON /api/cron job" },
      { label: "POST /api/ai", sub: "action: generate" },
      { label: "generateInsights()", sub: "30-day sales + stock + velocity" },
      { label: "Gemini AI", sub: "returns JSON array of insights" },
      { label: "db.aiInsight.create()", sub: "saved with 7-day expiry" },
    ],
    color: "violet",
  },
  {
    title: "Auth Flow",
    steps: [
      { label: "Login Page", sub: "email/password or PIN" },
      { label: "NextAuth", sub: "credentials or pin provider" },
      { label: "JWT Token", sub: "id, role, storeId, storeName" },
      { label: "Middleware", sub: "injects x-store-id header" },
      { label: "API Routes", sub: "read trusted headers" },
    ],
    color: "amber",
  },
];

const EXTERNAL_SERVICES = [
  {
    name: "Google Gemini",
    icon: "🧠",
    status: "required" as const,
    env: "GEMINI_API_KEY",
    model: "gemini-2.5-flash-lite",
    consumers: ["SMS Auto-Reply", "Business Insights", "Upsell Engine", "AI Reorder", "Reports", "Scheduling", "Pricing", "Marketing", "Wine Club", "Accounting"],
    color: "purple",
  },
  {
    name: "Stripe",
    icon: "💳",
    status: "optional" as const,
    env: "STRIPE_SECRET_KEY",
    model: "Payment Intents API",
    consumers: ["Card Payments", "Refunds", "Webhook (payment_intent.succeeded, charge.refunded)"],
    color: "blue",
  },
  {
    name: "Twilio",
    icon: "💬",
    status: "optional" as const,
    env: "TWILIO_ACCOUNT_SID",
    model: "Messages API",
    consumers: ["Send SMS", "Receive SMS (webhook)", "Broadcast Campaigns"],
    color: "cyan",
  },
  {
    name: "Redis",
    icon: "⚡",
    status: "optional" as const,
    env: "REDIS_URL",
    model: "ioredis (lazy proxy)",
    consumers: ["Dashboard Cache", "POS Cart Sync", "Inventory Cache"],
    color: "rose",
  },
];

const AUDIT_ITEMS = [
  { area: "Pages → useSession()", checked: 6, total: 6, status: "pass" as const },
  { area: "API Routes → x-store-id header", checked: 19, total: 19, status: "pass" as const },
  { area: "Middleware header injection", checked: 3, total: 3, status: "pass" as const },
  { area: "Prisma field-to-field bugs fixed", checked: 5, total: 5, status: "pass" as const },
  { area: "Register ID resolved from DB", checked: 1, total: 1, status: "pass" as const },
  { area: "Stripe graceful fallback", checked: 1, total: 1, status: "pass" as const },
  { area: "Redis no-op when unset", checked: 1, total: 1, status: "pass" as const },
  { area: "Demo-store references removed", checked: 8, total: 8, status: "pass" as const },
];

function SystemMap() {
  const [activeFlow, setActiveFlow] = useState<number | null>(null);
  const [activeService, setActiveService] = useState<number | null>(null);

  return (
    <div className="space-y-8">
      {/* ── Section 1: Architecture Layers ── */}
      <div>
        <h2 className="font-display text-xl font-bold text-surface-100 mb-1">Architecture Layers</h2>
        <p className="font-body text-sm text-surface-400 mb-4">How every request flows from browser to database</p>
        <div className="space-y-3">
          {ARCH_LAYERS.map((layer, i) => (
            <div key={layer.label} className="relative">
              {i < ARCH_LAYERS.length - 1 && (
                <div className="absolute left-6 top-full w-0.5 h-3 bg-surface-600 z-10" />
              )}
              <div className="bg-surface-900 border border-surface-600 rounded-2xl p-4 hover:border-surface-400 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-display text-sm font-bold text-surface-950 shrink-0",
                    layer.color === "brand" && "bg-brand",
                    layer.color === "purple-400" && "bg-purple-400",
                    layer.color === "cyan-400" && "bg-cyan-400",
                    layer.color === "emerald-400" && "bg-emerald-400",
                  )}>
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-surface-100">{layer.label}</h3>
                    <p className="font-mono text-[11px] text-surface-400">{layer.tech}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 ml-[52px]">
                  {layer.items.map((item) => (
                    <span key={item} className="px-2.5 py-1 bg-surface-800 border border-surface-600 rounded-lg font-body text-xs text-surface-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Data Flows ── */}
      <div>
        <h2 className="font-display text-xl font-bold text-surface-100 mb-1">Data Flows</h2>
        <p className="font-body text-sm text-surface-400 mb-4">Tap a flow to see the full request chain</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {DATA_FLOWS.map((flow, i) => (
            <button
              key={flow.title}
              onClick={() => setActiveFlow(activeFlow === i ? null : i)}
              className={cn(
                "px-3 py-2.5 rounded-xl font-display text-sm font-semibold transition-all text-left",
                activeFlow === i
                  ? cn(
                      "text-surface-950",
                      flow.color === "emerald" && "bg-emerald-400",
                      flow.color === "cyan" && "bg-cyan-400",
                      flow.color === "violet" && "bg-violet-400",
                      flow.color === "amber" && "bg-amber-400",
                    )
                  : "bg-surface-900 border border-surface-600 text-surface-300 hover:border-surface-400"
              )}
            >
              {flow.title}
            </button>
          ))}
        </div>

        {activeFlow !== null && (
          <div className="bg-surface-900 border border-surface-600 rounded-2xl p-5 space-y-0">
            <h3 className={cn(
              "font-display text-lg font-bold mb-4",
              DATA_FLOWS[activeFlow].color === "emerald" && "text-emerald-400",
              DATA_FLOWS[activeFlow].color === "cyan" && "text-cyan-400",
              DATA_FLOWS[activeFlow].color === "violet" && "text-violet-400",
              DATA_FLOWS[activeFlow].color === "amber" && "text-amber-400",
            )}>
              {DATA_FLOWS[activeFlow].title}
            </h3>
            {DATA_FLOWS[activeFlow].steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold text-surface-950",
                    DATA_FLOWS[activeFlow].color === "emerald" && "bg-emerald-400",
                    DATA_FLOWS[activeFlow].color === "cyan" && "bg-cyan-400",
                    DATA_FLOWS[activeFlow].color === "violet" && "bg-violet-400",
                    DATA_FLOWS[activeFlow].color === "amber" && "bg-amber-400",
                  )}>
                    {i + 1}
                  </div>
                  {i < DATA_FLOWS[activeFlow].steps.length - 1 && (
                    <div className="w-0.5 h-8 bg-surface-600" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="font-display text-sm font-semibold text-surface-100">{step.label}</p>
                  <p className="font-body text-xs text-surface-400">{step.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: External Services ── */}
      <div>
        <h2 className="font-display text-xl font-bold text-surface-100 mb-1">External Services</h2>
        <p className="font-body text-sm text-surface-400 mb-4">Third-party integrations and their connection points</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXTERNAL_SERVICES.map((svc, i) => {
            const isOpen = activeService === i;
            return (
              <div
                key={svc.name}
                className={cn(
                  "bg-surface-900 border rounded-2xl overflow-hidden transition-colors",
                  isOpen ? "border-surface-400" : "border-surface-600"
                )}
              >
                <button
                  onClick={() => setActiveService(isOpen ? null : i)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{svc.icon}</span>
                      <div>
                        <h3 className="font-display text-sm font-bold text-surface-100">{svc.name}</h3>
                        <p className="font-mono text-[11px] text-surface-400">{svc.model}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase",
                      svc.status === "required"
                        ? "bg-brand/20 text-brand"
                        : "bg-surface-600/50 text-surface-300"
                    )}>
                      {svc.status}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-surface-600 pt-3">
                    <p className="font-mono text-xs text-surface-400 mb-2">
                      env: <span className="text-surface-300">{svc.env}</span>
                    </p>
                    <p className="font-display text-xs font-semibold text-surface-200 mb-1.5">
                      Connected to {svc.consumers.length} features:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {svc.consumers.map((c) => (
                        <span key={c} className="px-2 py-0.5 bg-surface-800 border border-surface-600 rounded text-[11px] font-body text-surface-300">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 4: Accuracy Audit ── */}
      <div>
        <h2 className="font-display text-xl font-bold text-surface-100 mb-1">Accuracy Audit</h2>
        <p className="font-body text-sm text-surface-400 mb-4">Verification that every connection is wired correctly</p>
        <div className="bg-surface-900 border border-surface-600 rounded-2xl overflow-hidden">
          {AUDIT_ITEMS.map((item, i) => (
            <div
              key={item.area}
              className={cn(
                "flex items-center justify-between px-4 py-3",
                i < AUDIT_ITEMS.length - 1 && "border-b border-surface-800"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-body text-sm text-surface-200">{item.area}</span>
              </div>
              <span className="font-mono text-xs text-success">
                {item.checked}/{item.total}
              </span>
            </div>
          ))}
          <div className="px-4 py-3 bg-success/5 border-t border-success/20">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-success">All Systems Verified</span>
              <span className="font-mono text-xs text-success">
                {AUDIT_ITEMS.reduce((s, i) => s + i.checked, 0)}/{AUDIT_ITEMS.reduce((s, i) => s + i.total, 0)} checks passed
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
