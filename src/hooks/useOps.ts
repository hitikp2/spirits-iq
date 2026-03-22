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
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error || "Request failed");
  return json.data as T;
}

// ═══ DELIVERY ═════════════════════════════════════════════

export function useActiveDeliveries(storeId: string) {
  return useQuery({ queryKey: ["deliveries", storeId], queryFn: () => fetcher(`${BASE}/delivery?storeId=${storeId}`), refetchInterval: 15_000, enabled: !!storeId });
}

export function useDeliveryStats(storeId: string) {
  return useQuery({ queryKey: ["delivery-stats", storeId], queryFn: () => fetcher(`${BASE}/delivery?storeId=${storeId}&action=stats`), refetchInterval: 30_000, enabled: !!storeId });
}

export function useDrivers(storeId: string) {
  return useQuery({ queryKey: ["drivers", storeId], queryFn: () => fetcher(`${BASE}/delivery?storeId=${storeId}&action=drivers`), enabled: !!storeId });
}

export function useAssignDriver() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { orderId: string; driverId: string }) => poster(`${BASE}/delivery`, { action: "assign-driver", ...body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }) });
}

export function useMarkDelivered() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { orderId: string }) => poster(`${BASE}/delivery`, { action: "mark-delivered", ...body }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["deliveries"] }); qc.invalidateQueries({ queryKey: ["delivery-stats"] }); } });
}

// ═══ EMPLOYEES ════════════════════════════════════════════

export function useEmployees(storeId: string) {
  return useQuery({ queryKey: ["employees", storeId], queryFn: () => fetcher(`${BASE}/employees?storeId=${storeId}`), enabled: !!storeId });
}

export function useSchedule(storeId: string, week?: string) {
  const params = new URLSearchParams({ storeId, action: "schedule", ...(week ? { week } : {}) });
  return useQuery({ queryKey: ["schedule", storeId, week], queryFn: () => fetcher(`${BASE}/employees?${params}`), enabled: !!storeId });
}

export function useEmployeePerformance(storeId: string, days = 30) {
  return useQuery({ queryKey: ["employee-perf", storeId, days], queryFn: () => fetcher(`${BASE}/employees?storeId=${storeId}&action=performance&days=${days}`), enabled: !!storeId });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (userId: string) => poster(`${BASE}/employees`, { action: "clock-in", userId }), onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }) });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (userId: string) => poster(`${BASE}/employees`, { action: "clock-out", userId }), onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }) });
}

export function useGenerateSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { storeId: string; weekStart: string }) => poster(`${BASE}/employees`, { action: "generate-schedule", ...body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule"] }) });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Record<string, unknown>) => poster(`${BASE}/employees`, { action: "create", ...body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }) });
}

// ═══ SETTINGS ═════════════════════════════════════════════

export function useStoreSettings(storeId: string) {
  return useQuery({ queryKey: ["settings", storeId], queryFn: () => fetcher(`${BASE}/settings?storeId=${storeId}`), staleTime: 600_000, enabled: !!storeId });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Record<string, unknown>) => poster(`${BASE}/settings`, { action: "update-store", ...body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }) });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { storeId: string; settings: Record<string, unknown>; changedBy?: string }) => poster(`${BASE}/settings`, { action: "update-settings", ...body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }) });
}

export function useSettingsChangelog(storeId: string) {
  return useQuery({ queryKey: ["settings-changelog", storeId], queryFn: () => fetcher(`${BASE}/settings?storeId=${storeId}&action=changelog`), enabled: !!storeId });
}

// ═══ ACCOUNTING ═══════════════════════════════════════════

export function useChartOfAccounts(storeId: string) {
  return useQuery({ queryKey: ["accounts", storeId], queryFn: () => fetcher(`${BASE}/accounting?storeId=${storeId}&action=accounts`), enabled: !!storeId });
}

export function useProfitAndLoss(storeId: string, start?: string, end?: string) {
  const params = new URLSearchParams({ storeId, action: "pnl", ...(start ? { start } : {}), ...(end ? { end } : {}) });
  return useQuery({ queryKey: ["pnl", storeId, start, end], queryFn: () => fetcher(`${BASE}/accounting?${params}`), enabled: !!storeId });
}

export function useBalanceSheet(storeId: string) {
  return useQuery({ queryKey: ["balance-sheet", storeId], queryFn: () => fetcher(`${BASE}/accounting?storeId=${storeId}&action=balance-sheet`), enabled: !!storeId });
}

export function useExpenses(storeId: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ storeId, action: "expenses", ...params });
  return useQuery({ queryKey: ["expenses", storeId, params], queryFn: () => fetcher(`${BASE}/accounting?${query}`), enabled: !!storeId });
}

export function useTaxSummary(storeId: string) {
  return useQuery({ queryKey: ["tax", storeId], queryFn: () => fetcher(`${BASE}/accounting?storeId=${storeId}&action=tax`), enabled: !!storeId });
}

export function useJournalEntries(storeId: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ storeId, action: "journal", ...params });
  return useQuery({ queryKey: ["journal", storeId, params], queryFn: () => fetcher(`${BASE}/accounting?${query}`), enabled: !!storeId });
}

export function useRecordExpense() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Record<string, unknown>) => poster(`${BASE}/accounting`, { action: "record-expense", ...body }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["pnl"] }); qc.invalidateQueries({ queryKey: ["balance-sheet"] }); } });
}

export function useInitAccounts() {
  return useMutation({ mutationFn: (storeId: string) => poster(`${BASE}/accounting`, { action: "init-accounts", storeId }) });
}

export function useFinancialInsights() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (storeId: string) => poster(`${BASE}/accounting`, { action: "financial-insights", storeId }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights"] }) });
}
