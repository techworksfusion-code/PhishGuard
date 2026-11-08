package com.phishguard.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // IMPORTANT: plugins must be registered BEFORE super.onCreate(),
        // because the Capacitor bridge is created there and only picks up
        // plugins that were added to the bridge builder beforehand.
        registerPlugin(SmsInboxPlugin.class);
        registerPlugin(PhishGuardPlugin.class);
        super.onCreate(savedInstanceState);
        Notifier.ensureChannels(this);
    }
}
