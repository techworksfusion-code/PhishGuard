# PhishGuard backend design

> Companion to [`backend/README.md`](backend/README.md) (API contract) and
> [`System_Design.md`](System_Design.md) §5–§7. This document defines the
> module structure, the persistence layer, and the end-to-end user workflows
> the backend must support. The `POST /api/check-link` contract in
> `backend/README.md` is locked — everything here extends it, never changes it.
>
> The schema also ships as ready-to-run migrations:
> [`backend/db/migrations/001_init.sql`](backend/db/migrations/001_init.sql) ·
> [`backend/db/migrations/002_threat_reports.sql`](backend/db/migrations/002_threat_reports.sql)

---

## 1. Backend structure

### 1.1 Technology decisions

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS + Express 4 | Matches the documented stack; PM2-managed on port 5000 |
| Database | PostgreSQL 16 | Unique constraints on phone/email/URL hash, JSONB for signals, simple retention via cron SQL. SQLite is an acceptable dev fallback via `DATABASE_URL=sqlite://./dev.db` |
| Migrations | Plain `.sql` files + tiny runner script | No ORM knowledge required; schema stays reviewable |
| Auth | Session tokens (48 random bytes, sent as `Authorization: Bearer`) | Capacitor WebViews make cookies unreliable; tokens are simpler and revocable |
| Password hashing | `argon2id` (`argon2` npm package) | Standard choice; OTP codes hashed the same way |
| Email OTP delivery | `nodemailer` (SMTP); **console stub in dev** | `OTP_DELIVERY=console` prints codes to logs in development |
| Validation | Hand-rolled validators in `utils/` | Keep dependency count low for a student VPS |

### 1.2 Module layout

```text
backend/
├── package.json
├── .env.example
├── src/
│   ├── server.js              # boots config → db → migrations → http; PM2 entry
│   ├── app.js                 # express app: middleware chain + route mounting
│   ├── config/
│   │   └── index.js           # reads env once, fails fast on missing vars
│   ├── db/
│   │   ├── index.js           # pg Pool singleton
│   │   ├── migrate.js         # applies migrations/*.sql in order, tracks them
│   │   └── migrations/        # 001_init.sql, 002_threat_reports.sql
│   ├── routes/
│   │   ├── index.js           # mounts all routers under /api
│   │   ├── auth.routes.js     # register, login, otp, session, sign-out
│   │   ├── checks.routes.js   # POST /check-link, GET /history
│   │   ├── votes.routes.js    # community report/vote + domain summary
│   │   └── health.routes.js   # GET /api/health (for PM2 + tunnel checks)
│   ├── middleware/
│   │   ├── auth.js            # requireAuth / optionalAuth, loads req.user
│   │   ├── rateLimit.js       # express-rate-limit: 30 req/min per IP per route
│   │   ├── validate.js        # schema-lite body validators
│   │   ├── errorHandler.js    # central JSON error mapper (400/401/413/429)
│   │   └── requestLogger.js   # one-line request log, redacts URLs
│   ├── services/
│   │   ├── analyzer.js        # rule engine — fed ONLY by rules.json
│   │   ├── rules.json         # keywords, TLDs, shorteners, brand domains
│   │   ├── gemini.service.js  # Gemini Flash call, 5 s timeout, strict JSON parse
│   │   ├── checks.service.js  # merge rules + AI → response DTO, persist check
│   │   ├── urls.service.js    # normalize + hash URLs, upsert url row
│   │   ├── history.service.js # user/anonymous history queries + retention
│   │   ├── auth.service.js    # users: create, find by email/phone, password
│   │   ├── otp.service.js     # issue/verify hashed 6-digit codes
│   │   ├── token.service.js   # session token create/hash/revoke/rotate
│   │   ├── vote.service.js    # community reports + grouped threat stats
│   │   └── delivery.service.js# email/console delivery of OTPs
│   └── utils/
│       ├── normalizeUrl.js    # scheme default, host lowercase, length caps
│       ├── verdict.js         # SINGLE source of verdict bands (see §4.3)
│       ├── logger.js
│       └── asyncHandler.js
├── scripts/
│   └── retention.js           # cron job (PM2 schedule): deletes expired rows
└── tests/                     # supertest + node:test; see test plan below
```

### 1.3 Middleware chain (order matters)

