import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mail endpoints require local auth and disallow browser caching', () => {
  const src = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
  assert.match(src, /app.get\('\/api\/mail', requireAuth/);
  assert.match(src, /app.get\('\/api\/mail\/:id', requireAuth/);
  assert.match(src, /Cache-Control', 'no-store'/);
});
test('Gmail list is limited to 50 and body is decoded as plain text', () => {
  const src = readFileSync(new URL('./mail.ts', import.meta.url), 'utf8');
  assert.match(src, /maxResults: '50'/);
  assert.match(src, /labelIds: 'INBOX'/);
  assert.match(src, /text\/plain/);
  assert.doesNotMatch(src, /writeFile|localStorage|innerHTML/);
});
