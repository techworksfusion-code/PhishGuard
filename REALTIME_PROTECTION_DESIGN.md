# PhishGuard real-time AI protection — full technical design

> Implements [`System_Design.md`](System_Design.md) **§8A "Automatic SMS Detection
> and Blocking (Android)"** exactly: Java receiver (`SmsReceiver.java`),
> store (`PhishGuardStore.java`), plugin (`PhishGuardPlugin.java`), blocking
> **levels 1–3** for the lab demo (level 4 stays optional), Blocked screen and
> Setup screen in React, and the A1–A5 test set.
>
> This document is the implementation-level spec — every class, method,
> payload, constant, and screen flow for the feature "AI protection enabled in
> background intercepts the message and provides the scam score in real time
> via Gemini".
>
> Related: [`BACKEND_DESIGN.md`](BACKEND_DESIGN.md) (server modules M0–M6,
> `alert_events` schema) · locked API contract in [`backend/README.md`](backend/README.md)

---

## 0. Decision record — why Java (not Kotlin)

**Decision: all native Android code for this feature is Java. Final.**

1. The Capacitor Android shell in this repo (`frontend/android/`) is generated
   Java — `MainActivity.java`, `.java` test stubs, no `kotlin-android` plugin
   in any Gradle file. Mixed-language projects add toolchain friction and a
   second DEX reference set for zero benefit here.
2. The team teaches/uses Java (B.Tech 1st year). One language for the two tiny
   native files keeps the maintenance surface small.
3. SMS interception cannot be done in JavaScript at all — `SMS_RECEIVED`
   broadcasts only reach native code. The Java layer is deliberately *thin*:
   receive → extract link(s) → hash sender → fire one HTTP call. All
   **decision logic lives in React/JS**, where the team already works.
4. Historical note: `System_Design.md` §8A originally said "written in
   Kotlin"; that wording is corrected to Java everywhere now.

**Document hierarchy (one source of truth per layer):**

| Doc | Answers | Authority |
|---|---|---|
| `System_Design.md` §8A | *what & why* (lab-facing summary, blocking levels, tests A1–A5) | lowest |
| **`REALTIME_PROTECTION_DESIGN.md`** | *exactly how* (classes, methods, payloads, flutter-free screen wiring) | **highest — governs if docs differ** |
| `BACKEND_DESIGN.md` | *server side* (modules M0–M6, schema, endpoints) | server layer |

No other flavor of this feature exists; do not read §8A's historical Kotlin
wording as a competing design.

---

## 1. Feature definition and privacy contract

**One sentence:** while *Real-time scanning* is on, every inbound SMS is
inspected on-device in milliseconds, then the **complete message text** is sent
for a one-shot rule + Gemini analysis; Dangerous messages are quarantined,
blocklisted, and alerted. The server never stores the message text, and the
sender only ever leaves the phone as `sha256(deviceSalt + sender)`.

### 1.1 Privacy contract

| Data | On device | To backend | To Gemini |
|---|---|---|---|
| Full message text | ✅ (quarantine body only) | ✅ one-shot scan, **never stored** | ✅ quoted in the prompt |
| Sender number | ✅ | ❌ never — only `sha256(deviceSalt + sender)` (per-install salt) | ❌ |
| Quarantine / blocklist indexes | ✅ (SharedPreferences) | ❌ | ❌ |
| Extracted link | ✅ | ✅ via `/api/scan-message` (aggregated `urls` row) | ✅ quoted-prompt rule |

### 1.2 Blocking semantics per `System_Design.md` §8A

| Verdict | Level-1 alert (notification) | Level-2 quarantine + blocklist | Shown in inbox |
|---|---|---|---|
| Dangerous | red "Scam message blocked" | ✅ both | Blocked screen (plain-text links, warning screen first) |
| Suspicious | amber "Suspicious message checked" | ❌ none | scan/activity history only |
| Low risk / ignorable | silent (never shown) | ❌ | nothing |

Server response also records the event in `alert_events` (sender hash only).

---

## 2. Files this feature adds or edits (exact paths)

