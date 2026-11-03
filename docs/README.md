# Project documentation

The system overview, requirements, detection rules, API outline, and deployment
notes are in the repository-root [System_Design.md](../System_Design.md).
See [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) for the source layout.

## Frontend setup

The responsive React interface is in `frontend/`. From that directory, run
`npm install` once, then `npm run dev` to launch the Vite development server.
`npm run build` creates the production bundle in `frontend/dist/`.

Copy `.env.example` to `.env.local`, set `VITE_API_URL` to the HTTPS URL of the
Express API, and set `VITE_DEMO_MODE=false` to exercise the API while developing.
The production build never enables the local demo analyzer. The backend described
by `System_Design.md` must be implemented and deployed separately.

The frontend opens with an animated splash and welcome screen, followed by
sign-in or registration screens. Email and phone flows lead to a six-digit OTP
demo screen; use `123456` to complete the preview flow because no code is sent.
Google and Apple buttons are UI entry points and display a notice until OAuth
providers are configured. These auth screens are prototypes only: they do not
authenticate users, send credentials or OTPs, or persist account data. The
dashboard inbox, threat totals, and forensic material also contain illustrative
sample data. Real authentication, provider OAuth, OTP delivery, SMS permissions,
and message history require backend and native Android implementations; they
are not supplied by the frontend alone.
