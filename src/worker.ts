import { trace, metrics, SpanStatusCode } from "@opentelemetry/api";
import { createThumbnailWorker, createVideoWorker, thumbnailQueue, videoQueue } from "./services/queue.js";
import type { VideoJobData, ThumbnailJobData } from "./services/queue.js";
import { db } from "./db/index.js";
import { media, jobs } from "./db/schema.js";
import { eq, lt, and } from "drizzle-orm";
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

  const cmd = `ffmpeg -i "${originalPath}" -vf "scale=300:-1" -quality 85 "${thumbnailPath}"`;
  const { stderr } = await execAsync(cmd);

  if (stderr && !stderr.includes("frame=")) {
    log.warn({ stderr }, "ffmpeg non-fatal warning");
  }
}

async function detectGpu(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("ffmpeg -encoders 2>/dev/null | grep -c nvenc");
    return parseInt(stdout.trim(), 10) > 0;
  } catch {
    return false;
  }
}

async function extractFrame(
  originalPath: string,
  outputPath: string,
): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  const cmd = `ffmpeg -i "${originalPath}" -vf "scale=300:-1" -frames:v 1 -q:v 2 "${outputPath}"`;
  await execAsync(cmd);
}

async function generateAnimatedThumbnail(
  originalPath: string,
  outputPath: string,
  durationSec = 5,
): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  const cmd = [
    `ffmpeg -i "${originalPath}"`,
    `-t ${durationSec}`,
    `-vf "scale=300:-1,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"`,
    `-c:v libvpx-vp9 -b:v 2M`,
    `"${outputPath}"`,
  ].join(" ");
  await execAsync(cmd);
}

async function transcodePreview(
  originalPath: string,
  outputPath: string,
  gpu: boolean,
): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  const encoder = gpu
    ? "-c:v h264_nvenc -preset medium -b:v 4M"
    : "-c:v libx264 -preset medium -crf 23";
  const cmd = [
    `ffmpeg -i "${originalPath}"`,
    `-vf "scale='min(1280,iw)':-2"`,
    `-r 30`,
    encoder,
    `-c:a aac -b:a 128k`,
    `"${outputPath}"`,
  ].join(" ");
  await execAsync(cmd);
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

    log.info({ jobId, mediaId, step: "generateThumbnail" }, "thumbnail job: starting generateThumbnail");
    await generateThumbnail(originalPath, thumbnailPath);
    log.info({ jobId, mediaId, step: "generateThumbnail", thumbnailPath }, "thumbnail job: generateThumbnail complete");

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

async function processVideoJob(jobData: VideoJobData): Promise<void> {
  const { jobId, mediaId, originalPath, thumbnailPath, animatedThumbnailPath, previewPath, gpuEnabled } = jobData;

  log.info({ jobId, mediaId, originalPath }, "video job started");

  await updateJobStatus(jobId, "active");

  const span = tracer.startSpan("video.process");

  const startTime = Date.now();

  try {
    span.setAttributes({
      "media.id": mediaId,
      "media.original_path": originalPath,
      "media.thumbnail_path": thumbnailPath,
      "media.animated_thumbnail_path": animatedThumbnailPath,
      "media.preview_path": previewPath,
      "gpu.enabled": gpuEnabled,
    });

    log.info({ jobId, mediaId, step: "extractFrame" }, "video job: starting extractFrame");
    await extractFrame(originalPath, thumbnailPath);
    log.info({ jobId, mediaId, step: "extractFrame", thumbnailPath }, "video job: extractFrame complete");

    log.info({ jobId, mediaId, step: "generateAnimatedThumbnail" }, "video job: starting generateAnimatedThumbnail");
    await generateAnimatedThumbnail(originalPath, animatedThumbnailPath, 5);
    log.info({ jobId, mediaId, step: "generateAnimatedThumbnail", animatedThumbnailPath }, "video job: generateAnimatedThumbnail complete");

    log.info({ jobId, mediaId, step: "transcodePreview", gpuEnabled }, "video job: starting transcodePreview");
    await transcodePreview(originalPath, previewPath, gpuEnabled);
    log.info({ jobId, mediaId, step: "transcodePreview", previewPath }, "video job: transcodePreview complete");

    await db.update(media).set({
      thumbnailPath,
      animatedThumbnailPath,
      previewPath,
      status: "ready",
    }).where(eq(media.id, mediaId));

    await updateJobStatus(jobId, "completed");

    const duration = Date.now() - startTime;
    thumbnailProcessingDuration.record(duration, { status: "success" });
    thumbnailJobsTotal.add(1, { status: "success" });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    log.info({ jobId, mediaId, durationMs: duration }, "video job completed");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    const duration = Date.now() - startTime;
    thumbnailProcessingDuration.record(duration, { status: "failure" });
    thumbnailJobsTotal.add(1, { status: "failure" });
    thumbnailJobsFailed.add(1);

    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
    span.recordException(err as Error);
    span.end();

    log.error({ jobId, mediaId, error: errorMsg, durationMs: duration }, "video job failed");

    await db.update(media).set({ status: "failed" }).where(eq(media.id, mediaId));
    await updateJobStatus(jobId, "failed", errorMsg);
    throw err;
  }
}

