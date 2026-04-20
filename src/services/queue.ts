import { Worker } from "bullmq";
import { env } from "../env.js";

export const thumbnailQueueName = "thumbnail";
export const videoQueueName = "video";

export interface VideoJobData {
  jobId: string;
  mediaId: string;
  originalPath: string;
  thumbnailPath: string;
  animatedThumbnailPath: string;
  previewPath: string;
  gpuEnabled: boolean;
}

export function createThumbnailWorker(
  processor: (job: { jobId: string; mediaId: string; originalPath: string; thumbnailPath: string }) => Promise<void>,
): Worker {
  return new Worker(thumbnailQueueName, async (job) => {
    await processor(job.data);
  }, {
    connection: { url: env.REDIS_URL },
    concurrency: 2,
  });
}

export function createVideoWorker(
  processor: (job: VideoJobData) => Promise<void>,
): Worker {
  return new Worker(videoQueueName, async (job) => {
    await processor(job.data as VideoJobData);
  }, {
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  });
}