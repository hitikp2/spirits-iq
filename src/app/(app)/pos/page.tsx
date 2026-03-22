"use client";

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="text-5xl mb-4">🚧</div>
        <h2 className="font-display text-2xl font-bold text-surface-100 mb-2">
          Module Ready for Integration
        </h2>
        <p className="font-body text-sm text-surface-300 max-w-md">
          This page connects to the full API backend. Wire up the components
          from the interactive demo to these API hooks for production.
        </p>
      </div>
    </div>
  );
}
