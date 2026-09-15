# Deploy Botee (production)

Target: **Vercel** (app + crons) + **Neon** or any hosted Postgres.

Keep `BINANCE_TESTNET=1` and `LIVE_TRADING_ENABLED=0` until payments + testnet trading work on the live URL.

## 1. Create Postgres (Neon recommended)

1. Sign up at [neon.tech](https://neon.tech) → create project `botee`
2. Copy the connection string (use the **pooled** URL if Neon shows one, with `?sslmode=require`)
3. Keep it ready for Vercel env `DATABASE_URL`

## 2. Push code to GitHub

```bash
git add .
git commit -m "Prepare Botee for production deploy"
# create a private GitHub repo, then:
git remote add origin https://github.com/YOUR_USER/botee.git
git push -u origin master
```

## 3. Deploy on Vercel

1. [vercel.com](https://vercel.com) → Import the GitHub repo
2. Framework: Next.js (auto)
3. **Environment variables** (Production):

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon Postgres URL |
| `AUTH_SECRET` | long random (32+ chars) |
| `CREDENTIALS_ENCRYPTION_KEY` | long random (32+ chars) |
| `CRON_SECRET` | long random — Vercel crons send this as Bearer |
| `APP_URL` | `https://your-app.vercel.app` (update after first deploy) |
| `ADMIN_EMAIL` | your admin email |
| `ADMIN_PASSWORD` | strong password |
| `BINANCE_TESTNET` | `1` |
| `LIVE_TRADING_ENABLED` | `0` |
| `ACTIVE_STRATEGY` | `v3-quality-mtf` |
| `CRYPTO_USDT_ADDRESS` | your TRC20 USDT address |
| `CRYPTO_USDT_NETWORK` | `TRC20` |
| `TRONGRID_API_KEY` | optional but recommended |
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_BOT_USERNAME` | bot username without @ |
| `TELEGRAM_ADMIN_CHAT_ID` | optional ops alerts |
| `RESEND_API_KEY` | optional invoices |
| `EMAIL_FROM` | optional |
| `OPENAI_API_KEY` | optional personal AI |

4. Deploy
5. After deploy, set `APP_URL` to the real HTTPS URL and redeploy (or update in Vercel env)

## 4. Initialize the database

From your machine (with production `DATABASE_URL` temporarily in `.env`, or using Neon SQL + local prisma):

```bash
# Point DATABASE_URL at Neon, then:
npx prisma db push
npx prisma db seed
```

Or in Vercel: add a one-off — after first deploy, run locally against Neon once.

## 5. Post-deploy checklist

1. Open `https://YOUR_APP` → login as admin
2. **Admin → Launch config** — confirm Telegram / USDT / testnet
3. Register Telegram webhook: Admin action or  
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_APP/api/telegram/webhook`
4. Confirm Vercel **Crons** are enabled (Pro plan required for crons on Vercel; Hobby has limited cron support — if crons don’t run, use [cron-job.org](https://cron-job.org) hitting:
   - `/api/cron/signals` every 15m with header `Authorization: Bearer CRON_SECRET`
   - `/api/cron/usdt` every 5m
   - `/api/cron/trades` every 2m
5. Admin → run BTC backtest → PF ≥ 1.1
6. Approve a signal with QA note
7. Test USDT checkout with a small payment
8. Only later: testnet exchange keys → then live trading

## Safety

Do **not** set `LIVE_TRADING_ENABLED=1` until testnet auto-trade is proven on the production URL.
