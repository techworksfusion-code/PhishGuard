package com.phishguard.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Local native plugins must be registered explicitly.
        registerPlugin(SmsInboxPlugin.class);
    }
}
