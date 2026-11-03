const API_BASE_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

const verdicts = new Set(['Low risk', 'Suspicious', 'Dangerous']);

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
  if (!API_BASE_URL) {
    throw new Error('Link checking is not configured. Set VITE_API_URL to your PhishGuard API address.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/check-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('The link-check service returned an unreadable response.');
    }

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to check this link right now.');
    }

    return normalizeResult(payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The link check took too long. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const isDemoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false';