```text
request
  → requestLogger
  → helmet (CSP off for API; CORS restricted to VITE_API_URL origins)
  → express.json({ limit: '10kb' })          # enforces the 413 path cheaply
  → rateLimit (global 30/min/IP; tighter 10/min/IP for /api/auth/*)
  → routes
  → errorHandler                             # last — maps errors to JSON
```

### 1.4 Error contract (extends `backend/README.md`)

All errors return `{ "error": "<human-readable message>" }` with one of:
`400` bad input · `401` missing/invalid credentials · `409` duplicate
account/code mismatch · `413` payload too large · `422` URL rejected before
analysis · `429` rate limited · `500` unexpected (logged, never leaked).

---

## 2. Database design

### 2.1 Privacy stance (governs this schema)

- The **device is the source of truth for user history**, matching
  `PROJECT_STRUCTURE.md`. Server-side history is **opt-in**: stored only when
  the user enables sync (`users.history_sync`), used to restore history after
  reinstall.
- The server stores **URLs, never message text or sender numbers** — SMS
  content never reaches the backend.
- Retention is schema-enforced (partial indexes + cron), not "left to ops".

### 2.2 ER overview

```text
users 1──* sessions           urls 1──* checks *──1 users (nullable = anonymous)
users 1──* otp_codes (issued per destination row)
urls 1──* threat_votes *──1 users (nullable = anonymous vote)
urls 1──* alert_events *──1 users (nullable)     ← real-time SMS alerts (§003)
urls 1──1 url_threat_stats    (materialized aggregate)
```

### 2.3 Applied schema files

| Migration | Contents |
|---|---|
| `001_init.sql` | `users`, `otp_codes`, `sessions`, `urls`, `checks` |
| `002_threat_reports.sql` | `threat_votes`, `url_threat_stats` materialized view (phase 2) |
| `003_alerts.sql` | `alert_events` — real-time SMS protection events |

The column-level data dictionary is in **§6** below.

### 2.4 Retention policy (`scripts/retention.js`, run every 6 h)

| Data | Rule |
|---|---|
| `checks` with `user_id IS NULL` | delete after 7 days |
| `checks` for `history_sync = TRUE` users | delete after 90 days |
| `checks` for `history_sync = FALSE` users | delete after 24 h (device keeps them) |
| `otp_codes` | delete consumed/expired immediately |
| `sessions` | delete revoked/expired after 1 day |
| `urls`, `threat_votes`, `url_threat_stats` | kept (aggregated, non-personal) |

---

## 3. API surface

Endpoints marked 🔒 require `Authorization: Bearer <token>`;
✚ = new relative to `backend/README.md` (its two endpoints stay contract-locked).

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` ✚ | GET | – | PM2/tunnel probe |
| `/api/auth/register` ✚ | POST | – | Create account (email+password or phone) |
| `/api/auth/otp/request` ✚ | POST | – | Send 6-digit OTP (10 min TTL, 60 s resend cooldown) |
| `/api/auth/otp/verify` ✚ | POST | – | Verify OTP → creates session |
| `/api/auth/login` ✚ | POST | – | Password sign-in (then optional OTP step-up) |
| `/api/auth/session` 🔒 | GET | token | Current account summary |
| `/api/auth/session` 🔒 | DELETE | token | Sign out (revokes current session) |
| `/api/auth/account` 🔒 | DELETE | token | Account deletion (§4.6) |
| `/api/check-link` | POST | optional | Contract-locked; richer response when authed |
| `/api/scan-message` ✚ | POST | optional | Real-time SMS alert path — reuses the check chain, writes an `alert_events` row (see [`../REALTIME_PROTECTION_DESIGN.md`](../REALTIME_PROTECTION_DESIGN.md)) |
| `/api/alerts` ✚ | GET | 🔒 | Last 20 alert events for the signed-in account |
| `/api/history` | GET | 🔒 | Last 20 checks **if `history_sync` enabled**, else 200 `[]` |
| `/api/links/:urlHash/vote` ✚ | POST | 🔒 | Report a URL dangerous/safe (phase 2) |
| `/api/links/:urlHash/summary` ✚ | GET | – | Aggregated community stats (phase 2) |

Body examples:

```jsonc
// POST /api/auth/register
{ "name": "Alex", "email": "a@b.co", "password": "…" }   // or { "phone": "+91…" }

