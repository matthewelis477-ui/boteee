# Botee — production AI crypto assistant + USDT + auto-trading

Educational research tools with optional multi-exchange auto-trading (Binance, Bybit, OKX). **Not financial advice. No guaranteed returns.**

## Stack

- Next.js 15 + Prisma (**Postgres** for production)
- USDT TRC20 deposits (TxID + amount matching + support tickets)
- Encrypted trade-only API keys (Binance / Bybit / OKX + passphrase)
- Telegram bot, EN/HI i18n, learn lessons, community quiz
- Email invoices via Resend (optional)

## Deploy online (for real users)

Follow **[docs/DEPLOY.md](docs/DEPLOY.md)** — Vercel + Neon Postgres, env vars, crons, Telegram webhook.

## Local setup

```bash
npm install
# Set DATABASE_URL to Postgres, then:
npx prisma db push
npx prisma db seed
npm run dev
```

Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`

## Multi-exchange

**[docs/EXCHANGES.md](docs/EXCHANGES.md)**

## Trading safety

Keep `BINANCE_TESTNET=1` and `LIVE_TRADING_ENABLED=0` until testnet auto-trade works on the live URL.

## Legal

`/terms` · `/privacy` · `/risk`
