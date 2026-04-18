# Glimps Worker

BullMQ job processor for Glimps media pipeline. Handles thumbnail generation, video transcoding, and other CPU-intensive work offloaded from the API server.

## Development

The harness repo (`glimps/`) runs all services via Docker Compose. See the harness [AGENTS.md](../AGENTS.md) for the standard development workflow.

**Local iteration (debugging only):**
```bash
cp .env.example .env
pnpm install
(set -a && . .env && pnpm run dev)
```

## Commands

| Command | Context | Purpose |
|---------|---------|---------|
| `pnpm run lint` | docker exec or local | ESLint |
| `pnpm run typecheck` | docker exec or local | TypeScript |
| `pnpm run test` | docker exec or local | Vitest |
| `pnpm run build` | docker exec or local | tsc → dist/ |

## Entry Point

`src/worker.ts` — BullMQ job processor. No HTTP listener.

## Stack

- Node.js + TypeScript
- BullMQ (job queue via Redis)
- Drizzle ORM (database access)
- Pino (structured logging)
- OpenTelemetry (metrics + tracing)
- FFmpeg (media processing)