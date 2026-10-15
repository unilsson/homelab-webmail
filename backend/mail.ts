import { accessToken } from './google.js';

const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
type GmailHeader = { name: string; value: string };
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = {
  id: string; threadId?: string; snippet?: string; internalDate?: string;
  labelIds?: string[]; payload?: GmailPart & { headers?: GmailHeader[] };
};
export type MailSummary = {
  id: string; from: string; subject: string; date: string; snippet: string; unread: boolean;
};
const header = (headers: GmailHeader[] = [], name: string) =>
  headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
const summary = (m: GmailMessage): MailSummary => ({
  id: m.id,
  from: header(m.payload?.headers, 'From'),
  subject: header(m.payload?.headers, 'Subject') || '(Utan ämne)',
  date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : '',
  snippet: m.snippet ?? '',
  unread: (m.labelIds ?? []).includes('UNREAD'),
});
async function gmailGet<T>(token: string, route: string): Promise<T> {
  const r = await fetch(base + route, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('Gmail API request failed (' + r.status + ')');
  return await r.json() as T;
}
export async function inbox(pageToken?: string): Promise<{ messages: MailSummary[]; nextPageToken?: string }> {
  const token = await accessToken();
  const params = new URLSearchParams({ maxResults: '50', labelIds: 'INBOX' });
  if (pageToken) params.set('pageToken', pageToken);
  const page = await gmailGet<{messages?: {id:string}[];nextPageToken?:string}>(token, '/messages?' + params);
  const ids = page.messages ?? [];
  const results: MailSummary[] = [];
  // Fetch message metadata in bounded batches; do not retain messages in a cache.
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map(({id}) => gmailGet<GmailMessage>(
      token, '/messages/' + encodeURIComponent(id) + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject'
    )));
    results.push(...batch.map(summary));
  }
  return { messages: results, nextPageToken: page.nextPageToken };
}
const decode = (encoded: string): string => Buffer.from(encoded, 'base64url').toString('utf8');
function plainPart(part?: GmailPart): string | undefined {
  if (!part) return;
  if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  for (const child of part.parts ?? []) {
    const text = plainPart(child);
    if (text) return text;
  }
  return;
}
export async function readMessage(id: string): Promise<MailSummary & { to: string; body: string }> {
  if (!/^[a-f0-9]{8,32}$/i.test(id)) throw new Error('Invalid message id');
  const token = await accessToken();
  const message = await gmailGet<GmailMessage>(token, '/messages/' + id + '?format=full');
  return {
    ...summary(message),
    to: header(message.payload?.headers, 'To'),
    body: (plainPart(message.payload) ?? message.snippet ?? 'Ingen läsbar textdel hittades.').slice(0, 200000),
  };
}
