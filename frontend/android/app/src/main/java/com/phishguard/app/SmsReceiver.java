package com.phishguard.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONObject;

/**
 * Intercepts inbound SMS in real time (§8A).
 *
 * <p>Flow: on-device rules give an instant verdict, then the message text is
 * sent to /api/scan-message for the merged rule + Gemini score. Dangerous
 * messages are quarantined inside PhishGuard, the sender is blocklisted and
 * a high-priority notification is shown. Android does not allow a normal app
 * to hide the message from the system Messages app.
 */
public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        final PhishGuardStore store = new PhishGuardStore(context);
        if (!store.isRealtimeEnabled()) {
            return;
        }

        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) {
            return;
        }

        StringBuilder bodyBuilder = new StringBuilder();
        String sender = null;
        for (SmsMessage part : parts) {
            if (part == null) continue;
            String chunk = part.getMessageBody();
            if (chunk != null) bodyBuilder.append(chunk);
            if (sender == null || sender.trim().isEmpty()) {
                sender = part.getOriginatingAddress();
            }
        }

        final String body = bodyBuilder.toString().trim();
        if (body.isEmpty()) {
            return;
        }

        final String senderLabel = (sender == null || sender.trim().isEmpty())
                ? "Unknown sender"
                : sender;
        final String senderHash = store.hashSender(senderLabel);

        if (!store.markProcessed(senderHash + ":" + body.hashCode())) {
            return;
        }

        final Context appContext = context.getApplicationContext();
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                process(appContext, store, senderLabel, senderHash, body);
            } catch (Exception ignored) {
                // Never crash the SMS pipeline; the system still delivers the SMS.
            } finally {
                pendingResult.finish();
            }
        }).start();
    }

    private void process(Context context, PhishGuardStore store, String sender,
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
            return;
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
            }
            return;
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
        } else if (remote.suspicious()) {
            // Suspicious messages are alerted but never quarantined (§1.2).
            store.removeQuarantine(id);
            store.setLastAlert(alert);
            Notifier.alert(context, alert);
        } else if (local.score >= 30) {
            // Server says low risk: undo the on-device false positive.
            store.removeQuarantine(id);
            store.unblockSender(senderHash);
            store.clearLastAlert();
            Notifier.cancel(context, id);
        }
    }

    private JSONObject buildAlert(long id, String sender, String senderHash,
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
