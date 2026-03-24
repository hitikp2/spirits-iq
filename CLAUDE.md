# CLAUDE.md — Spirits IQ Project Intelligence

## Project Overview
AI-powered liquor store management platform (POS, Inventory, SMS, E-Commerce, Analytics).
- **Framework**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Database**: PostgreSQL (Supabase) with Prisma ORM v5.22.0
- **AI Provider**: Google Gemini (`gemini-2.5-flash-lite`) via `@google/generative-ai`
- **Deployment**: Railway (Docker) + Supabase (Postgres)
- **SMS**: Twilio
- **Payments**: Stripe
- **State Management**: React Query (TanStack Query) + NextAuth JWT sessions

## Architecture Overview

### App Structure
```
src/
├── app/
│   ├── (app)/              # Authenticated app shell (layout with sidebar/bottom nav)
│   │   ├── dashboard/      # Main dashboard — stats, revenue chart, top sellers, AI insights
│   │   ├── pos/            # Point of Sale — product grid, cart, Stripe checkout
│   │   ├── inventory/      # Inventory management — stock levels, alerts, AI reorder
│   │   ├── sms/            # SMS conversations — Twilio chat, AI auto-reply
│   │   ├── insights/       # AI Insights — generated business intelligence
│   │   └── settings/       # Store settings — config, employees, integrations
│   ├── api/                # 26 API routes (all export force-dynamic)
│   ├── login/              # Login page (email/password + POS PIN)
│   ├── providers.tsx       # React Query + NextAuth SessionProvider + Sonner toasts
│   └── layout.tsx          # Root layout with fonts + providers
├── hooks/
│   └── useApi.ts           # 16 React Query hooks (all data fetching)
├── lib/
│   ├── ai/
│   │   ├── gemini.ts       # Gemini SDK initialization + generateText helper
│   │   └── index.ts        # AI functions: SMS response, insights, upsell suggestions
│   ├── db/
│   │   ├── index.ts        # Prisma client (pgbouncer=true appended to DATABASE_URL)
│   │   └── redis.ts        # Lazy Redis proxy (no-op fallback if REDIS_URL unset)
│   ├── services/           # 17 business logic modules
│   ├── auth.ts             # NextAuth config (credentials + PIN providers, JWT strategy)
│   └── utils/index.ts      # 20+ utility functions (formatCurrency, getStockStatus, etc.)
├── config/
│   └── constants.ts        # App-wide constants (AI_MODEL, cache TTLs, rate limits)
├── types/
│   └── index.ts            # Core TypeScript interfaces
└── middleware.ts            # Auth guard + role-based access + x-store-id header injection
```

### Data Flow
```
Page (useSession → storeId) → React Query Hook → fetch(/api/...) → API Route → Service → Prisma → Supabase
                                                                        ↓
                                                            Middleware injects x-store-id header
```

## Critical Rules

### Prisma — No Column-to-Column Comparisons
- **DO NOT USE**: `db.product.fields.reorderPoint` or any `db.model.fields.*` in `where` clauses
- Prisma does NOT support field-to-field comparisons in `findMany`/`findFirst`
- **USE INSTEAD**: Fetch records and filter in application code
```typescript
// WRONG — causes undefined/silent failures
where: { quantity: { lte: db.product.fields.reorderPoint } }

// RIGHT — filter in app code
const all = await db.product.findMany({ where: { storeId, isActive: true } });
const lowStock = all.filter(p => p.quantity <= p.reorderPoint);
```
- **Known locations that had this bug**: `src/lib/services/inventory.ts` (fixed), `src/lib/ai/index.ts` (fixed — now filters in app code)

### Prisma Schema — Enum Syntax
- **USE**: Multi-line format with each value on its own line
- **DO NOT USE**: Single-line `enum Foo { A B C }` — Prisma parser silently fails

### Prisma Schema — Bidirectional Relations
Every model with `storeId String` MUST have both:
1. `store Store @relation(fields: [storeId], references: [id])` in the model
2. A corresponding array field in `Store` (e.g., `expenses Expense[]`)

### Docker Base Image
- **USE**: `node:20-slim` (Debian-based)
- **DO NOT USE**: `node:20-alpine` — musl libc causes OpenSSL mismatches with Prisma

### Prisma CLI in Docker
- **USE**: `./node_modules/.bin/prisma generate` and `./node_modules/.bin/prisma migrate deploy`
- **DO NOT USE**: `npx prisma generate` — npx can pick up globally cached Prisma v7 (breaking changes)

