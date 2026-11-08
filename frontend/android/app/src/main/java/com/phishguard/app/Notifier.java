package com.phishguard.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/** Alert notifications for real-time SMS protection (§8A level 1). */
public final class Notifier {

    public static final String CHANNEL_ALERTS = "phishguard_alerts";
    public static final String CHANNEL_INFO = "phishguard_info";
    public static final String EXTRA_ALERT = "phishguard_alert";

    private Notifier() {
    }

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel alerts = new NotificationChannel(
                CHANNEL_ALERTS, "Scam alerts", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Dangerous or suspicious SMS detected by PhishGuard");
        alerts.enableVibration(true);
        manager.createNotificationChannel(alerts);

        NotificationChannel info = new NotificationChannel(
                CHANNEL_INFO, "Protection status", NotificationManager.IMPORTANCE_DEFAULT);
        info.setDescription("Real-time protection status changes");
        manager.createNotificationChannel(info);
    }

    public static void alert(Context context, JSONObject alert) {
        if (alert == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ensureChannels(context);

        String verdict = alert.optString("verdict", "Suspicious");
        boolean dangerous = "Dangerous".equals(verdict);
        int score = alert.optInt("score", 0);
        long id = alert.optLong("id", System.currentTimeMillis());
        int notificationId = (int) (id & 0x7fffffff);

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(EXTRA_ALERT, alert.toString());
        PendingIntent pending = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String sender = alert.optString("sender", "Unknown sender");
        String bigText = dangerous
                ? "Sender: " + sender + "\nQuarantined in PhishGuard. Score " + score + "/100. Tap to review or unblock."
                : "Sender: " + sender + "\nLooks suspicious (" + score + "/100). Tap to review the analysis.";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, dangerous ? CHANNEL_ALERTS : CHANNEL_INFO)
                .setSmallIcon(R.drawable.ic_shield_alert)
                .setContentTitle(dangerous ? "Scam message blocked" : "Suspicious message detected")
                .setContentText(dangerous
                        ? "A dangerous SMS was quarantined (" + score + "/100)."
                        : "A message looks suspicious (" + score + "/100).")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(bigText))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(pending);

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked between the check and notify().
        }
    }

    public static void cancel(Context context, long id) {
        try {
            NotificationManagerCompat.from(context).cancel((int) (id & 0x7fffffff));
        } catch (SecurityException ignored) {
            // Nothing to cancel without notification permission.
        }
    }
}
