"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { cn, formatPhone } from "@/lib/utils";

type Tab = "store" | "team" | "ai";

interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  timezone: string;
  taxRate: number;
  licenseNumber: string;
  operatingHours: Record<string, string>;
}

interface Settings {
  aiSmsAutoResponse: boolean;
  aiPricingSuggestions: boolean;
  aiDemandForecasting: boolean;
  ecommerce: boolean;
  delivery: boolean;
  [key: string]: boolean;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  pin: string;
  isActive: boolean;
  clockedIn: boolean;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "store", label: "Store Info" },
  { key: "team", label: "Team" },
  { key: "ai", label: "AI Features" },
];

const AI_FEATURES: { key: string; label: string; description: string }[] = [
  { key: "aiSmsAutoResponse", label: "SMS Auto-Response", description: "Automatically reply to customer text messages using AI" },
  { key: "aiPricingSuggestions", label: "Pricing Suggestions", description: "AI-driven pricing recommendations based on market data" },
  { key: "aiDemandForecasting", label: "Demand Forecasting", description: "Predict inventory needs using historical sales patterns" },
  { key: "ecommerce", label: "E-Commerce", description: "Online storefront for customer orders" },
  { key: "delivery", label: "Delivery", description: "Enable delivery fulfillment for orders" },
];

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-brand/20 text-brand",
  MANAGER: "bg-blue-500/20 text-blue-400",
  CASHIER: "bg-emerald-500/20 text-emerald-400",
};

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-surface-800", className)} />
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-surface-900">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-surface-900">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function StoreSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 rounded-2xl bg-surface-900 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-36" />
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const [tab, setTab] = useState<Tab>("store");
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    fetch(`/api/settings?storeId=${storeId}`)
      .then((res) => res.json())
      .then((data) => {
        setStore(data.store);
        setSettings(data.settings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    fetch(`/api/employees?storeId=${storeId}&action=list`)
      .then((res) => res.json())
      .then((data) => setEmployees(Array.isArray(data) ? data : data.employees ?? []))
      .catch(() => {})
      .finally(() => setTeamLoading(false));
  }, [storeId]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-surface-100">Settings</h1>
        <p className="font-body text-surface-400 mt-1">Manage your store configuration</p>
      </div>

      <div className="flex gap-2 border-b border-surface-600 pb-px overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 font-body text-sm font-medium rounded-xl transition-colors whitespace-nowrap",
              tab === t.key
                ? "bg-surface-800 text-brand"
                : "text-surface-400 hover:text-surface-100 hover:bg-surface-900"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "store" && (
        <div>
          {loading ? (
            <StoreSkeleton />
          ) : store ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-surface-900 border border-surface-600 p-6">
                <h2 className="font-display text-xl font-semibold text-surface-100 mb-4">{store.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InfoField label="Address" value={`${store.address}, ${store.city}, ${store.state} ${store.zip}`} />
                  <InfoField label="Phone" value={formatPhone(store.phone)} />
                  <InfoField label="Email" value={store.email} />
                  <InfoField label="Timezone" value={store.timezone} />
                  <InfoField label="Tax Rate" value={`${(store.taxRate * 100).toFixed(2)}%`} />
                  <InfoField label="License Number" value={store.licenseNumber} />
                </div>
              </div>

              {store.operatingHours && Object.keys(store.operatingHours).length > 0 && (
                <div className="rounded-2xl bg-surface-900 border border-surface-600 p-6">
                  <h3 className="font-display text-lg font-semibold text-surface-100 mb-4">Operating Hours</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(store.operatingHours).map(([day, hours]) => (
                      <div key={day} className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-800">
                        <span className="font-body text-sm text-surface-300 capitalize">{day}</span>
                        <span className="font-mono text-sm text-surface-100">{hours}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState message="Unable to load store information" />
          )}
        </div>
      )}

      {tab === "team" && (
        <div>
          {teamLoading ? (
            <TeamSkeleton />
          ) : employees && employees.length > 0 ? (
            <div className="space-y-3">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-surface-900 border border-surface-600"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-surface-800 flex items-center justify-center shrink-0">
                      <span className="font-display text-sm font-bold text-surface-300">
                        {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-body text-sm font-medium text-surface-100 truncate">{emp.name}</p>
                      <p className="font-body text-xs text-surface-400 truncate">{emp.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[emp.role] ?? "bg-surface-800 text-surface-300")}>
                      {emp.role}
                    </span>
                    <span className="font-mono text-xs text-surface-400 bg-surface-800 px-2 py-0.5 rounded-lg">
                      PIN {emp.pin}
                    </span>
                    <span className={cn("h-2 w-2 rounded-full shrink-0", emp.isActive ? "bg-emerald-400" : "bg-surface-600")} title={emp.isActive ? "Active" : "Inactive"} />
                    {emp.clockedIn && (
                      <span className="text-xs font-body text-success bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                        Clocked In
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No team members found" />
          )}
        </div>
      )}

      {tab === "ai" && (
        <div>
          {loading ? (
            <SettingsSkeleton />
          ) : settings ? (
            <div className="space-y-3">
              {AI_FEATURES.map((feature) => (
                <div
                  key={feature.key}
                  className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface-900 border border-surface-600"
                >
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium text-surface-100">{feature.label}</p>
                    <p className="font-body text-xs text-surface-400 mt-0.5">{feature.description}</p>
                  </div>
                  <div
                    className={cn(
                      "relative h-6 w-11 rounded-full shrink-0 transition-colors",
                      settings[feature.key] ? "bg-brand" : "bg-surface-600"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        settings[feature.key] ? "translate-x-5" : "translate-x-0.5"
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Unable to load settings" />
          )}
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-xs text-surface-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-body text-sm text-surface-100">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="font-body text-sm text-surface-400">{message}</p>
    </div>
  );
}
