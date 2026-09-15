# External crons (Vercel Hobby)

Vercel Hobby only allows **once-per-day** crons. Botee needs frequent jobs, so use
[cron-job.org](https://cron-job.org) or similar with header:

`Authorization: Bearer <CRON_SECRET>`

| URL | Schedule |
|-----|----------|
| `https://YOUR_APP/api/cron/signals` | every 15 minutes |
| `https://YOUR_APP/api/cron/usdt` | every 5 minutes |
| `https://YOUR_APP/api/cron/trades` | every 2 minutes |

When you upgrade to Vercel Pro, restore schedules in `vercel.json` from `vercel.crons.pro.json`.
