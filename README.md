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
OPENROUTER_MODEL=qwen/qwen3.5-27b
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=Ask Arion
PORT=3001
```

## Content

Editable source-of-truth files live in:

- `server/data/knowledge.ts`
- `server/data/imageMap.ts`

The assistant is intentionally concise and cautious when information is not in
the static knowledge pack.
