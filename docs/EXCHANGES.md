# Multi-exchange auto-trade

Botee executes approved signals through a unified broker layer. Signal research still uses Binance public market data; **execution** can run on the venue you connect.

## Supported venues (live APIs)

| Venue ID | Label | Market | Auth | Notes |
|---|---|---|---|---|
| `binance_spot` | Binance Spot | Spot | API key + secret | OCO stop/TP when available |
| `binance_futures` | Binance Futures USD-M | Perps | API key + secret | Mark-price stops |
| `bybit_spot` | Bybit Spot | Spot | API key + secret | Bybit V5 |
| `bybit_linear` | Bybit Linear | USDT perps | API key + secret | Bybit V5 linear |
| `okx_spot` | OKX Spot | Spot | API key + secret + **passphrase** | OKX V5 |
| `okx_swap` | OKX Perpetual Swap | USDT swap | API key + secret + **passphrase** | OKX V5 |

Official docs (linked in Settings when you pick a venue):

- Binance Spot: https://developers.binance.com/docs/binance-spot-api-docs
- Binance Futures: https://developers.binance.com/docs/derivatives/usds-margined-futures
- Bybit V5: https://bybit-exchange.github.io/docs/v5/intro
- OKX V5: https://www.okx.com/docs-v5/en/

## How users connect

1. Plan must be **Pro / Elite / Institutional**
2. Settings → Auto-trading → choose **Preferred exchange** (binance | bybit | okx)
3. Connect the matching venue key (spot and/or futures)
4. Create a **trade-only** key (withdrawals off). OKX needs the passphrase created with the key.
5. Enable auto-trade. Keep Admin **testnet** on until a full loop works.

Keys are encrypted with `CREDENTIALS_ENCRYPTION_KEY` (AES-256-GCM). Plaintext is never returned by the API.

## Testnet / live

Admin → Launch config (or env):

- `BINANCE_TESTNET=1` / platform `binance_testnet` → Binance testnet hosts, Bybit testnet host, OKX `x-simulated-trading: 1`
- Live auto-trade also requires `live_trading_enabled` when testnet is off

## Routing

For each approved signal:

`preferredVenue` + signal `marketType` → venue id  
(example: bybit + futures → `bybit_linear`)

Execution uses that venue for entry, protection, reconcile, and flatten.

## Safety gates (unchanged)

- Pro+ plan, auto-trade on, kill switch off  
- Trade-only keys (`canWithdraw` rejected)  
- Strategy backtest PF ≥ 1.1 (unless emergency skip)  
- Signal must be approved and still within `validForMinutes`  
- Spot SHORT is blocked (use a futures venue)

## Code map

- Venue catalog: `src/lib/exchange/venues.ts`
- Facade: `src/lib/exchange/broker.ts`
- Adapters: `binance.ts`, `bybit.ts`, `okx.ts`
- Creds loader: `src/lib/exchange/creds.ts`
- Settings API: `src/app/api/me/exchange-keys/route.ts`
- Execution: `src/lib/trading/executor.ts`, `manager.ts`, `flatten.ts`
