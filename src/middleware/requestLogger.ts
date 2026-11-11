import type { RequestHandler, Response } from "express";
import morgan from "morgan";
import { randomUUID } from "node:crypto";
// import type { PipelineEvent, ServerResponse } from "../types/pipeline.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestIdMiddleware: RequestHandler = (req, res, next): void => {
  const incomingRequestId = req.get("X-Request-ID");

  const requestId =
    incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  next();
};

morgan.token("request-id", (_req, res) => {
  const expressResponse = res as Response;

  return String(expressResponse.locals?.requestId ?? "unknown");
});

export const requestLogger = morgan(
  (tokens, req, res) => {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: "http_request",
      requestId: tokens["request-id"](req, res),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number(tokens.status(req, res)),
      contentLength: tokens.res(req, res, "content-length"),
      responseTimeMs: Number(tokens["response-time"](req, res)),
      remoteAddress: tokens["remote-addr"](req, res),
      userAgent: tokens["user-agent"](req, res),
    });
  },
  {
    stream: {
      write: (message: string): void => {
        console.log(message.trim());
      },
    },
  },
);