// POST /api/auth/otp/verify  → { token, account: { id, name, email } }
{ "destination": "a@b.co", "code": "123456" }
```

---

## 4. User workflows

### 4.1 Registration / sign-in (matches the demo screen steps in `App.jsx`)

```text
Register (email)                         Register (phone)
────────────────────                     ────────────────
POST /auth/register                      POST /auth/register  { name, phone }
  → argon2id(password), user row            → user row (no password)
POST /auth/otp/request { destination }   POST /auth/otp/request
  → 6-digit code hashed+stored, emailed     → code SMSed (dev: logged)
POST /auth/otp/verify { destination, code }
  → attempts++ on wrong code (max 5 → 401, must re-request)
  → consume otp row, create session, return { token, account }

Login: POST /auth/login { email, password }
       → 401 on mismatch (same message as unknown user — no user enumeration)
       → OTP step-up when OTP_LOGIN=true; otherwise issue session directly.
```

### 4.2 Link check (the core loop)

```text
App                    Backend                        Gemini
──                     ───────                        ──────
1. user pastes link
2. POST /check-link ──▶ validate (2 000 char cap, http/https only, host required)
                        rate-limit 30/min (IP) + 60/min (token)
3.                     urls.service: normalize → sha256 → upsert urls
4.                     analyzer.js (rules.json): points → ruleScore
5.                     gemini.service ───────────────▶ strict-JSON prompt,
6.                     merge: final = max(ruleScore, aiScore)     5 s timeout
7.                     checks.service: persist per §2.4 policy
8.  ◀── 200 { valid, host, score, verdict, ai, signals }   (contract-locked)
   (Gemini down ⇒ ai:"unavailable", rules verdict still returned)
```

### 4.3 Verdict bands (single source of truth)

`utils/verdict.js` is the **only** place these thresholds live on the server;
the same band check is mirrored client-side in `frontend/src/services/api.js`.

```text
score 0–29   → Low risk      score 30–59 → Suspicious     score 60–100 → Dangerous
```

### 4.4 History & restore

```text
Enable sync (Profile → Privacy → server toggle)
  → flips users.history_sync
