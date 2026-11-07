/* Dev-only: populate phishguard.db with demo entries (gitignored artifact) */
const crypto = require('crypto');
const Database = require('better-sqlite3');
const argon2 = require('argon2');

const db = new Database('./data/phishguard.db');
db.pragma('foreign_keys = ON');

(async () => {
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (hAgo) => new Date(Date.now() - hAgo * 36e5).toISOString().slice(0, 19) + 'Z';

db.exec(`DELETE FROM alert_events; DELETE FROM threat_votes; DELETE FROM checks;
DELETE FROM otp_codes; DELETE FROM sessions; DELETE FROM urls; DELETE FROM users;
DELETE FROM schema_migrations;`);

db.prepare(`INSERT INTO schema_migrations (version) VALUES ('001_init.sql'),('002_threat_reports.sql'),('003_alerts.sql')`).run();

/* USERS */
const pwHash = await argon2.hash('DevOnlyPassword!2026', { type: argon2.argon2id });
const insUser = db.prepare(`INSERT INTO users (name, email, phone, password_hash, history_sync, settings, created_at, last_login_at) VALUES (?,?,?,?,?,json(?),?,?)`);
insUser.run('Alex Morgan', 'alex@example.com', null, pwHash, 1, JSON.stringify({ darkMode: true, pushAlerts: true }), iso(720), iso(2));
insUser.run('Priya Sharma', null, '+919812345678', null, 0, JSON.stringify({ darkMode: false, pushAlerts: true }), iso(480), iso(48));
insUser.run('Demo User', 'demo@example.com', null, pwHash, 0, JSON.stringify({}), iso(24), iso(20));
console.log('users: 3 inserted (argon2id hash computed)');

/* SESSIONS (one live, one revoked) */
db.prepare(`INSERT INTO sessions (user_id, token_hash, user_agent, created_at, expires_at) VALUES (?,?,?,?,?)`)
  .run(1, sha('demo-bearer-token' + 'PEPPER'), 'Mozilla/5.0 (Linux; Android 14)', iso(2), iso(-720));
db.prepare(`INSERT INTO sessions (user_id, token_hash, user_agent, created_at, expires_at, revoked_at) VALUES (?,?,?,?,?,?)`)
  .run(2, sha('old-bearer-token' + 'PEPPER'), 'iPhone (iOS 18)', iso(48), iso(-48), iso(24));
console.log('sessions: 2 inserted (hashes are sha256 of demo tokens + pepper)');

/* URLs */
const insUrl = db.prepare(`INSERT INTO urls (url_hash, url, host, first_seen_at, last_seen_at) VALUES (?,?,?,?,?)`);
insUrl.run(sha('http://free-recharge-jio.xyz/claim'), 'http://free-recharge-jio.xyz/claim', 'free-recharge-jio.xyz', iso(300), iso(1));
insUrl.run(sha('http://sbi-secure-login.xyz/kyc'), 'http://sbi-secure-login.xyz/kyc', 'sbi-secure-login.xyz', iso(200), iso(3));
insUrl.run(sha('https://www.amazon.in/s?k=powerbank'), 'https://www.amazon.in/s?k=powerbank', 'www.amazon.in', iso(150), iso(0.5));
insUrl.run(sha('http://bit.ly/win-lottery-now'), 'http://bit.ly/win-lottery-now', 'bit.ly', iso(100), iso(6));
insUrl.run(sha('https://paytm.kyc-update.top/verify'), 'https://paytm.kyc-update.top/verify', 'paytm.kyc-update.top', iso(80), iso(2));
console.log('urls: 5 inserted');

/* CHECKS (rule signals JSON mirrors the real analyzer output) */
const sig = (arr) => JSON.stringify(arr);
const insCheck = db.prepare(`INSERT INTO checks (user_id, url_id, score, verdict, ai_status, signals, created_at) VALUES (?,?,?,?,?,?,?)`);
insCheck.run(1, 1, 100, 'Dangerous', 'ok', sig([
  { points: 25, name: 'Scam keyword', detail: 'Contains: free-recharge' },
  { points: 25, name: 'Suspicious domain extension', detail: '.xyz is often used in scams.' },
  { points: 40, name: 'Brand mismatch', detail: 'Mentions jio but the domain does not match its official site.' },
  { points: 10, name: 'Not secure', detail: 'This link does not use HTTPS.' }]), iso(1));
insCheck.run(2, 2, 75, 'Dangerous', 'unavailable', sig([
  { points: 40, name: 'Brand mismatch', detail: 'Mentions sbi but the domain does not match its official site.' },
  { points: 25, name: 'Suspicious domain extension', detail: '.xyz is often used in scams.' },
  { points: 10, name: 'Not secure', detail: 'This link does not use HTTPS.' }]), iso(3));
insCheck.run(null, 3, 0, 'Low risk', 'ok', sig([{ points: 0, name: 'AI check', detail: 'Official e-commerce domain' }]), iso(0.5));
insCheck.run(1, 4, 40, 'Suspicious', 'ok', sig([
  { points: 25, name: 'Scam keyword', detail: 'Contains: win-lottery' },
  { points: 15, name: 'Shortened link', detail: 'The real destination is hidden.' }]), iso(6));
insCheck.run(2, 5, 65, 'Dangerous', 'ok', sig([
  { points: 40, name: 'Brand mismatch', detail: 'Mentions paytm but the domain does not match its official site.' },
  { points: 25, name: 'Suspicious domain extension', detail: '.top is often used in scams.' }]), iso(2));
console.log('checks: 5 inserted (2 signed-in, 1 anonymous, verdicts mixed)');

/* OTP CODES (one active, one consumed, one expired-locked) */
const insOtp = db.prepare(`INSERT INTO otp_codes (destination, code_hash, purpose, attempts, expires_at, consumed_at, created_at) VALUES (?,?,?,?,?,?,?)`);
insOtp.run('+919812345678', sha('428391PEPPER'), 'login', 0, iso(-0.16), null, iso(0.1));
insOtp.run('alex@example.com', sha('772901PEPPER'), 'register', 1, iso(720), iso(719.7), iso(720));
insOtp.run('demo@example.com', sha('503207PEPPER'), 'login', 5, iso(28), null, iso(28.1));
console.log('otp_codes: 3 inserted (stored as sha256 hashes, never plain codes)');

/* THREAT VOTES (community reports; one account per URL) */
const insVote = db.prepare(`INSERT INTO threat_votes (url_id, reporter_id, vote, created_at) VALUES (?,?,?,?)`);
insVote.run(1, 1, 'dangerous', iso(1));
insVote.run(1, 2, 'dangerous', iso(1.5));
insVote.run(1, 3, 'safe', iso(5));
insVote.run(2, 1, 'dangerous', iso(3));
insVote.run(4, 2, 'dangerous', iso(4));
insVote.run(5, 1, 'safe', iso(2));
insVote.run(5, 2, 'dangerous', iso(1.8));
insVote.run(3, 1, 'safe', iso(0.4));
console.log('threat_votes: 8 inserted (incl. one vote flip to test the 1-per-account rule)');

/* ALERT EVENTS (privacy: only sender hashes, never numbers/text) */
const insAlert = db.prepare(`INSERT INTO alert_events (user_id, url_id, sender_hash, link_count, local_verdict, score, verdict, ai_status, notified, in_app_shown, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
insAlert.run(1, 1, sha('+919000000001' + 'PEPPER'), 1, 'Suspicious', 100, 'Dangerous', 'ok', 1, 1, iso(2));
insAlert.run(2, null, sha('+919000000002' + 'PEPPER'), 0, 'Low risk', null, null, 'unavailable', 0, 1, iso(5));
insAlert.run(1, 4, sha('+919000000001' + 'PEPPER'), 1, 'Suspicious', 40, 'Suspicious', 'ok', 1, 0, iso(6));
console.log('alert_events: 3 inserted');

/* SHOW DUMPS */
const show = (title, sql) => {
  console.log('\n=== ' + title + ' ===');
  const rows = db.prepare(sql).all();
  if (rows.length) {
    const cols = Object.keys(rows[0]);
    console.log(' | ' + cols.join(' | '));
    for (const r of rows) console.log(' | ' + cols.map(c => String(r[c]).slice(0, 46)).join(' | '));
  } else console.log('(empty)');
};
show('URL THREAT STATS (view)', `SELECT url_id, host, dangerous_votes, safe_votes, last_voted_at FROM url_threat_stats ORDER BY url_id`);
show('USERS', `SELECT id, name, email, phone, substr(password_hash,1,24)||'…' AS password_hash, history_sync, settings, created_at FROM users`);
show('SESSIONS', `SELECT id, user_id, substr(token_hash,1,12)||'…' AS token_hash, user_agent, expires_at, revoked_at FROM sessions`);
show('CHECKS', `SELECT c.id, u.name AS user, ur.host, c.score, c.verdict, c.ai_status, json_array_length(c.signals) AS signals, c.created_at FROM checks c LEFT JOIN users u ON u.id=c.user_id JOIN urls ur ON ur.id=c.url_id ORDER BY c.id`);
show('OTP CODES', `SELECT id, destination, substr(code_hash,1,12)||'…' AS code_hash, purpose, attempts, expires_at, CASE WHEN consumed_at IS NULL THEN 'ACTIVE/PENDING' ELSE 'consumed '||substr(consumed_at,1,10) END AS status FROM otp_codes`);
show('THREAT VOTES', `SELECT tv.id, ur.host, COALESCE(u.name,'(anonymous)') AS reporter, tv.vote, tv.created_at FROM threat_votes tv JOIN urls ur ON ur.id=tv.url_id LEFT JOIN users u ON u.id=tv.reporter_id`);
show('ALERT EVENTS', `SELECT a.id, COALESCE(u.name,'(anon)') AS user, substr(a.sender_hash,1,12)||'…' AS sender_hash, a.link_count, a.local_verdict, a.score, a.verdict, a.notified, a.created_at FROM alert_events a LEFT JOIN users u ON u.id=a.user_id`);
show('INTEGRITY', `PRAGMA foreign_key_check`);
db.close();
console.log('\nDONE.');
})().catch((e) => { console.error(e); process.exit(1); });
