"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, CreditCard, Package, MessageSquare,
  Brain, Settings, Bell, ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "pos", label: "Point of Sale", icon: CreditCard, href: "/pos" },
  { id: "inventory", label: "Inventory", icon: Package, href: "/inventory" },
  { id: "sms", label: "SMS / AI Chat", icon: MessageSquare, href: "/sms" },
  { id: "insights", label: "AI Insights", icon: Brain, href: "/insights" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const activeItem = NAV_ITEMS.find((n) => pathname.startsWith(n.href));

  // ─── MOBILE LAYOUT ──────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-screen bg-surface-950">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 glass border-b border-surface-600 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-sm">
                🥃
              </div>
              <div>
                <span className="font-display text-base font-bold tracking-wide text-surface-100">
                  SPIRITS{" "}
                </span>
                <span className="font-mono text-[10px] text-brand tracking-[2px]">IQ</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="font-mono text-[10px] text-success">Open</span>
              </div>
              <button className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-600 flex items-center justify-center">
                <Bell size={14} className="text-surface-300" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="px-4 py-4 pb-24">{children}</main>

        {/* Bottom Tab Bar */}
        <nav className="fixed bottom-0 inset-x-0 z-40 glass border-t border-surface-600">
          <div className="flex justify-around items-center py-2 pb-5">
            {NAV_ITEMS.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <button
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className="flex flex-col items-center gap-1 px-3 py-1.5"
                >
                  <Icon
                    size={20}
                    className={cn(
                      "transition-colors",
                      active ? "text-brand" : "text-surface-400"
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-[9px] tracking-wide",
                      active ? "text-brand font-semibold" : "text-surface-400"
                    )}
                  >
                    {item.label.split(" ")[0]}
                  </span>
                  {active && (
                    <div className="w-1 h-1 rounded-full bg-brand" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  // ─── DESKTOP LAYOUT ─────────────────────────────────
  return (
    <div className="flex min-h-screen bg-surface-950">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-surface-600 bg-surface-900 transition-all duration-300",
          collapsed ? "w-[72px]" : "w-60"
        )}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-4 py-5 cursor-pointer"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-lg shrink-0">
            🥃
          </div>
          {!collapsed && (
            <div>
              <span className="font-display text-lg font-bold tracking-wide text-surface-100">
                SPIRITS
              </span>
              <span className="font-mono text-[10px] text-brand tracking-[2px] ml-1">
                IQ
              </span>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl transition-all duration-200",
                  collapsed ? "justify-center px-3 py-3" : "px-4 py-3",
                  active
                    ? "bg-brand/10 text-brand border-l-[3px] border-brand"
                    : "text-surface-300 hover:text-surface-100 hover:bg-surface-800 border-l-[3px] border-transparent"
                )}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Status / Collapse */}
        <div className="px-3 py-4 border-t border-surface-600">
          {!collapsed && (
            <div className="rounded-xl bg-brand/10 border border-brand/20 p-3 mb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                <span className="font-mono text-[10px] text-brand tracking-wide">
                  AI STATUS
                </span>
              </div>
              <div className="font-body text-xs text-success">All Systems Active</div>
              <div className="font-mono text-[10px] text-surface-400 mt-0.5">
                3 auto-replies sent today
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          collapsed ? "ml-[72px]" : "ml-60"
        )}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-30 glass border-b border-surface-600">
          <div className="flex items-center justify-between px-8 py-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-surface-100">
                {activeItem?.label || "Dashboard"}
              </h1>
              <p className="font-mono text-xs text-surface-400 mt-1">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-600">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="font-mono text-xs text-success">Store Open</span>
              </div>
              <button className="w-9 h-9 rounded-xl bg-surface-800 border border-surface-600 flex items-center justify-center hover:border-brand/40 transition-colors">
                <Bell size={16} className="text-surface-300" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
