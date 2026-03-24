"use client";

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";

interface CartItem {
  productId: string;
  name: string;
  brand?: string;
  size?: string;
  price: number;
  quantity: number;
}

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  customerName?: string;
  customerPoints?: number;
  onCharge: (method: "CARD" | "CASH" | "NFC") => void;
  processing: boolean;
}

const PAY_METHODS = [
  { key: "CARD" as const, icon: "💳", label: "Card" },
  { key: "CASH" as const, icon: "💵", label: "Cash" },
  { key: "NFC" as const, icon: "📱", label: "Tap/NFC" },
];

export default function CheckoutModal({
  open,
  onClose,
  items,
  subtotal,
  tax,
  total,
  customerName,
  customerPoints,
  onCharge,
  processing,
}: CheckoutModalProps) {
  const [payMethod, setPayMethod] = useState<"CARD" | "CASH" | "NFC">("CARD");
  const [cashTendered, setCashTendered] = useState("");
  const earnPts = Math.round(total);

  if (!open) return null;

  const payIcon = PAY_METHODS.find((m) => m.key === payMethod)?.icon || "💳";
  const cashAmount = parseFloat(cashTendered.replace(/[^0-9.]/g, "")) || 0;
  const changeDue = cashAmount - total;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[92vh] bg-surface-900 rounded-t-[20px] flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <span className="font-display text-base font-bold text-surface-100">Checkout</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 text-surface-400 flex items-center justify-center text-sm active:scale-90 transition-transform"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Payment methods */}
          <div className="flex gap-2 mb-4">
            {PAY_METHODS.map((m) => (
              <button
                key={m.key}
                onClick={() => { setPayMethod(m.key); setCashTendered(""); }}
                className={cn(
                  "flex-1 py-3.5 px-2 rounded-xl border-[1.5px] text-center transition-all active:scale-95",
                  payMethod === m.key
                    ? "border-brand bg-brand/15"
                    : "border-surface-700 bg-surface-800"
                )}
              >
                <div className="text-xl mb-1">{m.icon}</div>
                <div
                  className={cn(
                    "text-[10px] font-semibold",
                    payMethod === m.key ? "text-brand" : "text-surface-400"
                  )}
                >
                  {m.label}
                </div>
              </button>
            ))}
          </div>

          {/* Customer */}
          {customerName && (
            <div className="flex items-center gap-3 p-3 bg-surface-800 border border-surface-700 rounded-xl mb-4">
              <div className="w-9 h-9 rounded-full bg-info/10 flex items-center justify-center text-base">
                👤
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-surface-100">{customerName}</div>
                {customerPoints !== undefined && (
                  <div className="text-[10px] text-surface-400">{customerPoints.toLocaleString()} loyalty points</div>
                )}
              </div>
              <div className="text-[10px] text-brand font-semibold">+{earnPts} pts</div>
            </div>
          )}

          {/* Items */}
          <div className="mb-4">
            {items.map((item) => (
              <div
                key={item.productId}
                className="flex justify-between items-center py-2 border-b border-surface-800"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-brand bg-brand/15 w-6 h-6 rounded flex items-center justify-center font-mono">
                    {item.quantity}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-surface-100">{item.name}</div>
                    <div className="text-[10px] text-surface-400">
                      {item.brand}{item.size ? ` · ${item.size}` : ""}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-surface-100 font-mono">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mb-4">
            <div className="flex justify-between py-0.5 text-[11px] text-surface-400">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-[11px] text-surface-400">
              <span>Tax (9.75%)</span>
              <span className="font-mono">{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between py-2 text-lg font-bold">
              <span className="text-surface-100">Total</span>
              <span className="text-brand font-mono">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Cash tendered + change calculator */}
          {payMethod === "CASH" && (
            <div className="mb-4 p-3 rounded-xl bg-surface-800 border border-surface-700">
              <p className="text-[10px] font-bold text-surface-500 tracking-widest uppercase mb-2">
                Cash Tendered
              </p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-surface-400 text-lg font-mono">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-surface-900 border border-surface-700 text-surface-100 font-mono text-xl text-right placeholder:text-surface-600 focus:outline-none focus:border-brand transition-colors"
                  autoFocus
                />
              </div>
              {/* Quick amount buttons */}
              <div className="flex gap-1.5 mb-3">
                {[1, 5, 10, 20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCashTendered(amt.toFixed(2))}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all active:scale-95",
                      "bg-surface-900 border border-surface-700 text-surface-300 hover:border-brand hover:text-brand"
                    )}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              {/* Exact amount button */}
              <button
                onClick={() => setCashTendered(total.toFixed(2))}
                className="w-full py-1.5 rounded-lg text-[10px] font-semibold bg-brand/10 border border-brand/20 text-brand mb-3 active:scale-[0.97] transition-transform"
              >
                Exact: {formatCurrency(total)}
              </button>
              {/* Change display */}
              {cashAmount > 0 && (
                <div
                  className={cn(
                    "p-3 rounded-xl text-center",
                    changeDue >= 0
                      ? "bg-success/10 border border-success/15"
                      : "bg-danger/10 border border-danger/15"
                  )}
                >
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
                    {changeDue >= 0 ? "Change Due" : "Amount Short"}
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold font-mono mt-0.5",
                      changeDue >= 0 ? "text-success" : "text-danger"
                    )}
                  >
                    {formatCurrency(Math.abs(changeDue))}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Charge button */}
          <button
            onClick={() => onCharge(payMethod)}
            disabled={processing || (payMethod === "CASH" && cashAmount > 0 && changeDue < 0)}
            className="w-full py-4 rounded-xl bg-brand text-surface-950 text-base font-bold font-display flex items-center justify-center gap-2 transition-all active:scale-[0.97] active:brightness-90 disabled:opacity-50"
          >
            {processing ? (
              "Processing..."
            ) : (
              <>
                {payIcon} {payMethod === "CASH" && cashAmount >= total ? "Confirm Cash" : `Charge ${formatCurrency(total)}`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
