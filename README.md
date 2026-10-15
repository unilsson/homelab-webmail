# homelab-webmail

Self-hosted webmail for a private LAN, using Gmail API (not IMAP).

## Goals

- Gmail stays the source of truth; no permanent local mailbox.
- The web browser authenticates locally, never receives Google OAuth tokens.
- Backend uses OAuth 2.0 with narrowly scoped Gmail API permissions.
- Runs in Docker behind a LAN-only HTTPS reverse proxy.
- Secrets must never be committed to Git.

## Sprint 1 — Foundation

This sprint provides a working React + Express shell with a health endpoint. **It does not connect to Gmail, provide login, or display real mail yet. Do not expose it to untrusted networks.**

### Run on a headless ThinkPad

```bash
cp .env.example .env
nano .env
```

Set `HOST_BIND_IP` to the actual LAN IP of the ThinkPad (e.g. `192.168.1.153` **only if that remains its current address**), and leave `HOST_PORT=8087`. The default `127.0.0.1` is for setups using a reverse proxy on the same host.

```bash
docker compose up -d --build
docker compose ps
```

From another LAN device open `http://<THINKPAD_LAN_IP>:8087`, or `curl http://<THINKPAD_LAN_IP>:8087/api/health`.

**Security:** Sprint 1 has no login. Restrict this port to a trusted local network using firewall rules; do not forward it from the internet. Prefer internal HTTPS via a reverse proxy as soon as authentication is implemented. Binding to the specific LAN IP is safer than `0.0.0.0`, but does not by itself control which LAN clients may connect.

### Roadmap

1. Foundation: Docker, React/TypeScript, Express, tests.
2. Local authentication and secure session handling.
3. Google OAuth2 authorization (backend only) and token protection.
4. Gmail readonly inbox, list paging, and safe message rendering.
5. Attachments and search.
6. Optional `gmail.send` and compose flow.
7. Infisical deployment and hardened LAN-only Nginx reverse proxy.

### Architecture

- `frontend`: React/Vite SPA, built into static assets.
- `backend`: Express TypeScript app serving static frontend and `/api`.
- Gmail OAuth tokens will stay server-side; message contents are never persisted to a local mailbox.

See `.env.example` for nonsecret configuration. Do not commit `.env`, tokens, or other credentials.

## Sprint 2 — Local authentication

The service starts only after a local account and a scrypt password hash are configured. Passwords are **never** stored in Git or passed via shell command arguments. Session tokens are HTTP-only cookies, held server-side in memory, and expire after 30 minutes of inactivity. Restarting the container logs everyone out. Login attempts are rate-limited; state resets at restart.

### Set up on ThinkPad

```bash
cp -n .env.example .env
npm run hash-password
```

If Node.js is not installed on the host, generate the hash without creating a running server:

```bash
docker run --rm -it -v "$PWD/scripts:/work:ro" -w /work node:22-alpine node hash-password.mjs
```

Copy the printed `AUTH_PASSWORD_HASH=...` into `.env`; set `AUTH_USERNAME`. Keep `.env` out of Git and protect it with `chmod 600 .env`.

For a **temporary trusted LAN test only**, if you have not yet configured HTTPS, set these values in `.env`:

```dotenv
HOST_BIND_IP=<CURRENT_THINKPAD_LAN_IP>
HOST_PORT=8087
PUBLIC_ORIGIN=http://<CURRENT_THINKPAD_LAN_IP>:8087
COOKIE_SECURE=false
```

Then run `docker compose up -d --build`, and open `http://<CURRENT_THINKPAD_LAN_IP>:8087` from your laptop.

**Warning:** On plain HTTP, session cookies and passwords can be intercepted on the network. This mode is strictly for a short, trusted-LAN smoke test; don't connect Gmail or store tokens until HTTPS is configured. In normal use configure Nginx at `https://mail.ulnihnw.net`, set `PUBLIC_ORIGIN=https://mail.ulnihnw.net` and `COOKIE_SECURE=true`. Prefer binding Docker to localhost on the machine where Nginx runs.

### API checks

```bash
curl -i http://<THINKPAD_IP>:8087/api/auth/me
curl -i http://<THINKPAD_IP>:8087/api/mail
```

`/api/auth/me` returns `{"authenticated":false}` before login; `/api/mail` returns HTTP 401. With a valid session `/api/mail` currently returns a placeholder; no Gmail access is implemented yet.

Known sprint-2 limitations: sessions and rate-limit counters are in-memory (single replica only); local login is single-user; no OAuth yet; no external audit log.

## Sprint 3 — Google Gmail API OAuth2 (read-only)

