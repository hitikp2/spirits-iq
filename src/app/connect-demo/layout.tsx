/**
 * Connect Demo Layout
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal layout for the Connect demo pages. These pages don't use the main
 * app shell (sidebar/navigation) since they serve as a standalone demo.
 */

export default function ConnectDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
