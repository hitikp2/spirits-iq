import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

// ─── Classname Merge ─────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency Formatting ─────────────────────────────────
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return formatCurrency(amount);
}

// ─── Number Formatting ───────────────────────────────────
export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

// ─── Date / Time ─────────────────────────────────────────
export function formatDate(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatTime(date: Date | string): string {
  return format(new Date(date), "h:mm a");
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy h:mm a");
}

export function timeAgo(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

// ─── Phone Formatting ────────────────────────────────────
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === "1") {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

// ─── Validation ──────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === "1");
}

export function isValidSku(sku: string): boolean {
  return /^[A-Z]{2,4}-\d{3,6}$/.test(sku);
}

export function isValidBarcode(barcode: string): boolean {
  return /^\d{8,14}$/.test(barcode);
}

// ─── SKU Generation ──────────────────────────────────────
export function generateSku(category: string, existingCount: number): string {
  const prefix = category.substring(0, 2).toUpperCase();
  const num = (existingCount + 1).toString().padStart(3, "0");
  return `${prefix}-${num}`;
}

// ─── Inventory Status ────────────────────────────────────
export function getStockStatus(qty: number, reorderPoint: number) {
  if (qty === 0) return { status: "out" as const, label: "Out of Stock", color: "danger" };
  if (qty <= reorderPoint) return { status: "low" as const, label: "Low Stock", color: "brand" };
  return { status: "ok" as const, label: "In Stock", color: "success" };
}

// ─── Margin Calculation ──────────────────────────────────
export function calcMargin(retail: number, cost: number): number {
  if (retail === 0) return 0;
  return ((retail - cost) / retail) * 100;
}

export function calcMarkup(retail: number, cost: number): number {
  if (cost === 0) return 0;
  return ((retail - cost) / cost) * 100;
}

// ─── Debounce ────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── Slugify ─────────────────────────────────────────────
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
