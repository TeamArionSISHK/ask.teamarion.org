# Ask Arion

Minimal Team Arion chatbot web app with a React frontend and Express backend.

## Run

```bash
npm install
npm run dev
```

The Vite frontend runs on `http://localhost:5173` and proxies `/api/*` to the
Express server on `http://localhost:3001`.

Or use the local helper:

```bash
./scripts/start-local.sh
```

That script checks for `.env`, installs packages if needed, and starts both the
backend and frontend dev processes together.

## Build

```bash
npm run build
npm run start
```

## Environment

Create `.env` for the backend:

```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_FALLBACK_MODEL=qwen/qwen3.5-27b
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=Ask Arion
PORT=3001
ASK_ARION_ALLOWED_ORIGINS=https://ask.teamarion.org,http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173
ASK_ARION_RATE_LIMIT_WINDOW_MS=60000
ASK_ARION_RATE_LIMIT_MAX_REQUESTS=24
```

## API Protection

Ask Arion includes two lightweight server-side protections:

- origin / referer allowlist for `/api/*`
- in-memory per-IP rate limiting

`/api/health` is left open for uptime checks. Local loopback requests without
an `Origin` or `Referer` header are also allowed for on-server testing and
operations.

## Content

Editable source-of-truth files live in:

- `server/data/knowledge.ts`
- `server/data/imageMap.ts`

The assistant is intentionally concise and cautious when information is not in
the static knowledge pack.
