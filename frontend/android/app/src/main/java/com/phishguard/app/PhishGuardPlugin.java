package com.phishguard.app;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/** JS bridge for real-time SMS protection (§8A). */
@CapacitorPlugin(name = "PhishGuard", permissions = {
        @Permission(strings = { Manifest.permission.RECEIVE_SMS }, alias = "sms"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
})
public class PhishGuardPlugin extends Plugin {

    private static final String ALIAS_SMS = "sms";
    private static final String ALIAS_NOTIFICATIONS = "notifications";

    private PhishGuardStore store() {
        return new PhishGuardStore(getContext());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        resolveStatus(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState(ALIAS_SMS) != PermissionState.GRANTED) {
            requestPermissionForAlias(ALIAS_SMS, call, "smsPermissionCallback");
            return;
        }
        requestNotificationsIfNeeded(call);
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        if (getPermissionState(ALIAS_SMS) != PermissionState.GRANTED) {
            runOnUi(() -> call.reject("RECEIVE_SMS permission was denied.", "PERMISSION_DENIED"));
            return;
        }
        requestNotificationsIfNeeded(call);
    }

    private void requestNotificationsIfNeeded(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState(ALIAS_NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(ALIAS_NOTIFICATIONS, call, "notificationsPermissionCallback");
            return;
        }
        resolveStatus(call);
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        // Alerts still work without notification permission; the UI shows the banner.
        resolveStatus(call);
    }

    @PluginMethod
    public void setRealtimeEnabled(PluginCall call) {
        boolean enabled = call.getData().optBoolean("enabled", false);
        if (enabled && getPermissionState(ALIAS_SMS) != PermissionState.GRANTED) {
            requestPermissionForAlias(ALIAS_SMS, call, "enablePermissionCallback");
            return;
        }
        store().setRealtimeEnabled(enabled);
        resolveStatus(call);
    }

    @PermissionCallback
    private void enablePermissionCallback(PluginCall call) {
        if (getPermissionState(ALIAS_SMS) == PermissionState.GRANTED) {
            store().setRealtimeEnabled(true);
        }
        resolveStatus(call);
    }

    @PluginMethod
    public void getQuarantine(PluginCall call) {
        JSONArray rows = store().quarantine();
        JSArray items = new JSArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null) items.put(row);
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    @PluginMethod
    public void deleteQuarantine(PluginCall call) {
        long id = call.getData().optLong("id", -1L);
        store().removeQuarantine(id);
        call.resolve();
    }

    @PluginMethod
    public void restoreQuarantine(PluginCall call) {
        long id = call.getData().optLong("id", -1L);
        PhishGuardStore store = store();
        JSONObject item = store.findQuarantine(id);
        if (item != null) {
            store.unblockSender(item.optString("senderHash", ""));
        }
        store.removeQuarantine(id);
        call.resolve();
    }

    @PluginMethod
    public void unblockSender(PluginCall call) {
        store().unblockSender(call.getData().optString("senderHash", ""));
        call.resolve();
    }

    @PluginMethod
    public void getLastAlert(PluginCall call) {
        JSObject result = new JSObject();
        JSONObject alert = store().getLastAlert();
        result.put("alert", alert == null ? JSONObject.NULL : alert);
        call.resolve(result);
    }

    @PluginMethod
    public void clearLastAlert(PluginCall call) {
        store().clearLastAlert();
        call.resolve();
    }

    @PluginMethod
    public void syncSessionToken(PluginCall call) {
        store().setSessionToken(call.getData().optString("token", ""));
        call.resolve();
    }

    @PluginMethod
    public void setBaseUrl(PluginCall call) {
        store().setBaseUrl(call.getData().optString("url", ""));
        call.resolve();
    }

    /** Development helper: run a message through the live scan endpoint. */
    @PluginMethod
    public void testScan(PluginCall call) {
        final String text = call.getData().optString("text", "");
        if (text.trim().isEmpty()) {
            call.reject("Message text is required.");
            return;
        }
        final PhishGuardStore store = store();
        new Thread(() -> {
            GuardApi.Result result = GuardApi.scanSync(getContext(), text, store.hashSender("TEST-SENDER"));
            JSObject response = new JSObject();
            response.put("score", result.score);
            response.put("verdict", result.verdict);
            response.put("ai", result.ai);
            response.put("error", result.error == null ? JSONObject.NULL : result.error);
            runOnUi(() -> call.resolve(response));
        }).start();
    }

    /**
     * Simulates an incoming SMS through the complete native pipeline.
     * Lets the app be demonstrated/tested without a second phone.
     */
    @PluginMethod
    public void simulateSms(PluginCall call) {
        final String text = call.getData().optString("text", "");
        final String sender = call.getData().optString("sender", "PhishGuard test");
        if (text.trim().isEmpty()) {
            call.reject("Message text is required.");
            return;
        }

        final PhishGuardStore store = store();
        new Thread(() -> {
            try {
                JSONObject alert = SmsPipeline.process(
                        getContext(), store, sender, store.hashSender(sender), text);
                JSObject response = new JSObject();
                response.put("alert", alert == null ? JSONObject.NULL : alert);
                response.put("safe", alert == null);
                runOnUi(() -> call.resolve(response));
            } catch (Exception e) {
                runOnUi(() -> call.reject("Simulation failed."));
            }
        }).start();
    }

    @PluginMethod
    public void clearProtectionData(PluginCall call) {
        PhishGuardStore store = store();
        boolean enabled = store.isRealtimeEnabled();
        String token = store.getSessionToken();
        store.clearAll();
        store.setRealtimeEnabled(enabled);
        store.setSessionToken(token);
        call.resolve();
    }

    private void resolveStatus(PluginCall call) {
        PhishGuardStore store = store();
        boolean smsGranted = getPermissionState(ALIAS_SMS) == PermissionState.GRANTED;
        boolean notificationsGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState(ALIAS_NOTIFICATIONS) == PermissionState.GRANTED;

        JSObject result = new JSObject();
        result.put("enabled", store.isRealtimeEnabled());
        result.put("smsPermission", smsGranted);
        result.put("notifications", notificationsGranted);
        result.put("quarantineCount", store.quarantine().length());
        result.put("blockedCount", store.blockedSenders().size());
        result.put("scannedCount", store.getScannedCount());
        call.resolve(result);
    }

    private void runOnUi(Runnable action) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(action);
        } else {
            action.run();
        }
    }
}
