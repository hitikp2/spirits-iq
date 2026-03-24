"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface AgeVerificationModalProps {
  open: boolean;
  onVerified: (method: string, detail: string) => void;
  onDenied: () => void;
  restrictedItems: Array<{ name: string; id: string }>;
}

type VerifyMethod = "scan" | "manual" | "visual";

export default function AgeVerificationModal({
  open,
  onVerified,
  onDenied,
  restrictedItems,
}: AgeVerificationModalProps) {
  const [method, setMethod] = useState<VerifyMethod>("scan");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">("idle");
  const [scanResult, setScanResult] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [result, setResult] = useState<{ pass: boolean; detail: string } | null>(null);

  const resetState = useCallback(() => {
    setScanState("idle");
    setScanResult("");
    setDobMonth("");
    setDobDay("");
    setDobYear("");
    setResult(null);
  }, []);

  const switchMethod = useCallback((m: VerifyMethod) => {
    setMethod(m);
    resetState();
  }, [resetState]);

  // ID Scan simulation
  const handleIdScan = useCallback(() => {
    if (scanState !== "idle") return;
    setScanState("scanning");
    setTimeout(() => {
      setScanState("done");
      const detail = "ID Scan — Driver's License · DOB: 05/12/1990 · Age: 35";
      setScanResult(detail);
      setResult({ pass: true, detail });
    }, 1500);
  }, [scanState]);

  // Manual DOB check
  const checkDob = useCallback((m: string, d: string, y: string) => {
    if (m.length !== 2 || d.length !== 2 || y.length !== 4) {
      setResult(null);
      return;
    }
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    const year = parseInt(y, 10);
    if (isNaN(month) || isNaN(day) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
      setResult(null);
      return;
    }
    const dob = new Date(year, month - 1, day);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age >= 21) {
      setResult({ pass: true, detail: `Manual DOB entry · ${m}/${d}/${y} · Age: ${age}` });
    } else {
      setResult({ pass: false, detail: `Customer is ${age} years old — must be 21+` });
    }
  }, []);

  // Visual confirmation
  const handleVisual = useCallback((looks21: boolean) => {
    if (looks21) {
      setResult({ pass: true, detail: "Visual confirmation by cashier" });
    } else {
      setResult({ pass: false, detail: "Customer appears under 21" });
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!result) return;
    if (result.pass) {
      const methodMap: Record<VerifyMethod, string> = {
        scan: "ID_SCAN",
        manual: "MANUAL_DOB",
        visual: "VISUAL",
      };
      onVerified(methodMap[method], result.detail);
    } else {
      onDenied();
    }
  }, [result, method, onVerified, onDenied]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-[20px] border border-surface-700 bg-surface-900 shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div
          className="px-5 pt-6 pb-5 text-center border-b border-red-500/15"
          style={{ background: "linear-gradient(135deg, #2a1a1a, #1a0a0a)" }}
        >
          <div className="text-5xl mb-2">🔞</div>
          <h2 className="font-display text-lg font-bold text-surface-100">
            Age Verification Required
          </h2>
          <p className="text-[11px] text-surface-400 mt-1">
            Cart contains age-restricted items. Verify customer is 21+.
          </p>
          {restrictedItems.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 mt-2">
              {restrictedItems.map((item) => (
                <span
                  key={item.id}
                  className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[9px] font-semibold"
                >
                  {item.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {/* Method selector */}
          <p className="text-[10px] font-bold text-surface-500 tracking-widest uppercase mb-2">
            Verification Method
          </p>
          <div className="flex gap-2 mb-4">
            {([
              { key: "scan" as const, icon: "📸", label: "Scan ID" },
              { key: "manual" as const, icon: "📅", label: "Enter DOB" },
              { key: "visual" as const, icon: "👁️", label: "Visual" },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => switchMethod(m.key)}
                className={cn(
                  "flex-1 py-3.5 px-2 rounded-xl border-[1.5px] text-center transition-all active:scale-95",
                  method === m.key
                    ? "border-brand bg-brand/15"
                    : "border-surface-700 bg-surface-800"
                )}
              >
                <div className="text-2xl mb-1">{m.icon}</div>
                <div className={cn(
                  "text-[10px] font-semibold",
                  method === m.key ? "text-brand" : "text-surface-400"
                )}>
                  {m.label}
                </div>
              </button>
            ))}
          </div>

          {/* ID Scan */}
          {method === "scan" && (
            <button
              onClick={handleIdScan}
              disabled={scanState !== "idle"}
              className={cn(
                "w-full border-2 border-dashed rounded-2xl py-8 px-4 text-center transition-all mb-4",
                scanState === "idle" && "border-surface-700 hover:border-brand",
                scanState === "scanning" && "border-brand bg-brand/5",
                scanState === "done" && "border-success bg-success/5"
              )}
            >
              <div className="text-4xl mb-2">
                {scanState === "idle" ? "🪪" : scanState === "scanning" ? "⏳" : "✓"}
              </div>
              <p className="text-xs text-surface-400 font-medium">
                {scanState === "idle" && "Tap to simulate ID scan"}
                {scanState === "scanning" && "Scanning..."}
                {scanState === "done" && scanResult}
              </p>
            </button>
          )}

          {/* Manual DOB */}
          {method === "manual" && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="MM"
                maxLength={2}
                value={dobMonth}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setDobMonth(v);
                  checkDob(v, dobDay, dobYear);
                }}
                className="flex-1 py-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-100 font-mono text-base text-center placeholder:text-surface-500 focus:outline-none focus:border-brand transition-colors"
              />
              <input
                type="text"
                placeholder="DD"
                maxLength={2}
                value={dobDay}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setDobDay(v);
                  checkDob(dobMonth, v, dobYear);
                }}
                className="flex-1 py-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-100 font-mono text-base text-center placeholder:text-surface-500 focus:outline-none focus:border-brand transition-colors"
              />
              <input
                type="text"
                placeholder="YYYY"
                maxLength={4}
                value={dobYear}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setDobYear(v);
                  checkDob(dobMonth, dobDay, v);
                }}
                className="flex-1 py-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-100 font-mono text-base text-center placeholder:text-surface-500 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          )}

          {/* Visual */}
          {method === "visual" && !result && (
            <div className="rounded-xl bg-surface-800 border border-surface-700 p-4 text-center mb-4">
              <div className="text-3xl mb-2">👤</div>
              <p className="text-xs text-surface-400 mb-3 leading-relaxed">
                Cashier visually confirms the customer appears 21 or older.
                This is the least secure method — use only when ID is unavailable.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleVisual(true)}
                  className="flex-1 py-2.5 rounded-xl bg-success text-surface-950 text-xs font-bold active:scale-95 transition-transform"
                >
                  ✓ Looks 21+
                </button>
                <button
                  onClick={() => handleVisual(false)}
                  className="flex-1 py-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-bold active:scale-95 transition-transform"
                >
                  ✕ Under 21
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={cn(
                "flex items-center gap-3 p-4 rounded-xl mb-4",
                result.pass
                  ? "bg-success/10 border border-success/15"
                  : "bg-danger/10 border border-danger/15"
              )}
            >
              <span className="text-3xl">{result.pass ? "✅" : "🚫"}</span>
              <div>
                <p className={cn(
                  "text-sm font-semibold",
                  result.pass ? "text-success" : "text-danger"
                )}>
                  {result.pass ? "Verified — Sale may proceed" : "DENIED — Sale blocked"}
                </p>
                <p className="text-[10px] text-surface-400 mt-0.5">{result.detail}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {result && (
            <button
              onClick={handleConfirm}
              className={cn(
                "w-full py-3.5 rounded-xl font-bold text-sm font-display flex items-center justify-center gap-2 transition-all active:scale-[0.97]",
                result.pass
                  ? "bg-brand text-surface-950"
                  : "bg-danger/10 border border-danger/20 text-danger"
              )}
            >
              {result.pass ? "✓ Continue to Payment" : "✕ Cancel Sale"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
