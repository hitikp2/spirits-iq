"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn, formatPhone } from "@/lib/utils";
import {
  useSettings, useEmployees, useIntegrations,
  useConnectIntegration, useDisconnectIntegration, useTestIntegration,
  useUpdateSettings,
} from "@/hooks/useApi";

type Tab = "store" | "team" | "integrations" | "ai" | "account";

interface Settings {
  aiSmsAutoResponse: boolean;
  aiPricingSuggestions: boolean;
  aiDemandForecasting: boolean;
  ecommerce: boolean;
  delivery: boolean;
  [key: string]: boolean;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "store", label: "Store Info" },
  { key: "team", label: "Team" },
  { key: "integrations", label: "Integrations" },
  { key: "ai", label: "AI Features" },
  { key: "account", label: "Account" },
];

const AI_FEATURES: { key: string; label: string; description: string }[] = [
  { key: "aiAutoResponse", label: "SMS Auto-Response", description: "Automatically reply to customer text messages using AI" },
  { key: "aiPricingSuggestions", label: "Pricing Suggestions", description: "AI-driven pricing recommendations based on market data" },
  { key: "aiDemandForecasting", label: "Demand Forecasting", description: "Predict inventory needs using historical sales patterns" },
  { key: "deliveryEnabled", label: "Delivery", description: "Enable delivery fulfillment for orders" },
  { key: "loyaltyEnabled", label: "Loyalty Program", description: "Points-based loyalty rewards for repeat customers" },
];

