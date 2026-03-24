"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useInventory, useProcessSale, useUpsellSuggestion } from "@/hooks/useApi";
import { formatCurrency, cn } from "@/lib/utils";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const TAX_RATE = 0.0975;

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  retailPrice: number;
  quantity: number;
  categoryId: string;
  category: { name: string; icon: string };
  imageUrl: string | null;
  isAgeRestricted: boolean;
  size: string | null;
  abv: number | null;
}

// ─── Stripe Payment Form (inside Elements provider) ─────
function PaymentForm({
  total,
  onSuccess,
  onCancel,
}: {
  total: number;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError("");

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(submitError.message || "Payment failed");
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onSuccess(paymentIntent.id);
    } else {
      setError("Payment was not completed. Please try again.");
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-surface-600 bg-white p-4">
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: { applePay: "auto", googlePay: "auto" },
          }}
        />
      </div>
      {error && (
        <p className="font-body text-xs text-danger text-center">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 py-3 rounded-xl font-display font-bold text-sm bg-surface-800 text-surface-300 hover:bg-surface-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 py-3 rounded-xl font-display font-bold text-sm bg-brand text-surface-950 transition-opacity disabled:opacity-50"
        >
          {processing ? "Processing..." : `Pay ${formatCurrency(total)}`}
        </button>
      </div>
    </form>
  );
}

