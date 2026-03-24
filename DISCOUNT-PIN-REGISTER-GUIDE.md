# Discount Codes, PIN Switching & Multi-Register Sync — Claude Code Guide

## Prerequisites

Complete POS-IMPLEMENTATION-GUIDE.md first. Visual prototype: `spirits-discount-pin-register.html`

-----

## Feature 1: Discount Codes at POS

### Existing Infrastructure (Already Built)

Your project already has a full coupon/loyalty system. Read these files first:

- `src/lib/services/loyalty.ts` → `applyCoupon()` validates codes, `useCoupon()` marks as used
- `src/app/api/loyalty/route.ts` → `action: "apply-coupon"` endpoint
- `src/lib/store.ts` → Cart already has a `discount` field per item via `recalcCart()`
- `src/types/index.ts` → `CartItem` already has a `discount: number` field

The `applyCoupon()` function already handles: `DISCOUNT_FIXED`, `DISCOUNT_PERCENT`, `FREE_PRODUCT`, `FREE_CATEGORY` reward types.

### What Needs Building

**Create:** `src/components/pos/DiscountInput.tsx`

```tsx
interface DiscountInputProps {
  subtotal: number;
  onApply: (discount: { amount: number; code: string; label: string; redemptionId: string }) => void;
  onRemove: () => void;
  activeDiscount: { amount: number; code: string; label: string } | null;
  storeId: string;
}
```

**UI:**

1. Input field (monospace, uppercase auto-transform) + “Apply” button
1. On submit: call `POST /api/loyalty` with `{ action: "apply-coupon", couponCode, subtotal }`
1. Valid result → green banner showing discount name + amount + remove (X) button
1. Invalid → red banner with error message (“Invalid code”, “Expired”, “Already used”)
1. Loyalty reward codes (prefixed `SIQ-`) → purple banner with points info

**Supported discount types (all already in `applyCoupon()`):**

|Type              |How It Works              |Example                |
|------------------|--------------------------|-----------------------|
|`DISCOUNT_PERCENT`|`subtotal × (value / 100)`|15% off → SUMMER15     |
|`DISCOUNT_FIXED`  |Flat dollar amount off    |$20 off → SAVE20       |
|`FREE_PRODUCT`    |Specific product free     |Free tonic → BOGO-TONIC|
|`FREE_CATEGORY`   |Free item from category   |Free mixer → FREEMIXER |

**Integration into CheckoutModal:**

```tsx
// In CheckoutModal.tsx, add DiscountInput above the totals section:
const [discount, setDiscount] = useState<DiscountInfo | null>(null);

// Recalculate totals with discount:
const discountedSubtotal = subtotal - (discount?.amount || 0);
const tax = discountedSubtotal * TAX_RATE;
const total = discountedSubtotal + tax;
```

**After successful payment, mark coupon as used:**

```ts
// In the payment success handler:
if (discount?.redemptionId) {
  await fetch('/api/loyalty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'use-coupon', couponCode: discount.code }),
  });
}
```

The `useCoupon()` function in `src/lib/services/loyalty.ts` sets `status: "USED"` and `usedAt: new Date()`.

**Pass discount to `completeTransaction()`:**

The existing `completeTransaction()` in `src/lib/payments/index.ts` already calculates `discountAmount`:

```ts
discountAmount: items.reduce((s, i) => s + (i.discount || 0), 0),
```

For order-level discounts (not per-item), add a `discountAmount` override param:

```ts
export async function completeTransaction(params: {
  // ... existing
  orderDiscount?: number;    // Order-level discount amount
  couponCode?: string;       // For receipt/audit
}) {
  // Modify the total calculation:
  const discount = params.orderDiscount || items.reduce((s, i) => s + (i.discount || 0), 0);
  const taxable = subtotal - discount;
  const taxAmount = taxable * taxRate;
  const total = taxable + taxAmount + (params.tip || 0);
```

**Manager override for manual discounts:**

If a cashier wants to apply an ad-hoc discount (not code-based), require a manager PIN first. Reuse the PIN pad component from Feature 2, check that the entered PIN belongs to a user with role `MANAGER` or `OWNER` via `POST /api/employees` lookup, then allow manual dollar or percentage entry.

**Receipt display:** Show discount on both digital and thermal receipts:

```
Subtotal:     $218.96
Discount:     -$32.84  (SUMMER15)
Tax (9.75%):   $18.15
Total:        $204.27
```

### Stacking Rules

