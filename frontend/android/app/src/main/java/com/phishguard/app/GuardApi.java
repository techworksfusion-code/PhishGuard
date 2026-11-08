package com.phishguard.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The only network call made by the background SMS pipeline.
 * Sends the message text for a one-shot scan together with the salted sender
 * hash. Nothing is cached or written to disk here.
 */
public final class GuardApi {

    public static class Result {
        public final int score;
        public final int ruleScore;
        public final int aiScore; // -1 when the AI check was unavailable
        public final String verdict;
        public final String ai;
        public final JSONArray signals;
        public final JSONArray links;
        public final String error;

        private Result(int score, int ruleScore, int aiScore, String verdict, String ai,
                       JSONArray signals, JSONArray links, String error) {
            this.score = score;
            this.ruleScore = ruleScore;
            this.aiScore = aiScore;
            this.verdict = verdict;
            this.ai = ai;
            this.signals = signals;
            this.links = links;
            this.error = error;
        }

        static Result ok(int score, int ruleScore, int aiScore, String verdict, String ai,
                         JSONArray signals, JSONArray links) {
            return new Result(score, ruleScore, aiScore, verdict, ai, signals, links, null);
        }

        static Result error(String message) {
            return new Result(0, -1, -1, "Low risk", "unavailable",
                    new JSONArray(), new JSONArray(), message);
        }

        public boolean failed() {
            return error != null;
        }

        public boolean dangerous() {
            return "Dangerous".equals(verdict);
        }

        public boolean suspicious() {
            return "Suspicious".equals(verdict);
        }

        public boolean lowRisk() {
            return !failed() && "Low risk".equals(verdict);
        }
    }

    private GuardApi() {
    }

    public static Result scanSync(Context context, String text, String senderHash) {
        PhishGuardStore store = new PhishGuardStore(context);
        HttpURLConnection connection = null;

        try {
            URL url = new URL(store.getBaseUrl() + "/api/scan-message");
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");

            String token = store.getSessionToken();
            if (token != null && !token.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }

            JSONObject payload = new JSONObject();
            payload.put("text", text.length() > 4000 ? text.substring(0, 4000) : text);
            if (senderHash != null && !senderHash.isEmpty()) {
                payload.put("senderHash", senderHash);
            }

            OutputStream out = connection.getOutputStream();
            out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            out.close();

            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String body = readAll(stream);

            if (code != HttpURLConnection.HTTP_OK) {
                return Result.error("HTTP " + code);
            }

            JSONObject json = new JSONObject(body);
            JSONArray signals = json.optJSONArray("signals");
            JSONArray links = json.optJSONArray("links");
            int aiScore = (json.has("aiScore") && !json.isNull("aiScore")) ? json.optInt("aiScore", -1) : -1;
            return Result.ok(
                    json.optInt("score", 0),
                    json.optInt("ruleScore", -1),
                    aiScore,
                    json.optString("verdict", "Low risk"),
                    json.optString("ai", "unavailable"),
                    signals == null ? new JSONArray() : signals,
                    links == null ? new JSONArray() : links
            );
        } catch (Exception e) {
            return Result.error(e.getClass().getSimpleName());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int read;
        while ((read = stream.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        stream.close();
        return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    }
}