| Action | Path |
|---|---|
| EDIT | `frontend/android/app/src/main/AndroidManifest.xml` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/SmsReceiver.java` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/PhishGuardStore.java` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/PhishGuardPlugin.java` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/OfflineRules.java` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/Notifier.java` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/GuardApi.java` |
| ADD | `frontend/android/app/src/main/java/com/phishguard/app/SmsPipeline.java` |
| ADD | `frontend/android/app/src/main/res/drawable/ic_shield_alert.xml` |
| EDIT | `frontend/android/app/src/main/java/com/phishguard/app/MainActivity.java` (register plugin + channels) |
| ADD | `frontend/src/services/guard.js` |
| EDIT | `frontend/src/App.jsx` (alert banner, protection toggle, `blocked` page, real stats) |
| EDIT | `frontend/src/styles.css` (banner / quarantine styles) |
| ADD | `backend/src/routes/scan.routes.js` + `backend/src/routes/alerts.routes.js` |
| ADD | `backend/src/services/alerts.service.js` |
| EDIT | `backend/src/analyzer.js` (`analyzeMessage`, `extractLinks`) |
| EDIT | `backend/src/rules.json` (`messagePatterns`, `messageNegations`) |
| EDIT | `backend/src/services/gemini.service.js` (`analyzeMessageWithGemini`) |
| EDIT | `backend/src/routes/index.js` (mount `/scan-message`, `/alerts`) |
| EDIT | `backend/scripts/retention.js` (30-day `alert_events` sweep) |
| ADD | `backend/tests/` cases for message analysis + no-store contract |

---

## 3. Android native layer (Java, per §8A naming)

### 3.1 Manifest diff

```xml
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- INTERNET already declared -->

<application>
  <receiver
      android:name=".SmsReceiver"
      android:exported="true"
      android:permission="android.permission.BROADCAST_SMS">
      <intent-filter android:priority="2147483647">
          <action android:name="android.provider.Telephony.SMS_RECEIVED" />
      </intent-filter>
  </receiver>
</application>
```

`RECEIVE_SMS` observes inbound SMS without `READ_SMS` (no inbox access).
Max priority is allowed for delivery observation; it does **not** block other
apps (impossible since Android 4.4 — see §1.2 level 4 note).

### 3.2 `SmsGuardService.java` — constants and shared config

```java
object SmsGuardService {
    const val EVENT_SMS_LINK_DETECTED = "smsLinkDetected"
    const val EVENT_PERMISSION_CHANGED = "permissionChanged"
    const val EVENT_ALERT_OPENED = "alertOpened"

    const val PREFS = "phishguard_guard"
    // keys: realtime_enabled, api_url, token, alert_pepper, battery_hint_shown
    const val CHANNEL_ALERTS = "phishguard_scam_alerts"   // IMPORTANCE_HIGH
    const val NOTIF_ID_DANGEROUS = 7001
    const val NOTIF_ID_SUSPICIOUS = 7002
    const val REQUEST_MAX_LINKS = 3                        // per §8A
    const val URL_MAX_LENGTH = 2000                        // backend contract
    const val HTTP_TIMEOUT_MS = 8000                       // inside goAsync 10 s window
    const val DEDUPE_WINDOW_MS = 10 * 60_000               // same URL within 10 min reuses verdict
}
```

### 3.3 `OfflineRules.java` — on-device port of `rules.json` (transient ≤ 50 ms verdict)

Constants are a **verbatim copy of `frontend/src/utils/demoAnalyzer.js`** so the
offline verdict is identical to what the server's rule engine returns when
Gemini is down; must be regenerated whenever `analyzer.js + rules.json` change
(a CI test `OfflineRulesParityTest` compares both fixtures on 20 seed URLs).

```java
object OfflineRules {
    val KEYWORDS = listOf(
        "free-recharge", "win-lottery", "lucky-draw", "claim-prize", "kyc-update",
        "kyc-verify", "verify-account", "refund", "free-gift", "cashback-offer")
    val BAD_TLDS = setOf("xyz", "top", "tk", "click", "icu", "buzz", "gq", "ml", "cf", "work")
    val BRANDS = mapOf(
        "sbi" to listOf("sbi.co.in", "onlinesbi.sbi"), "paytm" to listOf("paytm.com"),
        "amazon" to listOf("amazon.in", "amazon.com"), "jio" to listOf("jio.com"),
        "hdfc" to listOf("hdfcbank.com"), "phonepe" to listOf("phonepe.com"))
    val SHORTENERS = setOf("bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "is.gd", "t.co", "goo.gl")

    data class Result(val score: Int, val verdict: String, val ignorable: Boolean,
                      val signals: List<String>)

    /** OTP-shaped or no-signal messages are ignorable → no alert, no network call */
    fun evaluate(body: String, url: String?): Result = /* port of demoAnalyzer.js; §8A */
}
```

