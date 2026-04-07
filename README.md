# ILAMath Profiles

This repo is ready for a static frontend + Vercel Functions deployment.

## What changed for Vercel

- Public pages stay static: `/`, `/main`, `/settings`, `/profile`, `/markdown`
- Backend now has Vercel-compatible functions in [`api/`](./api)
- Persistent storage on Vercel uses Redis via Marketplace env vars:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- The app also accepts legacy Vercel KV env names:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`

Without Redis, Vercel has nowhere persistent to save users, profiles, sessions, and views.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. In Vercel, add a Redis integration from the Marketplace.
4. Make sure Vercel injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5. Deploy.

The app seeds one default account on the first boot:

- `username`: `ila`
- `password`: `alesha7720`

## Local development

For local development without Vercel, the existing Node server still works:

```bash
npm start
```

Local mode stores data in `data/store.json`. That file is ignored by git on purpose.
