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
  assert.match(src, /maxResults:\s*'50'/);
  assert.match(src, /labelIds:\s*'INBOX'/);
  assert.match(src, /text\/plain/);
  assert.doesNotMatch(src, /writeFile|localStorage|innerHTML/);
});

test('HTML and attachments are isolated and protected', () => {
  const mail = readFileSync(new URL('./mail.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../frontend/main.tsx', import.meta.url), 'utf8');
  assert.match(mail, /sanitizeHtml\(/);
  assert.match(mail, /allowedSchemes:\['https','mailto'\]/);
  assert.doesNotMatch(mail, /allowedTags:.*'img'/);
  assert.match(mail, /15\*1024\*1024/);
  assert.match(server, /attachments\/:attachmentId', requireAuth/);
  assert.match(server, /application\/octet-stream/);
  assert.match(ui, /sandbox=""/);
  assert.match(ui, /default-src 'none'/);
});