Verdict bands (identical to §4.3 of BACKEND_DESIGN): `>=60 Dangerous`, `>=30
Suspicious`, else `Low risk`. `ignorable = true` when: no URL, no keyword hit,
and body matches OTP patterns (`\b\d{4,6}\b` + sender short-code style) — these
NEVER fire alerts.

### 3.4 `PhonePepper.java` (inside `PhishGuardStore.java`) — hashed sender

```java
private fun ensurePepper(ctx: Context): String = prefs(ALERT_PEPPER) {  // 32 random bytes
    val current = it.getString(KEY, null) ?: UUID.randomUUID().toString().also { v -> it.put(KEY, v) }
}
fun senderHash(ctx: Context, sender: String): String =
    sha256Hex("${ensurePepper(ctx)}:$sender")            // NEVER send the raw number
```

### 3.5 `SmsReceiver.java` — full implementation (replaces §8A skeleton, same behaviour)

```java
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (!PermissionHelper.hasReceiveSms(ctx)) return
        val store = PhishGuardStore(ctx)
        if (!store.realtimeEnabled()) return                       // toggle off → no work

        val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val sender = msgs.firstOrNull()?.originatingAddress ?: return
        val body = msgs.joinToString("") { it.messageBody ?: "" }   // multipart concat (level-2 dedupe too)
        val senderHash = store.senderHash(sender)
        if (store.isBlocked(senderHash)) { store.quarantine(senderHash, body); return }  // §8A A3

        val links = Regex("(?i)\\b(?:https?://|www\\.)\\S+")
            .findAll(body).map { it.value.take(SmsGuardService.URL_MAX_LENGTH) }
            .take(SmsGuardService.REQUEST_MAX_LINKS).toList()
        val local = OfflineRules.evaluate(body, links.firstOrNull())

        if (local.ignorable) return                                 // A2: no alert
        orch.provisional(ctx, senderHash, links, local)             // ≤50 ms banner/notification

        val pending = goAsync()                                     // 10 s ceiling
        Thread {
            try {
                val final = resolveVerdict(store, senderHash, links, local)   // 4.6
                store.recordAlert(senderHash, links.size, local.verdict, final)          // local queue
                orch.finalizeAlert(ctx, senderHash, links, local, final)             // JS event/dl
            } finally { pending.finish() }
        }.start()
    }

    private fun resolveVerdict(store: PhishGuardStore, senderHash: String,
                               links: List<String>, local: OfflineRules.Result): Verdict {
        var worst = Verdict(0, local.verdict, "local")
        if (urls.isEmpty() (links.isEmpty())) return worst          // text-only stays offline (§1.1)
        for (link in links) {
            val cached = store.cachedVerdict(link, SmsGuardService.DEDUPE_WINDOW_MS)
            val v = cached ?: GuardApi.scanMessage(link, senderHash)      // POST /api/scan-message
            if (v != null) { store.cacheVerdict(link, v.score, v.verdict) }
            if (v != null && v.score > worst.score) worst = v
            else if (v == null && !store.serverReachableRecently()) return worst // offline path
        }
        return worst
    }
}
```

Dangerous ⇒ `store.quarantine(senderHash, body) + store.blockSender(senderHash)
+ Notifier.alert(ctx, true)`; Suspicious ⇒ warning only — exactly §8A levels 1–2.

### 3.6 `PhishGuardStore.java` — on-device persistence (SharedPreferences)

| Key namespace | Contents | Type |
|---|---|---|
| `quarantined` | JSON array `{ senderHash, senderLabel, body, firstLink, verdict, score, receivedAt, id }` | newest first, cap 50 |
| `blockedSenders` | Set of `senderHash` | never leaves device |
| `urlVerdictCache[url]` | `{ score, verdict, savedAt }` | TTL 10 min |
| `recentAlerts` | JSON array for AlertDetail/AlertList after reinstall | cap 20 |
| guard prefs | `realtime_enabled`, `api_url`, `token`, `alert_pepper` | token written at login |

