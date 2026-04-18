import pino from "pino";
import { env } from "./env.js";
import { initTelemetry, shutdownTelemetry } from "./telemetry/index.js";

const log = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

async function start(): Promise<void> {
  initTelemetry();

  log.info("worker starting (stub — no jobs defined yet)");
  log.info(`redis: ${env.REDIS_URL}`);

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down");
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  log.fatal({ err }, "fatal error starting worker");
  process.exit(1);
});
