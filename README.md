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

### Run

```bash
docker compose up -d --build
curl http://127.0.0.1:8087/api/health
```

Open `http://127.0.0.1:8087` in a browser on the Docker host. Port 8087 is bound to loopback only. Later sprints will add local authentication before any LAN exposure.

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
