package com.phishguard.app;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fast on-device rules so an incoming SMS gets a verdict in milliseconds even
 * with no network. The server reruns the same logic and merges Gemini's score;
 * this class is intentionally a compact mirror (§8A).
 */
public final class OfflineRules {

    public static class Result {
        public final int score;
        public final String verdict;
        public final List<String> links;

        Result(int score, String verdict, List<String> links) {
            this.score = score;
            this.verdict = verdict;
            this.links = links;
        }
    }

    private static final String[] KEYWORDS = {
            "free-recharge", "win-lottery", "lucky-draw", "claim-prize", "kyc-update",
            "kyc-verify", "verify-account", "refund", "free-gift", "cashback-offer"
    };

    private static final String[] SUSPICIOUS_TLDS = {
            "xyz", "top", "tk", "click", "icu", "buzz", "gq", "ml", "cf", "work"
    };

    private static final String[] SHORTENERS = {
            "bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "is.gd", "t.co", "goo.gl"
    };

    private static final Map<String, String[]> BRANDS = new LinkedHashMap<>();
    static {
        BRANDS.put("sbi", new String[]{"sbi.co.in", "onlinesbi.sbi"});
        BRANDS.put("paytm", new String[]{"paytm.com"});
        BRANDS.put("amazon", new String[]{"amazon.in", "amazon.com"});
        BRANDS.put("jio", new String[]{"jio.com"});
        BRANDS.put("hdfc", new String[]{"hdfcbank.com"});
        BRANDS.put("phonepe", new String[]{"phonepe.com"});
    }

    private static final String[] NEGATIONS = {
            "do not share", "don't share", "never share",
            "do not disclose", "never disclose", "do not reveal"
    };

    private static final String[][] PATTERNS = {
            {"Credential request",
                    "(share|send|provide|tell|reply with|verify|confirm|enter)[^\\n]{0,40}(otp|one[- ]time password|pin\\b|password|cvv|card number)",
                    "35", "1"},
            {"Account threat",
                    "(account|card|sim|kyc|service)[^\\n]{0,40}(blocked|suspended|deactivated|expired|frozen|closed|disconnected)",
                    "30", "0"},
            {"Prize or lottery lure",
                    "(won|winner|lottery|lucky draw|prize money|cash reward|gift worth)",
                    "25", "0"},
            {"Urgency pressure",
                    "(urgent|immediately|within (24|48) hours|last chance|act now|expires today|final warning)",
                    "15", "0"},
            {"Payment request",
                    "(send|transfer|pay)[^\\n]{0,25}(money|rs\\.?\\s*\\d|inr|₹)|upi id|gpay|google pay|phonepe|scan this qr",
                    "25", "0"},
            {"KYC or refund lure",
                    "(kyc|recharge|refund|cashback)[^\\n]{0,30}(update|complete|verify|claim|pending|failed)",
                    "25", "0"},
            {"Link request",
                    "(click|open|visit)[^\\n]{0,25}(link|here|below)",
                    "10", "0"}
    };

    private static final String LINK_SOURCE = "(?i)"
            + "https?://[^\\s<>\"']+"
            + "|www\\.[^\\s<>\"']+"
            + "|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:com|in|net|org|co|io|xyz|top|tk|ml|cf|gq|click|icu|buzz|work|info|shop|live|online|site|store|app|link|pro|club|vip|cc|ru|cn|me)(?:/[^\\s<>\"']*)?";

    private static final Pattern LINK_PATTERN = Pattern.compile(LINK_SOURCE);

    private OfflineRules() {
    }

    public static Result evaluate(String rawText) {
        String text = rawText == null ? "" : rawText.trim();
        if (text.isEmpty()) {
            return new Result(0, "Low risk", new ArrayList<String>());
        }

        String lower = text.toLowerCase(Locale.ROOT);
        int textScore = 0;

        int keywordHits = 0;
        for (String keyword : KEYWORDS) {
            if (lower.contains(keyword)) keywordHits++;
        }
        textScore += Math.min(keywordHits * 25, 50);

        boolean negated = false;
        for (String phrase : NEGATIONS) {
            if (lower.contains(phrase)) {
                negated = true;
                break;
            }
        }

        for (String[] rule : PATTERNS) {
            if ("1".equals(rule[3]) && negated) continue;
            if (Pattern.compile(rule[1]).matcher(text).find()) {
                textScore += Integer.parseInt(rule[2]);
            }
        }

        List<String> links = extractLinks(text);
        int linkScore = 0;
        for (String link : links) {
            linkScore = Math.max(linkScore, scoreLink(link));
        }

        int score = Math.min(100, Math.max(textScore, linkScore));
        String verdict = score >= 60 ? "Dangerous" : (score >= 30 ? "Suspicious" : "Low risk");
        return new Result(score, verdict, links);
    }

    public static List<String> extractLinks(String text) {
        List<String> found = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        Matcher matcher = LINK_PATTERN.matcher(text == null ? "" : text);

        while (matcher.find() && found.size() < 5) {
            int start = matcher.start();
            char prev = start > 0 ? text.charAt(start - 1) : ' ';
            if (prev == '@' || prev == '/' || Character.isLetterOrDigit(prev)
                    || prev == '.' || prev == '_' || prev == '-') {
                continue;
            }

            String raw = matcher.group().replaceAll("[\\s.,;:!?)\\]}>\"']+$", "");
            if (raw.toLowerCase(Locale.ROOT).startsWith("www.")) {
                raw = "http://" + raw;
            }
            try {
                URI uri = new URI(raw);
                if (uri.getHost() == null || !uri.getHost().contains(".")) continue;
                String key = uri.getHost().toLowerCase(Locale.ROOT) + uri.getPath();
                if (!seen.contains(key)) {
                    seen.add(key);
                    found.add(uri.toString());
                }
            } catch (Exception ignored) {
                // Not a real link (e.g. "Rs.500").
            }
        }
        return found;
    }

    private static int scoreLink(String raw) {
        try {
            String value = raw;
            if (!value.contains("://")) value = "https://" + value;
            URI uri = new URI(value);
            String host = uri.getHost();
            if (host == null) return 0;
            host = host.toLowerCase(Locale.ROOT);
            if (!host.contains(".")) return 0;

            int score = 0;
            String tld = host.substring(host.lastIndexOf('.') + 1);
            if (Arrays.asList(SUSPICIOUS_TLDS).contains(tld)) score += 25;
            if (brandMismatch(host)) score += 40;
            if (host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) score += 30;
            if (Arrays.asList(SHORTENERS).contains(host)) score += 15;
            if (value.startsWith("http:")) score += 10;
            if (host.split("\\.").length > 4 || count(host, '-') >= 3) score += 10;
            if (host.contains("xn--")) score += 30;

            return Math.min(100, score);
        } catch (Exception e) {
            return 0;
        }
    }

    private static boolean brandMismatch(String host) {
        for (Map.Entry<String, String[]> brand : BRANDS.entrySet()) {
            if (!host.contains(brand.getKey())) continue;
            boolean official = false;
            for (String domain : brand.getValue()) {
                if (host.equals(domain) || host.endsWith("." + domain)) {
                    official = true;
                    break;
                }
            }
            if (!official) return true;
        }
        return false;
    }

    private static int count(String value, char needle) {
        int total = 0;
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) == needle) total++;
        }
        return total;
    }
}
