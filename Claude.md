# CLAUDE.md — SPIRITS IQ Project Instructions

## What is this project?

SPIRITS IQ is an AI-powered all-in-one liquor store management platform. It replaces 5-10 separate tools (POS, inventory, accounting, SMS, loyalty, e-commerce) with a single unified system. Think “Shopify + Square + QuickBooks + Twilio + AI” built specifically for liquor stores.

## Tech Stack

- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS with custom design tokens
- **Database**: PostgreSQL 16 via Prisma ORM
- **Cache**: Redis 7 via ioredis
- **Auth**: NextAuth.js with email/password + POS PIN login
- **Payments**: Stripe (Terminal SDK for card-present)
- **SMS**: Twilio (two-way messaging + webhooks)
- **AI**: Anthropic Claude API (SMS auto-reply, insights, reports, scheduling)
- **State**: Zustand (client), React Query (server)
- **UI**: Radix UI, Lucide Icons, Recharts

## Project Structure

```
spirits-iq/
├── prisma/
│   ├── schema.prisma          # UNIFIED schema — 51 models, 25 enums
│   └── seed.ts                # Demo data seeder
├── src/
│   ├── app/
│   │   ├── (app)/             # Authenticated routes (sidebar layout)
│   │   │   ├── layout.tsx     # Main app shell — sidebar + header
│   │   │   ├── dashboard/     # Revenue stats, charts, AI pulse
│   │   │   ├── pos/           # Point of sale interface
│   │   │   ├── inventory/     # Stock management
│   │   │   ├── sms/           # SMS conversations
│   │   │   ├── insights/      # AI insights
│   │   │   └── settings/      # Store config
│   │   ├── api/               # 23 API route files
│   │   │   ├── accounting/    # P&L, balance sheet, expenses, tax, journal
│   │   │   ├── ai/            # AI insight generation
│   │   │   ├── analytics/     # Dashboard stats
│   │   │   ├── auth/          # NextAuth handlers
│   │   │   ├── club/          # Spirits club subscriptions
│   │   │   ├── cron/          # Background job triggers
│   │   │   ├── customer-app/  # Customer-facing app API
│   │   │   ├── customers/     # CRM endpoints
│   │   │   ├── delivery/      # Active deliveries, drivers
│   │   │   ├── employees/     # Team, scheduling, performance
│   │   │   ├── inventory/     # Product CRUD, stock adjust, AI reorder
│   │   │   ├── labels/        # Barcode/shelf tag generation
│   │   │   ├── loyalty/       # Points, tiers, rewards, coupons
│   │   │   ├── marketing/     # Reviews, social, email, referrals
│   │   │   ├── pos/           # Transaction processing
│   │   │   ├── pricing/       # Competitor price monitoring
│   │   │   ├── reports/       # Dashboard KPIs + report generator
│   │   │   ├── security/      # Camera events, shrinkage
│   │   │   ├── settings/      # Store config, feature flags
│   │   │   ├── sms/           # Conversations, campaigns
│   │   │   ├── storefront/    # E-commerce browsing, orders
│   │   │   └── webhooks/      # Stripe + Twilio inbound
│   │   ├── login/             # Auth page (email + PIN pad)
│   │   ├── layout.tsx         # Root layout with fonts
│   │   ├── providers.tsx      # React Query + Auth + Toast
│   │   └── page.tsx           # Redirects to /dashboard
│   ├── hooks/
│   │   ├── useApi.ts          # Core hooks (dashboard, inventory, POS, SMS)
│   │   ├── useFeatures.ts     # Storefront, loyalty, reports hooks
│   │   └── useOps.ts          # Delivery, employees, settings, accounting hooks
│   ├── lib/
│   │   ├── ai/index.ts        # Claude API — SMS reply, insights, upsells
│   │   ├── auth.ts            # NextAuth config
│   │   ├── db/index.ts        # Prisma client singleton
│   │   ├── db/redis.ts        # Redis client + cache helpers
│   │   ├── payments/index.ts  # Stripe Terminal + refunds
│   │   ├── rbac.ts            # Role-based access control (5 roles, 50+ permissions)
│   │   ├── sms/index.ts       # Twilio send/receive/broadcast
│   │   ├── store.ts           # Zustand stores (POS cart, app state)
│   │   ├── utils/index.ts     # Formatting, validation, helpers
│   │   └── services/          # 17 service files (core business logic)
│   │       ├── accounting.ts      # Double-entry bookkeeping, P&L, balance sheet
│   │       ├── analytics.ts       # Dashboard stats, revenue, top sellers
│   │       ├── club.ts            # Subscription management, AI curation
│   │       ├── competitor-pricing.ts  # Price monitoring, AI recommendations
│   │       ├── customer-app.ts    # Order tracking, reorder suggestions, wallet
│   │       ├── delivery.ts        # Driver assignment, ETA, status tracking
│   │       ├── ecommerce.ts       # Storefront, online orders, fulfillment
│   │       ├── employees.ts       # Team, clock in/out, AI scheduling
│   │       ├── inventory.ts       # Stock, alerts, AI purchase orders
│   │       ├── jobs.ts            # Background cron tasks
│   │       ├── labels.ts          # Barcode/shelf tag generation + HTML rendering
│   │       ├── loyalty.ts         # Points, tiers, rewards, coupons
│   │       ├── marketing.ts       # Reviews, social, email, referrals
│   │       ├── notifications.ts   # Centralized alerts + Slack
│   │       ├── report-generator.ts # Auto HTML report generation
│   │       ├── reports.ts         # Daily/monthly snapshots, LTV, AI summaries
│   │       └── security.ts        # Camera events, shrinkage, discrepancies
│   ├── config/constants.ts    # App-wide settings
│   ├── types/index.ts         # TypeScript definitions
│   ├── styles/globals.css     # Tailwind + custom styles
│   └── middleware.ts          # Auth + role-based routing
├── docker-compose.yml         # Postgres + Redis for local dev
├── Dockerfile                 # Multi-stage production build
└── package.json               # 40+ dependencies
```