Methods: `realtimeEnabled()`, `setRealtime(Boolean)`, `isBlocked(senderHash)`,
`quarantine(senderHash, body)`, `unblock(senderHash)`, `restore(id)`,
`deleteBlocked(id)`, `getBlocked()`, `senderHash(sender)`,
`cacheVerdict/cachedVerdict(url)`, `recordAlert(...)`, `recentAlerts()`.

### 3.7 `GuardApi.java` — the only network client in the background

```java
object GuardApi {
    /** POST {api_url}/api/scan-message  { text, senderHash } */
    fun scanMessage(text: String, senderHash: String): Verdict? =
        url.openConnection(token, timeout = HTTP_TIMEOUT_MS).use { resp: 200 -> parse(dto) }
}
```

Response = `{ valid, score, verdict, ai, signals[{ name, points, detail }],
linkCount, alertId }`. The message body is sent once and is not persisted by
the backend.

### 3.8 `Notifier.java` — two channels, deep link

| Channel id | Importance | Content |
|---|---|---|
| `phishguard_scam_alerts` | HIGH (heads-up) | Dangerous: red 🔴 "Scam message blocked — ask PhishGuard for details"; Suspicious: amber "Suspicious message detected" |

Both launch `MainActivity` with extras (`alertId`, `verdict`, `score`,
`senderHash`) → plugin emits `alertOpened` → app routes to AlertDetail.

### 3.9 `PhishGuardPlugin.java` — full surface

```java
class PhishGuardPlugin : Plugin() {
    @PluginMethod fun getStatus(call)                 // { enabled, smsPermission, notifications, counts }
    @PluginMethod fun requestPermissions(call)        // RECEIVE_SMS + (API 33+) POST_NOTIFICATIONS
    @PluginMethod fun setRealtimeEnabled(call)        // persists the flag; manifest receiver always registered
    @PluginMethod fun getQuarantine(call)             // { items: [...] }
    @PluginMethod fun deleteQuarantine(call)          // { id }
    @PluginMethod fun restoreQuarantine(call)         // { id } → remove + unblock sender
    @PluginMethod fun unblockSender(call)             // { senderHash }
    @PluginMethod fun getLastAlert(call)              // { alert } for the in-app banner
    @PluginMethod fun clearLastAlert(call)
    @PluginMethod fun syncSessionToken(call)          // { token } from localStorage
    @PluginMethod fun setBaseUrl(call)                // { url } override
    @PluginMethod fun testScan(call)                  // { text } → live /api/scan-message
    @PluginMethod fun simulateSms(call)               // { text, sender } → full pipeline, no second phone
    @PluginMethod fun clearProtectionData(call)
}
```

The manifest receiver is always registered (app-killed path). When the flag is
off, `SmsReceiver` returns immediately. Duplicate broadcasts are de-duped with
`(senderHash, bodyHash)` within 15 s.

## 4. React layer

### 4.1 `guardBridge.js` — typed facade around the plugin

```js
import { registerPlugin } from '@capacitor/core';
export const SmsGuard = registerPlugin('PhishGuardPlugin');

export const guardBridge = {
    requestPermissions: () => SmsGuard.requestPermissions(),
    enableRealtime: (bool) => SmsGuard.setRealtimeEnabled({ enabled: bool }),
    getBlocked: () => SmsGuard.getBlocked(),
    unblockSender: (hash) => SmsGuard.unblockSender({ senderHash: hash }),
    restore: (id) => SmsGuard.restore({ id }),
    deleteBlocked: (id) => SmsGuard.deleteBlocked({ id }),
    pushBackendConfig: (apiUrl, token) => SmsGuard.setBackendConfig({ apiUrl, token }),
    onAlert: (cb) => SmsGuard.addListener('smsLinkDetected', cb),
    onAlertOpened: (cb) => SmsGuard.addListener('alertOpened', (e) => cb(e)),
    onPermissionChanged: (cb) => SmsGuard.addListener('permissionChanged', cb),
};
```

`pushBackendConfig` is called on **login** (token) and whenever `VITE_API_URL`
is validated — that is how the receiver gets server URL/token while the app is
closed.

### 4.2 `alertFlow.js` — alert state machine (one per alert id)

```text
entry → local(provisional ≤ 50 ms) → scanning(spinner) → final(merged) → detail | dismissed
                                        ↓ timeout 15 s
                                     fallback(offline verdict stands; ai_status = unavailable)
```

