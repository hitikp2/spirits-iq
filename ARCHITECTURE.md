# Spirits IQ — System Architecture & Connection Map

## 1. HIGH-LEVEL ARCHITECTURE

```
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                              BROWSER / MOBILE                                    │
 │                                                                                  │
 │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
 │  │Dashboard │ │  P.O.S.  │ │Inventory │ │   SMS    │ │ Insights │ │ Settings │ │
 │  │  page    │ │  page    │ │  page    │ │  page    │ │  page    │ │  page    │ │
 │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
 │       │             │             │             │             │             │      │
 │       └──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┘      │
 │              │             │             │             │             │              │
 │         useSession()  React Query    React Query   React Query  Raw fetch()       │
 │         (storeId)     Hooks x16      Hooks x16     Hooks x16   (settings)        │
 └──────────┬──────────────┬──────────────┬──────────────┬────────────────────────────┘
            │              │              │              │
            ▼              ▼              ▼              ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                           NEXT.JS MIDDLEWARE                                     │
 │                                                                                  │
 │  1. Check JWT token (getToken from next-auth)                                   │
 │  2. Redirect unauthenticated → /login                                           │
 │  3. Role guard: /settings → OWNER or MANAGER only                               │
 │  4. Inject headers on /api/* routes:                                            │
 │     ┌─────────────────────────────────────────────┐                             │
 │     │  x-store-id  = token.storeId               │                             │
 │     │  x-user-id   = token.id                    │                             │
 │     │  x-user-role = token.role                   │                             │
 │     └─────────────────────────────────────────────┘                             │
 │  5. Public bypass: /login, /api/auth/*, /api/webhooks                           │
 └──────────────────────────┬──────────────────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                           26 API ROUTES (all force-dynamic)                      │
 │                                                                                  │
 │   CORE              AI                 COMMS           BUSINESS                  │
 │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐             │
 │  │/api/pos    │   │/api/ai     │   │/api/sms    │   │/api/accounting│           │
 │  │/api/inv    │   │/api/cron   │   │/api/webhooks│  │/api/reports │             │
 │  │/api/cust   │   │            │   │            │   │/api/reports │             │
 │  │/api/analytics│ │            │   │            │   │  /generate  │             │
 │  │/api/settings│  │            │   │            │   │/api/loyalty │             │
 │  │/api/employees│ │            │   │            │   │/api/marketing│            │
 │  │/api/seed   │   │            │   │            │   │/api/delivery│             │
 │  │/api/health │   │            │   │            │   │/api/club    │             │
 │  │/api/populate│  │            │   │            │   │/api/security│             │
 │  │            │   │            │   │            │   │/api/pricing │             │
 │  │            │   │            │   │            │   │/api/labels  │             │
 │  │            │   │            │   │            │   │/api/storefront│           │
 │  │            │   │            │   │            │   │/api/customer-app│         │
 │  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘             │
 │        │                │                │                │                      │
 │  storeId = request.headers.get("x-store-id") || searchParams.get("storeId")    │
 └────────┬────────────────┬────────────────┬────────────────┬─────────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                          17 SERVICE MODULES                                      │
 │                                                                                  │
 │  analytics.ts  │ inventory.ts │ accounting.ts │ employees.ts │ marketing.ts     │
 │  club.ts       │ delivery.ts  │ ecommerce.ts  │ labels.ts    │ loyalty.ts       │
 │  notifications │ reports.ts   │ report-gen.ts  │ security.ts  │ customer-app.ts  │
 │  competitor-pricing.ts │ jobs.ts (cron handlers)                                │
 └────────┬────────────────┬────────────────┬──────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
 ┌─────────────────┐ ┌─────────────┐ ┌───────────────────┐
 │   PRISMA ORM    │ │  REDIS      │ │  EXTERNAL APIs    │
 │   (db client)   │ │  (cache)    │ │                   │
 │                  │ │             │ │  Google Gemini    │
 │  50+ Models     │ │  siq:* keys │ │  Stripe           │
 │  25+ Enums      │ │  Cart sync  │ │  Twilio           │
 │                  │ │  Dashboard  │ │                   │
 └────────┬────────┘ └──────┬──────┘ └───────────────────┘
          │                 │
          ▼                 ▼
 ┌─────────────────┐ ┌─────────────┐
 │  SUPABASE       │ │  REDIS      │
 │  PostgreSQL     │ │  (optional) │
 │                  │ │             │
 │  Port 6543      │ │  Graceful   │
 │  (PgBouncer)    │ │  no-op if   │
 │  Port 5432      │ │  unset      │
 │  (Direct/Migrate)│ │            │
 └─────────────────┘ └─────────────┘
```

