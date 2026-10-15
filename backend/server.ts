import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

const username = process.env.AUTH_USERNAME ?? '';
const passwordHash = process.env.AUTH_PASSWORD_HASH ?? '';
if (!username || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash)) {
  throw new Error('AUTH_USERNAME and a valid AUTH_PASSWORD_HASH are required. Run npm run hash-password.');
}
const cookieSecure = process.env.COOKIE_SECURE !== 'false';
const cookieName = cookieSecure ? '__Host-homelab_session' : 'homelab_session';
const ttlMs = 30 * 60 * 1000;
const sessions = new Map<string, number>();
const attempts = new Map<string, { count: number; until: number }>();

function verifyPassword(candidate: string): boolean {
  const [, salt, stored] = passwordHash.split('$');
  const actual = scryptSync(candidate, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(actual, Buffer.from(stored, 'hex'));
}
function cookies(req: Request): Record<string, string> {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').map(c => c.trim().split('=')).filter(([k, v]) => !!k && !!v));
}
function session(req: Request): string | undefined {
  const token = cookies(req)[cookieName];
  if (!token) return;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) { sessions.delete(token); return; }
  sessions.set(token, Date.now() + ttlMs);
  return token;
}
function cookieOptions() {
  return { httpOnly: true, secure: cookieSecure, sameSite: 'strict' as const, path: '/', maxAge: ttlMs };
}
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!session(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  next();
}
function checkOrigin(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    const expected = process.env.PUBLIC_ORIGIN;
    if (!origin || !expected || origin !== expected) { res.status(403).json({ error: 'Origin not allowed' }); return; }
  }
  next();
}
app.use('/api', checkOrigin);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'homelab-webmail' }));
app.get('/api/auth/me', (req, res) => res.json({ authenticated: !!session(req) }));
app.post('/api/auth/login', (req, res) => {
  const key = req.ip ?? 'unknown';
  const state = attempts.get(key);
  if (state && state.until > Date.now() && state.count >= 5) {
    res.status(429).json({ error: 'Too many attempts; retry later' }); return;
  }
  const input = req.body ?? {};
  const providedUser = typeof input.username === 'string' ? input.username : '';
  const providedPassword = typeof input.password === 'string' ? input.password : '';
  const validPassword = verifyPassword(providedPassword);
  if (providedUser !== username || !validPassword) {
    const count = state && state.until > Date.now() ? state.count + 1 : 1;
    attempts.set(key, { count, until: Date.now() + 15 * 60_000 });
    res.status(401).json({ error: 'Invalid credentials' }); return;
  }
  attempts.delete(key);
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + ttlMs);
  res.cookie(cookieName, token, cookieOptions());
  res.json({ authenticated: true });
});
app.post('/api/auth/logout', (req, res) => {
  const token = cookies(req)[cookieName];
  if (token) sessions.delete(token);
  res.clearCookie(cookieName, { httpOnly: true, secure: cookieSecure, sameSite: 'strict', path: '/' });
  res.json({ authenticated: false });
});
app.get('/api/mail', requireAuth, (_req, res) => res.json({ status: 'not_configured', messages: [] }));
const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
app.use(express.static(staticDir, { index: false }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) { res.status(404).json({ error: 'Not found' }); return; }
  res.sendFile(path.join(staticDir, 'index.html'));
});
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of sessions) if (expiry < now) sessions.delete(token);
  for (const [ip, state] of attempts) if (state.until < now) attempts.delete(ip);
}, 60_000).unref();
app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
