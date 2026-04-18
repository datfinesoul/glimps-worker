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

const sql = postgres(env.DATABASE_URL, {
  connect_timeout: 10_000,
  onnotice: (notice) => {
    log.warn({ notice }, "postgres notice");
  },
});

export const db = drizzle(sql, { schema });