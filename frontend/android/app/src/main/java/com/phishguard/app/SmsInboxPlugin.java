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

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/**
 * SmsInboxPlugin — reads the device SMS inbox for display inside
 * PhishGuard's Messages tab. Message bodies stay ON THE DEVICE: this
 * plugin only reads; it never uploads SMS content anywhere.
 */
@CapacitorPlugin(name = "SmsInbox", permissions = {
    @Permission(strings = { Manifest.permission.READ_SMS }, alias = "readSms")
})
public class SmsInboxPlugin extends Plugin {

    private static final String READ_SMS_ALIAS = "readSms";

    @PluginMethod
    public void list(final PluginCall call) {
        if (getPermissionState(READ_SMS_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(READ_SMS_ALIAS, call, "readSmsPermissionCallback");
            return;
        }
        loadInbox(call);
    }

    @PermissionCallback
    private void readSmsPermissionCallback(PluginCall call) {
        if (getPermissionState(READ_SMS_ALIAS) == PermissionState.GRANTED) {
            loadInbox(call);
        } else {
            call.reject("READ_SMS permission was denied.", "PERMISSION_DENIED");
        }
    }

    private void loadInbox(final PluginCall call) {
        final int limit = call.getInt("limit", 200);

        // Querying content providers on the main thread freezes the UI — offload it.
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    List<JSObject> rows = readMessages(limit);
                    JSArray messages = new JSArray();
                    for (JSObject row : rows) {
                        messages.put(row);
                    }
                    JSObject result = new JSObject();
                    result.put("messages", messages);
                    call.resolve(result);
                } catch (Exception e) {
                    call.reject("Could not read the SMS inbox: " + e.getMessage(), "READ_ERROR");
                }
            }
        }).start();
    }

    private List<JSObject> readMessages(int limit) {
        List<JSObject> rows = new ArrayList<JSObject>();
        ContentResolver resolver = getContext().getContentResolver();

        String[] projection = {
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.READ
        };

        Cursor cursor = resolver.query(
            Telephony.Sms.CONTENT_URI,
            projection,
            null,
            null,
            Telephony.Sms.DATE + " DESC LIMIT " + Math.max(1, limit)
        );

        if (cursor == null) {
            return rows;
        }

        try {
            while (cursor.moveToNext() && rows.size() < limit) {
                int dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE);
                int readIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.READ);
                JSObject row = new JSObject();
                row.put("id", cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms._ID)));
                row.put("sender", orPlaceholder(cursor, cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)));
                row.put("body", safeString(cursor, cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)));
                row.put("date", cursor.getLong(dateIndex));
                row.put("read", cursor.getInt(readIndex) == 1);
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
}
