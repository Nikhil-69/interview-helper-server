# Interview Helper — Server

Backend API + admin panel for the Interview Helper desktop app. Express + MongoDB.
Holds the OpenAI key server-side, manages users and credit balances, logs every
AI request, and processes credit purchases (mock gateway for now).

## Stack

- Node.js + Express 5 (ESM), `mongoose`, JWT auth (`jsonwebtoken` + `bcryptjs`)
- MongoDB — production on MongoDB Atlas (free M0 tier); local dev via
  `docker compose up -d` (see `docker-compose.yml`), port 27017
- Admin panel: React + Vite SPA served by Express at `/admin`

## Setup

```bash
cp .env.example .env    # fill in KIMI_API_KEY, JWT_SECRET, admin credentials
docker compose up -d    # starts local MongoDB 7 container
npm install
npm run seed            # creates admin user + default credit packages
npm run admin:build     # builds the admin SPA
npm run dev             # API on http://localhost:4000, admin at /admin
```

No schema migration step — collections and indexes are created automatically
by mongoose on first use.

Default local admin: `admin@example.com` / `admin123` (change via `.env` before seeding).

## Credit model

Flat per request: text = 1 credit, screenshot/vision = 2 credits (editable in
admin → Settings, along with signup bonus, AI model, and max tokens). Credits
are deducted up front with an atomic `findOneAndUpdate` (no double-spend) and
auto-refunded if the AI provider call fails. Every movement is a document in
`credittransactions` with `balance_after` for auditing.

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

## Deploy to Vercel (with MongoDB Atlas)

The repo is Vercel-ready: `/api/*` runs the Express app as a serverless
function (`api/index.js`), and the admin SPA is served from Vercel's static
layer (`public/admin`, built by `npm run admin:build`). Config in `vercel.json`.

1. **Database** — create a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/atlas):
   - Create a database user (Security → Database Access).
   - Network Access → allow `0.0.0.0/0` (Vercel functions have no fixed IPs).
   - Copy the connection string and append the db name:
     `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/interview_helper`
   - Seed it from your machine:
     ```bash
     MONGODB_URI='mongodb+srv://...' npm run seed
     ```
2. **Import the repo** on vercel.com (or `npx vercel`). No framework preset needed.
3. **Environment variables** (Vercel → Project → Settings): `MONGODB_URI`,
   `JWT_SECRET` (long random string), `KIMI_API_KEY`.
4. Point the desktop app at it: build with `VITE_API_URL=https://<project>.vercel.app`.

Serverless caveats already handled: the mongoose connection is cached across
warm invocations (pool capped at 5 per instance, `DB_POOL_SIZE` to override),
the AI function gets `maxDuration: 120`, and the desktop app compresses
screenshots client-side to stay under Vercel's ~4.5 MB request body limit.

## Payment gateway

`src/services/paymentGateway.js` defines the interface (`createOrder`,
`capturePayment`). The mock implementation auto-approves. To go live, add a
Razorpay/Stripe class with the same two methods and switch the export.

## Collections

`users`, `credittransactions` (signed ledger), `creditpackages`, `orders`,
`airequests` (usage log with tokens), `settings` (key/value, with code-side
defaults). Schemas in `src/models.js`.
