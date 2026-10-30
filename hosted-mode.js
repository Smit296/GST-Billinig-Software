// Hosted mode (opt-in). The app is a single-user desktop tool with no login of
// its own, so when it is run on a public host (HOSTED=1) every request must
// pass HTTP Basic auth first. Locally (HOSTED unset) none of this is active.
import crypto from 'crypto';

export const HOSTED = process.env.HOSTED === '1';

const USER = process.env.APP_USER || 'admin';
const PASSWORD = process.env.APP_PASSWORD || '';

if (HOSTED && PASSWORD.length < 12) {
  console.error('HOSTED=1 requires APP_PASSWORD (at least 12 characters). Refusing to start without a login.');
  process.exit(1);
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Crude per-IP throttle: 10 failures in 15 minutes locks that IP out for the window.
const fails = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

export function requireLogin(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = fails.get(ip);
  if (rec && now - rec.first > WINDOW_MS) fails.delete(ip);
  const cur = fails.get(ip);
  if (cur && cur.count >= MAX_FAILS) {
    return res.status(429).set('Retry-After', '900').send('Too many failed logins. Try again later.');
  }
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (m) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
    const i = decoded.indexOf(':');
    const u = i < 0 ? decoded : decoded.slice(0, i);
    const p = i < 0 ? '' : decoded.slice(i + 1);
    // Evaluate both so timing doesn't reveal which half was wrong.
    const okUser = safeEqual(u, USER);
    const okPass = safeEqual(p, PASSWORD);
    if (okUser && okPass) return next();
  }
  const r = fails.get(ip) || { first: now, count: 0 };
  r.count += 1;
  fails.set(ip, r);
  res.set('WWW-Authenticate', 'Basic realm="Free GST Billing", charset="UTF-8"');
  return res.status(401).send('Login required');
}

// These endpoints act on the machine the server runs on (open folders, run
// launcher scripts). Meaningless and unsafe on a shared host.
const BLOCKED = new Set([
  '/api/control-panel/open-data-folder',
  '/api/control-panel/open-backups-folder',
  '/api/control-panel/launch-script',
]);
export function blockHostLocalActions(req, res, next) {
  if (BLOCKED.has(req.path)) return res.status(404).json({ error: 'Not available on a hosted install' });
  next();
}