---

## 2. AUTHENTICATION FLOW

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                        LOGIN PAGE (/login)                              │
 │                                                                         │
 │   ┌─── EMAIL MODE ───┐         ┌──── PIN MODE ─────┐                  │
 │   │                   │         │                    │                  │
 │   │  email + password │         │  storeId + 4-digit │                 │
 │   │                   │         │  PIN               │                  │
 │   └────────┬──────────┘         └─────────┬──────────┘                  │
 │            │                              │                             │
 │            ▼                              ▼                             │
 │   signIn("credentials")          signIn("pin")                         │
 │   {email, password}              {pin, storeId}                        │
 └────────────┬──────────────────────────────┬─────────────────────────────┘
              │                              │
              ▼                              ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                    NEXTAUTH (src/lib/auth.ts)                           │
 │                                                                         │
 │   CREDENTIALS PROVIDER:              PIN PROVIDER:                      │
 │   ┌──────────────────────┐          ┌──────────────────────┐           │
 │   │ 1. Find user by email │          │ 1. Find user by      │          │
 │   │ 2. bcrypt.compare()  │          │    storeId + pin     │           │
 │   │ 3. Return user obj   │          │ 2. Return user obj   │           │
 │   └──────────┬───────────┘          └──────────┬───────────┘           │
 │              │                                 │                        │
 │              └────────────┬────────────────────┘                        │
 │                           ▼                                             │
 │                    JWT CALLBACK                                         │
 │              ┌─────────────────────────┐                                │
 │              │ token.id       = user.id│                                │
 │              │ token.role     = OWNER  │                                │
 │              │ token.storeId  = abc123 │                                │
 │              │ token.storeName= "..."  │                                │
 │              └─────────┬───────────────┘                                │
 │                        │                                                │
 │                SESSION CALLBACK                                         │
 │              ┌─────────────────────────┐                                │
 │              │ session.user.id         │                                │
 │              │ session.user.role       │                                │
 │              │ session.user.storeId    │  ◄── Pages read this          │
 │              │ session.user.storeName  │                                │
 │              └─────────────────────────┘                                │
 │                                                                         │
 │   Strategy: JWT │ MaxAge: 12 hours │ Cookie-based                      │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. DATA FLOW PER FEATURE

### 3A. POINT OF SALE (POS)

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  POS PAGE (src/app/(app)/pos/page.tsx)                          │
 │                                                                  │
 │  useSession() ──► storeId, userId                               │
 │       │                                                          │
 │       ├── useInventory(storeId) ──► GET /api/inventory           │
 │       │       └── getInventory() ──► db.product.findMany()      │
 │       │                                                          │
 │       ├── useUpsellSuggestion(storeId, cartIds) ──► GET /api/pos│
 │       │       └── getUpsellSuggestions() ──► Gemini AI          │
 │       │               └── db.product + db.transactionItem       │
 │       │                                                          │
 │       ├── Customer Lookup (phone) ──► POST /api/customers       │
 │       │       └── db.customer.findFirst({phone})                │
 │       │                                                          │
 │       └── handleCharge(CASH|CARD) ──► POST /api/pos             │
 │               │                                                  │
 │               ├── [CARD + Stripe key?] createTerminalPaymentIntent│
 │               │       └── stripe.paymentIntents.create()        │
 │               │                                                  │
 │               └── completeTransaction()                          │
 │                   ├── db.store.findUnique (tax rate)            │
 │                   ├── db.transaction.create (with items)        │
 │                   ├── db.product.update (decrement qty)         │
 │                   ├── db.inventoryLog.create (audit)            │
 │                   ├── db.customer.update (spend, visits)        │
 │                   └── cacheDelete (invalidate dashboard)        │
 └─────────────────────────────────────────────────────────────────┘