### Supabase PgBouncer Compatibility
- `src/lib/db/index.ts` auto-appends `pgbouncer=true` to `DATABASE_URL`
- PgBouncer transaction mode doesn't support prepared statements
- The seed script (`scripts/seed.mjs`) uses `DIRECT_URL` to bypass PgBouncer

## StoreId Resolution — Current State (Completed)

### Session-Based (Active)
All 6 pages use `useSession()` to get `storeId` from JWT:
- `src/app/(app)/dashboard/page.tsx` — `(session?.user as any)?.storeId`
- `src/app/(app)/pos/page.tsx` — `(session?.user as any)?.storeId`
- `src/app/(app)/inventory/page.tsx` — `(session?.user as any)?.storeId`
- `src/app/(app)/sms/page.tsx` — `(session?.user as any)?.storeId`
- `src/app/(app)/insights/page.tsx` — `(session?.user as any)?.storeId`
- `src/app/(app)/settings/page.tsx` — `(session?.user as any)?.storeId`

Login page PIN flow accepts storeId as user input (no hardcoding).
`/api/populate-products` requires CRON_SECRET and accepts storeId from body/header.

### API Routes — StoreId Source
All API routes read `storeId` from trusted middleware header first, with query param fallback:
```typescript
const storeId = request.headers.get("x-store-id") || searchParams.get("storeId");
```
Middleware injects `x-store-id` from JWT on all `/api/*` requests.

## AI Integration

### Configuration
- **SDK**: `@google/generative-ai` package
- **Model**: `gemini-2.5-flash-lite` (defined in `src/lib/ai/gemini.ts` and `src/config/constants.ts`)
- **Env var**: `GEMINI_API_KEY`

### AI Functions (`src/lib/ai/index.ts`)
| Function | Purpose | Max Tokens | Used By |
|----------|---------|------------|---------|
| `generateSmsResponse()` | RAG-based SMS auto-reply using customer context + live inventory | 200 | `/api/sms` |
| `generateInsights()` | Business intelligence from 30-day transactions, stock levels, top sellers | 1500 | `/api/ai`, `/api/cron` |
| `getUpsellSuggestions()` | Cart-based product recommendations using purchase history | 200 | `/api/pos` |

### AI Usage in Services (all via `generateText()`)
- `src/lib/services/accounting.ts` — Financial analysis
- `src/lib/services/employees.ts` — Staff scheduling suggestions
- `src/lib/services/competitor-pricing.ts` — Price analysis
- `src/lib/services/club.ts` — Wine club recommendations
- `src/lib/services/report-generator.ts` — Report narratives
- `src/lib/services/reports.ts` — Report summaries
- `src/lib/services/marketing.ts` — Campaign copy generation

## Authentication System

### NextAuth Configuration (`src/lib/auth.ts`)
- **Strategy**: JWT with 12-hour maxAge
- **Providers**:
  1. `credentials` — Email + bcrypt password
  2. `pin` — Store PIN for POS quick-login (requires storeId + 4-digit PIN)
- **JWT payload**: `{ id, email, name, role, storeId, storeName }`
- **Session**: Same fields available via `session.user.*`

### Middleware (`src/middleware.ts`)
- Public paths: `/login`, `/api/auth`, `/api/webhooks`
- Unauthenticated users → redirect to `/login?callbackUrl=...`
- Role guard: `/settings` restricted to OWNER and MANAGER
- Header injection on `/api/*`: `x-store-id`, `x-user-id`, `x-user-role`

### User Roles
| Role | Access |
|------|--------|
| OWNER | Full access including settings |
| MANAGER | Full access including settings |
| CASHIER | All pages except settings |

## React Query Hooks (`src/hooks/useApi.ts`)

### Pattern
All hooks use a shared `fetcher()` that extracts `json.data` from `ApiResponse<T>`.
Mutations use `poster()` and invalidate related query keys on success.

