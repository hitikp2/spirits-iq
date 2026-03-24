import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse, DashboardStats, RevenueDataPoint, TopSeller } from "@/types";

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

// ─── Dashboard ───────────────────────────────────────────
interface DashboardData {
  stats: DashboardStats;
  revenue: RevenueDataPoint[];
  topSellers: TopSeller[];
}

export function useDashboard(storeId: string) {
  return useQuery({
    queryKey: ["dashboard", storeId],
    queryFn: () => fetcher<DashboardData>(`${BASE}/analytics?storeId=${storeId}`),
    refetchInterval: 60_000, // Refresh every minute
    enabled: !!storeId,
  });
}

// ─── Inventory ───────────────────────────────────────────
export function useInventory(storeId: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ storeId, ...params }).toString();
  return useQuery({
    queryKey: ["inventory", storeId, params],
    queryFn: () => fetcher(`${BASE}/inventory?${query}`),
    enabled: !!storeId,
  });
}

export function useInventoryAlerts(storeId: string) {
  return useQuery({
    queryKey: ["inventory-alerts", storeId],
    queryFn: () => fetcher(`${BASE}/inventory?storeId=${storeId}&action=alerts`),
    refetchInterval: 120_000,
    enabled: !!storeId,
  });
}

export function useStockAdjust() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => poster(`${BASE}/inventory`, { action: "adjust", ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-alerts"] });
    },
  });
}

export function useAiReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string; performedBy: string }) =>
      poster(`${BASE}/inventory`, { action: "ai-reorder", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      poster(`${BASE}/inventory`, { action: "create", ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-alerts"] });
    },
  });
}

// ─── POS ─────────────────────────────────────────────────
export function useProcessSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => poster(`${BASE}/pos`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useUpsellSuggestion(storeId: string, productIds: string[], customerId?: string) {
  const params = new URLSearchParams({
    storeId,
    action: "upsell",
    productIds: productIds.join(","),
    ...(customerId ? { customerId } : {}),
  }).toString();

  return useQuery({
    queryKey: ["upsell", storeId, productIds, customerId],
    queryFn: () => fetcher(`${BASE}/pos?${params}`),
    enabled: !!storeId && productIds.length > 0,
    staleTime: 30_000,
  });
}

// ─── SMS ─────────────────────────────────────────────────
export function useConversations(storeId: string) {
  return useQuery({
    queryKey: ["sms-conversations", storeId],
    queryFn: () => fetcher(`${BASE}/sms?storeId=${storeId}`),
    refetchInterval: 15_000, // Check for new messages every 15s
    enabled: !!storeId,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customerId: string; message: string }) =>
      poster(`${BASE}/sms`, { action: "send", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms-conversations"] }),
  });
}

export function useSmsCampaigns(storeId: string) {
  return useQuery({
    queryKey: ["sms-campaigns", storeId],
    queryFn: () => fetcher(`${BASE}/sms?storeId=${storeId}&action=campaigns`),
    enabled: !!storeId,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      name: string;
      messageBody: string;
      targetTier?: string;
      targetTags?: string[];
      scheduledFor?: string;
    }) => poster(`${BASE}/sms`, { action: "campaign-create", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms-campaigns"] }),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      poster(`${BASE}/sms`, { action: "campaign-send", campaignId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms-campaigns"] }),
  });
}

// ─── AI Insights ─────────────────────────────────────────
export function useInsights(storeId: string) {
  return useQuery({
    queryKey: ["ai-insights", storeId],
    queryFn: () => fetcher(`${BASE}/ai?storeId=${storeId}`),
    refetchInterval: 300_000, // Every 5 min
    enabled: !!storeId,
  });
}

export function useGenerateInsights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => poster(`${BASE}/ai`, { action: "generate", storeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights"] }),
  });
}

export function useUpdateInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { insightId: string; status: string; actionTaken?: string }) =>
      poster(`${BASE}/ai`, { action: "update-status", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights"] }),
  });
}