```

### 3B. SMS / AI CHAT

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  OUTBOUND (Store → Customer)                                    │
 │                                                                  │
 │  SMS Page ──► useSendMessage() ──► POST /api/sms {action:"send"}│
 │                  └── sendSms() ──► Twilio client.messages.create│
 │                       └── db.smsMessage.create (log)            │
 │                                                                  │
 │  SMS Page ──► useConversations(storeId)                         │
 │                  └── GET /api/sms ──► db.customer.findMany      │
 │                       └── include: smsMessages (last 20)        │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │  INBOUND (Customer → Store)                                     │
 │                                                                  │
 │  Customer texts Twilio number                                   │
 │       │                                                          │
 │       ▼                                                          │
 │  Twilio Webhook ──► POST /api/webhooks?provider=twilio          │
 │       │   (Public path — no auth required)                      │
 │       ▼                                                          │
 │  handleInboundSms(from, body, sid)                              │
 │       ├── Normalize phone, find/create customer                 │
 │       ├── db.smsMessage.create (log inbound)                   │
 │       ├── Check opt-out: "STOP" → unsubscribe                  │
 │       ├── Check opt-in:  "START" → resubscribe                 │
 │       └── AI Auto-Reply (if enabled in store settings)          │
 │           └── generateSmsResponse()                              │
 │               ├── db.customer + transactions (RAG context)      │
 │               ├── db.product.findMany (search inventory)        │
 │               ├── Gemini AI ──► response (≤320 chars)           │
 │               └── sendSms() ──► Twilio (outbound reply)        │
 └─────────────────────────────────────────────────────────────────┘
```

### 3C. AI INSIGHTS

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  Insights Page ──► useInsights(storeId)                         │
 │                       └── GET /api/ai ──► db.aiInsight.findMany│
 │                                                                  │
 │  "Generate" button ──► useGenerateInsights()                    │
 │       └── POST /api/ai {action:"generate"}                     │
 │            └── generateInsights(storeId)                         │
 │                 ├── db.transaction.findMany (30-day sales)      │
 │                 ├── db.product.findMany + filter (low stock)    │
 │                 ├── db.product.findMany (top velocity)          │
 │                 ├── Gemini AI ──► JSON array of insights        │
 │                 └── db.aiInsight.create (save each)             │
 │                                                                  │
 │  "Apply/Dismiss" ──► useUpdateInsight()                         │
 │       └── POST /api/ai {action:"update-status"}                │
 │            └── db.aiInsight.update({status})                    │
 │                                                                  │
 │  CRON (scheduled):                                               │
 │  POST /api/cron {job:"daily-ai"} ──► dailyAiJob()             │
 │       └── generateInsights() for each active store              │
 └─────────────────────────────────────────────────────────────────┘
```

### 3D. INVENTORY MANAGEMENT

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  Inventory Page ──► useInventory(storeId)                       │
 │                        └── GET /api/inventory                   │
 │                             └── getInventory(storeId, filters)  │
 │                                  ├── status="ok"  → filter qty > reorderPoint │
 │                                  ├── status="low" → filter qty ≤ reorderPoint │
 │                                  ├── status="out" → where qty = 0             │
 │                                  └── status="all" → no filter                 │
 │                                                                  │
 │  Alerts ──► useInventoryAlerts(storeId)                         │
 │                └── GET /api/inventory?action=alerts              │
 │                     └── getInventoryAlerts() → compare qty      │
 │                                                                  │
 │  Adjust Stock ──► useStockAdjust()                              │
 │       └── POST /api/inventory {action:"adjust"}                 │
 │            └── adjustStock() → db.product.update + inventoryLog │
 │                                                                  │
 │  AI Reorder ──► useAiReorder()                                  │
 │       └── POST /api/inventory {action:"ai-reorder"}             │
 │            └── generateAiPurchaseOrder() → Gemini + db          │
 │                                                                  │
 │  Add Product ──► POST /api/inventory {action:"create"}          │
 │       └── db.product.create()                                    │
 └─────────────────────────────────────────────────────────────────┘
```

---

