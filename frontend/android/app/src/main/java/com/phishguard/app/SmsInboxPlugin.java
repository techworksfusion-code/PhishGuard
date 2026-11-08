package com.phishguard.app;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.Telephony;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

/**
 * SmsInboxPlugin — reads the device SMS inbox for display inside
 * PhishGuard's Messages tab. Message bodies stay ON THE DEVICE: this
 * plugin only reads; it never uploads SMS content anywhere.
 *
 * <p>All {@link PluginCall} resolve/reject calls are marshalled back to
 * the main UI thread because Capacitor expects plugin results on the
 * thread that received the call.
 */
@CapacitorPlugin(name = "SmsInbox", permissions = {
    @Permission(strings = { Manifest.permission.READ_SMS }, alias = "readSms")
})
public class SmsInboxPlugin extends Plugin {

    private static final String READ_SMS_ALIAS = "readSms";

    @PluginMethod
    public void list(final PluginCall call) {
        if (call == null) {
            return;
        }

        if (getContext() == null) {
            runOnUi(() -> call.reject("The Android context is not available.", "CONTEXT_UNAVAILABLE"));
            return;
        }

        if (getPermissionState(READ_SMS_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(READ_SMS_ALIAS, call, "readSmsPermissionCallback");
            return;
        }
        loadInbox(call);
    }

    @PermissionCallback
    private void readSmsPermissionCallback(PluginCall call) {
        if (call == null) {
            return;
        }
        if (getPermissionState(READ_SMS_ALIAS) == PermissionState.GRANTED) {
            loadInbox(call);
        } else {
            runOnUi(() -> call.reject("READ_SMS permission was denied.", "PERMISSION_DENIED"));
        }
    }

    private void loadInbox(final PluginCall call) {
        if (call == null || getContext() == null) {
            return;
        }

        final int limit = Math.max(1, Math.min(500, call.getInt("limit", 200)));

        // Content provider queries must not block the main thread.
        new Thread(() -> {
            try {
                List<JSObject> rows = readMessages(limit);
                JSArray messages = new JSArray();
                for (JSObject row : rows) {
                    messages.put(row);
                }
                JSObject result = new JSObject();
                result.put("messages", messages);
                runOnUi(() -> call.resolve(result));
            } catch (Exception e) {
                runOnUi(() -> call.reject("Could not read the SMS inbox: " + e.getMessage(), "READ_ERROR"));
            }
        }).start();
    }

    private List<JSObject> readMessages(int limit) {
        List<JSObject> rows = new ArrayList<>();
        if (getContext() == null) {
            return rows;
        }

        ContentResolver resolver = getContext().getContentResolver();
        if (resolver == null) {
            return rows;
        }

        String[] projection = {
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.READ
        };

        String orderBy = Telephony.Sms.DATE + " DESC LIMIT " + limit;
        Cursor cursor = resolver.query(
            Telephony.Sms.CONTENT_URI,
            projection,
            null,
            null,
            orderBy
        );

        if (cursor == null) {
            return rows;
        }

        try {
            int idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID);
            int addrIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS);
            int bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY);
            int dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE);
            int readIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.READ);

            while (cursor.moveToNext() && rows.size() < limit) {
                JSObject row = new JSObject();
                row.put("id", safeString(cursor, idIdx));
                row.put("sender", orPlaceholder(cursor, addrIdx));
                row.put("body", safeString(cursor, bodyIdx));
                row.put("date", cursor.getLong(dateIdx));
                row.put("read", cursor.getInt(readIdx) == 1);
                rows.add(row);
            }
        } finally {
            cursor.close();
        }
        return rows;
    }

    private String safeString(Cursor cursor, int index) {
        if (cursor.isNull(index)) {
            return "";
        }
        return cursor.getString(index);
    }

    private String orPlaceholder(Cursor cursor, int index) {
        String value = safeString(cursor, index);
        if (value == null || value.trim().isEmpty()) {
            return "Unknown sender";
        }
        return value;
    }

    /** Marshals a runnable onto the main UI thread so Capacitor call results are delivered safely. */
    private void runOnUi(Runnable action) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(action);
        } else {
            action.run();
        }
    }
}