- Only ONE coupon code per transaction (standard for retail POS)
- Loyalty point redemptions and coupon codes do NOT stack
- Employee discounts (if implemented) stack on top of coupons
- Display clear error: “Only one discount code per transaction”

-----

## Feature 2: Employee PIN Quick-Switch

### Existing Infrastructure

- `src/app/login/page.tsx` → Full PIN pad with 4-digit entry already built
- `src/lib/auth.ts` → NextAuth PIN provider that validates against `db.user`
- `src/lib/services/employees.ts` → `clockIn()`, `clockOut()` functions
- `prisma/schema.prisma` → User model has `pin: String`, `role: Role` enum
- Seed data: Alex (1234/OWNER), Jordan (5678/MANAGER), Sam (0000/CASHIER)

### What Needs Building

**Create:** `src/components/pos/PinSwitchModal.tsx`

```tsx
interface PinSwitchModalProps {
  open: boolean;
  onClose: () => void;
  onSwitch: (user: { id: string; name: string; role: string }) => void;
  storeId: string;
  currentUserId: string;
  preserveCart?: boolean;  // default true
}
```

**UI Structure:**

1. **Current cashier banner** — avatar, name, role badge, shift duration
1. **Quick-switch row** — horizontal scroll of clocked-in employees (avatars), tap to open PIN pad for that person
1. **PIN pad** — 4×3 grid with digits + backspace, 4 dots showing progress
1. **Cancel button** below the pad

**PIN validation flow (DO NOT use NextAuth):**

The PIN switch is a lightweight in-app authentication, not a full session change. The existing NextAuth session stays active (it holds the storeId). Instead:

```ts
// Direct DB lookup — add to /api/employees route:
if (action === "pin-switch") {
  const { storeId, pin } = body;
  const user = await db.user.findFirst({
    where: { storeId, pin, isActive: true },
    select: { id: true, name: true, role: true, pin: true },
  });
  if (!user) return error("Invalid PIN");
  return { success: true, data: user };
}
```

**Clock in/out automation:**

```ts
async function handlePinSwitch(newUser: User) {
  // 1. Clock out current cashier
  try { await clockOutMutation.mutateAsync(currentUserId); } catch {}
  
  // 2. Clock in new cashier
  try { await clockInMutation.mutateAsync(newUser.id); } catch {}
  
  // 3. Update local state
  setCurrentCashier(newUser);
  
  // 4. Update register assignment
  await fetch('/api/pos', {
    method: 'POST',
    body: JSON.stringify({ action: 'assign-register', registerId, userId: newUser.id }),
  });
  
  // 5. Cart is preserved (not cleared) by default
  // 6. Show toast: "Switched to Jordan Chen"
}
```

**Add the assign-register action to `src/app/api/pos/route.ts`:**

```ts
if (action === "assign-register") {
  const { registerId, userId } = body;
  await db.register.update({
    where: { id: registerId },
    data: { activeUserId: userId },
  });
  return NextResponse.json({ success: true });
}
```

**Add `activeUserId` to Register model if not present:**

```prisma
model Register {
  // ... existing
  activeUserId  String?
  activeUser    User?    @relation(fields: [activeUserId], references: [id])
}
```

**Where to place the switch button:**

In the POS header, show current cashier name with a small “Switch” icon:

```tsx
<button onClick={() => setPinSwitchOpen(true)} className="flex items-center gap-2">
  <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-xs font-bold text-brand">
    {currentCashier.name.split(' ').map(n => n[0]).join('')}
  </div>
  <span className="text-xs text-surface-400">{currentCashier.name}</span>
  <span className="text-xs text-surface-600">🔄</span>
</button>
```

**Manager override pattern:**

When certain actions require elevated permissions (void, refund, manual discount), show the same PIN pad but filter validation to only accept `MANAGER` or `OWNER` roles:

```ts
if (action === "manager-override") {
  const user = await db.user.findFirst({
    where: { storeId, pin, role: { in: ["MANAGER", "OWNER"] }, isActive: true },
  });
  if (!user) return error("Manager PIN required");
  return { success: true, data: { authorized: true, authorizer: user.name } };
}
```

**Audit logging:**

Every PIN switch should create an audit log entry. Add to the switch handler:

```ts
await db.auditLog.create({
  data: {
    storeId,
    action: "PIN_SWITCH",
    userId: newUser.id,
    details: {
      previousUserId: currentUserId,
      registerId,
      cartPreserved: true,
      cartItemCount: cart.length,
    },
  },
});
```

