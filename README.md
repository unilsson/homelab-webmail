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
