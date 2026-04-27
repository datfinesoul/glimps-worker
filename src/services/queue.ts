import { Queue, Worker } from "bullmq";
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

export interface ThumbnailJobData {
  jobId: string;
  mediaId: string;
  originalPath: string;
  thumbnailPath: string;
}

const queueConnection = { url: env.REDIS_URL };

export const thumbnailQueue = new Queue<ThumbnailJobData>(thumbnailQueueName, {
  connection: queueConnection,
});

export const videoQueue = new Queue<VideoJobData>(videoQueueName, {
  connection: queueConnection,
});

export function createThumbnailWorker(
  processor: (job: ThumbnailJobData) => Promise<void>,
): Worker<ThumbnailJobData> {
  return new Worker(thumbnailQueueName, async (job) => {
    await processor(job.data);
  }, {
    connection: queueConnection,
    concurrency: 2,
  });
}

export function createVideoWorker(
  processor: (job: VideoJobData) => Promise<void>,
): Worker<VideoJobData> {
  return new Worker(videoQueueName, async (job) => {
    await processor(job.data as VideoJobData);
  }, {
    connection: queueConnection,
    concurrency: 1,
    lockDuration: 120_000,
  });
}