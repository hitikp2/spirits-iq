# 🥃 SPIRITS IQ

**AI-Powered Liquor Store Management Platform**

All-in-one POS, inventory management, AI-powered SMS engagement, and business intelligence for modern liquor stores.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js 14 (App Router) + React 18 + Tailwind CSS          │
│  PWA-enabled · Responsive (Desktop + Tablet + Mobile)        │
├─────────────────────────────────────────────────────────────┤
│                        API LAYER                            │
│  Next.js API Routes + NextAuth.js                           │
│  /api/pos · /api/inventory · /api/sms · /api/ai · /api/…   │
├──────────────┬──────────────┬───────────────┬───────────────┤
│   PAYMENTS   │     SMS      │      AI       │    SEARCH     │
│  Stripe SDK  │   Twilio     │  Claude API   │   Pinecone    │
│  Terminal    │  2-way SMS   │  Anthropic    │   Vectors     │
├──────────────┴──────────────┴───────────────┴───────────────┤
│                      DATA LAYER                             │
│  PostgreSQL (Prisma ORM)  ·  Redis (Cache + Sessions)       │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 💳 Point of Sale
- Touch-optimized POS interface (tablet + desktop)
- Barcode scanning with USB/Bluetooth scanners
- Quick-add product grid with category filters
- Real-time cart with auto tax calculation
- Stripe Terminal integration for card-present payments
- Cash, card, Apple Pay, Google Pay support
- AI upsell suggestions based on customer history
- ID scanning for age verification (21+)
- PIN-based quick login for cashiers
- Offline-capable with sync queue

### 📦 Inventory Management
- Real-time stock tracking synced to POS
- Low stock / out of stock alerts
- AI-powered demand forecasting
- Auto-generated purchase orders
- Supplier management with lead times
- Barcode / SKU / category organization
- Margin and velocity analysis per product
- Audit logging for every stock change
- Bulk import/export (CSV)

### 💬 AI-Powered SMS
- Two-way SMS via Twilio
- AI auto-response using Claude (answers stock questions from live inventory)
- Customer segmentation (VIP, Wine Club, Regular, etc.)
- Broadcast campaigns with targeting
- Opt-in/opt-out compliance (TCPA)
- Conversation history per customer
- Manual override for AI responses

### 🧠 AI Insights & Analytics
- Revenue dashboard with real-time updates
- Top sellers, category breakdowns, trend detection
- AI-generated business insights (Claude)
- Demand forecasting with confidence scores
- Pricing optimization suggestions
- Shrinkage / theft detection alerts
- Staffing recommendations based on traffic patterns
- Weekly/monthly performance reports

### 👥 Customer CRM
- Phone-based loyalty (no cards needed)
- Customer tiers with auto-promotion
- Purchase history and preferences
- AI-generated customer profiles
- Loyalty points system
- Wine club / VIP management

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| State | Zustand (client), React Query (server) |
| UI Components | Radix UI, Lucide Icons, Recharts |
| Backend | Next.js API Routes, Server Actions |
| Database | PostgreSQL 16 (via Prisma ORM) |
| Cache | Redis 7 (via ioredis) |
| Auth | NextAuth.js (credentials + PIN) |
| Payments | Stripe (Terminal SDK for card-present) |
| SMS | Twilio (Messaging API + Webhooks) |
| AI | Anthropic Claude API |
| Vector DB | Pinecone (product recommendations) |
| Deployment | Docker, Vercel, or AWS ECS |

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (for local Postgres + Redis)
- Stripe account with Terminal enabled
- Twilio account with phone number
- Anthropic API key

### 1. Clone and install

```bash
git clone https://github.com/your-org/spirits-iq.git
cd spirits-iq
npm install
```

### 2. Start databases

```bash
docker-compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in your API keys and database URL
```

### 4. Set up database

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Demo login:**
- Email: `owner@highlandspirits.com`
- Password: `demo1234`
- POS PIN: `1234`

---

## Project Structure

