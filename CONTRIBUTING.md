# Contributing to PhishGuard

Thanks for helping make PhishGuard better! This is a student project, so small, clear improvements are very welcome.

## Getting started

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```
2. Install dependencies for the area you are working on:
   ```bash
   cd frontend && npm install
   ```
3. Run the dev server (`npm run dev`) and verify your change in both the mobile and desktop preview layouts.

## Commit style

- One logical change per commit
- Use a short imperative subject line, e.g. `Add punycode example to rules docs`

## Code guidelines

- Keep the frontend dependency-light: plain React + CSS, no UI framework
- Keep detection lists (scam keywords, suspicious TLDs, shorteners, brands) in `rules.json`, not hard-coded
- Never commit real credentials; `.env` files are already gitignored
- Keep the privacy guarantees: message text and sender numbers must not leave the device

## Pull requests

- Describe *what* changed and *why*
- Mention which screens or components you touched
- Update the relevant docs (`docs/README.md`, `PROJECT_STRUCTURE.md`, `System_Design.md`) when behavior or structure changes

## Reporting bugs

Open a GitHub issue with:

- What link (or screen) triggered the problem — use a **fake/test link**, never a real phishing campaign link
- Expected vs. actual behaviour
- Screenshot if it is a UI issue

## Code of conduct

Be kind and assume good intent. This project exists to help non-technical users stay safe online.
