# Interview Helper — Server

Backend API + admin panel for the Interview Helper desktop app. Express + MySQL.
Holds the OpenAI key server-side, manages users and credit balances, logs every
AI request, and processes credit purchases (mock gateway for now).

## Stack

- Node.js + Express 5 (ESM), `mysql2`, JWT auth (`jsonwebtoken` + `bcryptjs`)
- MySQL 8 — local dev via `docker compose up -d` (see `docker-compose.yml`), port 3306
- Admin panel: React + Vite SPA served by Express at `/admin`

## Setup

```bash
cp .env.example .env    # fill in OPENAI_API_KEY, JWT_SECRET, admin credentials
docker compose up -d    # starts local MySQL 8 container
npm install
npm run migrate         # creates database, app user, and tables (needs root creds)
npm run seed            # creates admin user + default credit packages
npm run admin:build     # builds the admin SPA
npm run dev             # API on http://localhost:4000, admin at /admin
```

Default local admin: `admin@example.com` / `admin123` (change via `.env` before seeding).

## Credit model

Flat per request: text = 1 credit, screenshot/vision = 2 credits (editable in
admin → Settings, along with signup bonus, AI model, and max tokens). Credits
are deducted up front and auto-refunded if the AI provider call fails. Every
movement is a row in `credit_transactions` with `balance_after` for auditing.

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | — | Create account (grants signup bonus) |
| POST | `/api/auth/login` | — | Get JWT |
| GET | `/api/auth/me` | user | Current user + balance |
| POST | `/api/ai/ask` | user | AI proxy: deduct credits → OpenAI → answer |
| GET | `/api/credits/balance` | user | Credit balance |
| GET | `/api/credits/transactions` | user | Own ledger |
| GET | `/api/orders/packages` | — | Active credit packages |
| POST | `/api/orders` | user | Create pending order for a package |
| POST | `/api/orders/:id/pay` | user | Capture payment (mock auto-approves), add credits |
| GET | `/api/orders` | user | Own orders |
| `/api/admin/*` | | admin | Users CRUD, credit adjustments, packages CRUD, settings, ledger/requests/orders views, stats |

## Payment gateway

`src/services/paymentGateway.js` defines the interface (`createOrder`,
`capturePayment`). The mock implementation auto-approves. To go live, add a
Razorpay/Stripe class with the same two methods and switch the export.

## Tables

`users`, `credit_transactions` (signed ledger), `credit_packages`, `orders`,
`ai_requests` (usage log with tokens), `settings` (key/value). Schema in
`sql/schema.sql`.