### Hook Inventory
| Hook | Type | Endpoint | Refetch |
|------|------|----------|---------|
| `useDashboard(storeId)` | Query | `GET /api/analytics?storeId=` | 60s |
| `useInventory(storeId, params?)` | Query | `GET /api/inventory?storeId=` | — |
| `useInventoryAlerts(storeId)` | Query | `GET /api/inventory?action=alerts` | 120s |
| `useStockAdjust()` | Mutation | `POST /api/inventory` (action: adjust) | — |
| `useAiReorder()` | Mutation | `POST /api/inventory` (action: ai-reorder) | — |
| `useProcessSale()` | Mutation | `POST /api/pos` | — |
| `useUpsellSuggestion(storeId, ids, cid?)` | Query | `GET /api/pos?action=upsell` | 30s stale |
| `useConversations(storeId)` | Query | `GET /api/sms?storeId=` | 15s |
| `useSendMessage()` | Mutation | `POST /api/sms` (action: send) | — |
| `useSmsCampaigns(storeId)` | Query | `GET /api/sms?action=campaigns` | — |
| `useInsights(storeId)` | Query | `GET /api/ai?storeId=` | 300s |
| `useGenerateInsights()` | Mutation | `POST /api/ai` (action: generate) | — |
| `useUpdateInsight()` | Mutation | `POST /api/ai` (action: update-status) | — |
| `useCustomers(storeId, params?)` | Query | `GET /api/customers?storeId=` | — |
| `useCustomerLookup()` | Mutation | `POST /api/customers` (action: lookup) | — |

## API Routes (`src/app/api/`)