## 4. EXTERNAL SERVICE CONNECTIONS

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                   GOOGLE GEMINI (AI)                             │
 │                                                                  │
 │  SDK: @google/generative-ai                                     │
 │  Model: gemini-2.5-flash-lite                                   │
 │  Env: GEMINI_API_KEY                                            │
 │                                                                  │
 │  Entry: src/lib/ai/gemini.ts → getModel() / generateText()     │
 │                                                                  │
 │  Used by:                                                        │
 │  ├── generateSmsResponse()  ──► SMS auto-reply (200 tokens)    │
 │  ├── generateInsights()     ──► Business intel  (1500 tokens)   │
 │  ├── getUpsellSuggestions() ──► Cart recs       (200 tokens)    │
 │  ├── accounting.ts          ──► Financial analysis              │
 │  ├── employees.ts           ──► Schedule suggestions            │
 │  ├── competitor-pricing.ts  ──► Price analysis                  │
 │  ├── club.ts                ──► Wine club recs                  │
 │  ├── report-generator.ts    ──► Report narratives               │
 │  ├── reports.ts             ──► Report summaries                │
 │  └── marketing.ts           ──► Campaign copy                   │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │                   STRIPE (Payments)                              │
 │                                                                  │
 │  SDK: stripe                                                     │
 │  Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                  │
 │  Status: OPTIONAL — graceful fallback if unset                  │
 │                                                                  │
 │  Entry: src/lib/payments/index.ts                                │
 │  ├── createTerminalPaymentIntent() ──► Card-present POS        │
 │  ├── completeTransaction()         ──► Record sale in DB        │
 │  ├── processRefund()               ──► Refund handling          │
 │  └── Webhook: /api/webhooks?provider=stripe                     │
 │       ├── payment_intent.succeeded → mark COMPLETED             │
 │       ├── payment_intent.payment_failed → mark FAILED           │
 │       └── charge.refunded → mark REFUNDED                       │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │                   TWILIO (SMS)                                   │
 │                                                                  │
 │  SDK: twilio                                                     │
 │  Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,                    │
 │       TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID         │
 │                                                                  │
 │  Entry: src/lib/sms/index.ts                                     │
 │  ├── sendSms()              ──► Outbound messages               │
 │  ├── handleInboundSms()     ──► Process incoming + AI reply     │
 │  ├── sendBroadcastCampaign()──► Mass campaign sending           │
 │  └── Webhook: /api/webhooks?provider=twilio                     │
 │       └── Receives inbound SMS → handleInboundSms()             │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │                   REDIS (Caching — Optional)                    │
 │                                                                  │
 │  SDK: ioredis (lazy proxy — no-op if REDIS_URL unset)           │
 │  Key prefix: siq:*                                               │
 │                                                                  │
 │  Entry: src/lib/db/redis.ts                                      │
 │  ├── cacheGet(key)          ──► Read from cache                 │
 │  ├── cacheSet(key, data)    ──► Write to cache with TTL         │
 │  ├── cacheDelete(pattern)   ──► Invalidate cache                │
 │  ├── getActiveCart(regId)   ──► POS cart (1hr TTL)              │
 │  └── setActiveCart(regId)   ──► Multi-device cart sync          │
 │                                                                  │
 │  All operations fail silently — cache is non-critical            │
 └─────────────────────────────────────────────────────────────────┘
```

---

## 5. PROVIDER WRAPPER CHAIN

```
 src/app/layout.tsx
 └── <Providers>  (src/app/providers.tsx)
      ├── <SessionProvider>          ──► NextAuth session context
      │    └── enables useSession() in all pages
      ├── <QueryClientProvider>      ──► React Query context
      │    └── enables useQuery/useMutation in all hooks
      └── <Toaster>                  ──► Sonner toast notifications
