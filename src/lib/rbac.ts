// ─── Role-Based Access Control ────────────────────────────
// Defines what each role can see and do across the platform

export type Permission =
  | "dashboard.view"
  | "pos.use" | "pos.void" | "pos.refund" | "pos.discount"
  | "inventory.view" | "inventory.edit" | "inventory.reorder" | "inventory.audit"
  | "customers.view" | "customers.edit"
  | "sms.view" | "sms.send" | "sms.campaign"
  | "insights.view" | "insights.apply"
  | "storefront.view" | "storefront.edit" | "storefront.orders"
  | "loyalty.view" | "loyalty.edit" | "loyalty.bonus"
  | "delivery.view" | "delivery.assign" | "delivery.manage"
  | "employees.view" | "employees.edit" | "employees.schedule" | "employees.performance"
  | "accounting.view" | "accounting.expenses" | "accounting.reports"
  | "reports.view" | "reports.generate" | "reports.export"
  | "settings.view" | "settings.edit" | "settings.integrations"
  | "security.view" | "security.manage"
  | "pricing.view" | "pricing.adjust"
  | "marketing.view" | "marketing.campaigns" | "marketing.social"
  | "club.view" | "club.manage"
  | "labels.view" | "labels.print"
  | "admin.users" | "admin.roles" | "admin.audit";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  OWNER: [
    // Owner has everything
    "dashboard.view",
    "pos.use", "pos.void", "pos.refund", "pos.discount",
    "inventory.view", "inventory.edit", "inventory.reorder", "inventory.audit",
    "customers.view", "customers.edit",
    "sms.view", "sms.send", "sms.campaign",
    "insights.view", "insights.apply",
    "storefront.view", "storefront.edit", "storefront.orders",
    "loyalty.view", "loyalty.edit", "loyalty.bonus",
    "delivery.view", "delivery.assign", "delivery.manage",
    "employees.view", "employees.edit", "employees.schedule", "employees.performance",
    "accounting.view", "accounting.expenses", "accounting.reports",
    "reports.view", "reports.generate", "reports.export",
    "settings.view", "settings.edit", "settings.integrations",
    "security.view", "security.manage",
    "pricing.view", "pricing.adjust",
    "marketing.view", "marketing.campaigns", "marketing.social",
    "club.view", "club.manage",
    "labels.view", "labels.print",
    "admin.users", "admin.roles", "admin.audit",
  ],
  MANAGER: [
    "dashboard.view",
    "pos.use", "pos.void", "pos.refund", "pos.discount",
    "inventory.view", "inventory.edit", "inventory.reorder",
    "customers.view", "customers.edit",
    "sms.view", "sms.send", "sms.campaign",
    "insights.view", "insights.apply",
    "storefront.view", "storefront.orders",
    "loyalty.view", "loyalty.bonus",
    "delivery.view", "delivery.assign", "delivery.manage",
    "employees.view", "employees.schedule", "employees.performance",
    "accounting.view", "accounting.expenses",
    "reports.view", "reports.generate",
    "security.view",
    "pricing.view",
    "marketing.view", "marketing.campaigns",
    "club.view", "club.manage",
    "labels.view", "labels.print",
  ],
  CASHIER: [
    "dashboard.view",
    "pos.use",
    "inventory.view",
    "customers.view",
    "sms.view",
    "delivery.view",
    "loyalty.view",
    "labels.view", "labels.print",
  ],
  INVENTORY: [
    "dashboard.view",
    "inventory.view", "inventory.edit", "inventory.reorder", "inventory.audit",
    "labels.view", "labels.print",
    "pricing.view",
  ],
  VIEWER: [
    "dashboard.view",
    "reports.view",
    "insights.view",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

// ─── Navigation Items by Role ────────────────────────────
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  permission: Permission;
  children?: NavItem[];
  badge?: string;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard", permission: "dashboard.view" },
  { id: "pos", label: "Point of Sale", icon: "💳", href: "/pos", permission: "pos.use" },
  { id: "inventory", label: "Inventory", icon: "📦", href: "/inventory", permission: "inventory.view" },
  { id: "storefront", label: "Online Store", icon: "🛍️", href: "/storefront", permission: "storefront.view" },
  { id: "delivery", label: "Delivery", icon: "🚗", href: "/delivery", permission: "delivery.view" },
  { id: "customers", label: "Customers", icon: "👥", href: "/customers", permission: "customers.view" },
  { id: "sms", label: "SMS / AI Chat", icon: "💬", href: "/sms", permission: "sms.view" },
  { id: "loyalty", label: "Loyalty", icon: "⭐", href: "/loyalty", permission: "loyalty.view" },
  { id: "club", label: "Spirits Club", icon: "🍷", href: "/club", permission: "club.view" },
  { id: "marketing", label: "Marketing", icon: "📣", href: "/marketing", permission: "marketing.view" },
  { id: "insights", label: "AI Insights", icon: "🧠", href: "/insights", permission: "insights.view" },
  { id: "security", label: "Security", icon: "🔒", href: "/security", permission: "security.view" },
  { id: "pricing", label: "Competitor Intel", icon: "💲", href: "/pricing", permission: "pricing.view" },
  { id: "employees", label: "Team", icon: "🧑‍💼", href: "/employees", permission: "employees.view" },
  { id: "accounting", label: "Accounting", icon: "💰", href: "/accounting", permission: "accounting.view" },
  { id: "reports", label: "Reports", icon: "📄", href: "/reports", permission: "reports.view" },
  { id: "labels", label: "Labels", icon: "🏷️", href: "/labels", permission: "labels.view" },
  { id: "settings", label: "Settings", icon: "⚙️", href: "/settings", permission: "settings.view" },
];

export function getNavForRole(role: string): NavItem[] {
  const perms = getPermissions(role);
  return ALL_NAV_ITEMS.filter((item) => perms.includes(item.permission));
}

// ─── Admin Audit Log Helper ──────────────────────────────
export function formatAuditAction(action: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    "transaction.create": { label: "Sale Completed", color: "#10B981" },
    "transaction.void": { label: "Sale Voided", color: "#F43F5E" },
    "transaction.refund": { label: "Refund Issued", color: "#F97316" },
    "product.create": { label: "Product Added", color: "#3B82F6" },
    "product.update": { label: "Product Updated", color: "#3B82F6" },
    "product.delete": { label: "Product Removed", color: "#F43F5E" },
    "inventory.adjust": { label: "Stock Adjusted", color: "#F5A623" },
    "order.create": { label: "Online Order", color: "#10B981" },
    "order.cancel": { label: "Order Cancelled", color: "#F43F5E" },
    "customer.create": { label: "Customer Added", color: "#3B82F6" },
    "sms.send": { label: "SMS Sent", color: "#8B5CF6" },
    "campaign.send": { label: "Campaign Sent", color: "#8B5CF6" },
    "settings.update": { label: "Settings Changed", color: "#F5A623" },
    "user.create": { label: "Employee Added", color: "#3B82F6" },
    "user.login": { label: "Login", color: "#10B981" },
    "expense.create": { label: "Expense Recorded", color: "#F97316" },
    "loyalty.redeem": { label: "Reward Redeemed", color: "#EC4899" },
  };
  return map[action] || { label: action, color: "#888" };
}
