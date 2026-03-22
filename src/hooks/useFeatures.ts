import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@/types";

const BASE = "/api";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error || "Request failed");
  return json.data as T;
}

async function poster<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error || "Request failed");
  return json.data as T;
}

// ─── E-COMMERCE ──────────────────────────────────────────

export function useStorefrontProducts(storeId: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ storeId, ...params }).toString();
  return useQuery({
    queryKey: ["storefront-products", storeId, params],
    queryFn: () => fetcher(`${BASE}/storefront?${query}`),
    enabled: !!storeId,
  });
}

export function useFeaturedProducts(storeId: string) {
  return useQuery({
    queryKey: ["storefront-featured", storeId],
    queryFn: () => fetcher(`${BASE}/storefront?storeId=${storeId}&action=featured`),
    staleTime: 300_000,
    enabled: !!storeId,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      poster(`${BASE}/storefront`, { action: "create-order", ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storefront-products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["loyalty"] });
    },
  });
}

export function useOnlineOrders(storeId: string, customerId?: string) {
  const params = new URLSearchParams({ storeId, action: "orders", ...(customerId ? { customerId } : {}) });
  return useQuery({
    queryKey: ["online-orders", storeId, customerId],
    queryFn: () => fetcher(`${BASE}/storefront?${params}`),
    enabled: !!storeId,
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderId: string; status: string }) =>
      poster(`${BASE}/storefront`, { action: "update-status", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["online-orders"] }),
  });
}

// ─── LOYALTY ─────────────────────────────────────────────

export function useLoyaltyProfile(storeId: string, customerId: string) {
  return useQuery({
    queryKey: ["loyalty", storeId, customerId],
    queryFn: () => fetcher(`${BASE}/loyalty?storeId=${storeId}&customerId=${customerId}`),
    enabled: !!storeId && !!customerId,
    refetchInterval: 120_000,
  });
}

export function useRedeemReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customerId: string; rewardId: string }) =>
      poster(`${BASE}/loyalty`, { action: "redeem", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty"] }),
  });
}

export function useApplyCoupon() {
  return useMutation({
    mutationFn: (body: { couponCode: string; subtotal: number }) =>
      poster(`${BASE}/loyalty`, { action: "apply-coupon", ...body }),
  });
}

export function useAwardBonusPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customerId: string; storeId: string; points: number; reason: string }) =>
      poster(`${BASE}/loyalty`, { action: "bonus-points", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty"] }),
  });
}

// ─── REPORTS ─────────────────────────────────────────────

export function useReportDashboard(storeId: string, days = 30) {
  return useQuery({
    queryKey: ["reports-dashboard", storeId, days],
    queryFn: () => fetcher(`${BASE}/reports?storeId=${storeId}&action=dashboard&days=${days}`),
    staleTime: 300_000,
    enabled: !!storeId,
  });
}

export function useMonthlyReport(storeId: string, year: number, month: number) {
  return useQuery({
    queryKey: ["monthly-report", storeId, year, month],
    queryFn: () => fetcher(`${BASE}/reports?storeId=${storeId}&action=monthly&year=${year}&month=${month}`),
    enabled: !!storeId,
  });
}

export function useDailySnapshots(storeId: string, days = 7) {
  return useQuery({
    queryKey: ["daily-snapshots", storeId, days],
    queryFn: () => fetcher(`${BASE}/reports?storeId=${storeId}&action=daily&days=${days}`),
    enabled: !!storeId,
  });
}

export function useTopCustomers(storeId: string, limit = 10) {
  return useQuery({
    queryKey: ["top-customers", storeId, limit],
    queryFn: () => fetcher(`${BASE}/reports?storeId=${storeId}&action=top-customers&limit=${limit}`),
    enabled: !!storeId,
  });
}

export function useCustomerSegments(storeId: string) {
  return useQuery({
    queryKey: ["customer-segments", storeId],
    queryFn: () => fetcher(`${BASE}/reports?storeId=${storeId}&action=customer-segments`),
    enabled: !!storeId,
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string; action: string; year?: number; month?: number }) =>
      poster(`${BASE}/reports`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports-dashboard"] });
      qc.invalidateQueries({ queryKey: ["monthly-report"] });
    },
  });
}

export function useExecutiveSummary(storeId: string, year: number, month: number) {
  return useMutation({
    mutationFn: () =>
      poster(`${BASE}/reports`, { action: "executive-summary", storeId, year, month }),
  });
}
