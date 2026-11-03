# PhishGuard 🛡️

**Fake Link / Phishing Warn Tool** — an Android app where a user pastes any link received by SMS, WhatsApp or email and instantly sees a clear verdict (**Low risk**, **Suspicious** or **Dangerous**) with plain-language reasons.

> Project for the AKTU Innovation and Design Thinking Lab (BME152/BME252), Problem Statement No. 48.
> Full design details: [System_Design.md](System_Design.md) · Source layout: [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)

## Features

- **Paste and check** a link with or without `http(s)://` — result in under one second
- **Rule engine** scoring scam keywords, suspicious TLDs, brand impersonation, raw IP hosts, shorteners, `@` tricks, punycode and more (0–100 risk score)
- **Gemini AI second opinion** for links the rules cannot judge; the higher score wins, and the app never fails completely if AI is unavailable
- **Headline verdict** with safety tips: *do not click*, report at [cybercrime.gov.in](https://cybercrime.gov.in) or call **1930**
- **Responsive React UI** (mobile and desktop preview screens) packaged for Android with Capacitor
- **Privacy first**: recent checks stay on the device; no personal data is stored on the server

## Screenshots

See [`docs/Design/`](docs/Design/) for the full UI design captures.

## Architecture

| Layer | Technology | Role |
|---|---|---|
| Mobile app | React JS (Vite) + Capacitor → Android APK | Link form, result card, history; WebView |
| Network edge | Cloudflare Tunnel (`cloudflared`) | HTTPS and routing; no open inbound ports |
| Server | Arch Linux VPS, Node.js + Express, PM2 | Validates input, rule engine, Gemini call, history |
| Detection layer 1 | Rule engine (`analyzer.js` + `rules.json`) | Scam keywords, suspicious extensions, brand mismatch |
| Detection layer 2 | Google Gemini Flash (`@google/genai`) | Context-aware second opinion as structured JSON |

```text
[ ANDROID APK ]  ──HTTPS──▶  [ CLOUDFLARE EDGE ]  ──tunnel──▶  [ ARCH LINUX VPS ]
 link checker                api.yourdomain.com               Express API (PM2 :5000)
 result card  ◀──JSON────    TLS + proxy routing              rule engine → Gemini → JSON
```

## Quick start (frontend)

```bash
cd frontend
npm install
npm run dev      # Vite dev server
npm run build    # production bundle in frontend/dist/
```

Copy `frontend/.env.example` to `.env.local`, set `VITE_API_URL` to the HTTPS URL of the Express API, and set `VITE_DEMO_MODE=false` to exercise the real API. Details: [docs/README.md](docs/README.md).

## Quick start (backend)

The Express backend is a planned scaffold area; its API contract, environment variables, and reference implementation are documented in [`backend/README.md`](backend/README.md). Deployment steps (PM2, Cloudflare Tunnel, Arch Linux VPS) live in [`deployment/README.md`](deployment/README.md).

## Android build

```bash
cd frontend
npm run android:debug    # build + cap sync + assembleDebug
npm run android:release  # build + cap sync + assembleRelease
```

## Repository status

| Area | Status |
|---|---|
| React frontend (screens, demo analyzer) | ✅ Working demo |
| Android scaffold (Capacitor) | ✅ Scaffolded; native SMS receiver pending |
| Express backend | 🚧 Planned (see `backend/README.md`) |
| Deployment configs | 🚧 Sample templates provided |
| Auth / OTP flows | Prototype UI only — no real authentication yet |

> Sample inbox, threats and history content are illustrative. "Low risk" never means "guaranteed safe".

## License

Released under the [MIT License](LICENSE).
