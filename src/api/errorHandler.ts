import { randomUUID } from "node:crypto";
import type { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getLogger } from "../logger";
import { ErrorCodes, type HonoEnv, zerotrustError } from "../shared/types";

type ApiLogger = {
  error(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
};

type ErrorBody = {
  error: string;
  message: string;
  requestId: string;
};

const GENERIC_INTERNAL_MESSAGE = "Internal server error";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const STATUS_ERROR_CODES: Record<number, string> = {
  400: ErrorCodes.INVALID_REQUEST,
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "VALIDATION_ERROR",
  429: ErrorCodes.RATE_LIMIT_EXCEEDED,
};

function requestIdFor(c: Context): string {
  const header = c.req.header("x-request-id") ?? c.req.header("x-correlation-id");
  if (header && REQUEST_ID_PATTERN.test(header)) return header;
  return randomUUID();
}

function redact(value: string): string {
  return value
    .replace(
      /\b(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|api[_-]?key|authorization|otp)\s*[:=]\s*["']?[^"'\s,;&}]+/gi,
      "$1=[REDACTED]"
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s]+)(@[^/\s]+(?:\/[^\s]*)?)/gi,
      "$1[REDACTED]$3"
    )
    .replace(
      /([?&](?:password|secret|client_secret|token|access_token|refresh_token|api_key|otp)=)[^&\s]+/gi,
      "$1[REDACTED]"
    );
}

function errorField(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return redact(value);
}

function statusFor(err: Error): number {
  if (err instanceof zerotrustError) return err.statusCode;
  if (err instanceof HTTPException) return err.status;
  return 500;
}

function publicBodyFor(err: Error, status: number, requestId: string): ErrorBody {
  if (status >= 500) {
    return {
      error: ErrorCodes.INTERNAL_ERROR,
      message: GENERIC_INTERNAL_MESSAGE,
      requestId,
    };
  }

  if (err instanceof zerotrustError) {
    return {
      error: err.code,
      message: err.message,
      requestId,
    };
  }

  if (err instanceof HTTPException) {
    return {
      error: STATUS_ERROR_CODES[status] ?? "HTTP_ERROR",
      message: err.message || "Request failed",
      requestId,
    };
  }

  return {
    error: STATUS_ERROR_CODES[status] ?? "REQUEST_FAILED",
    message: "Request failed",
    requestId,
  };
}

function logDataFor(
  c: Context,
  err: unknown,
  status: number,
  requestId: string
): Record<string, unknown> {
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    errorCode: err instanceof zerotrustError ? err.code : undefined,
    errorMessage: errorField(error.message),
    errorName: error.name,
    errorStack: errorField(error.stack),
    method: c.req.method,
    path: c.req.path,
    requestId,
    status,
  };
}

function jsonError(c: Context, body: ErrorBody, status: number): Response {
  // `status` is derived at runtime from thrown errors (zerotrustError.statusCode,
  // HTTPException.status), so it can't be proven to match Hono's literal status
  // union at compile time — this cast names that specific target type instead
  // of widening to `any`.
  return c.json(body, status as ContentfulStatusCode, { "x-request-id": body.requestId });
}

export function internalErrorResponse(
  c: Context,
  logger: ApiLogger,
  logMessage: string,
  err: unknown
): Response {
  const requestId = requestIdFor(c);
  logger.error(logMessage, logDataFor(c, err, 500, requestId));
  return jsonError(
    c,
    {
      error: ErrorCodes.INTERNAL_ERROR,
      message: GENERIC_INTERNAL_MESSAGE,
      requestId,
    },
    500
  );
}

export function registerGlobalErrorHandler(
  app: Pick<Hono<HonoEnv>, "onError">,
  logger: ApiLogger = getLogger("api-error-handler")
): void {
  app.onError((err, c) => {
    const status = statusFor(err);
    const requestId = requestIdFor(c);
    const data = logDataFor(c, err, status, requestId);

    if (status >= 500) {
      logger.error("Unhandled API error", data);
    } else {
      logger.warn("Handled API error", data);
    }

    return jsonError(c, publicBodyFor(err, status, requestId), status);
  });
}
