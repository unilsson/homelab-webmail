import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.PUBLIC_ORIGIN ?? '';
const id = process.env.GOOGLE_CLIENT_ID ?? '';
const secret = process.env.GOOGLE_CLIENT_SECRET ?? '';
const keyHex = process.env.TOKEN_ENCRYPTION_KEY ?? '';
const key = /^[a-f\d]{64}$/i.test(keyHex) ? Buffer.from(keyHex, 'hex') : null;
const storeFile = '/app/data/gmail-token.enc';
const redirectUri = origin + '/api/auth/google/callback';
const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const pending = new Map<string, { verifier: string; expires: number }>();
export const oauthConfigured = Boolean(id && secret && key && origin.startsWith('https://'));

export function beginOAuth(): { url: string; state: string } {
  if (!oauthConfigured) throw new Error('Google OAuth is not configured');
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  pending.set(state, { verifier, expires: Date.now() + 5 * 60_000 });
  const params = new URLSearchParams({
    client_id: id, redirect_uri: redirectUri, response_type: 'code',
    scope, access_type: 'offline', prompt: 'consent', state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params, state };
}
export async function finishOAuth(state: string, code: string): Promise<void> {
  const item = pending.get(state);
  pending.delete(state);
  if (!item || item.expires < Date.now() || !oauthConfigured) throw new Error('Invalid or expired OAuth request');
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri,
      grant_type: 'authorization_code', code_verifier: item.verifier }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error('Google refused the authorization code');
  const data = await resp.json() as { refresh_token?: string; scope?: string };
  if (!data.refresh_token || !data.scope?.split(' ').includes(scope)) throw new Error('Google did not grant offline read-only access');
  await saveRefreshToken(data.refresh_token);
}
async function saveRefreshToken(token: string): Promise<void> {
  if (!key) throw new Error('Missing encryption key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  await mkdir(path.dirname(storeFile), { recursive: true });
  const tmp = storeFile + '.' + randomBytes(6).toString('hex') + '.tmp';
  await writeFile(tmp, payload, { mode: 0o600 });
  await rename(tmp, storeFile);
}
async function loadRefreshToken(): Promise<string | null> {
  if (!key) return null;
  let data: Buffer;
  try { data = Buffer.from(await readFile(storeFile, 'utf8'), 'base64'); }
  catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null; throw err; }
  if (data.length < 29) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
export async function gmailStatus(): Promise<{ configured: boolean; connected: boolean }> {
  return { configured: oauthConfigured, connected: oauthConfigured && Boolean(await loadRefreshToken()) };
}
export async function accessToken(): Promise<string> {
  const refresh = await loadRefreshToken();
  if (!refresh) throw new Error('Gmail has not been connected');
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error('Could not refresh Gmail access');
  const data = await resp.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Missing Gmail access token');
  return data.access_token;
}
export async function gmailProfile(): Promise<{ emailAddress: string; messagesTotal: number }> {
  const token = await accessToken();
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error('Gmail profile request failed');
  const data = await resp.json() as { emailAddress: string; messagesTotal: number };
  return { emailAddress: data.emailAddress, messagesTotal: data.messagesTotal };
}
