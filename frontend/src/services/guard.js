import { Capacitor, registerPlugin } from '@capacitor/core';

// Typed facade around the native PhishGuardPlugin
// (android/.../PhishGuardPlugin.java). Only exists inside the Android build;
// on the web every call resolves to the "unavailable" state instead.
const PhishGuard = registerPlugin('PhishGuard');

export function isGuardAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function nativeOnly() {
  if (!isGuardAvailable()) {
    throw new Error('Real-time SMS protection is only available in the PhishGuard Android app.');
  }
}

export async function getGuardStatus() {
  nativeOnly();
  const status = await PhishGuard.getStatus();
  return {
    enabled: Boolean(status?.enabled),
    smsPermission: Boolean(status?.smsPermission),
    notifications: Boolean(status?.notifications),
    quarantineCount: Number(status?.quarantineCount || 0),
    blockedCount: Number(status?.blockedCount || 0),
    scannedCount: Number(status?.scannedCount || 0),
  };
}

export async function requestGuardPermissions() {
  nativeOnly();
  return PhishGuard.requestPermissions();
}

export async function setRealtimeEnabled(enabled) {
  nativeOnly();
  const status = await PhishGuard.setRealtimeEnabled({ enabled: Boolean(enabled) });
  return {
    enabled: Boolean(status?.enabled),
    smsPermission: Boolean(status?.smsPermission),
    notifications: Boolean(status?.notifications),
    quarantineCount: Number(status?.quarantineCount || 0),
    blockedCount: Number(status?.blockedCount || 0),
    scannedCount: Number(status?.scannedCount || 0),
  };
}

export async function getQuarantine() {
  nativeOnly();
  const payload = await PhishGuard.getQuarantine();
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function deleteQuarantine(id) {
  nativeOnly();
  return PhishGuard.deleteQuarantine({ id });
}

export async function restoreQuarantine(id) {
  nativeOnly();
  return PhishGuard.restoreQuarantine({ id });
}

export async function unblockSender(senderHash) {
  nativeOnly();
  return PhishGuard.unblockSender({ senderHash });
}

export async function getLastAlert() {
  nativeOnly();
  const payload = await PhishGuard.getLastAlert();
  return payload?.alert && payload.alert.id ? payload.alert : null;
}

export async function clearLastAlert() {
  nativeOnly();
  return PhishGuard.clearLastAlert();
}

export async function syncSessionToken(token) {
  nativeOnly();
  return PhishGuard.syncSessionToken({ token: token || '' });
}

/** Debug helper: send arbitrary text through the live /api/scan-message. */
export async function testScan(text) {
  nativeOnly();
  return PhishGuard.testScan({ text });
}

/** Runs the complete native SMS pipeline with a fake sender/message. */
export async function simulateSms({ text, sender = 'PhishGuard test' }) {
  nativeOnly();
  return PhishGuard.simulateSms({ text, sender });
}
