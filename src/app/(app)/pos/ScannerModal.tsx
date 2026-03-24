"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BarcodeDetector } from "barcode-detector/ponyfill";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const scanningRef = useRef(false);

  // Match a scanned barcode/SKU to a product
  const matchProduct = useCallback((code: string): Product | null => {
    const normalized = code.trim().toLowerCase();
    return products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === normalized) ||
        p.sku.toLowerCase() === normalized
    ) || null;
  }, [products]);

  // Start camera + barcode detection
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    scanningRef.current = true;

    async function start() {
      try {
        const detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        detectorRef.current = detector;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Detection loop
        const detect = async () => {
          if (!scanningRef.current || !videoRef.current || videoRef.current.readyState < 2) {
            if (scanningRef.current) rafRef.current = requestAnimationFrame(detect);
            return;
          }

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && scanningRef.current) {
              const code = barcodes[0].rawValue;
              const product = matchProduct(code);
              if (product) {
                scanningRef.current = false;
                setScanResult(product);
                // Haptic feedback if available
                if (navigator.vibrate) navigator.vibrate(50);
              }
            }
          } catch {
            // detection frame error, continue
          }

          if (scanningRef.current) {
            rafRef.current = requestAnimationFrame(detect);
          }
        };

        rafRef.current = requestAnimationFrame(detect);
      } catch (err: any) {
        if (!cancelled) {
          if (err.name === "NotAllowedError") {
            setError("Camera access denied. Please allow camera in your browser settings.");
          } else if (err.name === "NotFoundError" || err.name === "NotReadableError") {
            setError("no-detector");
          } else {
            setError("no-detector");
          }
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      scanningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, matchProduct]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setScanResult(null);
      setAdded(false);
      setError(null);
      setTorchOn(false);
      setManualEntry(false);
      setManualValue("");
    }
  }, [open]);

  // Torch toggle
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const newVal = !torchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: newVal }] });
      setTorchOn(newVal);
    } catch {
      // torch not supported on this device
    }
  }, [torchOn]);

  // Add to cart
  const handleAdd = useCallback(() => {
    if (!scanResult) return;
    onAddToCart(scanResult.id);
    setAdded(true);
    setTimeout(() => {
      // Reset for next scan
      setAdded(false);
      setScanResult(null);
      scanningRef.current = true;
      // Restart detection loop
      const detect = async () => {
        if (!scanningRef.current || !videoRef.current || videoRef.current.readyState < 2) {
          if (scanningRef.current) rafRef.current = requestAnimationFrame(detect);
          return;
        }
        try {
          const barcodes = await detectorRef.current?.detect(videoRef.current);
          if (barcodes?.length > 0 && scanningRef.current) {
            const code = barcodes[0].rawValue;
            const product = matchProduct(code);
            if (product) {
              scanningRef.current = false;
              setScanResult(product);
              if (navigator.vibrate) navigator.vibrate(50);
              return;
            }
          }
        } catch {}
        if (scanningRef.current) rafRef.current = requestAnimationFrame(detect);
      };
      rafRef.current = requestAnimationFrame(detect);
    }, 600);
  }, [scanResult, onAddToCart, matchProduct]);

  // Manual barcode/SKU submit
  const handleManualSubmit = useCallback(() => {
    if (!manualValue.trim()) return;
    const product = matchProduct(manualValue);
    if (product) {
      setScanResult(product);
      setManualEntry(false);
      setManualValue("");
    } else {
      setError(`No product found for "${manualValue}"`);
      setTimeout(() => setError(null), 2500);
    }
  }, [manualValue, matchProduct]);

  if (!open) return null;

  const showManualFallback = error === "no-detector" || manualEntry;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Camera viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Live camera feed */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Dark overlay outside scan area */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Top bar */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-center z-10">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center text-lg active:scale-90 transition-transform"
          >
            ✕
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => { setManualEntry(!manualEntry); setError(null); }}
              className="h-10 px-3 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center text-xs font-mono active:scale-90 transition-transform"
            >
              SKU
            </button>
            <button
              onClick={toggleTorch}
              className={cn(
                "w-10 h-10 rounded-full backdrop-blur-xl border flex items-center justify-center text-lg active:scale-90 transition-transform",
                torchOn
                  ? "bg-brand/30 border-brand/40 text-brand"
                  : "bg-black/50 border-white/10 text-white"
              )}
            >
              ⚡
            </button>
          </div>
        </div>

        {/* Scan frame — centered */}
        {!showManualFallback && (
          <div className="relative z-10 w-60 h-[150px]">
            {/* Clear window in the overlay */}
            <div className="absolute inset-0 bg-transparent" />
            {/* Corners */}
            <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-brand rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-brand rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-brand rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-brand rounded-br-lg" />
            {/* Scan line */}
            <div
              className="absolute left-2 right-2 h-0.5 bg-brand rounded-full shadow-[0_0_12px_var(--brand-glow),0_0_30px_rgba(245,166,35,0.3)]"
              style={{ animation: "scanLine 2s ease-in-out infinite" }}
            />
          </div>
        )}

        {/* Instruction text */}
        {!showManualFallback && !scanResult && (
          <p className="absolute bottom-[45%] text-sm font-semibold text-white/60 z-10">
            Align barcode within frame
          </p>
        )}

        {/* Manual entry fallback */}
        {showManualFallback && (
          <div className="relative z-10 w-[85%] max-w-sm space-y-4 text-center">
            {error === "no-detector" && (
              <p className="text-sm text-white/60">
                Camera barcode scanning not available on this browser. Enter barcode or SKU manually.
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder="Barcode or SKU..."
                autoFocus
                className="flex-1 h-12 px-4 rounded-xl bg-surface-800 border border-surface-600 text-surface-100 font-mono text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand"
              />
              <button
                onClick={handleManualSubmit}
                className="h-12 px-5 rounded-xl bg-brand text-surface-950 font-bold text-sm active:scale-95 transition-transform"
              >
                Look up
              </button>
            </div>
            {error && error !== "no-detector" && (
              <p className="text-xs text-danger">{error}</p>
            )}
          </div>
        )}

        {/* Scan result panel */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-700 rounded-t-[20px] p-5 transition-transform duration-300 z-20",
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
