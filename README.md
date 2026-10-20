# Aashraya

**Aashraya** (आश्रय, "shelter") is a mental health and wellbeing platform for Nepal, in English and Nepali.

- **Daily check-ins** with tags, private notes, streaks, insights charts and suggestions for what might help
- **Self-checks** (PHQ-9 and GAD-7) with plain-language guidance
- **Guided programs**: calmer days, better sleep, lifting low mood
- **Private journal** with prompts, gratitude and CBT thought records
- **Safety plan** and a **trusted contact** who can be asked to check in
- **Counselor sessions**: members request sessions; counselors accept with a time or decline; either side can cancel
- **Community forum** with anonymous posting, reporting and moderation, and instant alerts plus private outreach when someone may be at risk
- **Breathing exercises**, a public **crisis page** with Nepal helplines (works offline), articles and a **trusted resources** library
- **Directory** of mental health services (field-verified and public sources) with search, filters, map, and reports/suggestions
- **Notifications** in-app and by web push; daily reminders by push and email

> Aashraya offers support and information, not medical care. Crisis contacts are in [client/src/config/crisis.js](client/src/config/crisis.js) — re-check them periodically.

## Structure

```
client/   React 19 + Vite frontend (port 5173 in dev, proxies /api to the server)
server/   Express 5 + MongoDB API (port 5000)
```

## Running locally

Requirements: Node.js 20+, MongoDB.

```bash
# API
cd server
cp .env.example .env      # then fill in JWT_SECRET and DATA_ENCRYPTION_KEY (see below)
npm install
npm run migrate           # once, if you have data from an older version
npm run seed              # loads the center directory and resource library (safe to re-run)
npm run dev

# Frontend (separate terminal)
cd client
npm install
npm run dev               # http://localhost:5173
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx web-push generate-vapid-keys      # for push notifications (optional)
```

**Back up `DATA_ENCRYPTION_KEY`.** Journals, notes, self-check answers, safety plans, trusted contacts and session messages are encrypted with it; if it's lost, that data can't be recovered.

Without SMTP settings, emails are printed to the API console, so every flow works locally. Push notifications need the production build (the service worker isn't registered in dev).

### Roles

Nobody can sign up as an admin or counselor. Register normally, then:

```bash
cd server
npm run set-role -- <username> admin      # or counselor / user
```

Counselors write articles and take session requests. Admins also moderate the forum, manage members, centers and resources, run link checks, and see anonymised analytics and the audit log.

### With Docker

```bash
cp server/.env.example server/.env     # fill in the secrets
docker compose up --build              # http://localhost:8080
docker compose exec server node scripts/seed-centers.js
```

## Scripts

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` / `npm start` | API with/without auto-reload |
| server | `npm test` | Integration tests (in-memory MongoDB; first run downloads it) |
| server | `npm run migrate [-- --dry-run]` | Upgrade data from earlier versions |
| server | `npm run set-role -- <user> <role>` | Change a user's role |
| server | `npm run seed [-- --update]` | Load `server/data/centers.json` and `resources.json`; `--update` overwrites existing entries (`seed:centers` / `seed:resources` for one) |
| client | `npm run dev` / `npm run build` | Dev server / production build |
| client | `npm test` | Renders every page with a mocked API |
| client | `npm run lint` | ESLint |
| client | `npm run check:i18n` | Checks English and Nepali have the same strings |

GitHub Actions runs the server tests and the client lint, i18n check, tests and build on every push and pull request.

## Configuration

All server settings are in [server/.env.example](server/.env.example), including SMTP, web push keys, `REQUIRE_ADMIN_2FA`, reminders and the monthly link check. For the frontend, set `VITE_API_URL` at build time if the API isn't served from the same origin under `/api`.

## Security and privacy

- Passwords hashed with bcrypt. Browser sessions are httpOnly, SameSite cookies (not readable by page scripts); cookie-authenticated changes require a custom header, which blocks cross-site request forgery. Sessions are revoked on password change or reset.
- Optional two-factor sign-in (authenticator apps). Set `REQUIRE_ADMIN_2FA=true` to make it mandatory for admin tools. Admin actions are recorded in an audit log.
- Every request re-checks the user and role in the database; roles are enforced on the server.
- Private writing and personal details are encrypted at rest with AES-256-GCM.
- Self-check results are never shared or reported to anyone. Trusted-contact emails never include moods, journal entries or posts.
- Anonymous posts never send the author's identity to other members (moderators can see it for safety follow-up).
- Login is rate limited per account; account endpoints per IP. Request bodies are validated with zod; helmet sets security headers; CORS is limited to `CLIENT_ORIGIN`.
- Members can export all their data or delete their account.
- Admin analytics are aggregated and hide daily averages from fewer than three people.
- Risk-language detection (English, Romanized Nepali, Devanagari) is keyword-based and will miss things; it supplements, not replaces, human moderation.

## Deploying

- Serve over **HTTPS** in production: session cookies are marked `Secure` when `NODE_ENV=production`.
- Build the client and serve `client/dist` with a fallback to `index.html` for client-side routes, proxying `/api` to the server (see [client/nginx.conf](client/nginx.conf)), or set `VITE_API_URL`.
- Set `CLIENT_ORIGIN`/`APP_URL` to the public URL, `TRUST_PROXY=1` behind a reverse proxy, SMTP settings for email, and VAPID keys for push.
- The app is installable (PWA). The service worker caches the app shell so the crisis page works offline; it never caches API responses.

## History

This repo combines two earlier repos, with their full commit history preserved:

- Frontend: https://github.com/Itachi-Ns/Aashraya → `client/`
- Backend: https://github.com/Nirbhik-Shrestha/Aashrya-Backend → `server/`
