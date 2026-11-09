# PhishGuard frontend

React JS (Vite) interface for PhishGuard, packaged for Android with Capacitor. Setup and behaviour notes also live in [`../docs/README.md`](../docs/README.md).

## Setup

```bash
npm install

# development
npm run dev

# production build (outputs to dist/)
npm run build
```

## Environment

Copy `.env.example` to `.env.local`:

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | HTTPS base URL of the Express API (e.g. `https://api.example.com`) |
| `VITE_DEMO_MODE` | `true` enables the built-in local demo analyzer (dev only). Production builds never use demo mode. |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite development server with hot reload |
| `npm run build` | Production bundle in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run android:add` | Add the Capacitor Android platform |
| `npm run cap:sync` | Sync the web build and native config into `android/` |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:debug` | Build web + sync + `assembleDebug` APK |
| `npm run android:release` | Build web + sync + `assembleRelease` APK |

## Screens

Animated splash and welcome → sign-in / registration (email or phone leads to a six-digit OTP **demo** screen, code `123456`) → dashboard with Home, Inbox, Scan, Sandbox, Activity, Profile, link results, message details and sample settings. Sandbox explains the dynamic-analysis workflow and shows account-owned job history and delivery status. Completed PDF reports are sent through connected Telegram and WhatsApp services; there is no Reports screen or in-app download. Dark mode is available in Profile → Appearance and is saved on the device.

- The Sandbox guide describes the isolated Linux worker and network restrictions as deployment requirements. It does not attest that a particular configured sandbox enforces them; see [`../DYNAMIC_SANDBOX.md`](../DYNAMIC_SANDBOX.md).

- The demo analyzer reproduces the server rule engine (see [`../System_Design.md`](../System_Design.md) §5) so the UI is testable without a backend.
- Auth screens are **prototypes only**: no real authentication, OTP delivery, OAuth, or account persistence.
- Inbox, threat totals and forensic screens contain illustrative sample data; SMS permissions and history require backend and native Android work.

## Structure

- `src/App.jsx` — all screens and the local demo link analyzer
- `src/styles.css` — mobile and desktop UI styles
- `capacitor.config.json` — Capacitor configuration
- `android/` — Capacitor-generated Android project (native SMS receiver to be added here; it must send extracted links only, message text and sender numbers stay on the device)

## Requirements

- Node.js 18+
- For Android builds: Android Studio / JDK 17, per Capacitor requirements
