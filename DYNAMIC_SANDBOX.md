# Dynamic sandbox analysis specification

This document defines the PhishGuard-to-sandbox workflow and the security properties required of the separately operated sandbox service. It describes the integration contract; it is not evidence that a deployed provider currently enforces every worker or network control.

## Trust boundary and execution environment

PhishGuard performs link normalization, rule-based scoring, optional AI scoring, job eligibility checks, callback validation, evidence processing and report delivery. Browser execution is delegated to the service configured by `SANDBOX_API_BASE_URL`.

The sandbox deployment must run each scan in a disposable, isolated Linux worker or VM. The worker must be destroyed after the job and must not share a browser profile, writable filesystem, credentials or host privileges with other jobs. Use a non-root identity, bounded CPU/memory/runtime, and OS-level confinement. Do not mount host paths, expose container-runtime sockets, or place credentials or production secrets in the worker.

The application does not create that Linux environment and receives no per-job OS/isolation attestation. Validate the provider's actual execution and egress controls independently. A tunnel, container alone, Android proot or browser profile is not a sufficient security boundary.

## End-to-end lifecycle

1. **Check the link.** `POST /api/check-link` validates and normalizes the URL, computes rule signals and may add an AI score. The final displayed score is the higher score.
2. **Apply the queue gate.** Dynamic analysis is queued only when the rule score is strictly greater than 60, the user is authenticated, and sandbox credentials, callback signing secret and callback URL are configured. The AI score does not trigger a sandbox run by itself. Links extracted by `POST /api/scan-message` use the same rule-score gate; message text is not copied into the analysis job.
3. **Submit a passive scan.** The backend sends the URL, a unique client reference and callback URL to the sandbox `POST /scan` endpoint, with `fill_form: false` and `persona_runs: 0`. It requires HTTP 202 and a bounded string job identifier. The outbound request uses an API key, optional Cloudflare Access headers and a 10-second timeout. HTTPS is required in production; HTTP redirects are not followed.
4. **Navigate and observe.** The worker may load the submitted page and observe navigation/network behavior. It must not type into fields, submit forms, execute user-directed actions or use a real user's browser session. It captures the redirect chain, final URL, contacted hostnames, request counts by type, a bounded request timeline and up to four screenshots. There are no form submissions, persona runs or hooks in the persisted result.
5. **Return signed evidence.** The sandbox posts to `/api/webhooks/scan-done`. The backend verifies an HMAC-SHA256 signature over the raw callback body using `X-Signature: sha256=<hex>`, checks `X-Job-Id`, queued job ID, client reference, completion status and submitted URL. Invalid or mismatched callbacks are rejected. Callback size is limited to 2 MiB.
6. **Sanitize artifacts.** Redirects and screenshot URLs must use HTTP(S). Lists and strings are bounded; the result accepts at most 20 redirects, 20 contacted hosts, 20 request-type counters, 40 timeline points and four screenshots. Screenshot URLs must be same-origin with the configured sandbox API and confined to `/shots/{job_id}/{index}`. Each screenshot is limited to 1 MiB. The app downloads and embeds these images in the generated PDF.
7. **Deliver the report.** After a valid completion, PhishGuard stores the sanitized result and generated PDF, then sends it as a document to each linked Telegram and WhatsApp destination. Per-channel status is `pending`, `sent`, `failed` or `not_connected`; a failed delivery is logged and marked but does not change the scan verdict. Users see analysis history and delivery status in Sandbox; there is no Reports page or in-app download control.

## Service availability, prices and report destinations

The application currently supports one operator-configured external sandbox API endpoint; it does not provide a catalogue of sandbox vendors. The Sandbox UI lists this single connector and its supported request/callback configuration. Per-analysis pricing is not configured and no checkout, billing or provider price validation is implemented.

The app does not directly submit cases to cyber cells or law-enforcement agencies. Users may share a delivered report through an agency's official reporting channel. An official reporting integration requires a specified jurisdiction and an authorized agency API/process; none is currently configured.

For completed analyses, PhishGuard attempts PDF delivery through the user's linked Telegram bot chat and/or WhatsApp destination. A channel must be configured by the operator and connected by the user. Delivery status is recorded per channel; users should check the status in Sandbox and use the agency's official channel if they need to report a case. Do not treat delivery to a messaging account as an official cyber-cell filing.

The browser worker is passive only: it must not fill or submit forms, enter credentials, or perform user-directed actions on a suspected phishing page.

## Network policy required at the worker

These are deployment controls for the sandbox service, not controls enforced by the PhishGuard frontend. Enforce them at the worker's network boundary and repeat validation after every DNS resolution and redirect:

- Permit only the outbound DNS and public HTTP(S) traffic needed to visit the submitted page. Do not give the browser access to the PhishGuard database, callback signing secret, messaging credentials or other internal services.
- Deny loopback, private, link-local, multicast, reserved and IPv4-mapped IPv6 destinations, including cloud instance metadata endpoints. Apply equivalent policy to IPv4 and IPv6 and guard against DNS rebinding and redirects to prohibited addresses.
- Do not allow arbitrary UDP, inbound connections, lateral worker-to-worker traffic, host networking, or access to the worker host/control plane. Restrict DNS resolvers and egress ports according to the provider's implementation.
- Keep the callback channel separate from the browser's page-navigation network policy. The worker should send callback and screenshot artifacts only to the configured PhishGuard callback/artifact endpoints using authenticated, integrity-protected channels.
- Apply provider-side request, bandwidth, duration and response-size limits. Abort a job when these limits or the isolation boundary cannot be maintained.

The result schema reports observed HTTP navigation only: submitted/final URLs, redirect hop count and chain, contacted hostnames with request totals, request counts by type, timeline samples and screenshot references. It does not represent a complete packet capture or a guarantee that every external side effect was observed.

## Credentials and configuration

Configure the backend's sandbox API base URL and API key, webhook signing secret and public callback base URL. Optional Cloudflare Access client ID and secret must be supplied together. Use HTTPS for the sandbox and callback in production. Keep these secrets only on the backend; never place them in the frontend or worker page context.

The integration's job/authentication contract is:

- Sandbox submit: `POST {SANDBOX_API_BASE_URL}/scan` with `url`, `client_ref`, `callback_url`, `fill_form: false`, `persona_runs: 0`.
- Completion callback: `POST /api/webhooks/scan-done`, signed with HMAC-SHA256 and identifying both `job_id` and `client_ref`.
- Private history: authenticated `GET /api/analysis` and `GET /api/analysis/:jobId`.
- PDF delivery: generated after callback validation; sent to linked messaging destinations.

## User-visible behavior and failure handling

An eligible scan is shown as queued and then running until the callback is accepted. Missing authentication or sandbox configuration prevents queueing and leaves the rule-based result intact. Submission errors, invalid callback payloads or artifact errors mark the job failed; they do not overwrite the original rule-based verdict. Reports are delivered only to channels the user has linked; `not_connected` indicates there was no destination configured when delivery began.

The Sandbox page presents the workflow, environment caveat, network-policy requirements, account-owned job history and delivery status. Its “isolated Linux worker” wording refers to the required deployment design, not verified per-run execution. For operational sign-off, inspect provider configuration/logs and verify that the policy above is enforced before enabling untrusted URLs.
