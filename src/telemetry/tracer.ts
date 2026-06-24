import type { Span, SpanOptions, Tracer } from "@opentelemetry/api";
import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

export interface InitTelemetryOptions {
  endpoint?: string;
  serviceName?: string;
  serviceVersion?: string;
  enabled?: boolean;
}

export function initTelemetry(options: InitTelemetryOptions = {}): void {
  const enabled = options.enabled !== false && process.env.OTEL_ENABLED !== "false";

  if (!enabled) return;

  const endpoint =
    options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "zerotrust";

  const serviceVersion = options.serviceVersion ?? "1.0.0";

  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on("SIGTERM", () => {
    sdk?.shutdown().catch(console.error);
  });
}

export function getTracer(name = "zerotrust"): Tracer {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, options);

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

export { SpanKind, SpanStatusCode };
