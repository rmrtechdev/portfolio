# Visitor map API

Cloudflare Worker + D1 behind the globe's visitor dots. Location comes from Cloudflare's own
`request.cf` estimate (city level). Each ~1° cell is stored as visited or not: no visit counts,
no IPs, nothing derived from an IP. The list is edge-cached for 5 minutes.

## Deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create rmr-visitors      # paste the printed database_id into wrangler.toml
npm run db:init                          # creates the empty production tables
npm run deploy                           # prints https://rmr-visitors.<account>.workers.dev
```

Then build the site with that URL (e.g. `portfolio/.env.production.local`):

```
VITE_VISITS_API=https://rmr-visitors.<account>.workers.dev
```

Without `VITE_VISITS_API` the site makes no visitor requests and the globe shows home only.

## Local development

`npm run dev` serves on the port in your command (the site's `.env.development.local` expects
`http://localhost:8799`). The local database lives in `.wrangler/state` and is never deployed.
It currently holds seeded test cities for layout work; clear them with `npm run db:reset:local`.