| state | UI | transitions |
|---|---|---|
| `entry` | none | smsLinkDetected event |
| `local` | AlertBanner (rules color) | → `scanning` if URL exists; `detail` if text-only |
| `scanning` | AlertBanner spinner + "Asking Gemini…" | → `final` on response; `fallback` after 15 s |
| `final` | AlertBanner updated | → `detail` on tap; auto-dismiss 8 s |
| `detail` | AlertDetail screen (`page='alert'`) | manual close |
| `dismissed` | removed | swipe or auto |

Banner colors follow existing `risk-dot` classes (low-risk/suspicious/dangerous)
so the design language is unchanged.

### 4.3 Screen additions (wired into `App.jsx` routing exactly like existing pages)

| New page | Route behaviour | Entry plate |
|---|---|---|
| `setup` | first-run OR `permissionChanged` with deny → shown when accessing Protection settings | Setup card: why RECEIVE_SMS is needed, links cybercrime.gov.in / 1930, "Grant permissions" button ↔ `guardBridge.requestPermissions()` |
| `alert` | AlertDetail (from banner tap or notification deep link) | verdict hero + signals (same visual language as `scan-result`) |
| `blocked` | Quarantine list | rows: sender label, first link as plain text, verdict badge; actions per §8A: Restore / Delete / Unblock |

Settings wiring (already-existing toggles become real):

* `settings.realtime` — ON → `guardBridge.enableRealtime(true)`; if permission
  missing → first request; deny → OFF + red status line on Settings page.
* `settings.scamAlerts` — notification channel `phishguard_scam_alerts` enabled/disabled.
* `settings.privateAnalysis` — unchanged from BACKEND_DESIGN §2.1 (`history_sync`).

### 4.4 Deep links

```text
Notification tap → MainActivity intent extras → plugin emits alertOpened
  → App.jsx: useEffect on capApp 'appUrlOpen' for phishguard://alert/<id>
  → looks up store.recentAlerts()[id]; if absent, fetches GET /api/alerts
  → renders AlertDetail (page='alert', tab='home')
```

## 5. Backend additions

### 5.1 `POST /api/scan-message`

Request (validated):

```json
{ "text": "URGENT: your SBI account will be blocked…", "senderHash": "9f2c…64hex" }
```

`senderHash` is optional for manual web scans (a constant anonymous digest is
used), and must be a 64-char hex digest when present. `text` is capped at 4000
characters. The body is analysed in memory and **never written to disk**.

Response `200`:

```json
{
  "valid": true, "score": 100, "verdict": "Dangerous", "ai": "ok",
  "signals": [
    { "name": "Credential request", "points": 35, "detail": "Asks you to share a verification code, PIN or password." },
    { "name": "Brand mismatch", "points": 40, "detail": "Mentions sbi but the domain does not match its official site." }
  ],
  "linkCount": 1,
  "alertId": 4832
}
```

Processing chain:

```text
validate body → senderHash rules → analyzer.analyzeMessage(text)
→ gemini.analyzeMessageWithGemini(text) (daily budget) → merge max(score)
→ alerts.service.recordAlert({user_id?, url_id?, senderHash, linkCount,
    localVerdict, score, verdict, ai_status}) → alertId
```

Errors: `400` missing text · `413` text too long · `422` invalid senderHash ·
`429` rate-limited (receiver keeps the offline verdict).

### 5.2 `GET /api/alerts` 🔒

Last 20 `alert_events` for the token's user, newest first:

```json
{ "alerts": [ { "id": 4832, "host": "free-recharge-jio.xyz", "score": 92,
    "verdict": "Dangerous", "ai_status": "ok", "local_verdict": "Suspicious",
    "sender_hash": "9f2c…64hex", "link_count": 1,
    "notified": 1, "in_app_shown": 0, "created_at": "2026-11-05T10:02:11Z" } ] }
```

### 5.3 Rate limits, cache, queuing (Gemini cost control)

| Mechanism | Value |
|---|---|
| Global IP rate limit | 30 req/min (existing) |
| `/api/scan-message` per-token | 20 req/min |
| Per-senderHash queue | 1 in-flight call; else cached via `urlVerdictCache` |
| URL dedupe cache | in-memory, TTL 10 min (per §2.3 BACKEND_DESIGN) |
| Gemini daily cap | `GEMINI_DAILY_MAX` env → over-cap ⇒ `ai:'unavailable'` with rules verdict |

