"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, CreditCard, Package, MessageSquare,
  Brain, Settings, Bell, ChevronLeft, ChevronRight, LogOut, Sparkles, X, Menu,
  Users, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "pos", label: "Point of Sale", icon: CreditCard, href: "/pos" },
  { id: "inventory", label: "Inventory", icon: Package, href: "/inventory" },
  { id: "customers", label: "Customers", icon: Users, href: "/customers" },
  { id: "sms", label: "SMS / AI Chat", icon: MessageSquare, href: "/sms" },
  { id: "insights", label: "AI Insights", icon: Brain, href: "/insights" },
  { id: "reports", label: "Reports", icon: BarChart3, href: "/reports" },
  { id: "features", label: "Features", icon: Sparkles, href: "/features" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/sms?storeId=${storeId}&action=ai-stats`);
      const json = await res.json();
      return json.success ? json.data : { autoReplies: 0 };
    },
    enabled: !!storeId,
    refetchInterval: 60_000,
  });
  const autoReplies = (aiStatus as any)?.autoReplies ?? 0;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const activeItem = NAV_ITEMS.find((n) => pathname.startsWith(n.href));
  const isPos = pathname === "/pos";

  // ─── Swipe navigation for POS ───
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeBlocked = useRef(false);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    // Block swipe if touch starts inside a horizontally scrollable element
    let el = e.target as HTMLElement | null;
    swipeBlocked.current = false;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth + 1) {
        swipeBlocked.current = true;
        break;
      }
      el = el.parentElement;
    }
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isPos || swipeBlocked.current) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only trigger on horizontal swipes (>100px, more horizontal than vertical)
    if (Math.abs(dx) > 100 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) router.push("/dashboard");   // swipe right → dashboard
      else router.push("/inventory");            // swipe left → inventory
    }
  }, [isPos, router]);

  // ─── MOBILE LAYOUT ──────────────────────────────────
  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col bg-surface-950">
        {/* Top Bar */}
        <header className="flex-shrink-0 z-40 glass border-b border-surface-600 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-2.5 bg-transparent border-none"
              onClick={() => setMobileMenuOpen(true)}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-sm pointer-events-none">
                🥃
              </div>
              <div className="pointer-events-none">
                <span className="font-display text-base font-bold tracking-wide text-surface-100">
                  SPIRITS{" "}
                </span>
                <span className="font-mono text-[10px] text-brand tracking-[2px]">IQ</span>
              </div>
            </button>
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

        {/* Mobile Drawer Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          >
            {/* Drawer Panel */}
            <aside
              className="absolute inset-y-0 left-0 w-72 bg-surface-900 border-r border-surface-600 flex flex-col animate-in slide-in-from-left duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-surface-600">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-lg">
                    🥃
                  </div>
                  <div>
                    <span className="font-display text-lg font-bold tracking-wide text-surface-100">
                      SPIRITS
                    </span>
                    <span className="font-mono text-[10px] text-brand tracking-[2px] ml-1">
                      IQ
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-600 flex items-center justify-center"
                >
                  <X size={16} className="text-surface-300" />
                </button>
              </div>

              {/* Nav Items */}
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        router.push(item.href);
                        setMobileMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                        active
                          ? "bg-brand/10 text-brand border-l-[3px] border-brand"
                          : "text-surface-300 hover:text-surface-100 hover:bg-surface-800 border-l-[3px] border-transparent"
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* AI Status */}
              <div className="px-4 py-3 border-t border-surface-600">
                <div className="rounded-xl bg-brand/10 border border-brand/20 p-3 mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                    <span className="font-mono text-[10px] text-brand tracking-wide">
                      AI STATUS
                    </span>
                  </div>
                  <div className="font-body text-xs text-success">All Systems Active</div>
                  <div className="font-mono text-[10px] text-surface-400 mt-0.5">
                    {autoReplies} auto-{autoReplies === 1 ? "reply" : "replies"} sent today
                  </div>
                </div>

                {/* User + Sign Out */}
                {session?.user && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-surface-800 border border-surface-600 flex items-center justify-center shrink-0">
                      <span className="font-display text-xs font-bold text-surface-300">
                        {(session.user.name || "U").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-xs font-medium text-surface-200 truncate">{session.user.name}</p>
                      <p className="font-mono text-[10px] text-surface-400 truncate">{(session.user as any)?.role}</p>
                    </div>
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Sign out"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain",
            isPos ? "px-0 py-0" : "px-4 py-4"
          )}
          style={{ WebkitOverflowScrolling: "touch" as any }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >{children}</main>

        {/* Bottom Tab Bar — hidden on POS for full-screen checkout */}
        {!isPos && (
          <nav className="flex-shrink-0 z-30 glass border-t border-surface-600">
            <div className="flex justify-around items-center py-2 pb-5">
              {NAV_ITEMS.slice(0, 6).map((item) => {
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
        )}
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
        <button
          type="button"
          className={cn(
            "flex items-center gap-2.5 py-5 cursor-pointer w-full bg-transparent border-none",
            collapsed ? "justify-center px-0" : "px-4"
          )}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-lg shrink-0 pointer-events-none">
            🥃
          </div>
          {!collapsed && (
            <div className="pointer-events-none">
              <span className="font-display text-lg font-bold tracking-wide text-surface-100">
                SPIRITS
              </span>
              <span className="font-mono text-[10px] text-brand tracking-[2px] ml-1">
                IQ
              </span>
            </div>
          )}
        </button>

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
                {autoReplies} auto-{autoReplies === 1 ? "reply" : "replies"} sent today
              </div>
            </div>
          )}
          {/* User Profile + Sign Out */}
          {session?.user && (
            <div className={cn("mb-3", collapsed ? "text-center" : "flex items-center gap-2")}>
              <div className="w-8 h-8 rounded-full bg-surface-800 border border-surface-600 flex items-center justify-center shrink-0 mx-auto">
                <span className="font-display text-xs font-bold text-surface-300">
                  {(session.user.name || "U").charAt(0).toUpperCase()}
                </span>
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="font-body text-xs font-medium text-surface-200 truncate">{session.user.name}</p>
                  <p className="font-mono text-[10px] text-surface-400 truncate">{(session.user as any)?.role}</p>
                </div>
              )}
              {!collapsed && (
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>
          )}
          {collapsed && session?.user && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center justify-center py-2 mb-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
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
        <div className={pathname === "/pos" ? "p-0" : "p-8"}>{children}</div>
      </main>
    </div>
  );
}