```
spirits-iq/
├── prisma/
│   ├── schema.prisma          # Full database schema
│   └── seed.ts                # Demo data seeder
├── public/
│   ├── manifest.json          # PWA manifest
│   └── icons/                 # App icons
├── src/
│   ├── app/
│   │   ├── (app)/             # Authenticated app routes
│   │   │   ├── layout.tsx     # Sidebar + header shell
│   │   │   ├── dashboard/     # Main dashboard
│   │   │   ├── pos/           # Point of sale
│   │   │   ├── inventory/     # Stock management
│   │   │   ├── sms/           # SMS conversations
│   │   │   ├── insights/      # AI insights
│   │   │   └── settings/      # Store settings
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth handlers
│   │   │   ├── pos/           # Transaction processing
│   │   │   ├── inventory/     # CRUD + AI reorder
│   │   │   ├── sms/           # Messages + campaigns
│   │   │   ├── ai/            # Insight generation
│   │   │   ├── customers/     # CRM endpoints
│   │   │   ├── analytics/     # Dashboard data
│   │   │   └── webhooks/      # Stripe + Twilio
│   │   ├── login/             # Auth page
│   │   ├── layout.tsx         # Root layout + fonts
│   │   ├── providers.tsx      # React Query + Auth + Toast
│   │   └── page.tsx           # Redirect to /dashboard
│   ├── components/
│   │   ├── ui/                # Reusable UI primitives
│   │   ├── layout/            # Shell components
│   │   ├── dashboard/         # Dashboard widgets
│   │   ├── pos/               # POS components
│   │   ├── inventory/         # Inventory components
│   │   ├── sms/               # Chat interface
│   │   ├── insights/          # AI insight cards
│   │   └── charts/            # Chart components
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts       # Prisma client
│   │   │   └── redis.ts       # Redis client + helpers
│   │   ├── services/
│   │   │   ├── analytics.ts   # Dashboard stats
│   │   │   └── inventory.ts   # Stock management
│   │   ├── ai/
│   │   │   └── index.ts       # Claude integration
│   │   ├── sms/
│   │   │   └── index.ts       # Twilio integration
│   │   ├── payments/
│   │   │   └── index.ts       # Stripe integration
│   │   ├── utils/
│   │   │   └── index.ts       # Formatting, validation
│   │   ├── auth.ts            # NextAuth config
│   │   └── store.ts           # Zustand stores
│   ├── hooks/
│   │   └── useApi.ts          # React Query hooks
│   ├── types/
│   │   └── index.ts           # TypeScript definitions
│   ├── config/
│   │   └── constants.ts       # App constants
│   ├── styles/
│   │   └── globals.css        # Tailwind + custom styles
│   └── middleware.ts           # Auth + routing middleware
├── docker-compose.yml          # Local dev databases
├── Dockerfile                  # Production container
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── package.json
└── .env.example
```

---

## Hardware Requirements (Per Store)

| Component | Recommended | Purpose |
|-----------|------------|---------|
| POS Terminal | Elo Touch 15" or Sunmi T2 | Primary register |
| Payment Terminal | Stripe Reader S700 or PAX A920 | Card-present payments |
| Barcode Scanner | Socket Mobile S740 (Bluetooth) | Product scanning |
| Receipt Printer | Epson TM-T88VI (USB) | Receipt printing |
| Cash Drawer | APG Vasario (RJ12) | Cash management |
| ID Scanner | IDVisor Smart Plus | Age verification |
| Tablet (Floor) | iPad 10th Gen or Galaxy Tab S9 | Mobile POS / inventory |
| Router | Ubiquiti Dream Machine | Reliable WiFi |
| Local Cache | Intel NUC 13 Pro | Offline fallback |

---

## Deployment

### Vercel (Recommended for MVP)
```bash
vercel deploy --prod
```

### Docker
```bash
docker build -t spirits-iq .
docker run -p 3000:3000 --env-file .env spirits-iq
```

### AWS ECS (Production)
See `docs/deployment-aws.md` for full guide.

---

## API Documentation

All endpoints follow the pattern:
```
GET    /api/{resource}           — List/Read
POST   /api/{resource}           — Create/Action
PUT    /api/{resource}           — Update
DELETE /api/{resource}?id=xxx    — Delete
```

Every response returns:
```json
{
  "success": true|false,
  "data": { ... },
  "error": "...",
  "meta": { "page": 1, "limit": 25, "total": 100 }
}
```

---

## License

Proprietary — All Rights Reserved
