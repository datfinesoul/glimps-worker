import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import pino from "pino";
import { env } from "../env.js";
import * as schema from "./schema.js";

const log = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

const client = postgres(env.DATABASE_URL, {
  connect_timeout: 10_000,
  onnotice: (notice) => {
    log.warn({ notice }, "postgres notice");
  },
});

// @ts-expect-error postgres.Sql does not expose event emitter types
client.on("error", (err: Error) => {
  log.error({ err }, "postgres client error");
});

export const db = drizzle(client, { schema });
