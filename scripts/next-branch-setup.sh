#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# next-branch-setup.sh — Bootstrap script for the next branch
# Run this ONCE at the start of the new branch to apply all
# automated fixes from the CLAUDE.md audit.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== Spirits IQ — Next Branch Setup ==="
echo ""

# ─── 1. Fix AI model references ──────────────────────────────
echo "[1/6] Updating Gemini model to gemini-2.5-flash-lite..."

sed -i 's/gemini-2\.5-flash"/gemini-2.5-flash-lite"/g' src/lib/ai/gemini.ts
sed -i 's/AI_MODEL = "gemini-2\.5-flash"/AI_MODEL = "gemini-2.5-flash-lite"/g' src/config/constants.ts

echo "  ✓ src/lib/ai/gemini.ts"
echo "  ✓ src/config/constants.ts"

# ─── 2. Replace hardcoded STORE_ID with useSession ───────────
echo ""
echo "[2/6] Removing hardcoded STORE_ID = \"demo-store\" from pages..."

PAGES=(
  "src/app/(app)/dashboard/page.tsx"
  "src/app/(app)/pos/page.tsx"
  "src/app/(app)/inventory/page.tsx"
  "src/app/(app)/sms/page.tsx"
  "src/app/(app)/insights/page.tsx"
  "src/app/(app)/settings/page.tsx"
)

for page in "${PAGES[@]}"; do
  if [ -f "$page" ]; then
    # Add useSession import if not present
    if ! grep -q 'useSession' "$page"; then
      sed -i '1s/^/"use client";\n/' "$page" 2>/dev/null || true
      # Add import after the first import block
      sed -i '/^import/!b;:a;n;/^import/ba;i\import { useSession } from "next-auth/react";' "$page"
    fi

    # Replace hardcoded STORE_ID constant with session-based hook
    if grep -q 'const STORE_ID = "demo-store"' "$page"; then
      sed -i 's/const STORE_ID = "demo-store";/\/\/ storeId now comes from session — see useSession() below/' "$page"
      echo "  ✓ $page (removed hardcoded STORE_ID)"
    else
      echo "  - $page (no hardcoded STORE_ID found, skipping)"
    fi
  else
    echo "  ⚠ $page not found"
  fi
done

# ─── 3. Fix inventory status filter mismatch ─────────────────
echo ""
echo "[3/6] Fixing inventory status filter mismatch..."

INVENTORY_API="src/app/api/inventory/route.ts"
if [ -f "$INVENTORY_API" ]; then
  # The API accepts "all" | "low" | "out" but frontend sends "ok" for in-stock
  # Add "ok" as alias for "all" minus low/out (handled by service layer)
  if ! grep -q '"ok"' "$INVENTORY_API"; then
    sed -i 's/status: (searchParams.get("status") as "all" | "low" | "out")/status: (searchParams.get("status") as "all" | "ok" | "low" | "out")/' "$INVENTORY_API"
    echo "  ✓ $INVENTORY_API (added 'ok' status support)"
  else
    echo "  - $INVENTORY_API (already has 'ok' support)"
  fi
fi

# ─── 4. List remaining manual TODOs ─────────────────────────
echo ""
echo "[4/6] Scanning for remaining demo-store references..."
echo ""
REFS=$(grep -rn '"demo-store"\|demo-store\|demo-user\|demo-cashier' src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true)
if [ -n "$REFS" ]; then
  echo "  ⚠ Found remaining hardcoded demo references (fix manually):"
  echo "$REFS" | while IFS= read -r line; do echo "    $line"; done
else
  echo "  ✓ No remaining demo-store references found"
fi

# ─── 5. Scan for invalid Prisma field references ─────────────
echo ""
echo "[5/6] Scanning for invalid Prisma field references..."
PRISMA_REFS=$(grep -rn 'db\.\w\+\.fields\.' src/ --include="*.ts" 2>/dev/null || true)
if [ -n "$PRISMA_REFS" ]; then
  echo "  ⚠ Found invalid db.model.fields.* usage (must fix — Prisma doesn't support this):"
  echo "$PRISMA_REFS" | while IFS= read -r line; do echo "    $line"; done
else
  echo "  ✓ No invalid Prisma field references found"
fi

# ─── 6. Summary ──────────────────────────────────────────────
echo ""
echo "[6/6] Summary of manual work needed:"
echo ""
echo "  REQUIRED (before deploy):"
echo "    □ Add useSession() hook to each page and wire storeId from session"
echo "    □ Update API routes to read x-store-id header instead of query param"
echo "    □ Fix any remaining demo-store references listed above"
echo "    □ Update login page PIN flow to use session-based storeId"
echo ""
echo "  RECOMMENDED:"
echo "    □ Add 'ok' status handling in inventory service (getInventory)"
echo "    □ Migrate settings page from raw fetch() to React Query hooks"
echo "    □ Make sidebar AI status dynamic (replace hardcoded '3 auto-replies')"
echo "    □ Add auth check to /api/populate-products route"
echo "    □ Replace seed.mjs demo data with real-world store template"
echo ""
echo "=== Setup complete ==="
