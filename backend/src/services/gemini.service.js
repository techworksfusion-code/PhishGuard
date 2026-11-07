'use strict';

const GEMINI_TIMEOUT = 5000;

async function analyzeWithGemini(url) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return { status: 'unavailable', score: 0, signals: [] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Analyze this URL for phishing/scam risk: ' + url + '. Respond with JSON only.' }] }],
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return { status: 'unavailable', score: 0, signals: [] };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { status: 'unavailable', score: 0, signals: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      status: 'ok',
      score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    };
  } catch {
    return { status: 'unavailable', score: 0, signals: [] };
  }
}

module.exports = { analyzeWithGemini };