```

---

## 6. ACCURACY AUDIT — CURRENT STATUS

### Pages (6/6 wired correctly)

| Page | useSession | storeId Source | Status |
|------|-----------|----------------|--------|
| Dashboard | `useSession()` | `session.user.storeId` | PASS |
| POS | `useSession()` | `session.user.storeId` + `userId` for cashier | PASS |
| Inventory | `useSession()` | `session.user.storeId` + `userId` for audit | PASS |
| SMS | `useSession()` | `session.user.storeId` | PASS |
| Insights | `useSession()` | `session.user.storeId` | PASS |
| Settings | `useSession()` | `session.user.storeId` (deps: [storeId]) | PASS |

### API Routes — storeId from header (19/19 GET handlers)

| Route | x-store-id Header | Fallback to Query | Status |
|-------|-------------------|-------------------|--------|
| /api/analytics | Yes | Yes | PASS |
| /api/inventory | Yes | Yes | PASS |
| /api/pos (GET) | Yes | Yes | PASS |
| /api/sms | Yes | Yes | PASS |
| /api/ai | Yes | Yes | PASS |
| /api/customers | Yes | Yes | PASS |
| /api/settings | Yes | Yes | PASS |
| /api/employees | Yes | Yes | PASS |
| /api/accounting | Yes | Yes | PASS |
| /api/reports | Yes | Yes | PASS |
| /api/reports/generate | Yes | Yes | PASS |
| /api/loyalty | Yes | Yes | PASS |
| /api/marketing | Yes | Yes | PASS |
| /api/delivery | Yes | Yes | PASS |
| /api/club | Yes | Yes | PASS |
| /api/security | Yes | Yes | PASS |
| /api/pricing | Yes | Yes | PASS |
| /api/labels | Yes | Yes | PASS |
| /api/storefront | Yes | Yes | PASS |

### Middleware Header Injection

| Header | Source | Injected On | Status |
|--------|--------|------------|--------|
| x-store-id | token.storeId | All /api/* routes | PASS |
| x-user-id | token.id | All /api/* routes | PASS |
| x-user-role | token.role | All /api/* routes | PASS |

### External Services — Graceful Degradation

| Service | Required | Fallback When Missing | Status |
|---------|----------|----------------------|--------|
| Supabase PostgreSQL | Yes | App won't start | REQUIRED |
| GEMINI_API_KEY | Yes | AI features return empty | REQUIRED |
| NEXTAUTH_SECRET | Yes | Auth won't work | REQUIRED |
| Stripe | No | Card sales recorded without processing | PASS |
| Twilio | No | SMS send returns null (logged) | PASS |
| Redis | No | No-op proxy, all ops return null | PASS |

### Known Remaining Bugs

| # | Location | Bug | Severity |
|---|----------|-----|----------|
| 1 | `src/lib/services/report-generator.ts:67,79` | Uses `db.product.fields.reorderPoint` (invalid Prisma syntax) | HIGH — wrong report data |
| 2 | `src/lib/services/jobs.ts:28` | Uses `db.product.fields.reorderPoint` (invalid Prisma syntax) | HIGH — cron job fails silently |
| 3 | `src/app/api/webhooks/route.ts:2` | Imports `stripe` at top level — crashes if Stripe SDK init fails | MEDIUM |
| 4 | Settings page | Uses raw `fetch()` instead of React Query hooks | LOW — inconsistent pattern |
| 5 | Sidebar | "3 auto-replies sent today" is hardcoded static text | LOW — cosmetic |

---

## 7. DATABASE CONNECTION TOPOLOGY

```
 ┌───────────────┐         ┌──────────────────┐
 │  Next.js App  │         │    SUPABASE       │
 │               │         │                    │
 │  Prisma ORM ──┼────────►│  PgBouncer :6543  │──► PostgreSQL
 │  (pooled)     │  ?pgbouncer=true             │
 │               │         │                    │
 │  Seed Script ─┼────────►│  Direct    :5432  │──► PostgreSQL
 │  Migrations   │  DIRECT_URL                  │
 └───────────────┘         └──────────────────┘
```

---

## 8. DEPLOYMENT PIPELINE

```
 ┌──────────┐     ┌──────────────┐     ┌──────────────────────────┐
 │  GitHub  │────►│  Railway     │────►│  Docker Container        │
 │  Push    │     │  Build       │     │                          │
 └──────────┘     │              │     │  1. prisma migrate       │
                  │  Dockerfile: │     │     resolve --applied    │
                  │  node:20-slim│     │  2. prisma migrate       │
                  │  + openssl   │     │     deploy               │
                  │  3.0.x       │     │  3. node scripts/seed.mjs│
                  └──────────────┘     │  4. node server.js       │
                                       └──────────────────────────┘
```
