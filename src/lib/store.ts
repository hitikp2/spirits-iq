import { create } from "zustand";
import type { Cart, CartItem, StoreConfig } from "@/types";

// ─── POS / Cart Store ────────────────────────────────────
interface POSState {
  cart: Cart;
  registerId: string | null;
  isProcessing: boolean;

  addItem: (item: Omit<CartItem, "discount"> & { discount?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setCustomer: (id: string, name: string) => void;
  clearCustomer: () => void;
  clearCart: () => void;
  setProcessing: (v: boolean) => void;
  setRegister: (id: string) => void;
}

const TAX_RATE = parseFloat(process.env.NEXT_PUBLIC_TAX_RATE || "0.0975");

function recalcCart(items: CartItem[]): Pick<Cart, "subtotal" | "tax" | "discount" | "total"> {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = items.reduce((s, i) => s + i.discount * i.quantity, 0);
  const taxable = subtotal - discount;
  const tax = taxable * TAX_RATE;
  return { subtotal, tax, discount, total: taxable + tax };
}

export const usePOSStore = create<POSState>((set) => ({
  cart: { items: [], subtotal: 0, tax: 0, discount: 0, total: 0 },
  registerId: null,
  isProcessing: false,

  addItem: (item) =>
    set((state) => {
      const existing = state.cart.items.find((i) => i.productId === item.productId);
      let items: CartItem[];
      if (existing) {
        items = state.cart.items.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        items = [...state.cart.items, { ...item, discount: item.discount || 0 }];
      }
      return { cart: { ...state.cart, items, ...recalcCart(items) } };
    }),

  removeItem: (productId) =>
    set((state) => {
      const items = state.cart.items.filter((i) => i.productId !== productId);
      return { cart: { ...state.cart, items, ...recalcCart(items) } };
    }),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      const items = quantity > 0
        ? state.cart.items.map((i) => (i.productId === productId ? { ...i, quantity } : i))
        : state.cart.items.filter((i) => i.productId !== productId);
      return { cart: { ...state.cart, items, ...recalcCart(items) } };
    }),

  setCustomer: (id, name) =>
    set((state) => ({ cart: { ...state.cart, customerId: id, customerName: name } })),

  clearCustomer: () =>
    set((state) => {
      const { customerId, customerName, ...rest } = state.cart;
      return { cart: rest as Cart };
    }),

  clearCart: () =>
    set({ cart: { items: [], subtotal: 0, tax: 0, discount: 0, total: 0 } }),

  setProcessing: (v) => set({ isProcessing: v }),
  setRegister: (id) => set({ registerId: id }),
}));

// ─── App / UI Store ──────────────────────────────────────
interface AppState {
  storeConfig: StoreConfig | null;
  sidebarCollapsed: boolean;
  activePage: string;
  isMobile: boolean;
  notifications: Array<{ id: string; type: string; message: string; createdAt: string }>;

  setStoreConfig: (config: StoreConfig) => void;
  toggleSidebar: () => void;
  setActivePage: (page: string) => void;
  setMobile: (v: boolean) => void;
  addNotification: (n: { type: string; message: string }) => void;
  dismissNotification: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  storeConfig: null,
  sidebarCollapsed: false,
  activePage: "dashboard",
  isMobile: false,
  notifications: [],

  setStoreConfig: (config) => set({ storeConfig: config }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActivePage: (page) => set({ activePage: page }),
  setMobile: (v) => set({ isMobile: v }),
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { ...n, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
      ],
    })),
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}));