const stuckJobThresholdMs = 10 * 60 * 1000;

async function recoverStuckJobs(): Promise<void> {
  const stuckThreshold = new Date(Date.now() - stuckJobThresholdMs);

  const stuckJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "active"), lt(jobs.createdAt, stuckThreshold)));

  if (stuckJobs.length === 0) {
    log.info("no stuck jobs found");
    return;
  }

  log.warn({ count: stuckJobs.length }, "found stuck jobs, recovering");

  for (const job of stuckJobs) {
    const [mediaRecord] = await db
      .select()
      .from(media)
      .where(eq(media.id, job.mediaId))
      .limit(1);

    if (!mediaRecord) {
      log.error({ jobId: job.id, mediaId: job.mediaId }, "stuck job has no associated media, skipping");
      continue;
    }

    await db.update(jobs).set({ status: "pending" }).where(eq(jobs.id, job.id));
    await db.update(media).set({ status: "pending" }).where(eq(media.id, job.mediaId));

    const jobData = {
      jobId: job.id,
      mediaId: job.mediaId,
      originalPath: mediaRecord.originalPath,
      thumbnailPath: mediaRecord.thumbnailPath ?? "",
      animatedThumbnailPath: mediaRecord.animatedThumbnailPath ?? "",
      previewPath: mediaRecord.previewPath ?? "",
      gpuEnabled: false,
    };

    if (job.type === "thumbnail") {
      await thumbnailQueue.add("recover", {
        jobId: job.id,
        mediaId: job.mediaId,
        originalPath: mediaRecord.originalPath,
        thumbnailPath: mediaRecord.thumbnailPath ?? "",
      } as ThumbnailJobData, { jobId: job.id });
      log.info({ jobId: job.id, mediaId: job.mediaId }, "re-queued stuck thumbnail job");
    } else if (job.type === "video") {
      await videoQueue.add("recover", jobData, { jobId: job.id });
      log.info({ jobId: job.id, mediaId: job.mediaId }, "re-queued stuck video job");
    }
  }

  log.info({ count: stuckJobs.length }, "stuck job recovery complete");
}

async function start(): Promise<void> {
  log.info("worker starting");

  const gpuEnabled = await detectGpu();
  log.info({ gpuEnabled }, "GPU detection result");

  await recoverStuckJobs();

  const thumbnailWorker = createThumbnailWorker(processThumbnailJob);

  thumbnailWorker.on("completed", (job: Job) => {
    log.info({ jobId: job.id, attempts: job.attemptsMade }, "thumbnail job completed");
  });

  thumbnailWorker.on("failed", (job: Job | undefined, err: Error) => {
    log.error(
      { jobId: job?.id, err, attempts: job?.attemptsMade, failedReason: job?.failedReason },
      "thumbnail job failed",
    );
  });

  thumbnailWorker.on("error", (err: Error) => {
    log.error({ err }, "thumbnail worker error");
  });

  const videoWorker = createVideoWorker(processVideoJob);

  videoWorker.on("completed", (job: Job) => {
    log.info({ jobId: job.id, attempts: job.attemptsMade }, "video job completed");
  });

  videoWorker.on("failed", (job: Job | undefined, err: Error) => {
    log.error(
      { jobId: job?.id, err, attempts: job?.attemptsMade, failedReason: job?.failedReason },
      "video job failed",
    );
  });

  videoWorker.on("error", (err: Error) => {
    log.error({ err }, "video worker error");
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down");
    await thumbnailWorker.close();
    await videoWorker.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  log.fatal({ err }, "fatal error starting worker");
  process.exit(1);
});