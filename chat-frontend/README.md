# Portfolio DM — frontend

Browser client for the Portfolio DM MVP: a quiet, editorial chat workspace for
direct messages. Built with React 19, TypeScript, Vite, native `fetch`, and
`socket.io-client`.

## Setup

```bash
pnpm install
cp .env.example .env.local   # optional; VITE_API_URL defaults are built in
pnpm dev
```

## Environment

`VITE_API_URL` is the base URL used by every HTTP call and the Socket.IO
connection. When it is unset:

- Vite development falls back to `http://localhost:8747`.
- Production builds resolve to `window.location.origin` (same-origin hosting).

## Validation

```bash
pnpm build
pnpm lint
```

## Backend notes

- All requests send `credentials: 'include'`; authentication is an httpOnly
  JWT cookie set by the backend. The client never reads or stores the token.
- Socket.IO connects with `withCredentials: true` and authenticates via the
  same cookie during the handshake.
- For local development, the backend must allow the frontend origin in its
  CORS and Socket.IO configuration (`CLIENT_ORIGIN`, e.g.
  `http://localhost:5173`).
