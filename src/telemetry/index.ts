import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { env } from "../env.js";

let sdk: NodeSDK | undefined;

export function initTelemetry(): void {
  const traceExporter = new OTLPTraceExporter({
    url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10_000,
    }),
  });

  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