## Key Architecture Patterns

### API Routes

All API routes follow this pattern:

- `GET` — Read/List with query params for filtering
- `POST` — Create/Action with `action` field in body to multiplex
- `PUT` — Update
- `DELETE` — Soft delete (deactivate)

Every response returns: `{ success: boolean, data?: T, error?: string, meta?: { page, limit, total } }`

### Services

Business logic lives in `/src/lib/services/`. API routes are thin — they validate input and call service functions. Services handle database queries, caching, external API calls, and business rules.

### Database

- Single unified schema in `prisma/schema.prisma` with 51 models
- Use `db` from `@/lib/db` (Prisma singleton)
- Use `cacheGet`/`cacheSet` from `@/lib/db/redis` for caching
- All monetary values are `Decimal` type in Prisma
- Soft deletes via `isActive` flag (not actual deletion)

### Authentication

- NextAuth with two providers: email/password + POS PIN
- JWT sessions (12hr expiry)
- Middleware checks auth on all routes except `/login` and `/api/webhooks`
- Role-based access via `@/lib/rbac.ts`

### AI Integration

- All AI calls go through `@/lib/ai/index.ts`
- Model: `claude-sonnet-4-20250514`
- Used for: SMS auto-reply (RAG against inventory), business insights, financial analysis, schedule generation, product recommendations, report summaries, email/social content
- Always request JSON output and parse with try/catch

### Accounting

- Built-in double-entry bookkeeping (replaces QuickBooks)
- Chart of accounts initialized via `initializeAccounts()`
- Every POS sale, online order, and expense auto-creates journal entries
- Account balances update in real-time
- Assets/Expenses increase with debits; Liabilities/Equity/Revenue increase with credits

### Real-time Data Flow

When a POS sale happens, the system automatically:

1. Creates transaction record
1. Decrements inventory
1. Creates journal entry (debit Cash, credit Revenue + Tax)
1. Updates account balances
1. Awards loyalty points (with tier multiplier)
1. Updates customer stats (totalSpent, visitCount)
1. Invalidates relevant caches
1. Sends notification if large order

## Conventions

### Code Style

- TypeScript strict mode
- Async/await everywhere (no raw promises)
- Service functions are named `verbNoun` (e.g., `getInventory`, `createTransaction`)
- API routes use `satisfies ApiResponse` for type safety
- Imports use `@/` path alias

### Naming

- Database models: PascalCase (`OnlineOrder`)
- API routes: kebab-case (`/api/customer-app`)
- Service files: kebab-case (`competitor-pricing.ts`)
- Functions: camelCase (`getReorderSuggestions`)
- Types: PascalCase (`DashboardStats`)
- Constants: SCREAMING_SNAKE (`DEFAULT_TAX_RATE`)

### Error Handling

- Services throw errors with descriptive messages
- API routes catch errors and return `{ success: false, error: message }`
- Never expose internal errors to client — log them server-side
- Redis cache failures are silent (cache is non-critical)

## Environment Variables

Required for full functionality:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `NEXTAUTH_SECRET` — Session encryption key
- `STRIPE_SECRET_KEY` — Payment processing
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` — SMS
- `ANTHROPIC_API_KEY` — AI features
- `STORE_TAX_RATE` — Default 0.0975 (California)

See `.env.example` for the complete list.

## Getting Started

```bash
docker-compose up -d          # Start Postgres + Redis
cp .env.example .env          # Configure environment
npx prisma generate           # Generate Prisma client
npx prisma db push            # Create database tables
npm run db:seed               # Load demo data
npm run dev                   # Start dev server
```

Demo login: `owner@highlandspirits.com` / `demo1234` / PIN: `1234`

## Common Tasks

### Add a new API endpoint

1. Create route file in `src/app/api/{name}/route.ts`
1. Create service file in `src/lib/services/{name}.ts`
1. Add React Query hook in appropriate hooks file
1. Add any new Prisma models to `schema.prisma`
1. Run `npx prisma db push` to update database

### Add a new database model

1. Add model to `prisma/schema.prisma`
1. Run `npx prisma db push`
1. Add seed data to `prisma/seed.ts` if needed

### Modify the AI behavior

- SMS auto-reply: Edit system prompt in `src/lib/ai/index.ts` → `generateSmsResponse()`
- Business insights: Edit prompt in `src/lib/ai/index.ts` → `generateInsights()`
- Financial insights: Edit in `src/lib/services/accounting.ts` → `generateFinancialInsights()`
- Report summaries: Edit in `src/lib/services/report-generator.ts`

### Add a new role permission

1. Add permission string to `Permission` type in `src/lib/rbac.ts`
1. Add it to appropriate role arrays in `ROLE_PERMISSIONS`
1. Use `hasPermission(role, "permission.name")` in components/routes

## What Needs Building Next

- Wire interactive demo components into real API hooks (frontend pages)
- Add WebSocket support for real-time POS sync across devices
- Implement Stripe Terminal SDK on the frontend for card-present payments
- Add email sending via SendGrid for reports and campaigns
- Build the customer-facing PWA as a separate Next.js app or route group
- Add comprehensive test suite (Jest + Playwright)
- Set up CI/CD pipeline (GitHub Actions)
- Add rate limiting middleware for API routes
- Implement proper error boundaries in React components