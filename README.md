# Glimps Worker

BullMQ job processor for Glimps media pipeline. Handles thumbnail generation, video transcoding, and other CPU-intensive work offloaded from the API server.

## Tool Requirements

- **Node.js** 22+
- **pnpm** 9+

## Quick Start

```bash
cp .env.example .env
pnpm install
pnpm run dev
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm run dev` | Start worker in dev mode with hot reload |
| `pnpm run build` | Production build (tsc → dist/) |
| `pnpm run start` | Run production build |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | TypeScript |
| `pnpm run test` | Vitest |

## "Works at All" Test

```bash
pnpm install
pnpm run build
```

Build must succeed with no errors.

## Stack

- Node.js + TypeScript
- BullMQ (job queue via Redis)
- Drizzle ORM (database access)
- Pino (structured logging)
- OpenTelemetry (metrics + tracing)
- FFmpeg (media processing)

## Service Description

Worker connects to Redis for job queue and PostgreSQL for media status updates. No HTTP listener — runs as a background process. Enqueued jobs come from the API server.

## Development

Worker reads `MEDIA_STORAGE_PATH` from environment to locate media files. Shared volume between API and worker containers ensures media files are accessible to both.