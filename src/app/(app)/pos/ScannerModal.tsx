"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  retailPrice: number;
  quantity: number;
  size: string | null;
}

interface ScannerModalProps {
  open: boolean;
  onClose: () => void;
  onAddToCart: (productId: string) => void;
  products: Product[];
}

export default function ScannerModal({ open, onClose, onAddToCart, products }: ScannerModalProps) {
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [added, setAdded] = useState(false);

  // Simulate a scan after opening
  useEffect(() => {
    if (!open) {
      setScanResult(null);
      setAdded(false);
      return;
    }
    const inStock = products.filter((p) => p.quantity > 0);
    if (inStock.length === 0) return;
    const timer = setTimeout(() => {
      const p = inStock[Math.floor(Math.random() * inStock.length)];
      setScanResult(p);
    }, 1800);
    return () => clearTimeout(timer);
  }, [open, products]);

  const handleAdd = useCallback(() => {
    if (!scanResult) return;
    onAddToCart(scanResult.id);
    setAdded(true);
    setTimeout(() => onClose(), 600);
  }, [scanResult, onAddToCart, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Simulated camera background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,35,48,0.2)_0%,rgba(0,0,0,0.8)_100%)]" />
        <span className="text-7xl opacity-10 animate-bounce" style={{ animationDuration: "3s" }}>🍾</span>

        {/* Overlay controls */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Top bar */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-center">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center text-lg active:scale-90 transition-transform"
            >
              ✕
            </button>
            <button
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center text-lg active:scale-90 transition-transform"
            >
              ⚡
            </button>
          </div>

          {/* Scan frame */}
          <div className="w-60 h-[150px] relative">
            {/* Corners */}
            <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-brand rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-brand rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-brand rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-brand rounded-br-lg" />
            {/* Scan line */}
            <div
              className="absolute left-2 right-2 h-0.5 bg-brand rounded-full shadow-[0_0_12px_var(--brand-glow),0_0_30px_rgba(245,166,35,0.3)]"
              style={{
                animation: "scanLine 2s ease-in-out infinite",
              }}
            />
          </div>
          <p className="mt-5 text-sm font-semibold text-white/60">Align barcode within frame</p>
        </div>

        {/* Scan result panel */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-700 rounded-t-[20px] p-5 transition-transform duration-300",
            scanResult ? "translate-y-0" : "translate-y-full"
          )}
          style={{ transitionTimingFunction: "cubic-bezier(.34,1.56,.64,1)" }}
        >
          {scanResult && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-success/10 text-success tracking-wider">
                  ✓ MATCH FOUND
                </span>
                <span className="font-mono text-[10px] text-surface-400">
                  SKU: {scanResult.sku}
                </span>
              </div>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-[15px] font-bold text-surface-100">{scanResult.name}</div>
                  <div className="text-[11px] text-surface-400 mt-0.5">
                    {scanResult.brand} · {scanResult.size || "750ml"} · {scanResult.quantity} in stock
                  </div>
                </div>
                <div className="text-xl font-bold text-brand font-mono">
                  ${Number(scanResult.retailPrice).toFixed(2)}
                </div>
              </div>
              <button
                onClick={handleAdd}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold text-sm font-display flex items-center justify-center gap-2 transition-all active:scale-[0.97]",
                  added
                    ? "bg-success text-white"
                    : "bg-brand text-surface-950"
                )}
              >
                {added ? "✓ Added!" : "＋ Add to Cart"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scan line animation */}
      <style jsx>{`
        @keyframes scanLine {
          0%, 100% { top: 12%; opacity: 0.6; }
          50% { top: 88%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
