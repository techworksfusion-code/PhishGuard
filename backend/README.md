# PhishGuard API (backend)

> **Status: planned scaffold.** The `src/` folders are placeholders. This document is the authoritative contract the server must implement, matching `System_Design.md` §7. The React demo analyzer mirrors these rules client-side until the API is deployed.

Module structure, database schema, and user workflows: [`../BACKEND_DESIGN.md`](../BACKEND_DESIGN.md).

## Stack

- Node.js + Express (PM2-managed) on port **5000**
- `cors`, `express-rate-limit` (30 requests/minute per IP), `dotenv`
- Google Gemini Flash via `@google/genai`
- Rule engine module `src/analyzer.js` fed by `src/rules.json` (scam keywords, suspicious TLDs, shorteners, brand domains — keep lists here, not hard-coded)

## Environment variables

Copy `.env.example` (create it locally — real credentials are never committed):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Key from [ai.google.dev](https://ai.google.dev) |
| `GEMINI_MODEL` | Current Flash model name (`gemini-1.5-flash` is retired) |
| `PORT` | Defaults to `5000` |
| `ALERT_PEPPER` | 32-byte random salt for `sender_hash` in `alert_events` (real-time path) |
| `SCAN_RATE_PER_TOKEN` | Per-token rate cap on `/api/scan-message`; defaults to `20` |
| `GEMINI_DAILY_MAX` | Per-day Gemini call ceiling; over-cap falls back to rules with `"ai": "unavailable"` |

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

Scoring rules and verdict bands (0–29 Low risk, 30–59 Suspicious, 60–100 Dangerous) are defined in [`System_Design.md` §5](../System_Design.md). The final score is the **higher** of the rule score and the AI score; if Gemini fails, the rule result is returned with `"ai": "unavailable"`.

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

1. Implement `analyzer.js` + `rules.json` (reference pseudocode in `System_Design.md` §5)
2. Implement `server.js`, `app.js` and the routes listed above
3. Add tests in `tests/` covering every rule in §5 and the score-band boundaries
4. Deploy per [`../deployment/README.md`](../deployment/README.md)