**Prerequisites:** working `https://mail.ulnihnw.net`, `PUBLIC_ORIGIN=https://mail.ulnihnw.net`, `COOKIE_SECURE=true`, and LAN-only reverse proxy. Do not use this flow over HTTP.

In Google Cloud, enable Gmail API and create an OAuth **Web application** client. Register exactly this redirect URI:

```text
https://mail.ulnihnw.net/api/auth/google/callback
```

Enable `https://www.googleapis.com/auth/gmail.readonly` in OAuth Data Access. Add your account as a test user if the OAuth project is in Testing status. External test-mode refresh tokens can expire after seven days; plan production setup before relying on unattended access.

Add these **to your local `.env` only** (do not commit them):

```dotenv
PUBLIC_ORIGIN=https://mail.ulnihnw.net
COOKIE_SECURE=true
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET='your-google-client-secret'
TOKEN_ENCRYPTION_KEY=64-hex-characters
```

Generate the last value with `openssl rand -hex 32`. Secure the file with `chmod 600 .env`. Keep your existing AUTH_* values. Secrets can later be supplied from Infisical.

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=40
```

Log into the webmail UI locally, select **Anslut Gmail (endast läsning)**, consent at Google, then select **Testa Gmail-anslutning**. The API only requests the user's email address and message count for Sprint 3, **not message bodies**. Actual inbox browsing is planned for Sprint 4.

Security design: Google OAuth uses one-time state, an HttpOnly Secure Lax state cookie for the external redirect, and PKCE. Access and refresh tokens never go to the browser. The refresh token is stored at `/app/data/gmail-token.enc` encrypted via AES-256-GCM, persisted in Docker volume `gmail_tokens`. The encryption key **must** be backed up separately from this volume; losing it means reauthorizing Google. Do not print secrets in logs or save tokens in Git. The backend requires local authentication for all Gmail API routes.

This is a **single-user/single-Gmail-account** MVP. OAuth pending state and local login sessions reside in memory, so an app restart invalidates an in-progress OAuth flow. No email is stored locally. Google may invalidate refresh tokens at any time, requiring a new authorization.

## Sprint 4 — Inbox and message viewer

- Lists up to 50 Gmail messages in the **INBOX** label per page.
- Fetches sender, subject, date, snippet, and unread status directly from Gmail.
- Opens messages via Gmail API and renders the `text/plain` MIME part only. If a message contains HTML only, a Gmail snippet is shown rather than unsafe remote HTML.
- Older/newer paging uses Gmail's `nextPageToken`; **Uppdatera** refreshes the current page.
- Gmail remains the only permanent mailbox. No e-mail content is saved in the local database or Docker volume.
- Mail API routes require local login and set `Cache-Control: no-store`. Backend limits batches of metadata calls to five concurrent requests.
- Read-only OAuth scope continues to prevent changes to Gmail: opening a message does **not** mark it read on Gmail.
- Attachments, searching, rich HTML rendering and sending are not in this sprint. Text replies can be truncated to 200,000 characters as a safeguard.

### Test on ThinkPad

```bash
git fetch origin
git switch sprint/04-inbox
npm test
docker compose up -d --build
docker compose ps
docker compose logs --tail=40
```

Visit https://mail.ulnihnw.net and sign in locally. Confirm inbox rows appear, open a message, return to inbox, try the Older and Newer buttons, and sign out. Test on mobile width if convenient. Your existing `.env` and Google token volume remain in place.

If Gmail API returns a temporary error (e.g. rate limiting) an error is displayed without exposing Gmail tokens or backend secrets.

## Sprint 5 — HTML mail and attachments

Mail messages can be viewed as sanitized HTML or plain text. HTML is sanitized on the server using `sanitize-html` and displayed in an iframe without sandbox permissions. Its Content Security Policy blocks all external resources, including remote images and fonts, and prevents scripts or forms. Formatting support is deliberately conservative: inline styles, external images and some complex newsletter layouts are stripped.

Attachments are listed below the message with download links. Downloads require a valid local session, use `Content-Disposition: attachment`, and are limited to 15 MiB. Unsupported or oversized attachments show an informational label. There is no permanent storage of attachment data. This sprint does not change Gmail messages, labels or read status.

### Test Sprint 5 on ThinkPad

```bash
git fetch origin
git switch sprint/05-html-attachments
npm test
docker compose up -d --build
docker compose logs --tail=50
```

Open https://mail.ulnihnw.net and inspect a regular plain-text message, a formatted HTML message, and an email with a small attachment. Confirm remote images are not loaded, attachments download correctly, and switching between **Formaterat** and **Ren text** works. Existing `.env` and Google OAuth token volume are unchanged.

Do not merge before Docker compilation and functional testing on the ThinkPad.
