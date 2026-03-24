"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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

interface QuickAddForm {
  name: string;
  brand: string;
  retailPrice: string;
  costPrice: string;
  quantity: string;
  size: string;
  description: string;
  abv: string;
  imageUrl: string;
}

const EMPTY_FORM: QuickAddForm = {
  name: "", brand: "", retailPrice: "", costPrice: "", quantity: "1",
  size: "750ml", description: "", abv: "", imageUrl: "",
};

interface ScannerModalProps {
  open: boolean;
  onClose: () => void;
  onAddToCart: (productId: string) => void;
  onProductCreated?: () => void;
  products: Product[];
  storeId: string;
}

export default function ScannerModal({ open, onClose, onAddToCart, onProductCreated, products, storeId }: ScannerModalProps) {
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [quickForm, setQuickForm] = useState<QuickAddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

        // Create offscreen canvas for frame capture (needed for polyfill on iOS)
        const canvas = document.createElement("canvas");
        canvasRef.current = canvas;

        // Detection loop using setInterval (more reliable than rAF on iOS)
        let detecting = false;
        intervalRef.current = setInterval(async () => {
          if (!scanningRef.current || detecting) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;

          detecting = true;
          try {
            // Draw current video frame to canvas
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) { detecting = false; return; }
            ctx.drawImage(video, 0, 0);

            // Create ImageBitmap for detection
            const imageBitmap = await createImageBitmap(canvas);
            const barcodes = await detector.detect(imageBitmap);
            imageBitmap.close();

            if (barcodes.length > 0 && scanningRef.current) {
              const code = barcodes[0].rawValue;
              const product = matchProduct(code);
              if (product) {
                scanningRef.current = false;
                setScanResult(product);
                setScannedCode(null);
                if (navigator.vibrate) navigator.vibrate(50);
              } else {
                // Show the scanned code even if no product matched
                setScannedCode(code);
                if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
              }
            }
          } catch {
            // detection frame error, continue
          }
          detecting = false;
        }, 250); // Scan ~4 times per second
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
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
      setScannedCode(null);
      setQuickAdd(false);
      setQuickForm(EMPTY_FORM);
      setSaving(false);
      setPhotoBase64(null);
      setIdentifying(false);
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
      setAdded(false);
      setScanResult(null);
      setScannedCode(null);
      scanningRef.current = true;
    }, 600);
  }, [scanResult, onAddToCart]);

  // Manual barcode/SKU submit
  const handleManualSubmit = useCallback(() => {
    if (!manualValue.trim()) return;
    const product = matchProduct(manualValue);
    if (product) {
      setScanResult(product);
      setManualEntry(false);
      setManualValue("");
    } else {
      setScannedCode(manualValue.trim());
      setManualEntry(false);
      setManualValue("");
    }
  }, [manualValue, matchProduct]);

  // Capture photo from live camera feed
  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement("canvas");
    const w = Math.min(video.videoWidth, 1280);
    const h = Math.round((w / video.videoWidth) * video.videoHeight);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  // Send photo to AI for identification
  const identifyProduct = useCallback(async (photo: string, barcode: string | null) => {
    setIdentifying(true);
    try {
      const res = await fetch("/api/product-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: photo, barcode: barcode || undefined }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const ai = data.data;
        setQuickForm(f => ({
          ...f,
          name: ai.name || f.name,
          brand: ai.brand || f.brand,
          retailPrice: ai.retailPrice ? String(ai.retailPrice) : f.retailPrice,
          costPrice: ai.costPrice ? String(ai.costPrice) : f.costPrice,
          size: ai.size || f.size,
          description: ai.description || f.description,
          abv: ai.abv || f.abv,
          imageUrl: ai.imageUrl || f.imageUrl,
        }));
      }
    } catch {
      // AI identification failed — user can fill manually
    }
    setIdentifying(false);
  }, []);

  // Open quick-add: capture photo + send to AI
  const openQuickAdd = useCallback(async () => {
    // Capture photo FIRST while camera is still showing the product
    const photo = capturePhoto();

    scanningRef.current = false;
    setQuickAdd(true);
    setQuickForm(EMPTY_FORM);
    setError(null);

    if (photo) {
      setPhotoBase64(photo);
      identifyProduct(photo, scannedCode);
    } else {
      setPhotoBase64(null);
    }
  }, [capturePhoto, scannedCode, identifyProduct]);

  // Retake photo and re-identify
  const retakePhoto = useCallback(() => {
    const photo = capturePhoto();
    if (!photo) return;
    setPhotoBase64(photo);
    setQuickForm(EMPTY_FORM);
    identifyProduct(photo, scannedCode);
  }, [capturePhoto, scannedCode, identifyProduct]);

  // Save quick-add product via API then add to cart
  const handleQuickSave = useCallback(async () => {
    if (!quickForm.name.trim()) return;
    setSaving(true);
    try {
      const sku = scannedCode || quickForm.name.replace(/\s+/g, "-").toUpperCase().slice(0, 20);

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          storeId,
          barcode: scannedCode || undefined,
          sku,
          name: quickForm.name.trim(),
          brand: quickForm.brand.trim() || undefined,
          description: quickForm.description.trim() || undefined,
          retailPrice: parseFloat(quickForm.retailPrice) || 0,
          costPrice: parseFloat(quickForm.costPrice) || 0,
          quantity: parseInt(quickForm.quantity) || 1,
          size: quickForm.size.trim() || undefined,
          abv: quickForm.abv ? parseFloat(quickForm.abv) : undefined,
          imageUrl: quickForm.imageUrl || undefined,
          isAgeRestricted: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.data?.id) {
        onProductCreated?.();
        setScanResult({
          id: data.data.id,
          sku: data.data.sku,
          barcode: data.data.barcode,
          name: data.data.name,
          brand: data.data.brand || "",
          retailPrice: data.data.retailPrice,
          quantity: data.data.quantity,
          size: data.data.size,
        });
        setQuickAdd(false);
        setScannedCode(null);
        setPhotoBase64(null);
      } else {
        setError(data.error || "Failed to create product");
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      setError("Network error — could not save product");
      setTimeout(() => setError(null), 3000);
    }
    setSaving(false);
  }, [quickForm, scannedCode, storeId, onProductCreated]);

  if (!open) return null;

  const showManualFallback = error === "no-detector" || manualEntry;

  const modal = (
    <div className="fixed inset-0 flex flex-col bg-black" style={{ zIndex: 9999 }}>
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

        {/* Top bar — safe area for notch/dynamic island */}
        <div
          className="absolute left-0 right-0 flex justify-between items-center z-10 px-4"
          style={{ top: "max(12px, env(safe-area-inset-top, 12px))" }}
        >
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 text-white flex items-center justify-center text-lg active:scale-90 transition-transform"
          >
            ✕
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => { setManualEntry(!manualEntry); setError(null); }}
              className="h-11 px-4 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 text-white flex items-center justify-center text-xs font-mono font-bold active:scale-90 transition-transform"
            >
              SKU
            </button>
            <button
              onClick={toggleTorch}
              className={cn(
                "w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center text-lg active:scale-90 transition-transform",
                torchOn
                  ? "bg-brand/30 border-brand/40 text-brand"
                  : "bg-black/60 border-white/15 text-white"
              )}
            >
              ⚡
            </button>
          </div>
        </div>

        {/* Scan frame — centered */}
        {!showManualFallback && !quickAdd && (
          <div className="relative z-10 w-60 h-[150px]">
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

        {/* Instruction text / scanned code feedback */}
        {!showManualFallback && !scanResult && !quickAdd && (
          <div className="absolute bottom-[38%] z-10 flex flex-col items-center gap-2">
            {scannedCode ? (
              <>
                <span className="px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur font-mono text-sm text-white">
                  {scannedCode}
                </span>
                <p className="text-xs font-semibold text-white/50 mb-1">
                  Not in inventory
                </p>
                <button
                  onClick={openQuickAdd}
                  className="px-5 py-2.5 rounded-xl bg-brand text-surface-950 font-bold text-sm active:scale-95 transition-transform flex items-center gap-2"
                >
                  <span className="text-base">📸</span> Snap & Add Product
                </button>
                <p className="text-[10px] text-white/40 mt-1">
                  AI will identify from photo
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-white/60">
                Align barcode within frame
              </p>
            )}
          </div>
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

        {/* ─── Quick-Add Panel ─── */}
        {quickAdd && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface-900/95 backdrop-blur-xl border-t border-surface-700 rounded-t-[20px] z-20 flex flex-col"
            style={{
              maxHeight: "82vh",
              paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center">
                  <span className="text-sm">✨</span>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-surface-100">New Product</h3>
                  {scannedCode && (
                    <p className="text-[10px] text-surface-400 font-mono">Barcode: {scannedCode}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setQuickAdd(false); setPhotoBase64(null); scanningRef.current = true; }}
                className="px-3 py-1.5 rounded-lg text-surface-400 text-xs font-medium hover:bg-surface-800 active:scale-95 transition-all"
              >
                Cancel
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-5 pb-4 space-y-3 flex-1 min-h-0">

              {/* Photo preview + retake */}
              {(quickForm.imageUrl || photoBase64) ? (
                <div className="relative rounded-xl overflow-hidden bg-surface-800">
                  <img
                    src={quickForm.imageUrl || photoBase64!}
                    alt="Product"
                    className={cn(
                      "w-full h-32",
                      quickForm.imageUrl ? "object-contain bg-white" : "object-cover"
                    )}
                  />
                  {quickForm.imageUrl && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-success/80 backdrop-blur">
                      <span className="text-[9px] font-semibold text-white">AI Enhanced</span>
                    </div>
                  )}
                  {identifying && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-medium text-white">AI identifying...</span>
                    </div>
                  )}
                  {!identifying && (
                    <button
                      onClick={retakePhoto}
                      className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur text-white text-[11px] font-medium active:scale-95 transition-transform"
                    >
                      📸 Retake
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    const photo = capturePhoto();
                    if (photo) {
                      setPhotoBase64(photo);
                      identifyProduct(photo, scannedCode);
                    }
                  }}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-surface-600 flex items-center justify-center gap-2 text-surface-400 text-sm active:scale-[0.98] transition-transform"
                >
                  <span className="text-lg">📸</span> Take Product Photo
                </button>
              )}

              {/* Form fields */}
              <div>
                <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Product Name *</label>
                <input
                  type="text"
                  value={quickForm.name}
                  onChange={(e) => setQuickForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={identifying ? "Identifying..." : "e.g. Michelob Ultra 12-Pack"}
                  disabled={identifying}
                  className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Brand</label>
                <input
                  type="text"
                  value={quickForm.brand}
                  onChange={(e) => setQuickForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder={identifying ? "Identifying..." : "e.g. Anheuser-Busch"}
                  disabled={identifying}
                  className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Retail $</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={quickForm.retailPrice}
                    onChange={(e) => setQuickForm(f => ({ ...f, retailPrice: e.target.value }))}
                    placeholder="0.00"
                    disabled={identifying}
                    className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm font-mono placeholder:text-surface-500 focus:outline-none focus:border-brand disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Cost $</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={quickForm.costPrice}
                    onChange={(e) => setQuickForm(f => ({ ...f, costPrice: e.target.value }))}
                    placeholder="0.00"
                    disabled={identifying}
                    className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm font-mono placeholder:text-surface-500 focus:outline-none focus:border-brand disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Qty</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={quickForm.quantity}
                    onChange={(e) => setQuickForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="1"
                    className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm font-mono placeholder:text-surface-500 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Size</label>
                  <input
                    type="text"
                    value={quickForm.size}
                    onChange={(e) => setQuickForm(f => ({ ...f, size: e.target.value }))}
                    placeholder="750ml"
                    disabled={identifying}
                    className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">ABV %</label>
                  <input
                    type="text"
                    value={quickForm.abv}
                    onChange={(e) => setQuickForm(f => ({ ...f, abv: e.target.value }))}
                    placeholder="5%"
                    disabled={identifying}
                    className="w-full h-11 px-3 rounded-lg bg-surface-800 border border-surface-600 text-surface-100 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand disabled:opacity-50"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-danger">{error}</p>
              )}
            </div>

            {/* Fixed save button at bottom */}
            <div className="px-5 pt-2 shrink-0">
              <button
                onClick={handleQuickSave}
                disabled={saving || identifying || !quickForm.name.trim()}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold text-sm font-display flex items-center justify-center gap-2 transition-all active:scale-[0.97]",
                  saving || identifying || !quickForm.name.trim()
                    ? "bg-surface-700 text-surface-400"
                    : "bg-brand text-surface-950"
                )}
              >
                {saving ? "Saving..." : identifying ? "Waiting for AI..." : "Save & Add to Cart"}
              </button>
            </div>
          </div>
        )}

        {/* Scan result panel */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-700 rounded-t-[20px] p-5 transition-transform duration-300 z-20",
            scanResult && !quickAdd ? "translate-y-0" : "translate-y-full"
          )}
          style={{
            transitionTimingFunction: "cubic-bezier(.34,1.56,.64,1)",
            paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))",
          }}
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

  // Portal to document.body so it renders above the app shell (header, sidebar, nav)
  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
