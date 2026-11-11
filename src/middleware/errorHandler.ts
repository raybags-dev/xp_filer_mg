import type { ErrorRequestHandler } from "express";

import { logError } from "../utils/logger.js";

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req,
  res,
  _next,
): void => {
  const requestId = String(res.locals?.requestId ?? "unknown");

  const statusCode =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status <= 599
      ? err.status
      : 500;

  logError("http_request_failed", err, {
    requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
  });

  let errorMessage: string;

  if (statusCode >= 500) {
    errorMessage = "Internal server error";
  } else if (err instanceof Error) {
    errorMessage = err.message;
  } else {
    errorMessage = "Request failed";
  }

  res.status(statusCode).json({
    error: errorMessage,
    requestId,
  });
};
