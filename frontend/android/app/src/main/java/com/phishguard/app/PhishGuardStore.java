package com.phishguard.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * On-device persistence for real-time protection (§8A).
 *
 * <p>Everything here stays on the phone: quarantine bodies, blocked sender
 * hashes and the per-install salt. The server only ever receives
 * sha256(deviceSalt + sender) and the message text for a one-shot scan.
 */
public class PhishGuardStore {

    private static final String PREFS = "phishguard_guard";
    private static final String KEY_ENABLED = "realtime_enabled";
    private static final String KEY_SALT = "device_salt";
    private static final String KEY_BLOCKED = "blocked_senders";
    private static final String KEY_QUARANTINE = "quarantine";
    private static final String KEY_LAST_ALERT = "last_alert";
    private static final String KEY_TOKEN = "session_token";
    private static final String KEY_BASE_URL = "base_url";

    private static final String DEFAULT_BASE_URL = "https://guard.fusiontechworks.in";
    private static final int MAX_QUARANTINE = 100;

    private final SharedPreferences prefs;

    public PhishGuardStore(Context context) {
        Context app = context.getApplicationContext();
        this.prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- settings

    public boolean isRealtimeEnabled() {
        return prefs.getBoolean(KEY_ENABLED, false);
    }

    public void setRealtimeEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    public String getBaseUrl() {
        String value = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        return value == null || value.isEmpty() ? DEFAULT_BASE_URL : value;
    }

    public void setBaseUrl(String baseUrl) {
        prefs.edit().putString(KEY_BASE_URL, baseUrl == null ? DEFAULT_BASE_URL : baseUrl).apply();
    }

    public String getSessionToken() {
        return prefs.getString(KEY_TOKEN, "");
    }

    public void setSessionToken(String token) {
        prefs.edit().putString(KEY_TOKEN, token == null ? "" : token).apply();
    }

    // ------------------------------------------------------------ sender hash

    public synchronized String deviceSalt() {
        String salt = prefs.getString(KEY_SALT, null);
        if (salt == null || salt.isEmpty()) {
            salt = UUID.randomUUID().toString().replace("-", "")
                    + UUID.randomUUID().toString().replace("-", "");
            prefs.edit().putString(KEY_SALT, salt).apply();
        }
        return salt;
    }

    /**
     * Salted sender digest. Unsalted hashes of phone numbers are trivially
     * reversible, so the per-install salt never leaves the device.
     */
    public String hashSender(String sender) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(deviceSalt().getBytes(StandardCharsets.UTF_8));
            digest.update((byte) ':');
            digest.update((sender == null ? "" : sender).getBytes(StandardCharsets.UTF_8));
            return toHex(digest.digest());
        } catch (Exception e) {
            return "";
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    // --------------------------------------------------------------- blocklist

    public synchronized boolean isBlocked(String senderHash) {
        if (senderHash == null) return false;
        return copyBlocked().contains(senderHash);
    }

    public synchronized void blockSender(String senderHash) {
        if (senderHash == null || senderHash.isEmpty()) return;
        Set<String> blocked = copyBlocked();
        blocked.add(senderHash);
        prefs.edit().putStringSet(KEY_BLOCKED, blocked).apply();
    }

    public synchronized void unblockSender(String senderHash) {
        if (senderHash == null) return;
        Set<String> blocked = copyBlocked();
        blocked.remove(senderHash);
        prefs.edit().putStringSet(KEY_BLOCKED, blocked).apply();
    }

    public synchronized Set<String> blockedSenders() {
        return copyBlocked();
    }

    private Set<String> copyBlocked() {
        Set<String> stored = prefs.getStringSet(KEY_BLOCKED, Collections.<String>emptySet());
        return new HashSet<>(stored);
    }

    // -------------------------------------------------------------- quarantine

    public synchronized JSONArray quarantine() {
        String raw = prefs.getString(KEY_QUARANTINE, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public synchronized void addQuarantine(JSONObject entry) {
        if (entry == null) return;
        JSONArray current = quarantine();
        JSONArray next = new JSONArray();
        next.put(entry);
        for (int i = 0; i < current.length() && next.length() < MAX_QUARANTINE; i++) {
            JSONObject item = current.optJSONObject(i);
            if (item != null && item.optLong("id") != entry.optLong("id")) {
                next.put(item);
            }
        }
        saveQuarantine(next);
    }

    public synchronized void upsertQuarantine(JSONObject entry) {
        if (entry == null) return;
        JSONArray current = quarantine();
        JSONArray next = new JSONArray();
        boolean replaced = false;
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item == null) continue;
            if (item.optLong("id") == entry.optLong("id")) {
                next.put(entry);
                replaced = true;
            } else {
                next.put(item);
            }
        }
        if (!replaced) {
            next.put(entry);
        }
        saveQuarantine(trim(next));
    }

    public synchronized void removeQuarantine(long id) {
        JSONArray current = quarantine();
        JSONArray next = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item != null && item.optLong("id") != id) {
                next.put(item);
            }
        }
        saveQuarantine(next);
    }

    public synchronized JSONObject findQuarantine(long id) {
        JSONArray current = quarantine();
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item != null && item.optLong("id") == id) {
                return item;
            }
        }
        return null;
    }

    private JSONArray trim(JSONArray array) {
        JSONArray next = new JSONArray();
        for (int i = 0; i < array.length() && next.length() < MAX_QUARANTINE; i++) {
            JSONObject item = array.optJSONObject(i);
            if (item != null) next.put(item);
        }
        return next;
    }

    private void saveQuarantine(JSONArray array) {
        prefs.edit().putString(KEY_QUARANTINE, array.toString()).apply();
    }

    // --------------------------------------------------------------- last alert

    public synchronized JSONObject getLastAlert() {
        String raw = prefs.getString(KEY_LAST_ALERT, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    public synchronized void setLastAlert(JSONObject alert) {
        prefs.edit().putString(KEY_LAST_ALERT, alert == null ? "" : alert.toString()).apply();
    }

    public synchronized int getScannedCount() {
        return prefs.getInt("scanned_count", 0);
    }

    public synchronized void incrementScannedCount() {
        prefs.edit().putInt("scanned_count", getScannedCount() + 1).apply();
    }

    public synchronized void clearLastAlert() {
        prefs.edit().remove(KEY_LAST_ALERT).apply();
    }

    // ------------------------------------------------------------------- reset

    public synchronized void clearAll() {
        prefs.edit().clear().apply();
    }

    /**
     * Guards against duplicate delivery of the same SMS (some OEMs emit the
     * broadcast twice). Returns false when the same signature was seen in the
     * last 15 seconds.
     */
    public synchronized boolean markProcessed(String signature) {
        long now = System.currentTimeMillis();
        String last = prefs.getString("last_signature", "");
        long at = prefs.getLong("last_signature_at", 0L);
        if (signature != null && signature.equals(last) && now - at < 15_000L) {
            return false;
        }
        prefs.edit()
                .putString("last_signature", signature == null ? "" : signature)
                .putLong("last_signature_at", now)
                .apply();
        return true;
    }
}
