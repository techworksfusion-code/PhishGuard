# PhishGuard API (backend)

> The backend implements URL checks, optional sign-in, passive dynamic-analysis
> job brokering, PDF reports, and Telegram/WhatsApp report delivery.

Module structure, database schema, and user workflows: [`../BACKEND_DESIGN.md`](../BACKEND_DESIGN.md).

## Stack

- Node.js + Express (PM2-managed) on port **5000**
- SQLite via `better-sqlite3` — schema in [`../BACKEND_DESIGN.md`](../BACKEND_DESIGN.md) §2, ready-to-run migrations in [`db/migrations/`](db/migrations/)
- `cors`, `express-rate-limit` (30 requests/minute per IP), `dotenv`, `helmet`,
  `pdfkit`, and Baileys for the opt-in WhatsApp sender account

## Environment variables

Copy `.env.example` (create it locally — real credentials are never committed):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Key from [ai.google.dev](https://ai.google.dev) |
| `GEMINI_MODEL` | Current Flash model name (`gemini-1.5-flash` is retired) |
| `DATABASE_URL` | SQLite connection string; path of the database file, auto-created (e.g. `sqlite://./data/phishguard.db`) |
| `PORT` | Defaults to `5000` |
| `ALERT_PEPPER` | 32-byte random salt for `sender_hash` in `alert_events` (real-time path) |
| `SCAN_RATE_PER_TOKEN` | Per-token rate cap on `/api/scan-message`; defaults to `20` |
| `GEMINI_DAILY_MAX` | Per-day Gemini call ceiling; over-cap falls back to rules with `"ai": "unavailable"` |
| `OTP_CHANNEL` | `console` (dev) \| `smtp` \| `telegram` \| `whatsapp` (Baileys — chosen production channel for the lab) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable **Continue with Google** (OAuth web client). Optional; absent → `/api/auth/google/url` returns `503` and the frontend falls back to email/phone |
| `GOOGLE_REDIRECT_URI` | Must match the OAuth client's redirect URI; default `http://localhost:5173/auth/google/callback` |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server for the `smtp` channel; defaults `smtp.gmail.com:465`. Only needed when `OTP_CHANNEL=smtp` |
| `SMTP_USER` / `SMTP_PASS` | Gmail address / **16-character App Password** (Google Account → Security → 2-Step Verification → App passwords). Regular account passwords are rejected by Gmail |
| `SMTP_FROM` | Optional custom From line, e.g. `PhishGuard OTP <you@gmail.com>` |
| `WHATSAPP_SESSION_DIR` | Directory holding the paired Baileys team-sender session keys |
| `WHATSAPP_BOT_ENABLED` | Set to `true` to start the Baileys team-sender connection |
| `WHATSAPP_PUBLIC_NUMBER` | Team sender number users message to opt in |
| `SANDBOX_API_BASE_URL` / `SANDBOX_API_KEY` | HTTPS API endpoint and API key for the passive analysis job broker |
| `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access service-token credentials |
| `APP_WEBHOOK_BASE_URL` / `WEBHOOK_SIGNING_SECRET` | Public app base URL and HMAC-SHA256 secret for sandbox callbacks |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | Bot token and Telegram webhook secret token |

Create `backend/.env` from [`.env.example`](.env.example), set
`GEMINI_API_KEY`, then run:

```powershell
npm ci
npm test
npm start
```

The API listens on port 5000 by default. `GET /api/health` returns
`{ "ok": true }`. Configure `CORS_ORIGINS` as a comma-separated list of exact
HTTP(S) origins for the frontend (for example
`http://localhost:5173,https://localhost`). Database migrations are applied
automatically at startup; `npm run migrate` can apply them separately.

## API

### `POST /api/check-link`

Request:

```json
{ "url": "http://free-recharge-jio.xyz/claim" }
```

Response `200`:

```json
{
  "valid": true,
  "host": "free-recharge-jio.xyz",
  "score": 92,
  "verdict": "Dangerous",
  "ai": "ok",
  "signals": [
    { "points": 25, "name": "Scam keyword", "detail": "Contains: free-recharge" },
    { "points": 25, "name": "Suspicious domain extension", "detail": ".xyz is often used in scams" },
    { "points": 40, "name": "Brand mismatch", "detail": "Mentions jio but the real domain is free-recharge-jio.xyz" },
    { "points": 10, "name": "Not secure", "detail": "Link does not use HTTPS" },
    { "points": 0,  "name": "AI check", "detail": "Imitates a telecom recharge offer" }
  ]
}
```

Scoring rules and verdict bands (0–29 Low risk, 30–59 Suspicious, 60–100 Dangerous) are defined in [`System_Design.md` §5](../System_Design.md). The final score is the higher of the rule score and the AI score; dynamic analysis is triggered only when the rule score is strictly greater than 60. It requires a signed-in user and configured sandbox credentials.

The response includes `dynamicAnalysis`:

```json
{ "status": "queued", "jobId": 27 }
```

The app submits `fill_form: false` and `persona_runs: 0`. The sandbox must only passively navigate and collect screenshots/navigation/network metadata. It must not fill or submit forms. Run browser execution in a disposable, isolated worker with no access to private networks; a Cloudflare Tunnel or Termux/proot environment by itself is not a security boundary.

The backend delegates browser execution to the configured external sandbox. PhishGuard does not provision or attest the worker OS or its isolation controls. Treat disposable Linux execution and the outbound network policy as deployment requirements and verify them in the sandbox provider before production. See the [dynamic sandbox specification](../DYNAMIC_SANDBOX.md) for the full lifecycle, callback contract, evidence limits and network controls.

### Dynamic analysis and reports

- `GET /api/analysis/:jobId` returns the authenticated user's job status and sanitized result.
- `GET /api/analysis/:jobId/report.pdf` remains an authenticated backend endpoint; the app UI does not expose a Reports screen or download button.
- `POST /api/webhooks/scan-done` accepts only HMAC-SHA256 signed callbacks (`X-Signature: sha256=<hex>`) with a matching `X-Job-Id`. The callback is matched to the queued job and screenshot URLs must be same-origin with the configured sandbox API and use the job's `/shots/{job_id}/{index}` path.

The same strict rule-score trigger applies to links extracted from `POST /api/scan-message`; message text is not added to the dynamic-analysis record. The report contains the rule/worker verdict details, redirect chain, contacted hosts, request metrics, timeline graph, and returned screenshots. Callback fields such as `form_submission`, persona data, and hooks are deliberately ignored and never persisted. Reports are automatically delivered as PDF attachments to linked Telegram and WhatsApp accounts; delivery outcomes are tracked per channel.

### Connected messaging

- `GET /api/integrations` returns connection state for the authenticated user.
- `POST /api/integrations/telegram/link-code` returns a one-time code. The user sends `/start <code>` to the configured Telegram bot.
- `POST /api/integrations/whatsapp/link-code` returns a one-time code. The user sends `CONNECT <code>` to the configured team WhatsApp number.
- `DELETE /api/integrations/{telegram|whatsapp}` disconnects that destination.
- `POST /api/webhooks/telegram` receives Telegram updates and requires `X-Telegram-Bot-Api-Secret-Token`.

Register the Telegram webhook at `https://<app-origin>/api/webhooks/telegram` with Telegram's `setWebhook` API and the configured secret token. When `WHATSAPP_BOT_ENABLED=true`, the backend prints a pairing QR in its terminal for the team's sender account; the session directory contains sensitive account credentials and must be protected and backed up securely. Relative `WHATSAPP_SESSION_DIR` paths are resolved from the backend directory; the default `backend/sessions/` path is gitignored. Baileys uses the WhatsApp Web protocol and is not the official WhatsApp Business API; assess platform terms and account restrictions before production use.

#### `POST /api/scan-message` (real-time SMS alerts — background receiver path)

Same rules + Gemini pipeline as `check-link`, driven from the Android
background receiver. Request carries **only** the URL, a SHA-256 sender hash,
and a link count — never message text or the sender number. Response is the
check-link DTO with an additive `"alertId"` field and writes an `alert_events`
row. Rate limits: 30 req/min global, 20 req/min per token, 10-minute URL
verdict cache. Full design: [`../REALTIME_PROTECTION_DESIGN.md`](../REALTIME_PROTECTION_DESIGN.md) §5.

```json
{ "url": "http://free-recharge-jio.xyz/claim", "senderHash": "9f2c…64hex", "linkCount": 2 }
```

#### `GET /api/alerts`

Returns the last 20 `alert_events` for the signed-in account (requires
`Authorization: Bearer`); used by the in-app Blocked/alert screens after
reinstall. Backend structure and DB schema for all of these are specified in
[`BACKEND_DESIGN.md`](../BACKEND_DESIGN.md).

### `GET /api/history`

Returns the last 20 results from the in-memory threat history (current session only; nothing is persisted).

## Errors

| Status | Meaning |
|---|---|
| `400` | Empty or not a valid link |
| `413` | Input longer than 2000 characters |
| `429` | Rate limited (30 req/min) |

## Roadmap

1. Deploy the API, isolated passive-analysis worker, Telegram webhook, and Baileys sender account with the environment variables above.
2. Configure firewall/egress controls so the browser worker cannot reach private or local network addresses.
3. Run `npm test` and deploy per [`../deployment/README.md`](../deployment/README.md).