All 26 routes export `force-dynamic`. Key routes:

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/analytics` | GET | Dashboard stats, revenue timeline, top sellers |
| `/api/inventory` | GET, POST, PUT, DELETE | Products CRUD, stock adjust, AI reorder |
| `/api/pos` | GET, POST | Process sales, upsell suggestions |
| `/api/sms` | GET, POST | Conversations, send messages, campaigns |
| `/api/ai` | GET, POST | AI insights CRUD, generate insights |
| `/api/customers` | GET, POST | Customer CRUD, phone lookup |
| `/api/webhooks` | POST | Stripe + Twilio webhook handler |
| `/api/auth/[...nextauth]` | GET, POST | NextAuth endpoints |
| `/api/cron` | POST | Scheduled jobs (CRON_SECRET auth) |
| `/api/seed` | GET, POST | Database seeding (idempotent) |
| `/api/health` | GET | Health check |
| `/api/settings` | GET, PUT | Store settings |
| `/api/employees` | GET, POST, PUT | Employee management |
| `/api/accounting` | GET, POST | Financial reports |
| `/api/reports` | GET, POST | Report management |
| `/api/reports/generate` | POST | AI report generation |
| `/api/loyalty` | GET, POST | Loyalty program |
| `/api/marketing` | GET, POST | Marketing campaigns |
| `/api/delivery` | GET, POST, PUT | Delivery management |
| `/api/club` | GET, POST | Wine club |
| `/api/security` | GET, POST | Security events |
| `/api/pricing` | GET, POST | Competitor pricing |
| `/api/labels` | GET, POST | Shelf labels |
| `/api/storefront` | GET, POST | E-commerce storefront |
| `/api/customer-app` | GET, POST | Customer-facing app |
| `/api/populate-products` | POST | Bulk product import |

## Service Modules (`src/lib/services/`)

17 service files with business logic:
- `analytics.ts` — Dashboard stats aggregation, revenue timeline, top sellers
- `inventory.ts` — Stock management, alerts, AI purchase order generation
- `accounting.ts` — P&L, tax reports, financial summaries
- `employees.ts` — Scheduling, performance, payroll
- `competitor-pricing.ts` — Price monitoring, competitor analysis
- `club.ts` — Wine club subscriptions, shipments
- `report-generator.ts` — PDF/report generation with AI narratives
- `reports.ts` — Monthly/custom report management
- `marketing.ts` — SMS campaigns, email marketing
- `loyalty.ts` — Points, tiers, rewards
- `delivery.ts` — Order delivery tracking
- `security.ts` — Security event logging, access audit
- `ecommerce.ts` — Online storefront
- `customer-app.ts` — Customer-facing features
- `labels.ts` — Shelf label generation
- `notifications.ts` — Push/email notifications
- `jobs.ts` — Cron job handlers (insight generation, cleanup)

## Known Bugs & Issues

### Resolved Bugs (as of 2026-03-23)
1. ~~`db.product.fields.reorderPoint` in AI insights~~ — **FIXED**: Now filters in app code
2. ~~Inventory status filter mismatch~~ — **FIXED**: API accepts "ok" status, aligned with frontend
3. ~~Settings page uses raw fetch()~~ — **FIXED**: Migrated to `useSettings()` / `useEmployees()` React Query hooks
4. ~~No `useSession()` in pages~~ — **FIXED**: All 6 pages use `useSession()` → `session.user.storeId`
5. ~~API routes ignore middleware headers~~ — **FIXED**: All routes read `x-store-id` header first
6. ~~Sidebar AI status hardcoded~~ — **FIXED**: Fetches live auto-reply count via `/api/sms?action=ai-stats`
7. ~~No auth on `/api/populate-products`~~ — **FIXED**: Requires CRON_SECRET, accepts dynamic storeId
8. ~~`adjustStock()` missing storeId check~~ — **FIXED**: Verifies product ownership before adjusting
9. ~~`generateText()` no error handling~~ — **FIXED**: Try-catch wrapper, validates GEMINI_API_KEY
10. ~~Twilio client no env var check~~ — **FIXED**: Conditional init, null guard in sendSms()

### Remaining Design Debt
1. **Type safety on session.user** — All pages cast `(session?.user as any)?.storeId`; could add typed session interface
2. **No cascade delete rules** — Prisma schema uses RESTRICT by default; may block store cleanup workflows

## Deployment: Railway + Docker

### Dockerfile (Multi-stage)
1. **deps** — `node:20-slim`, `npm ci`
2. **builder** — Copies deps, runs `prisma generate` + `next build` with dummy env vars
3. **runner** — Copies standalone output, prisma client, bcryptjs, seed script

### Build-Time Dummy Env Vars
Required because Next.js validates env vars at build time:
```dockerfile
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="build-secret"
ENV NEXTAUTH_URL="http://localhost:3000"
```

### Startup Sequence (CMD)
1. `prisma migrate resolve --applied 0001_initial` — Baselines initial schema
2. `prisma migrate deploy` — Applies pending migrations
3. `node scripts/seed.mjs` — Seeds demo data (idempotent, skips if store exists)
4. `node server.js` — Starts Next.js

### Next.js Build Config (`next.config.js`)
- `output: "standalone"` (for Docker)
- `typescript: { ignoreBuildErrors: true }` — Service files have type inference issues
- `eslint: { ignoreDuringBuilds: true }`
- CORS headers on `/api/*` routes

## Prisma Schema
- **Location**: `prisma/schema.prisma` (~1257 lines)
- **Models**: 50+ including Store, User, Product, Category, Supplier, Customer, Transaction, TransactionItem, InventoryLog, PurchaseOrder, AiInsight, SmsMessage, Register, etc.
- **Enums**: 25+ (UserRole, TransactionStatus, PaymentMethod, InsightType, etc.)
- **Binary targets**: `["native", "debian-openssl-3.0.x"]`

### Migration Strategy
- `prisma/migrations/0001_initial/migration.sql` — Full schema (1432 lines)
- Production: `prisma migrate deploy` (auto-run on Railway startup)
- **DO NOT** use `prisma db push` in production

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Supabase pooled connection (port 6543) |
| `DIRECT_URL` | Yes | Supabase direct connection (port 5432, for migrations) |
| `NEXTAUTH_SECRET` | Yes | JWT signing key |
| `NEXTAUTH_URL` | Yes | App base URL |
| `GEMINI_API_KEY` | Yes | Google Gemini AI |
| `STRIPE_SECRET_KEY` | For payments | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | For payments | Stripe webhook verification |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio account |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio auth |
| `TWILIO_PHONE_NUMBER` | For SMS | Twilio sender number |
| `TWILIO_MESSAGING_SERVICE_SID` | For SMS | Twilio messaging service |
| `REDIS_URL` | Optional | Caching (graceful no-op fallback) |
| `CRON_SECRET` | For cron | Bearer token for `/api/cron` and `/api/seed` |
| `SUPABASE_URL` | For MMS receipts | Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | For MMS receipts | Supabase service role key (or `SUPABASE_SERVICE_ROLE_KEY`) |

## Redis Configuration
- **Lazy proxy** in `src/lib/db/redis.ts` — only connects if `REDIS_URL` is set
- All cache operations are non-critical (fail silently)
- Cache helpers: `cacheGet()`, `cacheSet()`, `cacheDelete()` with `siq:` key prefix
- POS cart stored in Redis with 1-hour TTL

## Key Constants (`src/config/constants.ts`)
- `AI_MODEL`: `"gemini-2.5-flash-lite"`
- `DEFAULT_TAX_RATE`: 0.0975 (9.75% California)
- `SMS_MAX_LENGTH`: 320
- `POS_SESSION_TIMEOUT_MS`: 12 hours
- `CACHE_TTL`: Dashboard 60s, Revenue 120s, AI Insights 1800s
- `RATE_LIMITS`: POS 30/min, SMS 10/min, AI 5/5min

## PIN Login — Stale Closure Fix
`handlePinLogin` must receive the PIN as a parameter, NOT read from React state. The `setTimeout` call creates a stale closure where `pin` still has 3 characters. Pattern: `handlePinLogin(newPin)` not `handlePinLogin()`.

## Build Failure History (2026-03-22)
| Build | Stage | Root Cause | Resolution |
|-------|-------|------------|------------|
| 1-4 | `prisma generate` | Alpine musl + OpenSSL mismatch | Switched to `node:20-slim` + `debian-openssl-3.0.x` |
| 5 | `prisma generate` | Inline enum definitions (invalid syntax) | Expanded all enums to multi-line format |
| 6 | `prisma generate` | 14 models missing bidirectional relations | Added back-relations + Store array fields |
| 7 | `next build` | TypeScript errors in service files | `ignoreBuildErrors: true` |
| 8 | Static page gen | ioredis ECONNREFUSED + DYNAMIC_SERVER_USAGE | Lazy Redis proxy + `force-dynamic` on all routes |

## Next Steps — Production Readiness

### Phase 1: Remove Demo Mode — COMPLETED
All items resolved. Pages use `useSession()`, API routes read `x-store-id` header, populate-products requires auth, PIN login accepts storeId input.

### Phase 2: Fix Known Bugs — COMPLETED
All items resolved. Prisma field bug fixed, inventory filter aligned, settings migrated to React Query, sidebar AI status is dynamic.

## SMS Receipt (MMS Image) — Implementation Status

### Architecture
1. **ReceiptModal.tsx** — `sendAsImage` toggle (defaults ON), uses `html2canvas` to capture receipt as PNG
2. **`/api/receipt-image`** — Uploads base64 PNG to Supabase Storage (`receipts` bucket), returns public URL
3. **`/api/sms` (send-direct)** — Passes `mediaUrl` to Twilio for MMS delivery
4. **`sendSmsDirect()`** in `src/lib/sms/index.ts` — Sets `params.mediaUrl = [url]` for Twilio MMS

### Required Env Vars (Railway)
- `SUPABASE_URL` — Must be set for image upload to work
- `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) — Supabase service role key

### Known Issues & Fixes (2026-03-24)
| Issue | Status | Details |
|-------|--------|---------|
| `sendAsImage` defaulted to `false` | **FIXED** | Changed to `true` — users expect image by default |
| Known-customer auto-send skipped toggle | **FIXED** | Now defaults ON, so auto-send uses image mode |
| Silent fallback to text on upload failure | **FIXED** | Added toast warning when image upload fails |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` not set in Railway | **CHECK REQUIRED** | Without these env vars, upload returns 503 and silently falls back to text. Verify these are set in Railway dashboard |
| Supabase `receipts` bucket not created | Auto-handled | `/api/receipt-image` auto-creates public bucket on first upload |
| Twilio MMS requires publicly accessible URL | OK | Supabase Storage public bucket URLs are accessible |

### Debugging MMS Failures
1. Check Railway logs for `"Receipt image upload:"` errors
2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Railway env vars
3. Test image upload: POST to `/api/receipt-image` with `{ imageBase64: "data:image/png;base64,..." }`
4. Verify Supabase Storage bucket `receipts` exists and is public
5. If toast shows "Image upload failed — sending as text instead", the Supabase upload is failing

### Phase 3: External Service Integration
1. Configure Stripe webhook → `https://<domain>/api/webhooks?provider=stripe`
2. Configure Twilio webhook → `https://<domain>/api/webhooks?provider=twilio`
3. Set up Railway cron job → `POST /api/cron` with `Authorization: Bearer <CRON_SECRET>`
4. Optional: Add Railway Redis plugin for caching

### Phase 4: Multi-Tenant Support
1. Add store selection/creation flow for new users
2. Add typed session interface (replace `as any` casts)
3. Add store-level feature flags (AI, SMS, delivery, e-commerce)
4. Define cascade delete or soft-delete strategy for Store cleanup
