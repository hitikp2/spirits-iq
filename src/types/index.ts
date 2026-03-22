// ─── SPIRITS IQ — Core Type Definitions ───────────────────

// ─── API Response Types ──────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// ─── Dashboard ───────────────────────────────────────────
export interface DashboardStats {
  todayRevenue: number;
  todayTransactions: number;
  avgBasketSize: number;
  activeSmsSubscribers: number;
  revenueChange: number;
  transactionChange: number;
  basketChange: number;
  subscriberChange: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  transactions: number;
  avgTicket: number;
}

export interface TopSeller {
  productId: string;
  productName: string;
  category: string;
  quantitySold: number;
  revenue: number;
  trend: "hot" | "rising" | "stable" | "declining";
}

// ─── POS ─────────────────────────────────────────────────
export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  discount: number;
  imageUrl?: string;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  customerId?: string;
  customerName?: string;
}

export interface AiUpsellSuggestion {
  productId: string;
  productName: string;
  price: number;
  reason: string;
  attachRate: number; // Percentage
}

export interface AgeVerificationResult {
  verified: boolean;
  method: "id_scan" | "manual";
  dateOfBirth?: string;
  age?: number;
  documentType?: string;
  documentId?: string;
  scannedAt: string;
}

// ─── Inventory ───────────────────────────────────────────
export interface InventoryAlert {
  productId: string;
  productName: string;
  status: "out" | "low" | "overstocked";
  currentQty: number;
  reorderPoint: number;
  aiAction: string;
  aiConfidence: number;
}

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  currentQty: number;
  suggestedQty: number;
  supplierId: string;
  supplierName: string;
  estimatedCost: number;
  urgency: "critical" | "soon" | "routine";
  reasoning: string;
}

// ─── SMS / CRM ───────────────────────────────────────────
export interface Conversation {
  customerId: string;
  customerName: string;
  phone: string;
  tier: string;
  tags: string[];
  unreadCount: number;
  lastMessage: string;
  lastMessageAt: string;
  messages: Message[];
}

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  aiGenerated: boolean;
  status: string;
  createdAt: string;
}

export interface BroadcastCampaign {
  id?: string;
  name: string;
  message: string;
  targetTier?: string;
  targetTags?: string[];
  scheduledFor?: string;
  estimatedRecipients: number;
}

// ─── AI Insights ─────────────────────────────────────────
export interface AiInsightData {
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

export interface DemandForecast {
  productId: string;
  productName: string;
  currentVelocity: number;
  predicted7d: number;
  predicted30d: number;
  confidence: number;
  factors: string[];
}

export interface PricingSuggestion {
  productId: string;
  productName: string;
  currentPrice: number;
  suggestedPrice: number;
  localAverage: number;
  expectedImpact: string;
  confidence: number;
}

// ─── Store Config ────────────────────────────────────────
export interface StoreConfig {
  id: string;
  name: string;
  taxRate: number;
  currency: string;
  timezone: string;
  operatingHours: Record<string, { open: string; close: string }>;
  features: {
    aiSmsAutoResponse: boolean;
    aiPricingSuggestions: boolean;
    aiDemandForecasting: boolean;
    ecommerce: boolean;
    delivery: boolean;
  };
}

// ─── Websocket Events ────────────────────────────────────
export type WsEvent =
  | { type: "transaction.created"; data: { transactionId: string; total: number } }
  | { type: "inventory.low"; data: { productId: string; productName: string; qty: number } }
  | { type: "inventory.out"; data: { productId: string; productName: string } }
  | { type: "sms.received"; data: { customerId: string; message: string } }
  | { type: "insight.new"; data: AiInsightData }
  | { type: "pos.sync"; data: { registerId: string } };
