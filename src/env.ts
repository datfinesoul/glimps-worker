function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: Number(optional("PORT", "3000")),
  HOST: optional("HOST", "0.0.0.0"),

  DATABASE_URL: optional("DATABASE_URL", "postgres://glimps:glimps@localhost:5432/glimps"),
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),

  LOG_LEVEL: optional("LOG_LEVEL", "info"),

  OTEL_EXPORTER_OTLP_ENDPOINT: optional("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"),
  OTEL_SERVICE_NAME: optional("OTEL_SERVICE_NAME", "glimps-backend"),

  MEDIA_STORAGE_PATH: required("MEDIA_STORAGE_PATH"),

  ALLOWED_ORIGINS: optional("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"),

  RATE_LIMIT_MAX: Number(optional("RATE_LIMIT_MAX", "100")),
  RATE_LIMIT_TIME_WINDOW_MS: Number(optional("RATE_LIMIT_TIME_WINDOW_MS", "90000")),
  RATE_LIMIT_AUTH_MAX: Number(optional("RATE_LIMIT_AUTH_MAX", "10")),
} as const;

export type Env = typeof env;
