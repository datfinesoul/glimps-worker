import { trace, metrics, SpanStatusCode } from "@opentelemetry/api";
import { createThumbnailWorker } from "./services/queue.js";
import { db } from "./db/index.js";
import { media, jobs } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import pino from "pino";
import type { Job } from "bullmq";
import { env } from "./env.js";

const execAsync = promisify(exec);

const log = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

const tracer = trace.getTracer("glimps-worker");
const meter = metrics.getMeter("glimps-worker");

const thumbnailProcessingDuration = meter.createHistogram("thumbnail.processing.duration", {
  description: "Time taken to process a thumbnail job",
  unit: "ms",
});

const thumbnailJobsTotal = meter.createCounter("thumbnail.jobs.total", {
  description: "Total number of thumbnail jobs processed",
});

const thumbnailJobsFailed = meter.createCounter("thumbnail.jobs.failed", {
  description: "Total number of failed thumbnail jobs",
});

async function updateJobStatus(
  jobId: string,
  status: "pending" | "active" | "completed" | "failed",
  error?: string,
): Promise<void> {
  const updateData: Record<string, unknown> = { status };
  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }
  if (error) {
    updateData.error = error;
  }

  await db.update(jobs).set(updateData).where(eq(jobs.id, jobId));
}

async function generateThumbnail(
  originalPath: string,
  thumbnailPath: string,
): Promise<void> {
  const dir = path.dirname(thumbnailPath);
  await fs.mkdir(dir, { recursive: true });

  const cmd = `ffmpeg -i "${originalPath}" -vf "scale=300:-1" -q:v 2 "${thumbnailPath}"`;
  const { stderr } = await execAsync(cmd);

  if (stderr && !stderr.includes("frame=")) {
    log.warn({ stderr }, "ffmpeg non-fatal warning");
  }
}

async function processThumbnailJob(jobData: {
  jobId: string;
  mediaId: string;
  originalPath: string;
  thumbnailPath: string;
}): Promise<void> {
  const { jobId, mediaId, originalPath, thumbnailPath } = jobData;

  log.info({ jobId, mediaId, originalPath }, "thumbnail job started");

  await updateJobStatus(jobId, "active");

  const span = tracer.startSpan("thumbnail.generate");

  const startTime = Date.now();

  try {
    span.setAttributes({
      "media.id": mediaId,
      "media.original_path": originalPath,
      "media.thumbnail_path": thumbnailPath,
    });

    await generateThumbnail(originalPath, thumbnailPath);

    await db.update(media).set({
      thumbnailPath,
      status: "ready",
    }).where(eq(media.id, mediaId));

    await updateJobStatus(jobId, "completed");

    const duration = Date.now() - startTime;
    thumbnailProcessingDuration.record(duration, { status: "success" });
    thumbnailJobsTotal.add(1, { status: "success" });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    log.info({ jobId, mediaId, durationMs: duration }, "thumbnail job completed");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    const duration = Date.now() - startTime;
    thumbnailProcessingDuration.record(duration, { status: "failure" });
    thumbnailJobsTotal.add(1, { status: "failure" });
    thumbnailJobsFailed.add(1);

    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
    span.recordException(err as Error);
    span.end();

    log.error({ jobId, mediaId, error: errorMsg, durationMs: duration }, "thumbnail job failed");

    await db.update(media).set({ status: "failed" }).where(eq(media.id, mediaId));
    await updateJobStatus(jobId, "failed", errorMsg);
    throw err;
  }
}

async function start(): Promise<void> {
  log.info("thumbnail worker starting");

  const worker = createThumbnailWorker(processThumbnailJob);

  worker.on("completed", (job: Job) => {
    log.info({ jobId: job.id, attempts: job.attemptsMade }, "job completed");
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    log.error(
      { jobId: job?.id, err, attempts: job?.attemptsMade, failedReason: job?.failedReason },
      "job failed",
    );
  });

  worker.on("error", (err: Error) => {
    log.error({ err }, "worker error");
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  log.fatal({ err }, "fatal error starting worker");
  process.exit(1);
});