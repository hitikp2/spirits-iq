// ─── App Configuration Constants ─────────────────────────

export const APP_NAME = "SPIRITS IQ";
export const APP_DESCRIPTION = "AI-Powered Liquor Store Management Platform";

// ─── Tax & Pricing ───────────────────────────────────────
export const DEFAULT_TAX_RATE = 0.0975; // 9.75% California
export const CURRENCY = "USD";
export const LOCALE = "en-US";

// ─── Inventory Thresholds ────────────────────────────────
export const LOW_STOCK_MULTIPLIER = 1.0; // Alert when qty <= reorderPoint * this
export const CRITICAL_STOCK_THRESHOLD = 0; // Out of stock

// ─── AI Configuration ────────────────────────────────────
export const AI_MODEL = "claude-sonnet-4-20250514";
export const AI_MAX_SMS_TOKENS = 200;
export const AI_MAX_INSIGHT_TOKENS = 1500;
export const AI_INSIGHT_REFRESH_HOURS = 6;

// ─── SMS Configuration ───────────────────────────────────
export const SMS_MAX_LENGTH = 320;
export const SMS_OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "cancel", "quit", "end"];
export const SMS_OPT_IN_KEYWORDS = ["start", "subscribe", "join", "yes"];
export const SMS_RATE_LIMIT_MS = 1100; // 1 msg per second for long codes
export const SMS_BROADCAST_BATCH_SIZE = 50;

// ─── POS Configuration ──────────────────────────────────
export const POS_SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
export const POS_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
export const MIN_DRINKING_AGE = 21;

// ─── Cache TTLs (seconds) ────────────────────────────────
export const CACHE_TTL = {
  DASHBOARD_STATS: 60,       // 1 minute
  REVENUE_TIMELINE: 120,     // 2 minutes
  TOP_SELLERS: 120,          // 2 minutes
  INVENTORY_ALERTS: 120,     // 2 minutes
  PRODUCT_SEARCH: 300,       // 5 minutes
  CUSTOMER_PROFILE: 600,     // 10 minutes
  AI_INSIGHTS: 1800,         // 30 minutes
  ACTIVE_CART: 3600,         // 1 hour
} as const;

// ─── API Rate Limits ─────────────────────────────────────
export const RATE_LIMITS = {
  POS_TRANSACTION: { window: 60, max: 30 },   // 30 per minute
  SMS_SEND: { window: 60, max: 10 },           // 10 per minute
  AI_GENERATE: { window: 300, max: 5 },        // 5 per 5 min
  GENERAL_API: { window: 60, max: 100 },       // 100 per minute
} as const;

// ─── Pagination Defaults ─────────────────────────────────
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// ─── Customer Tiers ──────────────────────────────────────
export const CUSTOMER_TIERS = [
  { value: "REGULAR", label: "Regular", color: "#60A5FA", minSpend: 0 },
  { value: "PREFERRED", label: "Preferred", color: "#34D399", minSpend: 500 },
  { value: "VIP", label: "VIP", color: "#F5A623", minSpend: 2000 },
  { value: "WINE_CLUB", label: "Wine Club", color: "#A78BFA", minSpend: 0 },
  { value: "WHOLESALE", label: "Wholesale", color: "#F87171", minSpend: 0 },
] as const;

// ─── Product Categories (Default) ────────────────────────
export const DEFAULT_CATEGORIES = [
  { name: "Bourbon", icon: "🥃" },
  { name: "Tequila", icon: "🌵" },
  { name: "Scotch", icon: "🏴" },
  { name: "Vodka", icon: "🧊" },
  { name: "Gin", icon: "🫒" },
  { name: "Rum", icon: "🏝️" },
  { name: "Wine", icon: "🍷" },
  { name: "Champagne", icon: "🍾" },
  { name: "Beer", icon: "🍺" },
  { name: "Seltzer", icon: "🥤" },
  { name: "Mixers", icon: "🧃" },
  { name: "Accessories", icon: "🧊" },
] as const;

// ─── Insight Types ───────────────────────────────────────
export const INSIGHT_TYPES = {
  DEMAND_FORECAST: { label: "Demand Forecast", icon: "📊", color: "#60A5FA" },
  PRICING_SUGGESTION: { label: "Pricing", icon: "💡", color: "#F5A623" },
  REORDER_ALERT: { label: "Reorder", icon: "📦", color: "#F87171" },
  SHRINKAGE_ALERT: { label: "Shrinkage", icon: "⚠️", color: "#F87171" },
  TREND_DETECTION: { label: "Trend", icon: "📈", color: "#34D399" },
  CUSTOMER_INSIGHT: { label: "Customer", icon: "👤", color: "#A78BFA" },
  REVENUE_FORECAST: { label: "Revenue", icon: "💰", color: "#F5A623" },
  STAFFING_SUGGESTION: { label: "Staffing", icon: "👥", color: "#60A5FA" },
} as const;
