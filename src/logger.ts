import { env } from "./env.js";

export const loggerConfig = {
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  serializers: {
    req(req: { method: string; url: string; id: string }) {
      return {
        method: req.method,
        url: req.url,
        requestId: req.id,
      };
    },
  },
};
