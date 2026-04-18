import { Worker } from "bullmq";
import { env } from "../env.js";

export const thumbnailQueueName = "thumbnail";

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