"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-2xl bg-surface-900 border border-red-500/20 p-6 space-y-4">
        <h2 className="font-display text-xl font-bold text-red-400">Something went wrong</h2>
        <div className="rounded-xl bg-surface-950 border border-surface-600 p-4 overflow-x-auto">
          <p className="font-mono text-xs text-surface-300 whitespace-pre-wrap break-all">
            {error.message || "Unknown error"}
          </p>
          {error.digest && (
            <p className="font-mono text-[10px] text-surface-500 mt-2">
              Digest: {error.digest}
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-medium bg-brand text-surface-950 hover:bg-brand/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
