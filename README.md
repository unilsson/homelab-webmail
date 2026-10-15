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
