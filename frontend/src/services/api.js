const API_BASE_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || '';

const TOKEN_KEY = 'phishguard_token';

const verdicts = new Set(['Low risk', 'Suspicious', 'Dangerous']);

function getToken() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

function setToken(token) {
  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('API not configured. Set VITE_API_URL to your PhishGuard backend address.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
      ...options,
      signal: controller.signal,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('The server returned an unreadable response.');
    }

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status}).`);
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeResult(payload) {
  if (!payload || typeof payload !== 'object' || payload.valid !== true) {
    throw new Error('The link-check service returned an invalid response.');
  }

  const score = payload.score;
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error('The link-check service returned an invalid risk score.');
  }

  if (!verdicts.has(payload.verdict) || typeof payload.host !== 'string' || !payload.host.trim()) {
    throw new Error('The link-check service returned incomplete analysis data.');
  }
  const expectedVerdict = score >= 60 ? 'Dangerous' : score >= 30 ? 'Suspicious' : 'Low risk';
  if (payload.verdict !== expectedVerdict) {
    throw new Error('The link-check service returned inconsistent risk data.');
  }

  if (!Array.isArray(payload.signals)) {
    throw new Error('The link-check service returned incomplete analysis data.');
  }
  const signals = payload.signals.map((signal) => {
    const title = signal?.name || signal?.title;
    if (!signal || !Number.isFinite(signal.points) || signal.points < 0 || signal.points > 100 || typeof title !== 'string' || typeof signal.detail !== 'string') {
      throw new Error('The link-check service returned an invalid detection signal.');
    }
    return { points: signal.points, title, detail: signal.detail };
  });

  return {
    valid: true,
    host: payload.host,
    score,
    verdict: payload.verdict,
    signals,
    ai: payload.ai === 'ok' ? 'ok' : 'unavailable',
  };
}

export async function checkLink(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Paste a link to get started.');
  }
  if (url.length > 2000) {
    throw new Error('That link is too long. Try a shorter URL.');
  }

  const payload = await apiRequest('/api/check-link', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

  return normalizeResult(payload);
}

// ---------- Auth ----------

export async function register({ name, email, phone, password }) {
  const payload = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, phone, password }),
  });
  return payload; // { requiresOtp: true, destination, channel }
}

export async function requestOtp({ destination, purpose = 'register' }) {
  const payload = await apiRequest('/api/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ destination, purpose }),
  });
  return payload; // { sent: true, channel, destination }
}

export async function verifyOtp({ destination, code, purpose = 'register', name, email, phone, password }) {
  const payload = await apiRequest('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ destination, code, purpose, name, email, phone, password }),
  });
  if (payload.token) {
    setToken(payload.token);
  }
  return payload; // { token, account }
}

export async function login({ email, phone, password }) {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, phone, password }),
  });
  if (payload.token) {
    setToken(payload.token);
  }
  return payload; // { token, account } or { requiresOtp: true, destination, channel }
}

export async function getSession() {
  return apiRequest('/api/auth/session', { method: 'GET' });
}

export async function logout() {
  try {
    await apiRequest('/api/auth/session', { method: 'DELETE' });
  } catch {
    // Ignore errors on logout
  }
  setToken(null);
}

export function isAuthenticated() {
  return !!getToken();
}

export const isDemoMode = false;