If `AuditLog` model doesn’t exist, create it:

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  storeId   String
  store     Store    @relation(fields: [storeId], references: [id])
  action    String
  userId    String?
  details   Json?
  createdAt DateTime @default(now())
}
```

-----

## Feature 3: Multi-Register Sync

### Existing Infrastructure

- `prisma/schema.prisma` → `Register` model with `storeId`, `isActive`, `terminalId`
- `src/lib/db/redis.ts` → `getActiveCart(registerId)`, `setActiveCart(registerId, cart)`, `clearActiveCart(registerId)` — per-register cart sync already built
- `src/lib/payments/index.ts` → `completeTransaction()` already takes `registerId`
- Seed data creates “Register 1” by default
- CLAUDE.md mentions: “Add WebSocket support for real-time POS sync across devices” as a TODO

### Architecture

```
Register 1 (iPad)     Register 2 (Desktop)     Mobile POS
     │                      │                      │
     └──────────┬───────────┘──────────────────────┘
                │
         Redis Pub/Sub (or polling)
                │
     ┌──────────┴───────────┐
     │    PostgreSQL         │
     │  (source of truth)   │
     └──────────────────────┘
```

### What Needs Building

#### Step 1: Register Management API

**Add to `src/app/api/pos/route.ts`:**

```ts
// GET: List registers for this store
if (action === "registers") {
  const registers = await db.register.findMany({
    where: { storeId, isActive: true },
    include: { 
      activeUser: { select: { id: true, name: true, role: true } },
    },
  });
  
  // Get today's stats per register
  const enriched = await Promise.all(registers.map(async (reg) => {
    const stats = await db.transaction.aggregate({
      where: { registerId: reg.id, createdAt: { gte: startOfDay() }, paymentStatus: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    });
    return {
      ...reg,
      todaySales: Number(stats._sum.total || 0),
      todayTransactions: stats._count,
    };
  }));
  
  return NextResponse.json({ success: true, data: enriched });
}
```

#### Step 2: Real-Time Inventory Sync

When a sale completes on any register, all other registers need updated stock counts. Two approaches:

**Option A: Polling (Simpler, works now)**

Use React Query’s `refetchInterval` on the inventory hook:

```ts
// In useInventory() — src/hooks/useApi.ts:
export function useInventory(storeId: string) {
  return useQuery({
    queryKey: ["inventory", storeId],
    queryFn: () => fetcher(`/api/inventory?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 5000,  // Poll every 5 seconds
    staleTime: 3000,
  });
}
```

**Option B: Server-Sent Events (Better UX, needs new endpoint)**

**Create:** `src/app/api/pos/events/route.ts`

```ts
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const storeId = request.headers.get("x-store-id");
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send heartbeat every 30s
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
      }, 30000);
      
      // Poll for changes (or use Redis pub/sub)
      const poll = setInterval(async () => {
        const events = await getRecentStoreEvents(storeId, 5); // last 5 seconds
        if (events.length > 0) {
          controller.enqueue(
            encoder.encode(`event: update\ndata: ${JSON.stringify(events)}\n\n`)
          );
        }
      }, 2000);
      
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clearInterval(poll);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Create:** `src/hooks/useStoreEvents.ts`

```ts
export function useStoreEvents(storeId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!storeId) return;
    const es = new EventSource(`/api/pos/events?storeId=${storeId}`);
    
    es.addEventListener("update", (e) => {
      const events = JSON.parse(e.data);
      for (const event of events) {
        switch (event.type) {
          case "SALE_COMPLETED":
            // Invalidate inventory cache → triggers refetch
            queryClient.invalidateQueries({ queryKey: ["inventory", storeId] });
            break;
          case "STOCK_UPDATED":
            queryClient.invalidateQueries({ queryKey: ["inventory", storeId] });
            break;
          case "PRICE_CHANGED":
            queryClient.invalidateQueries({ queryKey: ["inventory", storeId] });
            break;
          case "PIN_SWITCH":
            queryClient.invalidateQueries({ queryKey: ["registers", storeId] });
            break;
        }
      }
    });

    return () => es.close();
  }, [storeId, queryClient]);
}
```

#### Step 3: Per-Register Cart Isolation

The Redis functions for this already exist in `src/lib/db/redis.ts`:

- `getActiveCart(registerId)`
- `setActiveCart(registerId, cart)`
- `clearActiveCart(registerId)`

Wire these into the Zustand store:

```ts
// In src/lib/store.ts, modify usePOSStore:
export const usePOSStore = create<POSState>((set, get) => ({
  // ... existing
  registerId: null,
  
  setRegister: (id: string) => {
    set({ registerId: id });
    // Load cart from Redis for this register
    fetch(`/api/pos?action=get-cart&registerId=${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          set({ cart: data.data });
        }
      });
  },

  // Modify addItem to also persist to Redis:
  addItem: (item) => set((state) => {
    // ... existing logic
    const newCart = { ...state.cart, items, ...recalcCart(items) };
    // Persist to Redis (fire-and-forget)
    if (state.registerId) {
      fetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-cart', registerId: state.registerId, cart: newCart }),
      });
    }
    return { cart: newCart };
  }),
}));
```

**Add cart endpoints to `src/app/api/pos/route.ts`:**

```ts
if (action === "get-cart") {
  const cart = await getActiveCart(registerId);
  return NextResponse.json({ success: true, data: cart });
}

if (action === "save-cart") {
  await setActiveCart(registerId, body.cart);
  return NextResponse.json({ success: true });
}
```

#### Step 4: Conflict Resolution (Stock Races)

When two registers try to sell the last item simultaneously:

```ts
// In completeTransaction(), add optimistic locking:
for (const item of items) {
  const product = await tx.product.findUnique({ where: { id: item.productId } });
  if (!product) throw new Error(`Product not found: ${item.productId}`);
  
  if (product.quantity < item.quantity) {
    throw new Error(`OUT_OF_STOCK:${product.name}:${product.quantity}`);
  }
  
  // Use atomic decrement (Prisma handles this safely)
  await tx.product.update({
    where: { id: item.productId },
    data: { quantity: { decrement: item.quantity } },
  });
}
```

Handle the error on the frontend:

```ts
if (error.message.startsWith('OUT_OF_STOCK:')) {
  const [, productName, remaining] = error.message.split(':');
  toast.error(`${productName} is out of stock (${remaining} left). Removed from cart.`);
  removeItem(productId);
  // Refetch inventory to get current counts
  queryClient.invalidateQueries({ queryKey: ["inventory"] });
}
```

#### Step 5: Register Selection on Login

After PIN login, if the store has multiple registers, show a register picker:

**Create:** `src/components/pos/RegisterPicker.tsx`

```tsx
interface RegisterPickerProps {
  registers: Register[];
  onSelect: (registerId: string) => void;
}
```

Show a grid of register cards. Active ones show the current cashier, idle ones show “Available”. Selecting a register calls `setRegister()` on the Zustand store.

### What Syncs vs. What Doesn’t

|Data              |Syncs?|Method            |Latency|
|------------------|------|------------------|-------|
|Inventory counts  |✅ Yes |SSE or 5s polling |2-5s   |
|Product prices    |✅ Yes |SSE or polling    |2-5s   |
|Customer loyalty  |✅ Yes |DB (on lookup)    |Instant|
|Active promotions |✅ Yes |SSE or polling    |2-5s   |
|Cart contents     |❌ No  |Per-register Redis|N/A    |
|Cashier assignment|✅ Yes |DB + SSE          |~1s    |
|Register status   |✅ Yes |SSE heartbeat     |30s    |

-----

## Execution Order

1. **Discount codes** — Lightest lift, `applyCoupon()` already works
1. **PIN switching** — Moderate, PIN pad UI already exists in login page
1. **Multi-register** — Heaviest, needs SSE endpoint + register management

For Claude Code:

```bash
claude
> Read DISCOUNT-PIN-REGISTER-GUIDE.md, start with Feature 1.
> The prototype is in spirits-discount-pin-register.html.
> The coupon system already exists in src/lib/services/loyalty.ts — 
> check applyCoupon() before writing anything new.
```

-----

## New Files Summary

```
src/components/pos/DiscountInput.tsx        # Coupon code input + validation
src/components/pos/PinSwitchModal.tsx        # PIN pad for cashier switching
src/components/pos/RegisterPicker.tsx        # Register selection grid
src/app/api/pos/events/route.ts             # SSE endpoint for real-time sync
src/hooks/useStoreEvents.ts                 # SSE client hook
```

## Modified Files

```
src/app/api/pos/route.ts                    # Add pin-switch, assign-register, get-cart, save-cart actions
src/lib/payments/index.ts                   # Add orderDiscount param, stock race protection
src/lib/store.ts                            # Wire register-aware cart persistence
src/hooks/useApi.ts                         # Add refetchInterval to useInventory
prisma/schema.prisma                        # Add activeUserId to Register, AuditLog model
src/app/(app)/pos/page.tsx                  # Integrate all three features
```