Device keeps history locally (current behavior); server keeps ≤ 20 rows/user.
Reinstall/new device → sign in → GET /api/history → repopulate the list.
```

### 4.5 Community report (phase 2, replaces the fake "1,284 votes" card)

```text
App                                Backend
POST /links/:hash/vote { vote } →  upsert threat_votes (one per account)
GET  /links/:hash/summary       →  url_threat_stats (materialized view)
```

### 4.6 Account deletion

`DELETE /api/auth/account` 🔒 → soft-delete user, revoke sessions, null out
checks (`ON DELETE SET NULL`), purge OTP rows, keep anonymized votes/urls.
Honor the "your data stays yours" promise in the UI footnote.

---

## 5. Data dictionary

Types are PostgreSQL. *PII* marks columns that count as personal data.

### 5.1 `users` — one row per account

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | Internal surrogate ID |
| `name` | VARCHAR(80) | NOT NULL | Display name |
| `email` | VARCHAR(254) | UNIQUE, nullable (PII) | NULL for phone-only accounts |
| `phone` | VARCHAR(20) | UNIQUE, nullable (PII) | E.164-ish; NULL for email accounts |
| `password_hash` | TEXT | nullable | argon2id; must be non-NULL when email present (CHECK) |
| `history_sync` | BOOLEAN | NOT NULL DEFAULT FALSE | Opt-in server storage of checks |
| `settings` | JSONB | NOT NULL DEFAULT `{}` | Mirror of app protection toggles |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `last_login_at` | TIMESTAMPTZ | nullable | Updated on successful login |
| `deleted_at` | TIMESTAMPTZ | nullable | Soft delete (§4.6) |

CHECKs: at least one contact channel; email ⇒ password.

### 5.2 `otp_codes` — one row per issued code

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `destination` | VARCHAR(254) | NOT NULL, indexed | Email or phone the code was sent to |
| `code_hash` | CHAR(64) | NOT NULL | sha256(code + TOKEN_PEPPER) — never the code itself |
| `purpose` | VARCHAR(12) | NOT NULL, CHECK `register`/`login` | |
| `attempts` | SMALLINT | NOT NULL DEFAULT 0 | ≥ 5 ⇒ locked; user must re-request |
| `expires_at` | TIMESTAMPTZ | NOT NULL | issued + 10 min |
| `consumed_at` | TIMESTAMPTZ | nullable | Set on success; row then purged |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Drives 60 s resend cooldown |

### 5.3 `sessions` — one row per active login

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `user_id` | BIGINT | NOT NULL FK→users ON DELETE CASCADE | |
| `token_hash` | CHAR(64) | NOT NULL UNIQUE | sha256(bearer token + pepper); raw token never stored |
| `user_agent` | VARCHAR(200) | nullable | Debug aid only |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `expires_at` | TIMESTAMPTZ | NOT NULL | created + 30 days |
| `revoked_at` | TIMESTAMPTZ | nullable | Sign-out / "sign out everywhere" |

### 5.4 `urls` — deduplicated check targets (non-personal)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | Referenced by `checks` and `threat_votes` |
| `url_hash` | CHAR(64) | NOT NULL UNIQUE | sha256 of normalized URL |
| `url` | TEXT | NOT NULL | Normalized form (scheme, lowercase host) |
| `host` | VARCHAR(253) | NOT NULL, indexed | Hostname for community stats |
| `first_seen_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `last_seen_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Bumped on re-check |

### 5.5 `checks` — one row per analysis (the audit trail)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `user_id` | BIGINT | FK→users ON DELETE SET NULL, nullable | NULL = anonymous check |
| `url_id` | BIGINT | NOT NULL FK→urls | |
| `score` | SMALLINT | NOT NULL CHECK 0–100 | Merged rules-vs-AI score |
| `verdict` | VARCHAR(10) | NOT NULL CHECK enum | `Low risk`/`Suspicious`/`Dangerous` |
| `ai_status` | VARCHAR(11) | NOT NULL CHECK enum | `ok` / `unavailable` |
| `signals` | JSONB | NOT NULL | Array of `{ name, points, detail }` — full rule audit |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Retention key (§2.4) |

Indexes: `(user_id, created_at DESC)` history-reads; `(url_id, created_at DESC)`
per-URL stats; partial index on `(created_at) WHERE user_id IS NULL` for the
retention sweep.

### 5.6 `threat_votes` — community reports (phase 2)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `url_id` | BIGINT | NOT NULL FK→urls ON DELETE CASCADE | |
| `reporter_id` | BIGINT | FK→users ON DELETE SET NULL, nullable | NULL = anonymous report |
| `vote` | VARCHAR(10) | NOT NULL CHECK `dangerous`/`safe` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

UNIQUE `(url_id, reporter_id)` — one vote per account per URL.

### 5.7 `url_threat_stats` — materialized aggregate (refresh every 5 min)

| Column | Source | Notes |
|---|---|---|
| `url_id` | `urls.id` | UNIQUE index (required for concurrent refresh) |
| `host` | `urls.host` | Allows host-level summaries |
| `dangerous_votes` | count FILTER | Powers the community card |
| `safe_votes` | count FILTER | |
| `last_voted_at` | max(created_at) | Staleness signal |

---

## 6. Modular development output

Six self-contained modules, each wireable independently. Build in this order —
each phase ends with something runnable against the existing frontend.

### M0 — Bootstrap (day 1)

| File | Responsibility | Depends on | Done when |
|---|---|---|---|
| `package.json` | deps: express, cors, pg, dotenv, helmet, express-rate-limit | – | `npm ci` works |
| `src/config/index.js` | env load + validation, fail-fast | – | missing `GEMINI_API_KEY` → clear error |
| `src/db/index.js` + `migrate.js` | pg Pool; applies migrations in order | config | 001 + 002 apply cleanly twice (idempotent) |
| `src/app.js` / `src/server.js` | middleware chain §1.3; route mounting | db | `GET /api/health` → `{ ok: true }` |
| `src/middleware/*` | logger, errorHandler, rateLimit, validate, auth stubs | app.js | 404 and error paths return JSON contract |

### M1 — URL plumbing

| File | Responsibility | Depends on | Done when |
|---|---|---|---|
| `src/utils/normalizeUrl.js` | scheme defaulting, host lowercase, length caps, public-uri check | – | matches `analyzeDemoLink` acceptance rules |
| `src/utils/verdict.js` | band mapping (§4.3) | – | boundaries 29/30/59/60 correct |
| `src/services/urls.service.js` | sha256, find-or-insert, bump `last_seen_at` | M0 | re-check reuses the same `urls.id` |

### M2 — Detection core (unblocks demo parity)

| File | Responsibility | Depends on | Done when |
|---|---|---|---|
| `src/analyzer.js` + `src/rules.json` | all rules from `System_Design.md` §5, points per signal | M1, `verdict.js` | scores match `frontend/src/utils/demoAnalyzer.js` on 20 seed URLs |
| `src/services/gemini.service.js` | strict JSON prompt, 5 s timeout, parse proofing | config | Gemini down ⇒ rule verdict returned, `ai: "unavailable"` |
| `src/services/checks.service.js` | merge `max(rule, ai)`, DTO, persistence per §2.4 | M2 above | response passes `normalizeResult` in `frontend/src/services/api.js` |
| `src/routes/checks.routes.js` | `POST /api/check-link` (locked contract), `GET /api/history` stub | M0 | curl check returns the documented JSON |

### M3 — Accounts & auth

| File | Responsibility | Depends on | Done when |
|---|---|---|---|
| `src/services/otp.service.js` | issue/verify hashed codes, 5 attempts, 60 s cooldown | M0 | unit tests cover expiry + lockout |
| `src/services/token.service.js` | 48-byte token, sha256 storage, revoke/rotate | M0 | token hash never reverses |
| `src/services/auth.service.js` | create user, argon2id, find by email/phone | M0 | duplicate email → 409 |
| `src/services/delivery.service.js` | nodemailer / console stub | config | dev prints code, prod sends mail |
| `src/routes/auth.routes.js` + `middleware/auth.js` | §3 auth endpoints, `requireAuth`/`optionalAuth` | M3 above | full register→OTP→verify→token loop via supertest |

### M4 — History & retention

| File | Responsibility | Depends on | Done when |
|---|---|---|---|
| `src/services/checks.service.js` (extend) | honours `history_sync` on persist | M2, M3 | anonymous rows written, unsynced users' rows expire in 24 h |
| `src/services/history.service.js` | user history fetch (≤ 20), device-first policy | M3 | sync-off user gets `[]`, sync-on gets rows |
| `scripts/retention.js` | §2.4 deletions + view refresh | M0 | run twice ⇒ second run deletes nothing |

### M5 — Community votes (phase 2)

| File | Responsibility | Depends on | Done when |
|---|---|---|---|
| `src/services/vote.service.js` | upsert vote (1/account/URL), view refresh hook | M4 | double vote is an update, not a duplicate |
| `src/routes/votes.routes.js` | `POST /links/:hash/vote`, `GET /links/:hash/summary` | M5 above | summary powers the real community card |

### M6 — Hardening

| Item | Detail |
|---|---|
| CORS allow-list | only the deployed `VITE_API_URL` origins |
| Gemini cost guard | per-day call cap env `GEMINI_DAILY_MAX`, falls back to rules |
| Request logs | redact full URLs; log hosts + verdicts only |
| Load sanity | 30 req/min × 5 min soak; PM2 restart mid-test retains health |

### Module dependency graph

```text
M0 ──▶ M1 ──▶ M2 ──▶ M4 ──▶ M5
        │     │
        └─▶ M3─┘            (M3 needs M0 only; M4 needs M3 for tokens)
```

---

## 7. Test plan (extends `backend/README.md` roadmap item 3)

1. **Rules engine** — one case per rule in `rules.json` + band boundaries
   (29→Low, 30→Suspicious, 59→Suspicious, 60→Dangerous).
2. **check-link contract** — exact response shape `frontend/src/services/api.js`
   will accept (score int 0–100, verdict consistent with bands, signals
   `{name|title, points, detail}`).
3. **Gemini resilience** — stub 5 s timeout ⇒ `ai: "unavailable"`, rules still win.
4. **Auth** — register → OTP → verify → token; 5 wrong OTP attempts lockout;
   login reuse; session revocation.
5. **Retention** — `retention.js` only deletes what §2.4 allows.
6. **Migrations** — apply twice ⇒ idempotent; apply on fresh DB ⇒ all up.
7. **scan-message** — reuses rules total; no message text accepted in the body
   (server rejects any body longer than `{ url, senderHash, linkCount }` shape).
