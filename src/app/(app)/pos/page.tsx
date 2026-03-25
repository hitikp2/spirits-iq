"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useInventory, useProcessSale, useUpsellSuggestion } from "@/hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, cn } from "@/lib/utils";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import ScannerModal from "./ScannerModal";
import CheckoutModal from "./CheckoutModal";
import ReceiptModal from "./ReceiptModal";
import AgeVerificationModal from "@/components/pos/AgeVerificationModal";
import { toast } from "sonner";

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
  barcode: string | null;
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
      <div className="flex gap-2 sticky bottom-0 bg-surface-900 pt-2 pb-1">
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

// ─── NFC Tap to Pay Modal ────────────────────────────────
function NfcTapModal({
  total,
  storeId,
  cashierId,
  onSuccess,
  onCancel,
}: {
  total: number;
  storeId: string;
  cashierId: string;
  onSuccess: (paymentIntentId: string, cardLast4?: string, cardBrand?: string) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"initializing" | "ready" | "waiting" | "processing" | "done" | "error">("initializing");
  const [error, setError] = useState("");
  const terminalRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { loadStripeTerminal } = await import("@stripe/terminal-js");
        const StripeTerminal = await loadStripeTerminal();
        if (!StripeTerminal) throw new Error("Failed to load Stripe Terminal SDK");

        const terminal = StripeTerminal.create({
          onFetchConnectionToken: async () => {
            const res = await fetch("/api/terminal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "connection-token" }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data.secret;
          },
          onUnexpectedReaderDisconnect: () => {
            if (!cancelled) {
              setError("Reader disconnected unexpectedly");
              setStatus("error");
            }
          },
        });

        if (cancelled) return;
        terminalRef.current = terminal;

        // Discover and connect to the tap-to-pay reader (built into the device)
        setStatus("ready");
        const discoverResult = await terminal.discoverReaders({
          simulated: false,
        });

        if (cancelled) return;

        if ("error" in discoverResult) {
          // Try simulated mode as fallback (dev/testing)
          const simResult = await terminal.discoverReaders({ simulated: true });
          if ("error" in simResult || simResult.discoveredReaders.length === 0) {
            setError("No NFC reader found. Ensure NFC is enabled on this device.");
            setStatus("error");
            return;
          }
          await terminal.connectReader(simResult.discoveredReaders[0]);
        } else if (discoverResult.discoveredReaders.length === 0) {
          setError("No NFC reader found. This device may not support Tap to Pay.");
          setStatus("error");
          return;
        } else {
          const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
          if ("error" in connectResult) {
            setError("Could not connect to NFC reader");
            setStatus("error");
            return;
          }
        }

        if (cancelled) return;

        // Create a card-present PaymentIntent on the server
        const piRes = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create-intent",
            amount: Math.round(total * 100),
            cashierId,
          }),
        });
        const piJson = await piRes.json();
        if (!piJson.success) {
          setError(piJson.error || "Failed to create payment");
          setStatus("error");
          return;
        }

        if (cancelled) return;
        setStatus("waiting");

        // Collect payment method (NFC tap)
        const collectResult = await terminal.collectPaymentMethod(piJson.data.clientSecret);
        if ("error" in collectResult) {
          if (!cancelled) {
            setError(collectResult.error.message || "Card tap cancelled");
            setStatus("error");
          }
          return;
        }

        if (cancelled) return;
        setStatus("processing");

        // Confirm the payment
        const confirmResult = await terminal.processPayment(collectResult.paymentIntent);
        if ("error" in confirmResult) {
          setError(confirmResult.error.message || "Payment failed");
          setStatus("error");
          return;
        }

        if (cancelled) return;

        // Get card details from server
        const captureRes = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "capture",
            paymentIntentId: confirmResult.paymentIntent.id,
          }),
        });
        const captureJson = await captureRes.json();

        setStatus("done");
        onSuccess(
          confirmResult.paymentIntent.id,
          captureJson.data?.cardLast4,
          captureJson.data?.cardBrand
        );
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "NFC initialization failed");
          setStatus("error");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (terminalRef.current) {
        try { terminalRef.current.disconnectReader(); } catch {}
      }
    };
  }, [total, cashierId, onSuccess, storeId]);

  function handleCancel() {
    if (terminalRef.current) {
      try { terminalRef.current.cancelCollectPaymentMethod(); } catch {}
      try { terminalRef.current.disconnectReader(); } catch {}
    }
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-600 bg-surface-900 shadow-2xl p-6 text-center">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold text-surface-100">Tap to Pay</h2>
          <p className="font-mono text-sm text-brand">{formatCurrency(total)}</p>
        </div>

        {/* NFC Icon */}
        <div className="my-8 flex justify-center">
          <div className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center transition-all",
            status === "waiting" ? "bg-brand/20 animate-pulse" : "bg-surface-800",
            status === "done" ? "bg-success/20" : "",
            status === "error" ? "bg-danger/20" : ""
          )}>
            {status === "done" ? (
              <svg className="w-12 h-12 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : status === "error" ? (
              <svg className="w-12 h-12 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-12 h-12 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" />
                <circle cx="12" cy="18" r="1.5" fill="currentColor" />
              </svg>
            )}
          </div>
        </div>

        <p className="font-body text-sm text-surface-300 mb-2">
          {status === "initializing" && "Connecting to NFC reader..."}
          {status === "ready" && "Discovering reader..."}
          {status === "waiting" && "Hold card near the back of this device"}
          {status === "processing" && "Processing payment..."}
          {status === "done" && "Payment successful!"}
          {status === "error" && error}
        </p>

        {status !== "done" && (
          <button
            onClick={handleCancel}
            className="mt-4 w-full py-3 rounded-xl font-display font-bold text-sm bg-surface-800 text-surface-300 hover:bg-surface-700 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default function POSPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
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
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "APPLE_PAY" | "GOOGLE_PAY" | "NFC">("CARD");
  const [paymentError, setPaymentError] = useState("");

  // NFC Tap to Pay state
  const [nfcModal, setNfcModal] = useState(false);

  // Cart expand/collapse (mobile bottom sheet)
  const [cartExpanded, setCartExpanded] = useState(false);

  // Scanner modal
  const [scannerOpen, setScannerOpen] = useState(false);

  // Image refresh state — tracks which product IDs are currently refreshing
  const [refreshingImages, setRefreshingImages] = useState<Set<string>>(new Set());

  const refreshProductImage = useCallback(async (product: Product) => {
    setRefreshingImages((prev) => new Set(prev).add(product.id));
    try {
      const res = await fetch("/api/product-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refresh-image",
          productId: product.id,
          name: product.name,
          brand: product.brand,
          size: product.size,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.imageUrl) {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        toast.success("Product photo updated");
      } else {
        toast.error(json.error || "Could not find a product image");
      }
    } catch {
      toast.error("Failed to refresh image");
    } finally {
      setRefreshingImages((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  }, [queryClient]);

  // Checkout modal
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Receipt modal
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{
    items: Array<{ name: string; brand?: string; size?: string; price: number; quantity: number }>;
    subtotal: number; tax: number; total: number;
    orderNumber: string; paymentMethod: string;
    ageVerified?: boolean; verificationMethod?: string;
    customerId?: string; customerName?: string; customerPhone?: string;
    transactionId?: string;
  } | null>(null);

  // Age verification
  const [ageVerifyOpen, setAgeVerifyOpen] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<string | undefined>();
  const [ageDenied, setAgeDenied] = useState(false);

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

  // Reset age verification when cart composition changes
  useEffect(() => {
    setAgeVerified(false);
    setVerificationMethod(undefined);
    setAgeDenied(false);
  }, [cart.length]);

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
          price: Number(product.retailPrice),
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

  // Check if cart has age-restricted items
  const restrictedItems = useMemo(() => {
    return cart
      .map((item) => {
        const product = products.find((p: Product) => p.id === item.productId);
        return product?.isAgeRestricted ? { name: item.name, id: item.productId } : null;
      })
      .filter(Boolean) as Array<{ name: string; id: string }>;
  }, [cart, products]);

  const hasAgeRestricted = restrictedItems.length > 0;

  // Handle "Charge" button — gate behind age verification if needed
  const handleChargeClick = useCallback(() => {
    if (cart.length === 0) return;
    setAgeDenied(false);
    if (hasAgeRestricted && !ageVerified) {
      setAgeVerifyOpen(true);
    } else {
      setCheckoutOpen(true);
    }
  }, [cart, hasAgeRestricted, ageVerified]);

  const handleAgeVerified = useCallback((method: string, _detail: string) => {
    setAgeVerified(true);
    setVerificationMethod(method);
    setAgeVerifyOpen(false);
    // Open checkout after successful verification
    setCheckoutOpen(true);
  }, []);

  const handleAgeDenied = useCallback(() => {
    setAgeVerifyOpen(false);
    setAgeDenied(true);
    toast.error("Sale blocked — customer failed age verification");
  }, []);

  // Save order data and show receipt after successful sale
  const completeOrder = useCallback((payMethod: string, transactionId?: string) => {
    const orderItems = cart.map((item) => {
      const product = products.find((p: Product) => p.id === item.productId);
      return {
        name: item.name,
        brand: product?.brand,
        size: product?.size || undefined,
        price: item.price,
        quantity: item.quantity,
      };
    });
    setLastOrder({
      items: orderItems,
      subtotal,
      tax,
      total,
      orderNumber: "SIQ-" + (1000 + Math.floor(Math.random() * 9000)),
      paymentMethod: payMethod,
      ageVerified: ageVerified || undefined,
      verificationMethod: verificationMethod || undefined,
      customerId: customerId || undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      transactionId,
    });
    setCart([]);
    setCustomerId(undefined);
    setCustomerName("");
    setCheckoutOpen(false);
    setSaleSuccess(true);
    setTimeout(() => {
      setSaleSuccess(false);
      setReceiptOpen(true);
    }, 800);
  }, [cart, products, subtotal, tax, total, customerId, customerName, customerPhone, ageVerified, verificationMethod]);

  // Handle charge from checkout modal — defined after payment handlers below
  // (see handleCheckoutCharge below)

  // Cash sale — immediate, no Stripe
  const handleCashChargeInternal = useCallback(() => {
    if (cart.length === 0) return;

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
        ageVerified: ageVerified || undefined,
        verificationMethod: verificationMethod || undefined,
      },
      {
        onSuccess: (data: any) => {
          completeOrder("CASH", data?.id);
        },
      }
    );
  }, [cart, products, saleMutation, storeId, userId, customerId, completeOrder]);

  // Card / Apple Pay / Google Pay — open Stripe payment sheet
  const handleCardCharge = useCallback(
    async (method: "CARD" | "APPLE_PAY" | "GOOGLE_PAY") => {
      if (cart.length === 0) return;
      setPaymentMethod(method);
      setPaymentError("");

      const totalCents = Math.round(total * 100);

      if (totalCents < 50) {
        setPaymentError("Stripe requires a minimum charge of $0.50. Use Cash for smaller amounts.");
        return;
      }

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

  // NFC Tap to Pay — open NFC modal
  const handleNfcCharge = useCallback(() => {
    if (cart.length === 0) return;
    setPaymentMethod("NFC");
    setPaymentError("");
    setNfcModal(true);
  }, [cart]);

  // Called after NFC payment succeeds
  const handleNfcSuccess = useCallback(
    (paymentIntentId: string, cardLast4?: string, cardBrand?: string) => {
      setNfcModal(false);

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
          paymentMethod: "CARD",
          stripePaymentId: paymentIntentId,
          cardLast4,
          cardBrand,
          ageVerified: ageVerified || undefined,
          verificationMethod: verificationMethod || undefined,
        },
        {
          onSuccess: (data: any) => {
            completeOrder("NFC", data?.id);
          },
        }
      );
    },
    [cart, products, saleMutation, storeId, userId, customerId, completeOrder]
  );

  // Called after Stripe payment succeeds
  const handlePaymentSuccess = useCallback(
    (paymentIntentId: string) => {
      setPaymentModal(false);
      setClientSecret(null);

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
          ageVerified: ageVerified || undefined,
          verificationMethod: verificationMethod || undefined,
        },
        {
          onSuccess: (data: any) => {
            completeOrder("CARD", data?.id);
          },
        }
      );
    },
    [cart, saleMutation, storeId, userId, customerId, paymentMethod, completeOrder, ageVerified, verificationMethod]
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

  // Handle charge from checkout modal — routes to correct payment handler
  const handleCheckoutCharge = useCallback((method: "CARD" | "CASH" | "NFC") => {
    setCheckoutOpen(false);
    if (method === "CASH") {
      handleCashChargeInternal();
    } else if (method === "NFC") {
      handleNfcCharge();
    } else {
      handleCardCharge("CARD");
    }
  }, [handleCashChargeInternal, handleNfcCharge, handleCardCharge]);

  // Add to cart from scanner
  const handleScannerAdd = useCallback((productId: string) => {
    const product = products.find((p: Product) => p.id === productId);
    if (product) {
      addToCart(product);
      toast.success(`${product.name} added to cart`);
    }
  }, [products, addToCart]);

  useEffect(() => {
    if (!saleSuccess) return;
    const t = setTimeout(() => setSaleSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [saleSuccess]);

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex flex-col h-full">
      {/* ─── Product Grid Area ─── */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-4 pb-2">
        {/* Search bar + Scanner */}
        <div className="flex gap-1.5 mb-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-base">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, brands, SKU..."
              className="w-full pl-9 pr-4 py-2.5 bg-surface-900 border border-surface-700 rounded-xl text-sm text-surface-100 placeholder:text-surface-500 font-body focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <button
            onClick={() => setScannerOpen(true)}
            className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center text-lg flex-shrink-0 active:bg-brand active:text-surface-950 active:scale-[0.92] transition-all"
            title="Scan Barcode"
          >
            📷
          </button>
        </div>

        {/* Category filter chips */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-body whitespace-nowrap transition-colors border",
              activeCategory === "all"
                ? "bg-surface-100 text-surface-950 border-surface-100 font-semibold"
                : "bg-surface-900 text-surface-300 border-surface-700 hover:border-surface-500"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-body whitespace-nowrap transition-colors border flex items-center gap-1.5",
                activeCategory === cat.id
                  ? "bg-surface-100 text-surface-950 border-surface-100 font-semibold"
                  : "bg-surface-900 text-surface-300 border-surface-700 hover:border-surface-500"
              )}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-surface-400 font-body text-sm">
              No products found
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {filteredProducts.map((product: Product) => {
                const outOfStock = product.quantity <= 0;
                const inCart = cart.find((i) => i.productId === product.id);
                const lowStock = product.quantity > 0 && product.quantity <= 5;
                return (
                  <div
                    key={product.id}
                    onClick={() => !outOfStock && addToCart(product)}
                    className={cn(
                      "relative flex flex-col p-2.5 rounded-xl border transition-all cursor-pointer gap-1 animate-fade-in",
                      outOfStock
                        ? "bg-surface-950 border-surface-800 opacity-40 cursor-not-allowed"
                        : inCart
                        ? "bg-surface-900 border-brand shadow-[0_0_0_1px_var(--tw-shadow-color),0_0_12px_rgba(245,166,35,0.15)] shadow-brand active:scale-[0.97]"
                        : "bg-surface-900 border-surface-700 hover:border-surface-500 active:scale-[0.97] active:border-brand"
                    )}
                  >
                    {/* Cart quantity badge */}
                    {inCart && (
                      <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-brand text-surface-950 text-[9px] font-bold flex items-center justify-center shadow-md font-mono z-10">
                        {inCart.quantity}
                      </span>
                    )}

                    {/* Product image with refresh button */}
                    <div className="relative w-full h-20 rounded-lg overflow-hidden bg-surface-800 -mt-0.5 mb-0.5">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">
                          {product.category?.icon || "📦"}
                        </div>
                      )}
                      {/* Refresh photo button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!refreshingImages.has(product.id)) refreshProductImage(product);
                        }}
                        disabled={refreshingImages.has(product.id)}
                        className="absolute bottom-1 right-1 w-6 h-6 rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-all active:scale-90"
                        title="Find professional photo"
                      >
                        {refreshingImages.has(product.id) ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Top: name + stock */}
                    <div className="flex justify-between items-start">
                      <span className="font-display text-xs font-bold text-surface-100 leading-tight line-clamp-2 pr-5">
                        {product.name}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ml-1 font-mono",
                          outOfStock
                            ? "bg-danger/20 text-danger"
                            : lowStock
                            ? "bg-red-500/20 text-red-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        )}
                      >
                        {outOfStock ? "0" : product.quantity}
                      </span>
                    </div>

                    {/* Meta */}
                    <span className="text-[10px] text-surface-400 font-body truncate leading-tight">
                      {product.brand}{product.size ? ` · ${product.size}` : ""}
                    </span>

                    {/* Price + Add button */}
                    <div className="mt-auto pt-1.5 flex items-end justify-between">
                      <span className="font-mono text-base font-bold text-brand leading-none">
                        {formatCurrency(Number(product.retailPrice))}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!outOfStock) addToCart(product); }}
                        disabled={outOfStock}
                        className={cn(
                          "w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[15px] font-semibold transition-all",
                          outOfStock
                            ? "bg-surface-800 text-surface-600 cursor-not-allowed"
                            : "bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-surface-950 active:scale-[0.85]"
                        )}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Cart Bottom Sheet ─── */}
      {cartExpanded && cart.length > 0 && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setCartExpanded(false)} />
      )}
      <div className={cn(
        "flex-shrink-0 z-50 bg-surface-900 border-t border-surface-700 transition-all rounded-t-[20px]",
        cartExpanded && "fixed bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto",
        !cartExpanded && "relative",
        cart.length === 0 && "hidden"
      )}>
        {/* Cart header — always visible */}
        <button
          onClick={() => cart.length > 0 && setCartExpanded(!cartExpanded)}
          className="w-full flex items-center justify-between px-4 py-2.5"
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold text-surface-100">Cart</span>
            {cartItemCount > 0 && (
              <span className="min-w-[22px] h-[22px] rounded-full bg-brand text-surface-950 flex items-center justify-center text-xs font-bold font-mono px-1">
                {cartItemCount}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <span className="text-xs text-surface-400 font-body flex items-center gap-1">
              <svg className={cn("w-3 h-3 transition-transform", cartExpanded ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
              {cartExpanded ? "Collapse" : "Expand"}
            </span>
          )}
        </button>

        {/* Customer toggle — visible when cart has items */}
        {cart.length > 0 && (
          <div className="px-4 pb-1.5">
            {customerId ? (
              <button
                onClick={() => { setCustomerId(undefined); setCustomerName(""); setCustomerPhone(""); setLookupResult(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 border border-success/15 text-success text-[10px] font-semibold transition-all active:scale-95"
              >
                ✓ {customerName} ({lookupResult?.loyaltyPoints?.toLocaleString() || "0"} pts)
              </button>
            ) : (
              <button
                onClick={() => setCustomerLookupOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-info/10 border border-info/12 text-info text-[10px] font-semibold transition-all active:scale-95"
              >
                👤 Add Customer
              </button>
            )}
          </div>
        )}

        {/* Expanded cart content */}
        {cartExpanded && cart.length > 0 && (
          <div className="overflow-y-auto max-h-[30vh] px-4 pb-2 space-y-1.5">
            {/* Customer section */}
            <div className="pb-2">
              {customerId ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center">
                      <span className="font-display text-[10px] font-bold text-brand">
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
                    className="text-[10px] text-surface-400 hover:text-danger font-body transition-colors"
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
                      className="flex-1 px-3 py-1.5 bg-surface-800 border border-surface-600 rounded-lg text-surface-100 font-mono text-xs placeholder:text-surface-400 focus:outline-none focus:border-brand"
                    />
                    <button
                      onClick={handleCustomerLookup}
                      disabled={lookupLoading || !customerPhone.trim()}
                      className="px-3 py-1.5 rounded-lg bg-brand text-surface-950 font-display text-xs font-semibold disabled:opacity-50"
                    >
                      {lookupLoading ? "..." : "Find"}
                    </button>
                  </div>
                  {lookupResult === "not_found" && (
                    <div className="flex items-center justify-between px-1">
                      <span className="font-body text-xs text-surface-400">Not found</span>
                      <button
                        onClick={handleAddCustomer}
                        disabled={lookupLoading}
                        className="text-xs text-brand font-body font-medium hover:underline"
                      >
                        + Create
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => { setCustomerLookupOpen(false); setLookupResult(null); }}
                    className="text-[10px] text-surface-400 hover:text-surface-100 font-body transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCustomerLookupOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-surface-600 text-xs text-surface-400 hover:text-brand hover:border-brand font-body transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                  </svg>
                  Add Customer (Loyalty)
                </button>
              )}
            </div>

            {/* Sale success */}
            {saleSuccess ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center">
                  <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-display text-base font-bold text-success">Sale Complete</span>
              </div>
            ) : (
              <>
                {/* Cart items */}
                {cart.map((item) => {
                  const product = products.find((p: Product) => p.id === item.productId);
                  return (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between py-2 border-b border-surface-800 last:border-0"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-body text-sm font-medium text-surface-100 truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-surface-400 font-body truncate">
                          {product?.brand}{product?.size ? ` · ${product.size}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center">
                          <button
                            onClick={() => updateQuantity(item.productId, -1)}
                            className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center text-sm font-bold transition-colors"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono text-sm font-semibold text-surface-100">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.productId, 1)}
                            className="w-7 h-7 rounded-lg bg-brand/20 text-brand hover:bg-brand/30 flex items-center justify-center text-sm font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-mono text-sm font-semibold text-surface-100 w-16 text-right">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Upsells */}
                {upsells && upsells.length > 0 && (
                  <div className="mt-2 p-2.5 bg-brand/10 border border-brand/20 rounded-xl">
                    <p className="text-[10px] font-semibold text-brand font-display mb-1.5 uppercase tracking-wider">
                      Suggested
                    </p>
                    {upsells.map((u) => (
                      <div key={u.productId} className="flex items-center justify-between py-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-surface-100 font-body truncate">{u.name}</p>
                          <p className="text-[10px] text-surface-400 font-body truncate">{u.reason}</p>
                        </div>
                        <button
                          onClick={() => {
                            const product = products.find((p: Product) => p.id === u.productId);
                            if (product) addToCart(product);
                          }}
                          className="ml-2 px-2 py-0.5 text-[10px] bg-brand/20 text-brand rounded-md hover:bg-brand/30 transition-colors font-body"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Totals + Charge button — always visible when cart has items */}
        {cart.length > 0 && !saleSuccess && (
          <div className="px-4 pt-1 space-y-1.5" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}>
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] font-body">
                <span className="text-surface-400">Subtotal</span>
                <span className="text-surface-300 font-mono">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[10px] font-body">
                <span className="text-surface-400">Tax (9.75%)</span>
                <span className="text-surface-300 font-mono">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-display font-bold pt-1">
                <span className="text-surface-100">Total</span>
                <span className="text-brand font-mono">{formatCurrency(total)}</span>
              </div>
            </div>

            {(saleMutation.isError || paymentError) && (
              <p className="text-[10px] text-danger font-body text-center">
                {paymentError || (saleMutation.error as Error)?.message || "Sale failed. Try again."}
              </p>
            )}

            {/* Age denied warning */}
            {ageDenied && (
              <p className="text-[10px] text-danger font-body text-center">
                Sale blocked — remove age-restricted items or re-verify ID
              </p>
            )}

            {/* Checkout button — gates through age verification if needed */}
            <button
              onClick={handleChargeClick}
              disabled={cart.length === 0 || saleMutation.isPending}
              className={cn(
                "w-full h-[42px] rounded-xl font-display font-bold text-sm transition-all flex items-center justify-center gap-2 tracking-wide",
                cart.length === 0
                  ? "bg-surface-800 text-surface-500 cursor-not-allowed"
                  : "bg-brand text-surface-950 hover:brightness-110 active:scale-[0.97] active:brightness-90"
              )}
            >
              {hasAgeRestricted && !ageVerified ? "🪪" : "💳"}{" "}
              {saleMutation.isPending ? "Processing..." : `Charge ${formatCurrency(total)}`}
            </button>
          </div>
        )}
      </div>

      {/* ─── Stripe Payment Modal ─── */}
      {paymentModal && clientSecret && stripePromise && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-0 sm:px-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-surface-600 bg-surface-900 shadow-2xl max-h-[95vh] overflow-y-auto">
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

      {/* ─── NFC Tap to Pay Modal ─── */}
      {nfcModal && (
        <NfcTapModal
          total={total}
          storeId={storeId}
          cashierId={userId}
          onSuccess={handleNfcSuccess}
          onCancel={() => {
            setNfcModal(false);
            setPaymentError("");
          }}
        />
      )}

      {/* ─── Age Verification Modal ─── */}
      <AgeVerificationModal
        open={ageVerifyOpen}
        onVerified={handleAgeVerified}
        onDenied={handleAgeDenied}
        restrictedItems={restrictedItems}
      />

      {/* ─── Barcode Scanner Modal ─── */}
      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onAddToCart={handleScannerAdd}
        onProductCreated={() => queryClient.invalidateQueries({ queryKey: ["inventory"] })}
        products={products as any}
        storeId={storeId}
      />

      {/* ─── Checkout Modal ─── */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        items={cart.map((item) => {
          const product = products.find((p: Product) => p.id === item.productId);
          return {
            productId: item.productId,
            name: item.name,
            brand: product?.brand,
            size: product?.size || undefined,
            price: item.price,
            quantity: item.quantity,
          };
        })}
        subtotal={subtotal}
        tax={tax}
        total={total}
        customerName={customerName || undefined}
        onCharge={handleCheckoutCharge}
        processing={saleMutation.isPending}
      />

      {/* ─── Receipt Modal ─── */}
      {lastOrder && (
        <ReceiptModal
          open={receiptOpen}
          onClose={() => { setReceiptOpen(false); setLastOrder(null); }}
          items={lastOrder.items}
          subtotal={lastOrder.subtotal}
          tax={lastOrder.tax}
          total={lastOrder.total}
          orderNumber={lastOrder.orderNumber}
          paymentMethod={lastOrder.paymentMethod}
          cashierName={(session?.user as any)?.name || "Cashier"}
          customerName={lastOrder.customerName}
          customerId={lastOrder.customerId}
          customerPhone={lastOrder.customerPhone}
          storeId={storeId}
          ageVerified={lastOrder.ageVerified}
          verificationMethod={lastOrder.verificationMethod}
          transactionId={lastOrder.transactionId}
          onSendEmail={() => toast.success("Receipt sent via email")}
        />
      )}
    </div>
  );
}