// ─── Customers ───────────────────────────────────────────
export function useCustomers(storeId: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ storeId, ...params }).toString();
  return useQuery({
    queryKey: ["customers", storeId, params],
    queryFn: () => fetcher(`${BASE}/customers?${query}`),
    enabled: !!storeId,
  });
}

export function useCustomerLookup() {
  return useMutation({
    mutationFn: (body: { storeId: string; phone: string }) =>
      poster(`${BASE}/customers`, { action: "lookup", ...body }),
  });
}

// ─── Reports ────────────────────────────────────────────
export function useReportDashboard(storeId: string, days = 30) {
  return useQuery({
    queryKey: ["report-dashboard", storeId, days],
    queryFn: () => fetcher<any>(`${BASE}/reports?storeId=${storeId}&action=dashboard&days=${days}`),
    enabled: !!storeId,
  });
}

export function useReportDaily(storeId: string, days = 7) {
  return useQuery({
    queryKey: ["report-daily", storeId, days],
    queryFn: () => fetcher<any[]>(`${BASE}/reports?storeId=${storeId}&action=daily&days=${days}`),
    enabled: !!storeId,
  });
}

export function useGenerateMonthlyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string; year: number; month: number }) =>
      poster(`${BASE}/reports`, { action: "generate-monthly", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-dashboard"] }),
  });
}

// ─── Settings ───────────────────────────────────────────
export function useSettings(storeId: string) {
  return useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => fetcher<{ store: any; settings: any; storefrontConfig: any; loyaltyConfig: any }>(`${BASE}/settings?storeId=${storeId}`),
    enabled: !!storeId,
  });
}

// ─── Employees ──────────────────────────────────────────
export function useEmployees(storeId: string) {
  return useQuery({
    queryKey: ["employees", storeId],
    queryFn: () => fetcher<any[]>(`${BASE}/employees?storeId=${storeId}&action=list`),
    enabled: !!storeId,
  });
}

// ─── Integrations ───────────────────────────────────────
export function useIntegrations(storeId: string) {
  return useQuery({
    queryKey: ["integrations", storeId],
    queryFn: () => fetcher<any[]>(`${BASE}/integrations?storeId=${storeId}`),
    enabled: !!storeId,
  });
}

export function useConnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; credentials?: Record<string, string>; config?: Record<string, any> }) =>
      poster(`${BASE}/integrations`, { action: "connect", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => poster(`${BASE}/integrations`, { action: "disconnect", provider }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: (provider: string) => poster<{ status: string }>(`${BASE}/integrations`, { action: "test", provider }),
  });
}

// ─── Stripe Connect ─────────────────────────────────────
export function useConnectStatus(storeId: string) {
  return useQuery({
    queryKey: ["connect-status", storeId],
    queryFn: () => fetcher<{
      connected: boolean;
      accountId?: string;
      chargesEnabled?: boolean;
      payoutsEnabled?: boolean;
      detailsSubmitted?: boolean;
      feePercent?: number;
      reason?: string;
    }>(`${BASE}/connect?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 30_000, // Check every 30s during onboarding
  });
}

export function useConnectOnboard() {
  return useMutation({
    mutationFn: (body: { returnUrl: string }) =>
      poster<{ url: string }>(`${BASE}/connect`, { action: "onboard", ...body }),
  });
}

export function useConnectDashboardLink() {
  return useMutation({
    mutationFn: () =>
      poster<{ url: string }>(`${BASE}/connect`, { action: "dashboard-link" }),
  });
}

export function useConnectDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => poster(`${BASE}/connect`, { action: "disconnect" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connect-status"] }),
  });
}

export function useConnectEarnings(storeId: string, days = 30) {
  return useQuery({
    queryKey: ["connect-earnings", storeId, days],
    queryFn: () => fetcher<{
      totalFees: number;
      totalVolume: number;
      transactionCount: number;
      periodDays: number;
    }>(`${BASE}/connect?storeId=${storeId}&action=earnings&days=${days}`),
    enabled: !!storeId,
  });
}

// ─── Settings Update ────────────────────────────────────
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { storeId: string; settings: Record<string, any> }) =>
      poster(`${BASE}/settings`, { action: "update-settings", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}
