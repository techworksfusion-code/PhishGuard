package com.phishguard.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * Intercepts inbound SMS in real time (§8A). The actual analysis pipeline
 * lives in {@link SmsPipeline} so the plugin's test simulator can reuse it.
 *
 * <p>Android does not allow a normal app to hide the message from the system
 * Messages app; PhishGuard quarantines its own copy and alerts instead.
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
                SmsPipeline.process(appContext, store, senderLabel, senderHash, body);
            } catch (Exception ignored) {
                // Never crash the SMS pipeline; the system still delivers the SMS.
            } finally {
                pendingResult.finish();
            }
        }).start();
    }
}