const INTEGRATION_PROVIDERS = [
  {
    id: "stripe",
    name: "Stripe",
    icon: "💳",
    description: "Accept credit card payments at POS and online",
    mode: "byok" as const,
    fields: [
      { key: "secretKey", label: "Secret Key", placeholder: "sk_live_... or sk_test_...", secret: true },
      { key: "publishableKey", label: "Publishable Key", placeholder: "pk_live_... or pk_test_..." },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true },
    ],
    docsUrl: "https://stripe.com/docs",
  },
  {
    id: "twilio",
    name: "Twilio",
    icon: "💬",
    description: "Send and receive SMS messages with customers",
    mode: "byok" as const,
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "AC..." },
      { key: "authToken", label: "Auth Token", placeholder: "Your auth token", secret: true },
      { key: "phoneNumber", label: "Phone Number", placeholder: "+1234567890" },
      { key: "messagingServiceSid", label: "Messaging Service SID", placeholder: "MG... (optional)" },
    ],
    docsUrl: "https://twilio.com/docs",
  },
  {
    id: "gemini",
    name: "Google Gemini AI",
    icon: "🧠",
    description: "Power AI features with your own API key for higher limits",
    mode: "byok" as const,
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Your Gemini API key", secret: true },
    ],
    docsUrl: "https://ai.google.dev",
  },
];

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-brand/20 text-brand",
  MANAGER: "bg-blue-500/20 text-blue-400",
  CASHIER: "bg-emerald-500/20 text-emerald-400",
};

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-800", className)} />;
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
  const { data: settingsData, isLoading: loading, error: settingsError } = useSettings(storeId);
  const { data: employeesData, isLoading: teamLoading, error: teamError } = useEmployees(storeId);
  const { data: integrations, isLoading: intLoading, error: intError } = useIntegrations(storeId);
  const updateSettings = useUpdateSettings();

  const store = settingsData?.store ?? null;
  const settings: Settings | null = settingsData?.settings ?? null;
  const employees = Array.isArray(employeesData) ? employeesData : [];

  const handleToggle = (key: string) => {
    if (!settings || !storeId) return;
    updateSettings.mutate({ storeId, settings: { [key]: !settings[key] } });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-surface-100">Settings</h1>
        <p className="font-body text-surface-400 mt-1">Manage your store configuration</p>
      </div>

      <div className="flex gap-2 border-b border-surface-600 pb-px overflow-x-auto scrollbar-hide">
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

      {/* ── Store Info ── */}
      {tab === "store" && (
        <div>
          {loading ? (
            <StoreSkeleton />
          ) : settingsError ? (
            <EmptyState message="Failed to load store info. Please try again." />
          ) : store ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-surface-900 border border-surface-600 p-6">
                <h2 className="font-display text-xl font-semibold text-surface-100 mb-4">{store.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InfoField label="Address" value={`${store.address || ""}, ${store.city || ""}, ${store.state || ""} ${store.zip || ""}`} />
                  <InfoField label="Phone" value={store.phone ? formatPhone(store.phone) : "—"} />
                  <InfoField label="Email" value={store.email || "—"} />
                  <InfoField label="Timezone" value={store.timezone || "—"} />
                  <InfoField label="Tax Rate" value={`${(Number(store.taxRate || 0) * 100).toFixed(2)}%`} />
                  <InfoField label="License Number" value={store.licenseNumber || "—"} />
                </div>
              </div>
              {store.operatingHours && typeof store.operatingHours === "object" && Object.keys(store.operatingHours).length > 0 && (
                <div className="rounded-2xl bg-surface-900 border border-surface-600 p-6">
                  <h3 className="font-display text-lg font-semibold text-surface-100 mb-4">Operating Hours</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(store.operatingHours).map(([day, hours]) => (
                      <div key={day} className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-800">
                        <span className="font-body text-sm text-surface-300 capitalize">{day}</span>
                        <span className="font-mono text-sm text-surface-100">
                          {typeof hours === "object" && hours !== null
                            ? `${(hours as any).open || "—"} – ${(hours as any).close || "—"}`
                            : String(hours ?? "—")}
                        </span>
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

      {/* ── Team ── */}
      {tab === "team" && (
        <div>
          {teamLoading ? (
            <SettingsSkeleton />
          ) : teamError ? (
            <EmptyState message="Failed to load team data. Please try again." />
          ) : employees.length > 0 ? (
            <div className="space-y-3">
              {employees.map((emp: any) => (
                <div
                  key={emp.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-surface-900 border border-surface-600"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-surface-800 flex items-center justify-center shrink-0">
                      <span className="font-display text-sm font-bold text-surface-300">
                        {(emp.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
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
                    <span className="font-mono text-xs text-surface-400 bg-surface-800 px-2 py-0.5 rounded-lg">PIN {emp.pin}</span>
                    <span className={cn("h-2 w-2 rounded-full shrink-0", emp.isActive ? "bg-emerald-400" : "bg-surface-600")} />
                    {emp.clockedIn && (
                      <span className="text-xs font-body text-success bg-emerald-500/10 px-2 py-0.5 rounded-lg">Clocked In</span>
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

      {/* ── Integrations ── */}
      {tab === "integrations" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand/5 border border-brand/20 p-4">
            <p className="font-body text-sm text-surface-300">
              <span className="font-semibold text-brand">Platform-managed by default.</span>{" "}
              All services work out of the box with your subscription. Connect your own accounts below for custom billing or higher limits.
            </p>
          </div>
          {intLoading ? (
            <SettingsSkeleton />
          ) : intError ? (
            <EmptyState message="Failed to load integrations. Please try again." />
          ) : (
            INTEGRATION_PROVIDERS.map((provider) => (
              <IntegrationCard
                key={provider.id}
                provider={provider}
                integration={Array.isArray(integrations) ? integrations.find((i: any) => i.provider === provider.id) : undefined}
                storeId={storeId}
              />
            ))
          )}
        </div>
      )}

      {/* ── AI Features ── */}
      {tab === "ai" && (
        <div>
          {loading ? (
            <SettingsSkeleton />
          ) : settingsError ? (
            <EmptyState message="Failed to load AI settings. Please try again." />
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
                  <button
                    onClick={() => handleToggle(feature.key)}
                    disabled={updateSettings.isPending}
                    className={cn(
                      "relative h-6 w-11 rounded-full shrink-0 transition-colors cursor-pointer",
                      settings[feature.key] ? "bg-brand" : "bg-surface-600"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        settings[feature.key] ? "translate-x-5" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Unable to load settings" />
          )}
        </div>
      )}

      {/* ── Account ── */}
      {tab === "account" && (
        <div className="space-y-6">
          {session?.user && (
            <div className="rounded-2xl bg-surface-900 border border-surface-600 p-6">
              <h2 className="font-display text-lg font-semibold text-surface-100 mb-4">Your Account</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InfoField label="Name" value={session.user.name || "—"} />
                <InfoField label="Email" value={session.user.email || "—"} />
                <InfoField label="Role" value={(session.user as any)?.role || "—"} />
                <InfoField label="Store" value={(session.user as any)?.storeName || "—"} />
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-surface-900 border border-surface-600 p-6">
            <h2 className="font-display text-lg font-semibold text-surface-100 mb-2">Session</h2>
            <p className="font-body text-xs text-surface-400 mb-4">Sessions expire after 12 hours of inactivity</p>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-4 py-2.5 rounded-xl font-body text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              Sign Out
            </button>
          </div>

          <div className="rounded-2xl bg-surface-900 border border-red-500/20 p-6">
            <h2 className="font-display text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
            <p className="font-body text-xs text-surface-400 mb-4">These actions cannot be undone</p>
            <button
              disabled
              className="px-4 py-2.5 rounded-xl font-body text-sm font-medium bg-surface-800 text-surface-500 border border-surface-600 cursor-not-allowed"
            >
              Delete Store Data (Coming Soon)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Integration Card Component ──────────────────────────
function IntegrationCard({
  provider,
  integration,
  storeId,
}: {
  provider: typeof INTEGRATION_PROVIDERS[number];
  integration?: any;
  storeId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const test = useTestIntegration();

  const isConnected = integration?.isActive && integration?.hasCredentials;

  const handleConnect = () => {
    if (provider.mode === "oauth") {
      // Stripe Connect would redirect — placeholder for now
      return;
    }
    const filledFields = Object.fromEntries(
      provider.fields.map((f) => [f.key, fields[f.key] || ""])
    );
    const hasValues = Object.values(filledFields).some(Boolean);
    if (!hasValues) return;
    connect.mutate({ provider: provider.id, credentials: filledFields });
    setExpanded(false);
    setFields({});
  };

  const handleTest = async () => {
    setTestStatus("testing");
    try {
      const result = await test.mutateAsync(provider.id);
      setTestStatus((result as any)?.status || "unknown");
    } catch {
      setTestStatus("failed");
    }
  };

  return (
    <div className={cn(
      "rounded-2xl bg-surface-900 border transition-colors overflow-hidden",
      isConnected ? "border-success/30" : "border-surface-600"
    )}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{provider.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-bold text-surface-100">{provider.name}</h3>
                {isConnected && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-success/20 text-success uppercase">Connected</span>
                )}
                {provider.mode === "oauth" && !isConnected && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-800 text-surface-400 uppercase">OAuth</span>
                )}
              </div>
              <p className="font-body text-xs text-surface-400 mt-0.5">{provider.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <>
                <button
                  onClick={handleTest}
                  disabled={test.isPending}
                  className="px-3 py-1.5 rounded-lg font-body text-xs font-medium bg-surface-800 text-surface-300 hover:text-surface-100 transition-colors"
                >
                  {testStatus === "testing" ? "Testing..." : testStatus === "connected" ? "Passed" : "Test"}
                </button>
                <button
                  onClick={() => disconnect.mutate(provider.id)}
                  disabled={disconnect.isPending}
                  className="px-3 py-1.5 rounded-lg font-body text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
            {!isConnected && provider.mode === "byok" && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="px-3 py-1.5 rounded-lg font-body text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
              >
                {expanded ? "Cancel" : "Connect"}
              </button>
            )}
            {!isConnected && provider.mode === "oauth" && (
              <button
                disabled
                className="px-3 py-1.5 rounded-lg font-body text-xs font-medium bg-surface-800 text-surface-500 cursor-not-allowed"
              >
                Connect (Coming Soon)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BYOK credential form */}
      {expanded && provider.mode === "byok" && (
        <div className="border-t border-surface-600 p-4 bg-surface-950/50">
          <div className="space-y-3">
            {provider.fields.map((field) => (
              <div key={field.key}>
                <label className="font-body text-xs text-surface-400 mb-1 block">{field.label}</label>
                <input
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={fields[field.key] || ""}
                  onChange={(e) => setFields({ ...fields, [field.key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-surface-600 font-mono text-sm text-surface-100 placeholder:text-surface-500 focus:border-brand focus:outline-none"
                />
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-xs text-surface-400 hover:text-brand transition-colors"
              >
                Where do I find these? &rarr;
              </a>
              <button
                onClick={handleConnect}
                disabled={connect.isPending}
                className="px-4 py-2 rounded-xl font-body text-sm font-medium bg-brand text-surface-950 hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {connect.isPending ? "Saving..." : "Save & Connect"}
              </button>
            </div>
          </div>
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
