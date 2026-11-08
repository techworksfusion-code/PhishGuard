import { Capacitor, registerPlugin } from '@capacitor/core';

// Typed facade around the native SmsInboxPlugin (see
// android/.../SmsInboxPlugin.java). The plugin is only present inside
// the Capacitor Android build — on web every call is unavailable and
// the caller falls back to an explanatory empty state.

const SmsInbox = registerPlugin('SmsInbox');

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/** Fetch the device SMS inbox, newest first (max 200 by default). */
export async function fetchInboxMessages({ limit = 200 } = {}) {
  if (!isNativePlatform()) {
    throw new Error('SMS inbox is only available in the PhishGuard Android app.');
  }
  const { messages } = await SmsInbox.list({ limit });
  return Array.isArray(messages) ? messages : [];
}
