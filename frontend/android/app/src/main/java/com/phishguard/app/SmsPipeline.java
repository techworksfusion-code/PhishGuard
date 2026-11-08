package com.phishguard.app;

import android.content.Context;

import org.json.JSONObject;

/**
 * The shared real-time SMS pipeline. Used by {@link SmsReceiver} for genuine
 * inbound broadcasts and by the plugin's debug simulator, so a test exercises
 * exactly the same code path (offline rules → backend/Gemini → notify →
 * quarantine/blocklist).
 */
public final class SmsPipeline {

    private SmsPipeline() {
    }

    /**
     * @return the alert JSON when a notification/quarantine was produced,
     *         or {@code null} for a silent low-risk message.
     */
    public static JSONObject process(Context context, PhishGuardStore store, String sender,
                                     String senderHash, String body) throws Exception {
        final long id = System.currentTimeMillis();
        final boolean alreadyBlocked = store.isBlocked(senderHash);
        final OfflineRules.Result local = OfflineRules.evaluate(body);

        store.incrementScannedCount();

        JSONObject alert = buildAlert(id, sender, senderHash, body, local);

        if (alreadyBlocked) {
            alert.put("score", Math.max(local.score, 100));
            alert.put("verdict", "Dangerous");
            alert.put("reason", "blocked_sender");
            store.addQuarantine(alert);
            store.setLastAlert(alert);
            Notifier.alert(context, alert);
            return alert;
        }

        final boolean localDangerous = local.score >= 60;
        final boolean localSuspicious = local.score >= 30 && !localDangerous;

        if (localDangerous) {
            // Instant protection while the network call is in flight.
            alert.put("source", "local");
            store.addQuarantine(alert);
            store.setLastAlert(alert);
            Notifier.alert(context, alert);
        } else if (localSuspicious) {
            alert.put("source", "local");
            store.setLastAlert(alert);
            Notifier.alert(context, alert);
        }

        GuardApi.Result remote = GuardApi.scanSync(context, body, senderHash);

        if (remote.failed()) {
            // Offline: honour the on-device verdict and block dangerous senders.
            if (localDangerous) {
                store.blockSender(senderHash);
                alert.put("ai", "unavailable");
                store.upsertQuarantine(alert);
                store.setLastAlert(alert);
                return alert;
            }
            return (localSuspicious) ? alert : null;
        }

        alert.put("score", remote.score);
        alert.put("verdict", remote.verdict);
        alert.put("ai", remote.ai);
        alert.put("source", "server");

        if (remote.dangerous()) {
            store.blockSender(senderHash);
            store.upsertQuarantine(alert);
            store.setLastAlert(alert);
            Notifier.alert(context, alert);
            return alert;
        }

        if (remote.suspicious()) {
            // Suspicious messages are alerted but never quarantined (§1.2).
            store.removeQuarantine(id);
            store.setLastAlert(alert);
            Notifier.alert(context, alert);
            return alert;
        }

        // Low risk: undo an on-device false positive.
        if (local.score >= 30) {
            store.removeQuarantine(id);
            store.unblockSender(senderHash);
            store.clearLastAlert();
            Notifier.cancel(context, id);
        }
        return null;
    }

    private static JSONObject buildAlert(long id, String sender, String senderHash,
                                         String body, OfflineRules.Result local) throws Exception {
        JSONObject alert = new JSONObject();
        alert.put("id", id);
        alert.put("sender", sender);
        alert.put("senderHash", senderHash);
        alert.put("body", body);
        alert.put("score", local.score);
        alert.put("verdict", local.verdict);
        alert.put("localVerdict", local.verdict);
        alert.put("ai", "unavailable");
        alert.put("linkCount", local.links.size());
        alert.put("createdAt", id);
        return alert;
    }
}