export default function POSPage() {
  const { data: session } = useSession();
  const storeId = (session?.user as any)?.storeId ?? "";
  const userId = (session?.user as any)?.id ?? "";

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [saleSuccess, setSaleSuccess] = useState(false);
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLookupOpen, setCustomerLookupOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);

  // Stripe payment modal state
  const [paymentModal, setPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "APPLE_PAY" | "GOOGLE_PAY">("CARD");
  const [paymentError, setPaymentError] = useState("");

  const { data: products = [], isLoading } = useInventory(storeId) as {
    data: Product[];
    isLoading: boolean;
  };
  const saleMutation = useProcessSale();

  const cartProductIds = useMemo(() => cart.map((i) => i.productId), [cart]);
  const { data: upsells } = useUpsellSuggestion(storeId, cartProductIds) as {
    data: Array<{ productId: string; name: string; reason: string }> | undefined;
  };

  const categories = useMemo(() => {
    const seen = new Map<string, { name: string; icon: string }>();
    products.forEach((p: Product) => {
      if (!seen.has(p.categoryId)) {
        seen.set(p.categoryId, p.category);
      }
    });
    return Array.from(seen.entries()).map(([id, cat]) => ({
      id,
      ...cat,
    }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p: Product) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.brand.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        activeCategory === "all" || p.categoryId === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const addToCart = useCallback((product: Product) => {
    if (product.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) return prev;
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.retailPrice,
          quantity: 1,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback(
    (productId: string, delta: number) => {
      setCart((prev) => {
        return prev
          .map((item) => {
            if (item.productId !== productId) return item;
            const product = products.find((p: Product) => p.id === productId);
            const maxQty = product?.quantity ?? 999;
            const newQty = Math.min(item.quantity + delta, maxQty);
            return { ...item, quantity: newQty };
          })
          .filter((item) => item.quantity > 0);
      });
    },
    [products]
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [cart]
  );
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  // Cash sale — immediate, no Stripe
  const handleCashCharge = useCallback(() => {
    if (cart.length === 0) return;
    const hasAgeRestricted = cart.some((item) => {
      const product = products.find((p: Product) => p.id === item.productId);
      return product?.isAgeRestricted;
    });

    saleMutation.mutate(
      {
        storeId,
        cashierId: userId,
        customerId,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.price,
          discount: 0,
        })),
        paymentMethod: "CASH",
        ageVerified: hasAgeRestricted ? true : undefined,
      },
      {
        onSuccess: () => {
          setCart([]);
          setCustomerId(undefined);
          setCustomerName("");
          setSaleSuccess(true);
        },
      }
    );
  }, [cart, products, saleMutation, storeId, userId, customerId]);

  // Card / Apple Pay / Google Pay — open Stripe payment sheet
  const handleCardCharge = useCallback(
    async (method: "CARD" | "APPLE_PAY" | "GOOGLE_PAY") => {
      if (cart.length === 0) return;
      setPaymentMethod(method);
      setPaymentError("");

      const totalCents = Math.round(total * 100);

      try {
        // Create PaymentIntent
        const res = await fetch("/api/pos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create-intent", amount: totalCents, storeId }),
        });
        const json = await res.json();

        if (!json.success) {
          setPaymentError(json.error || "Could not create payment. Is Stripe configured?");
          return;
        }

        // Load Stripe.js with the publishable key
        const pkRes = await fetch("/api/integrations?storeId=" + storeId + "&action=stripe-pk");
        const pkJson = await pkRes.json();
        const pk = pkJson.data?.publishableKey || "";

        if (!pk) {
          setPaymentError("Stripe Publishable Key not configured. Add it in Settings > Integrations.");
          return;
        }

        setStripePromise(loadStripe(pk));
        setClientSecret(json.data.clientSecret);
        setPaymentModal(true);
      } catch {
        setPaymentError("Network error creating payment");
      }
    },
    [cart, total, storeId]
  );

  // Called after Stripe payment succeeds
  const handlePaymentSuccess = useCallback(
    (paymentIntentId: string) => {
      setPaymentModal(false);
      setClientSecret(null);

      const hasAgeRestricted = cart.some((item) => {
        const product = products.find((p: Product) => p.id === item.productId);
        return product?.isAgeRestricted;
      });

      saleMutation.mutate(
        {
          storeId,
          cashierId: userId,
          customerId,
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price,
            discount: 0,
          })),
          paymentMethod,
          stripePaymentId: paymentIntentId,
          ageVerified: hasAgeRestricted ? true : undefined,
        },
        {
          onSuccess: () => {
            setCart([]);
            setCustomerId(undefined);
            setCustomerName("");
            setSaleSuccess(true);
          },
        }
      );
    },
    [cart, products, saleMutation, storeId, userId, customerId, paymentMethod]
  );

  const handleCustomerLookup = useCallback(async () => {
    if (!customerPhone.trim() || !storeId) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", storeId, phone: customerPhone.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setLookupResult(json.data);
        setCustomerId(json.data.id);
        setCustomerName([json.data.firstName, json.data.lastName].filter(Boolean).join(" ") || "Customer");
        setCustomerLookupOpen(false);
      } else {
        setLookupResult("not_found");
      }
    } catch {
      setLookupResult("error");
    } finally {
      setLookupLoading(false);
    }
  }, [customerPhone, storeId]);

  const handleAddCustomer = useCallback(async () => {
    if (!customerPhone.trim() || !storeId) return;
    setLookupLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          storeId,
          phone: customerPhone.trim(),
          firstName: "New",
          lastName: "Customer",
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setCustomerId(json.data.id);
        setCustomerName("New Customer");
        setCustomerLookupOpen(false);
        setLookupResult(null);
      }
    } catch {}
    setLookupLoading(false);
  }, [customerPhone, storeId]);

  useEffect(() => {
    if (!saleSuccess) return;
    const t = setTimeout(() => setSaleSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [saleSuccess]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-5rem)] p-4">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, brand, or SKU..."
            className="w-full px-4 py-3 bg-surface-900 border border-surface-600 rounded-xl text-surface-100 placeholder:text-surface-400 font-body focus:outline-none focus:border-brand transition-colors"
          />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-body whitespace-nowrap transition-colors",
              activeCategory === "all"
                ? "bg-brand text-surface-950 font-semibold"
                : "bg-surface-900 text-surface-300 hover:bg-surface-800"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-body whitespace-nowrap transition-colors",
                activeCategory === cat.id
                  ? "bg-brand text-surface-950 font-semibold"
                  : "bg-surface-900 text-surface-300 hover:bg-surface-800"
              )}
            >
              <span className="mr-1.5">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-surface-400 font-body">
              No products found
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product: Product) => {
                const outOfStock = product.quantity <= 0;
                const inCart = cart.find((i) => i.productId === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={outOfStock}
                    className={cn(
                      "relative flex flex-col p-3 rounded-2xl border text-left transition-all",
                      outOfStock
                        ? "bg-surface-950 border-surface-800 opacity-40 cursor-not-allowed"
                        : "bg-surface-900 border-surface-600 hover:border-brand hover:bg-surface-800 active:scale-[0.98]"
                    )}
                  >
                    {inCart && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 bg-brand text-surface-950 rounded-full flex items-center justify-center text-xs font-bold font-mono">
                        {inCart.quantity}
                      </span>
                    )}
                    <span className="font-display text-sm font-semibold text-surface-100 leading-tight line-clamp-2">
                      {product.name}
                    </span>
                    <span className="text-xs text-surface-400 font-body mt-1 truncate">
                      {product.brand}
                    </span>
                    {product.size && (
                      <span className="text-xs text-surface-400 font-body">
                        {product.size}
                      </span>
                    )}
                    <div className="mt-auto pt-2 flex items-end justify-between">
                      <span className="font-mono text-sm font-bold text-brand">
                        {formatCurrency(product.retailPrice)}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-mono",
                          outOfStock
                            ? "text-danger"
                            : product.quantity <= 5
                            ? "text-brand"
                            : "text-surface-400"
                        )}
                      >
                        {outOfStock ? "Out" : `${product.quantity} left`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-96 flex flex-col bg-surface-900 rounded-2xl border border-surface-600 min-h-0 lg:max-h-full">
        <div className="px-4 py-3 border-b border-surface-600">
          <h2 className="font-display text-lg font-bold text-surface-100">
            Cart
            {cart.length > 0 && (
              <span className="ml-2 text-sm font-mono text-surface-400">
                ({cart.reduce((s, i) => s + i.quantity, 0)} items)
              </span>
            )}
          </h2>
        </div>

        {/* Customer Section */}
        <div className="px-4 py-2 border-b border-surface-600">
          {customerId ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center">
                  <span className="font-display text-xs font-bold text-brand">
                    {customerName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-body text-xs font-medium text-surface-100">{customerName}</p>
                  <p className="font-mono text-[10px] text-surface-400">Loyalty linked</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setCustomerId(undefined);
                  setCustomerName("");
                  setCustomerPhone("");
                  setLookupResult(null);
                }}
                className="text-xs text-surface-400 hover:text-danger font-body transition-colors"
              >
                Remove
              </button>
            </div>
          ) : customerLookupOpen ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomerLookup()}
                  placeholder="Phone number..."
                  className="flex-1 px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-xs placeholder:text-surface-400 focus:outline-none focus:border-brand"
                />
                <button
                  onClick={handleCustomerLookup}
                  disabled={lookupLoading || !customerPhone.trim()}
                  className="px-3 py-2 rounded-lg bg-brand text-surface-950 font-display text-xs font-semibold disabled:opacity-50"
                >
                  {lookupLoading ? "..." : "Find"}
                </button>
              </div>
              {lookupResult === "not_found" && (
                <div className="flex items-center justify-between px-2">
                  <span className="font-body text-xs text-surface-400">No customer found</span>
                  <button
                    onClick={handleAddCustomer}
                    disabled={lookupLoading}
                    className="text-xs text-brand font-body font-medium hover:underline"
                  >
                    + Create New
                  </button>
                </div>
              )}
              <button
                onClick={() => { setCustomerLookupOpen(false); setLookupResult(null); }}
                className="text-xs text-surface-400 hover:text-surface-100 font-body transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCustomerLookupOpen(true)}
              className="flex items-center gap-2 text-xs text-surface-400 hover:text-brand font-body transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
              Add Customer (Loyalty)
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {saleSuccess ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="font-display text-lg font-bold text-success">
                Sale Complete
              </span>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-surface-400 font-body text-sm">
              Tap a product to add it
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.productId}
                className="flex items-center gap-3 p-3 bg-surface-800 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-surface-100 truncate">
                    {item.name}
                  </p>
                  <p className="font-mono text-xs text-surface-400">
                    {formatCurrency(item.price)} each
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="w-7 h-7 rounded-lg bg-surface-900 text-surface-300 hover:bg-surface-600 flex items-center justify-center text-sm font-bold transition-colors"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono text-sm text-surface-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, 1)}
                    className="w-7 h-7 rounded-lg bg-surface-900 text-surface-300 hover:bg-surface-600 flex items-center justify-center text-sm font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
                <span className="font-mono text-sm font-semibold text-surface-100 w-20 text-right">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))
          )}

          {upsells && upsells.length > 0 && cart.length > 0 && !saleSuccess && (
            <div className="mt-4 p-3 bg-brand/10 border border-brand/30 rounded-xl">
              <p className="text-xs font-semibold text-brand font-display mb-2">
                Suggested Add-ons
              </p>
              {upsells.map((u) => (
                <div key={u.productId} className="flex items-center justify-between py-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-surface-100 font-body truncate">{u.name}</p>
                    <p className="text-xs text-surface-400 font-body truncate">{u.reason}</p>
                  </div>
                  <button
                    onClick={() => {
                      const product = products.find((p: Product) => p.id === u.productId);
                      if (product) addToCart(product);
                    }}
                    className="ml-2 px-2 py-1 text-xs bg-brand/20 text-brand rounded-lg hover:bg-brand/30 transition-colors font-body"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!saleSuccess && (
          <div className="border-t border-surface-600 p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-sm font-body">
                <span className="text-surface-400">Subtotal</span>
                <span className="text-surface-100 font-mono">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-body">
                <span className="text-surface-400">Tax (9.75%)</span>
                <span className="text-surface-100 font-mono">
                  {formatCurrency(tax)}
                </span>
              </div>
              <div className="flex justify-between text-base font-display font-bold pt-1 border-t border-surface-600">
                <span className="text-surface-100">Total</span>
                <span className="text-brand font-mono">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCashCharge}
                disabled={cart.length === 0 || saleMutation.isPending}
                className={cn(
                  "py-3 rounded-xl font-display font-bold text-sm transition-all",
                  cart.length === 0
                    ? "bg-surface-800 text-surface-400 cursor-not-allowed"
                    : "bg-success text-surface-950 hover:brightness-110 active:scale-[0.98]"
                )}
              >
                {saleMutation.isPending ? "Processing..." : "Cash"}
              </button>
              <button
                onClick={() => handleCardCharge("CARD")}
                disabled={cart.length === 0 || saleMutation.isPending}
                className={cn(
                  "py-3 rounded-xl font-display font-bold text-sm transition-all",
                  cart.length === 0
                    ? "bg-surface-800 text-surface-400 cursor-not-allowed"
                    : "bg-brand text-surface-950 hover:brightness-110 active:scale-[0.98]"
                )}
              >
                {saleMutation.isPending ? "Processing..." : "Card"}
              </button>
              <button
                onClick={() => handleCardCharge("APPLE_PAY")}
                disabled={cart.length === 0 || saleMutation.isPending}
                className={cn(
                  "py-3 rounded-xl font-display font-bold text-sm transition-all",
                  cart.length === 0
                    ? "bg-surface-800 text-surface-400 cursor-not-allowed"
                    : "bg-white text-black hover:brightness-95 active:scale-[0.98]"
                )}
              >
                Apple Pay
              </button>
              <button
                onClick={() => handleCardCharge("GOOGLE_PAY")}
                disabled={cart.length === 0 || saleMutation.isPending}
                className={cn(
                  "py-3 rounded-xl font-display font-bold text-sm transition-all",
                  cart.length === 0
                    ? "bg-surface-800 text-surface-400 cursor-not-allowed"
                    : "bg-white text-black hover:brightness-95 active:scale-[0.98]"
                )}
              >
                Google Pay
              </button>
            </div>

            {(saleMutation.isError || paymentError) && (
              <p className="text-xs text-danger font-body text-center">
                {paymentError || (saleMutation.error as Error)?.message || "Sale failed. Try again."}
              </p>
            )}

            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="w-full py-2 text-xs text-surface-400 hover:text-danger font-body transition-colors"
              >
                Clear Cart
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stripe Payment Modal */}
      {paymentModal && clientSecret && stripePromise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-surface-600 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-600 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-surface-100">Payment</h2>
                <p className="font-mono text-sm text-brand">{formatCurrency(total)}</p>
              </div>
              <button
                onClick={() => {
                  setPaymentModal(false);
                  setClientSecret(null);
                  setPaymentError("");
                }}
                className="rounded-lg p-1 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "night",
                    variables: {
                      colorPrimary: "#F5A623",
                      colorBackground: "#1a1a2e",
                      colorText: "#e0e0e0",
                      borderRadius: "12px",
                    },
                  },
                }}
              >
                <PaymentForm
                  total={total}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => {
                    setPaymentModal(false);
                    setClientSecret(null);
                  }}
                />
              </Elements>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
