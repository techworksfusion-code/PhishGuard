'use strict';

// Gemini link analysis. The daily budget is enforced *before* the network
// call so an exhausted key/quota simply falls back to the rule engine.
// See BACKEND_DESIGN.md §M6 (Gemini cost guard).

const config = require('../config');
const { reserveGeminiCall } = require('./geminiUsage.service');

const GEMINI_TIMEOUT = 5000;

function unavailable(reason) {
  return { status: 'unavailable', score: 0, signals: [], reason };
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function normalizeSignals(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((signal) => signal && typeof signal === 'object')
    .map((signal) => ({
      name: String(signal.name || 'AI check').slice(0, 120),
      points: clampScore(signal.points),
      detail: String(signal.detail || '').slice(0, 300),
    }));
}

async function analyzeWithGemini(url) {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here') {
    return unavailable('disabled');
  }

  const reservation = reserveGeminiCall({ max: config.geminiDailyMax });
  if (!reservation.allowed) {
    console.warn(
      `[gemini] daily cap reached (${reservation.calls}/${reservation.max}); falling back to rules`
    );
    return unavailable('daily_cap');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${config.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text:
                'Analyze this URL for phishing/scam risk: ' + url + '. ' +
                'Respond with JSON only, shaped like ' +
                '{"score": <0-100>, "signals": [{"name": "...", "points": <0-100>, "detail": "..."}]}.'
            }]
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return unavailable('http_error');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return unavailable('bad_response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      status: 'ok',
      score: clampScore(parsed.score),
      signals: normalizeSignals(parsed.signals),
    };
  } catch {
    return unavailable('request_failed');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { analyzeWithGemini, unavailable };
