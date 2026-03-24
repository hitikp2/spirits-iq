"use client";

import { useState, useMemo, useCallback } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface ReceiptItem {
  name: string;
  brand?: string;
  size?: string;
  price: number;
  quantity: number;
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  orderNumber: string;
  paymentMethod: string;
  cashierName: string;
  customerName?: string;
  customerPoints?: number;
  customerId?: string;
  customerPhone?: string;
  storeId?: string;
  ageVerified?: boolean;
  verificationMethod?: string;
  onSendEmail?: () => void;
}

export default function ReceiptModal({
  open,
  onClose,
  items,
  subtotal,
  tax,
  total,
  orderNumber,
  paymentMethod,
  cashierName,
  customerName,
  customerPoints,
  customerId,
  customerPhone,
  storeId,
  ageVerified,
  verificationMethod: ageMethod,
  onSendEmail,
}: ReceiptModalProps) {
  const [view, setView] = useState<"digital" | "print">("digital");
  const [smsSending, setSmsSending] = useState(false);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsName, setSmsName] = useState("");
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const earnPts = Math.round(total);

  const now = useMemo(() => new Date(), []);
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const payLabel = useMemo(() => {
    switch (paymentMethod) {
      case "CASH": return "Cash";
      case "NFC": return "Apple Pay";
      default: return "Visa ending in 4242";
    }
  }, [paymentMethod]);

  // Build receipt text for SMS
  const receiptText = useMemo(() => {
    const lines = [
      `🥃 SPIRITS IQ — Receipt`,
      `Order #${orderNumber}`,
      `${date} ${time}`,
      ``,
      ...items.map((i) => `${i.quantity}x ${i.name} — ${formatCurrency(Number(i.price) * i.quantity)}`),
      ``,
      `Subtotal: ${formatCurrency(subtotal)}`,
      `Tax: ${formatCurrency(tax)}`,
      `Total: ${formatCurrency(total)}`,
      `Paid: ${payLabel}`,
      ``,
      `Thank you for your purchase!`,
    ];
    return lines.join("\n");
  }, [orderNumber, date, time, items, subtotal, tax, total, payLabel]);

  // Open SMS dialog — pre-fill from customer data if available
  const handleSmsClick = useCallback(() => {
    if (customerPhone && !smsPhone) setSmsPhone(customerPhone);
    if (customerName && !smsName) setSmsName(customerName);
    setShowPhoneInput(true);
  }, [customerPhone, customerName, smsPhone, smsName]);

  // Actually send SMS receipt
  const handleSendSms = useCallback(async () => {
    if (!smsPhone.trim()) {
      toast.error("Enter a phone number");
      return;
    }

    // Prepend name greeting if provided
    const greeting = smsName.trim() ? `Hi ${smsName.trim()}! ` : "";
    const fullMessage = greeting + receiptText;

    setSmsSending(true);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-direct",
          phone: smsPhone.trim(),
          message: fullMessage,
          storeId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Receipt sent to ${smsPhone.trim()}`);
        setShowPhoneInput(false);
        setSmsPhone("");
        setSmsName("");
      } else {
        toast.error(json.error || "Failed to send SMS");
      }
    } catch {
      toast.error("Network error sending SMS");
    } finally {
      setSmsSending(false);
    }
  }, [smsPhone, smsName, receiptText, storeId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0 bg-surface-950 flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 flex-shrink-0">
          <div className="flex gap-1">
            <button
              onClick={() => setView("digital")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all active:scale-95",
                view === "digital"
                  ? "bg-brand/15 border-brand text-brand"
                  : "bg-surface-800 border-surface-700 text-surface-400"
              )}
            >
              📱 Digital
            </button>
            <button
              onClick={() => setView("print")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all active:scale-95",
                view === "print"
                  ? "bg-brand/15 border-brand text-brand"
                  : "bg-surface-800 border-surface-700 text-surface-400"
              )}
            >
              🧾 Print
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 text-surface-400 flex items-center justify-center text-sm active:scale-90 transition-transform"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === "digital" ? (
            <DigitalReceipt
              items={items}
              subtotal={subtotal}
              tax={tax}
              total={total}
              orderNumber={orderNumber}
              date={date}
              time={time}
              cashierName={cashierName}
              payLabel={payLabel}
              customerName={customerName}
              customerPoints={customerPoints}
              earnPts={earnPts}
              ageVerified={ageVerified}
              ageMethod={ageMethod}
            />
          ) : (
            <PrintReceipt
              items={items}
              subtotal={subtotal}
              tax={tax}
              total={total}
              orderNumber={orderNumber}
              date={date}
              time={time}
              cashierName={cashierName}
              paymentMethod={paymentMethod}
              payLabel={payLabel}
              customerName={customerName}
              customerPoints={customerPoints}
              ageVerified={ageVerified}
              earnPts={earnPts}
            />
          )}
        </div>

        {/* SMS Phone Pad Panel */}
        {showPhoneInput && (
          <div className="px-4 py-3 border-t border-surface-700 flex-shrink-0 bg-surface-900">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-surface-100 font-display">Send Receipt via SMS</span>
              <button
                onClick={() => { setShowPhoneInput(false); setSmsPhone(""); setSmsName(""); }}
                className="w-6 h-6 rounded-full bg-surface-800 border border-surface-700 text-surface-400 flex items-center justify-center text-[10px] active:scale-90 transition-transform"
              >
                ✕
              </button>
            </div>

            {/* Name input */}
            <input
              type="text"
              placeholder="Customer name (optional)"
              value={smsName}
              onChange={(e) => setSmsName(e.target.value)}
              className="w-full px-3 py-2.5 mb-2 bg-surface-800 border border-surface-700 rounded-xl text-surface-100 text-sm font-body placeholder:text-surface-500 focus:outline-none focus:border-brand transition-colors"
            />

            {/* Phone input — uses device numpad */}
            <input
              type="tel"
              inputMode="tel"
              placeholder="Phone number"
              value={smsPhone}
              onChange={(e) => setSmsPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && smsPhone.trim() && handleSendSms()}
              className="w-full px-3 py-2.5 mb-3 bg-surface-800 border border-surface-700 rounded-xl text-surface-100 font-mono text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand transition-colors"
              autoFocus
            />

            {/* Send button */}
            <button
              onClick={handleSendSms}
              disabled={smsSending || !smsPhone.trim()}
              className="w-full py-3 rounded-xl bg-brand text-surface-950 text-sm font-bold font-display flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.97] transition-transform"
            >
              {smsSending ? "Sending..." : `💬 Send to ${smsPhone || "..."}`}
            </button>
          </div>
        )}

        {/* Bottom actions */}
        <div className="px-4 pt-3 pb-6 border-t border-surface-700 flex-shrink-0 flex gap-2" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
          <button
            onClick={handleSmsClick}
            disabled={smsSending}
            className="flex-1 py-3 rounded-xl border border-surface-700 bg-surface-800 text-surface-100 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-transform disabled:opacity-50"
          >
            {smsSending ? "Sending..." : "💬 SMS"}
          </button>
          <button
            onClick={onSendEmail}
            className="flex-1 py-3 rounded-xl border border-surface-700 bg-surface-800 text-surface-100 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-transform"
          >
            📧 Email
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-brand text-surface-950 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.96] transition-transform"
          >
            ✓ Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Digital Receipt ──────────────── */
function DigitalReceipt({
  items, subtotal, tax, total, orderNumber, date, time, cashierName, payLabel, customerName, customerPoints, earnPts, ageVerified, ageMethod,
}: {
  items: ReceiptItem[]; subtotal: number; tax: number; total: number; orderNumber: string;
  date: string; time: string; cashierName: string; payLabel: string;
  customerName?: string; customerPoints?: number; earnPts: number;
  ageVerified?: boolean; ageMethod?: string;
}) {
  return (
    <div className="rounded-[20px] overflow-hidden border border-surface-700 shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
      style={{ background: "linear-gradient(145deg, #141820, #0e1118)" }}
    >
      {/* Gold header */}
      <div
        className="px-5 pt-6 pb-5 text-center relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #F5A623, #c7891c)" }}
      >
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-white/[.07] rounded-full" />
        <div className="font-display text-lg font-bold text-black tracking-widest">🥃 SPIRITS IQ</div>
        <div className="text-[9px] font-semibold tracking-[3px] text-black/45 mt-0.5">PREMIUM SPIRITS</div>
        <div className="w-11 h-11 bg-black/[.13] rounded-full flex items-center justify-center mx-auto mt-4 mb-1.5 text-xl animate-scale-in">
          ✓
        </div>
        <div className="text-[15px] font-bold text-black">Payment Successful</div>
      </div>

      {/* Body */}
      <div className="px-5 py-5">
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div>
            <div className="text-[9px] font-semibold text-surface-400 tracking-wider uppercase">Date</div>
            <div className="text-xs font-semibold text-surface-100 mt-0.5">{date}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold text-surface-400 tracking-wider uppercase">Time</div>
            <div className="text-xs font-semibold text-surface-100 mt-0.5">{time}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold text-surface-400 tracking-wider uppercase">Order</div>
            <div className="text-xs font-semibold text-surface-100 mt-0.5">#{orderNumber}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold text-surface-400 tracking-wider uppercase">Cashier</div>
            <div className="text-xs font-semibold text-surface-100 mt-0.5">{cashierName}</div>
          </div>
        </div>

        <div className="h-px bg-surface-700 my-3.5" />

        <div className="flex justify-between text-[9px] font-semibold text-surface-400 tracking-wider uppercase mb-2.5">
          <span>Items</span>
          <span>Amount</span>
        </div>

        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-start py-2 border-b border-white/[.02]">
            <div className="flex gap-2 items-start">
              <span className="text-[10px] font-bold text-brand bg-brand/15 w-6 h-6 rounded flex items-center justify-center flex-shrink-0 font-mono">
                {item.quantity}
              </span>
              <div>
                <div className="text-xs font-semibold text-surface-100">{item.name}</div>
                <div className="text-[10px] text-surface-400">{item.size || "750ml"} · {formatCurrency(item.price)} ea</div>
              </div>
            </div>
            <span className="text-xs font-bold text-surface-100 flex-shrink-0 font-mono">
              {formatCurrency(item.price * item.quantity)}
            </span>
          </div>
        ))}

        <div className="h-px border-t border-dashed border-surface-700 my-3.5" />

        <div className="space-y-0.5">
          <div className="flex justify-between text-[11px] text-surface-400">
            <span>Subtotal</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-surface-400">
            <span>Tax (9.75%)</span>
            <span className="font-mono">{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2">
            <span className="text-surface-100">Total</span>
            <span className="text-brand font-mono">{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/[.12] rounded-lg text-[11px] font-semibold text-success mt-3">
          ✓ {payLabel} · Approved
        </div>

        {ageVerified && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-info/10 border border-info/[.12] rounded-lg text-[11px] font-semibold text-info mt-2 ml-1">
            🪪 Age Verified: {ageMethod === "ID_SCAN" ? "ID Scan" : ageMethod === "MANUAL_DOB" ? "Manual DOB" : "Visual"}
          </div>
        )}

        {customerName && (
          <div className="flex items-center gap-2 p-3 bg-brand/15 border border-brand/[.12] rounded-xl mt-3.5">
            <span className="text-xl">⭐</span>
            <div>
              <div className="text-[11px] font-semibold text-brand">+{earnPts} points earned</div>
              <div className="text-[9px] text-surface-400 mt-0.5">
                Balance: {((customerPoints || 0) + earnPts).toLocaleString()} pts
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center px-5 py-4 border-t border-surface-700">
        <div className="text-xs font-semibold text-surface-400">Thank you for your purchase!</div>
        <div className="text-[10px] text-surface-500 mt-0.5">123 Bourbon St, Nashville, TN · (615) 555-0142</div>
      </div>
    </div>
  );
}

/* ──────────────── Print Receipt ──────────────── */
function PrintReceipt({
  items, subtotal, tax, total, orderNumber, date, time, cashierName,
  paymentMethod, payLabel, customerName, customerPoints, earnPts, ageVerified,
}: {
  items: ReceiptItem[]; subtotal: number; tax: number; total: number; orderNumber: string;
  date: string; time: string; cashierName: string; paymentMethod: string; payLabel: string;
  customerName?: string; customerPoints?: number; earnPts: number; ageVerified?: boolean;
}) {
  return (
    <div className="flex flex-col items-center py-3">
      <div
        className="w-72 px-3.5 py-5 relative shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
        style={{
          background: "#faf9f5",
          color: "#1a1a1a",
          fontFamily: "'Courier New', monospace",
        }}
      >
        {/* Zigzag top */}
        <div
          className="absolute -top-1.5 left-0 right-0 h-1.5"
          style={{
            background: `
              linear-gradient(135deg, transparent 33.33%, #faf9f5 33.33%, #faf9f5 66.67%, transparent 66.67%),
              linear-gradient(225deg, transparent 33.33%, #faf9f5 33.33%, #faf9f5 66.67%, transparent 66.67%)
            `,
            backgroundSize: "12px 6px",
          }}
        />
        {/* Zigzag bottom */}
        <div
          className="absolute -bottom-1.5 left-0 right-0 h-1.5"
          style={{
            background: `
              linear-gradient(45deg, transparent 33.33%, #faf9f5 33.33%, #faf9f5 66.67%, transparent 66.67%),
              linear-gradient(315deg, transparent 33.33%, #faf9f5 33.33%, #faf9f5 66.67%, transparent 66.67%)
            `,
            backgroundSize: "12px 6px",
          }}
        />

        <div className="text-center">
          <div className="text-base tracking-[4px]" style={{ fontWeight: 500 }}>SPIRITS IQ</div>
          <div className="text-[8px] tracking-[2px]" style={{ color: "#666" }}>PREMIUM SPIRITS</div>
          <div className="text-[9px] leading-relaxed mt-1.5" style={{ color: "#555" }}>
            123 Bourbon St<br />Nashville, TN 37203<br />(615) 555-0142
          </div>
        </div>

        <hr className="my-2 border-0" style={{ borderTop: "1px dashed #bbb", borderBottom: "1px dashed #bbb", height: 4 }} />

        <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
          <span>{date}</span><span>{time}</span>
        </div>
        <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
          <span>Order #{orderNumber}</span><span>{cashierName}</span>
        </div>
        {customerName && (
          <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
            <span>Customer: {customerName}</span><span>Loyalty ★</span>
          </div>
        )}

        <hr className="my-2 border-0" style={{ borderTop: "1px dashed #bbb" }} />

        {items.map((item, i) => (
          <div key={i} className="mb-1.5">
            <div className="text-[10px]" style={{ fontWeight: 500 }}>
              {item.name} {item.size || "750ml"}
            </div>
            <div className="flex justify-between text-[9px] pl-2.5" style={{ color: "#555" }}>
              <span>{item.quantity} x ${Number(item.price).toFixed(2)}</span>
              <span>${(Number(item.price) * item.quantity).toFixed(2)}</span>
            </div>
          </div>
        ))}

        <hr className="my-2 border-0" style={{ borderTop: "1px dashed #bbb" }} />

        <div className="flex justify-between text-[10px]" style={{ lineHeight: 1.8 }}>
          <span>Subtotal</span><span>${Number(subtotal).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[10px]" style={{ lineHeight: 1.8 }}>
          <span>Tax 9.75%</span><span>${Number(tax).toFixed(2)}</span>
        </div>

        <hr className="my-2 border-0" style={{ borderTop: "1px dashed #bbb" }} />

        <div className="flex justify-between text-[13px] tracking-wider" style={{ fontWeight: 500 }}>
          <span>TOTAL</span><span>${Number(total).toFixed(2)}</span>
        </div>

        <hr className="my-2 border-0" style={{ borderTop: "1px dashed #bbb" }} />

        <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
          <span>{paymentMethod === "CARD" ? "VISA ***4242" : paymentMethod === "CASH" ? "CASH" : "TAP PAY"}</span>
          <span>${Number(total).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
          <span>Auth: {100000 + Math.floor(Math.random() * 900000)}</span>
          <span>APPROVED</span>
        </div>

        {ageVerified && (
          <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
            <span>Age Verified</span><span>YES</span>
          </div>
        )}

        {customerName && (
          <>
            <hr className="my-2 border-0" style={{ borderTop: "1px dashed #bbb" }} />
            <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
              <span>Points earned</span><span>+{earnPts}</span>
            </div>
            <div className="flex justify-between text-[9px]" style={{ color: "#555", lineHeight: 1.8 }}>
              <span>Points balance</span><span>{((customerPoints || 0) + earnPts).toLocaleString()}</span>
            </div>
          </>
        )}

        {/* Barcode simulation */}
        <div className="text-center mt-3 mb-1">
          <div className="flex justify-center gap-px h-8 mb-1">
            {[2,1,1,3,1,2,1,1,3,2,1,1,2,1,3,1,1,2,3,1,1,2,1,1,3,1,2,1,1,2,1,3,1,2,1,1,2,3,1].map((w, i) => (
              <span key={i} className="block h-full" style={{ width: `${w}px`, background: i % 2 === 0 ? "#1a1a1a" : "transparent" }} />
            ))}
          </div>
          <div className="text-[8px] tracking-[2px]" style={{ color: "#555" }}>{orderNumber}</div>
        </div>

        <div className="text-center text-[9px] mt-2" style={{ color: "#777", lineHeight: 1.5 }}>
          <div className="text-[11px]" style={{ color: "#333", fontWeight: 500 }}>Thank you!</div>
          Returns within 30 days with receipt<br />spiritsiq.com
        </div>
      </div>
    </div>
  );
}
