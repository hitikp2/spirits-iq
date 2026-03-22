"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [mode, setMode] = useState<"email" | "pin">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  const handlePinLogin = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError("");

    const res = await signIn("pin", {
      pin,
      storeId: "demo-store", // In production, this comes from device registration
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid PIN");
      setPin("");
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  const handlePinInput = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      setTimeout(() => handlePinLogin(), 200);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-3xl mx-auto mb-4">
            🥃
          </div>
          <h1 className="font-display text-3xl font-bold text-surface-100 tracking-wide">
            SPIRITS <span className="font-mono text-sm text-brand tracking-[3px]">IQ</span>
          </h1>
          <p className="font-body text-sm text-surface-400 mt-2">
            AI-Powered Store Management
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-surface-900 border border-surface-600 rounded-xl p-1 mb-8">
          {[
            { id: "email" as const, label: "Email Login" },
            { id: "pin" as const, label: "POS PIN" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setError(""); }}
              className={`flex-1 py-2.5 rounded-lg font-body text-sm font-medium transition-all ${
                mode === m.id
                  ? "bg-brand/15 text-brand"
                  : "text-surface-400 hover:text-surface-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-body text-center">
            {error}
          </div>
        )}

        {/* Email Login Form */}
        {mode === "email" && (
          <div onSubmit={handleEmailLogin}>
            <div className="space-y-4">
              <div>
                <label className="block font-body text-xs text-surface-300 uppercase tracking-wider mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@store.com"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface-800 border border-surface-600 text-surface-100 font-body text-sm outline-none focus:border-brand/50 transition-colors"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-surface-300 uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface-800 border border-surface-600 text-surface-100 font-body text-sm outline-none focus:border-brand/50 transition-colors"
                />
              </div>
              <button
                onClick={handleEmailLogin}
                disabled={loading || !email || !password}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brand to-brand-dark text-black font-body text-sm font-bold transition-all hover:shadow-lg hover:shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </div>
        )}

        {/* PIN Login */}
        {mode === "pin" && (
          <div className="text-center">
            <p className="font-body text-sm text-surface-300 mb-6">
              Enter your 4-digit PIN
            </p>

            {/* PIN Display */}
            <div className="flex justify-center gap-4 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all ${
                    pin.length > i
                      ? "border-brand bg-brand/10"
                      : "border-surface-600 bg-surface-800"
                  }`}
                >
                  {pin.length > i && (
                    <div className="w-3 h-3 rounded-full bg-brand" />
                  )}
                </div>
              ))}
            </div>

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map(
                (digit) =>
                  digit === "" ? (
                    <div key="empty" />
                  ) : (
                    <button
                      key={digit}
                      onClick={() => {
                        if (digit === "←") setPin(pin.slice(0, -1));
                        else handlePinInput(digit);
                      }}
                      disabled={loading}
                      className="h-16 rounded-xl bg-surface-800 border border-surface-600 font-display text-2xl text-surface-100 hover:bg-surface-700 hover:border-brand/30 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {digit}
                    </button>
                  )
              )}
            </div>
          </div>
        )}

        {/* Demo credentials */}
        <div className="mt-8 p-4 rounded-xl bg-surface-900 border border-surface-600">
          <p className="font-mono text-[10px] text-surface-400 uppercase tracking-wider mb-2">
            Demo Credentials
          </p>
          <div className="font-mono text-xs text-surface-300 space-y-1">
            <p>Email: owner@highlandspirits.com</p>
            <p>Password: demo1234</p>
            <p>POS PIN: 1234</p>
          </div>
        </div>
      </div>
    </div>
  );
}
