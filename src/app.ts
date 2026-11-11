import cors from "cors";
import express from "express";
import helmet from "helmet";

import { getPresignedUrl } from "./controllers/presignedController.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  requestIdMiddleware,
  requestLogger,
} from "./middleware/requestLogger.js";

const app = express();

app.disable("x-powered-by");

// Request identification
app.use(requestIdMiddleware);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          "https://image-data-processor-rb-2026.s3.eu-central-1.amazonaws.com",
        ],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);

//CORS
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-ID",
    ],
    exposedHeaders: ["X-Request-ID"],
  }),
);

// Request logging
app.use(requestLogger);

// 5. Request parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// 6. Static files
app.use(express.static("public"));

// 7. Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "xp-filer-mg-v1",
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.get("/api/presigned-url", getPresignedUrl);

// 404 handling
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({
      error: "Route not found",
      requestId: res.getHeader("X-Request-ID"),
    });

    return;
  }

  res.status(404).sendFile("404.html", {
    root: "public",
  });
});

// Global error handler
app.use(errorHandler);

export default app;