### 5.4 Schema: `backend/db/migrations/003_alerts.sql` (already created)

`alert_events`: `id`, `user_id` (nullable FK), `url_id` (nullable FK),
`sender_hash` (CHAR(64)), `link_count`, `local_verdict`,
`score`/`verdict`/`ai_status` (server), `notified`, `in_app_shown`,
`created_at`. Retention: 30 days (§6 below). **Sender numbers and message text
cannot be stored — the columns don't exist.**

### 5.5 Env additions (`backend/.env.example`)

```bash
# Real-time alert pathway
ALERT_PEPPER=change_me_random_32_bytes       # salt for sender_hash (never rotated casually)
SCAN_RATE_PER_TOKEN=20                        # req/min per bearer token
```

## 6. Retention additions

| Data | Rule |
|---|---|
| `alert_events` | delete after 30 days (retention.js sweep) |
| `quarantined`, `blockedSenders`, `urlVerdictCache` (on device) | purged on "Delete data" in Privacy settings |

## 7. Sequence diagrams (per §8A tests A1–A5)

```text
A1 (open app)                                  A1 (app killed)
SMS ─▶ runtime receiver ─▶ OfflineRules        SMS ─▶ manifest receiver
     banner ● Suspicious(40s) + scanning            OfflineRules ─▶ red notification ● Dangerous(75s)
     POST /scan-message → 92 Dangerous              (no network: cached token in prefs only if login)
     banner ▶ Dangerous(92) + quarantine + block    quarantine/blocklist written on-device only
A2 no link → ignorable() true → nothing ever sent
A3 blocked sender → quarantined instantly, no network
A4 offline → GuardApi null → local verdict (rules port) stands
A5 unblock → next SMS is re-scored fresh (blocklist left, cache purged for sender's URLs)
```

## 8. Battery/deadlock handling (per §8A notes)

* Battery: Setup screen asks for "Unrestricted" battery — no workaround applied
  proactively (Play review safety).
* If the process is killed between provisional and finalize, the notification
  already shows the local verdict; the finalize step is a no-op after reboot.
* If `RECEIVE_SMS` is revoked from OS settings while enabled → next receiver
  registration attempt returns denied → `permissionChanged` → autodisable.

## 9. Implementation phases (with acceptance per A-tests)

| Phase | Scope | Accept |
|---|---|---|
| **R1** | Project permission plumbing + `SmsGuardPlugin` (requestPermissions, setRealtimeEnabled, events) + SetupScreen | `adb emu recv` fake SMS → no crash, event console |
| **R2** | `OfflineRules.java` parity port + `Notifier.java` + `PhishGuardStore.java` (quarantine, blocklist) | A2 silent, A4 offline red notification |
| **R3** | Backend `/api/scan-message` + `/api/alerts` + `003_alerts.sql` wired + retention | supertest contract tests, 429 path |
| **R4** | `SmsReceiver.java` full pipeline + GuardApi + banner/deep link + AlertDetail | **A1** end-to-end while app open |
| **R5** | BlockedScreen (restore/unblock/delete) + idempotent replay dedupe + battery docs | **A3, A5** |

### 9.1 Testing without a second phone

`PhishGuardPlugin.simulateSms({ text, sender })` runs the **same**
`SmsPipeline` used by the real receiver (offline rules → `/api/scan-message` →
Gemini → notification → quarantine/blocklist). Protection settings exposes two
buttons ("Send test scam alert", "Send test safe OTP"). This validates every
step except the OS handing the `SMS_RECEIVED` broadcast to the app, which is
confirmed by `adb shell dumpsys package com.phishguard.app` showing the
registered receiver and granted `RECEIVE_SMS`.

## 10. Open items / risks

1. Google Play policy — APK-sideloading for lab (per §8A note), document
   prominently; never claim a Play Store build.
2. `RECEIVE_SMS`+`POST_NOTIFICATIONS` pre-grant matrix on Android 8–14 OEMs.
3. The `senderLabel` for the quarantine UI is a masked form (e.g. "Unknown
   sender (hash 9f2c…)") to avoid accidental PII leaks in screenshots.
4. Text-only Gemini scoring — **implemented** in `/api/scan-message`
   (full message text, one-shot, not stored). The on-device rules remain the
   offline fallback; Gemini Nano/AICore stays a future battery optimisation.
