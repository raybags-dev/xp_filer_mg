import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { RequestHandler } from "express";
import { createHash, randomUUID } from "node:crypto";

import {
  getOrCreateUploadRecord,
  IdempotencyConflictError,
} from "../service/idempotencyStore.js";

import { log } from "../utils/logger.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-central-1",
});

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const sanitizeFilename = (filename: string): string => {
  const basename = filename.split(/[\\/]/).pop() ?? "";

  const sanitized = basename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);

  if (
    !sanitized ||
    sanitized === "." ||
    sanitized === ".." ||
    !sanitized.includes(".")
  ) {
    throw new Error("Invalid filename");
  }

  return sanitized;
};

const hashValue = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const getPresignedUrl: RequestHandler = async (
  req,
  res,
): Promise<void> => {
  const requestId = String(res.locals?.requestId ?? "unknown");

  try {
    const filename = req.query.filename;
    const contentType = req.query.type;
    const idempotencyHeader = req.get("Idempotency-Key");

    if (
      typeof filename !== "string" ||
      typeof contentType !== "string" ||
      !filename.trim() ||
      !contentType.trim()
    ) {
      res.status(400).json({
        error: "Missing or invalid filename or type query parameters",
        requestId,
      });
      return;
    }

    if (
      !idempotencyHeader ||
      idempotencyHeader.length < 8 ||
      idempotencyHeader.length > 128
    ) {
      res.status(400).json({
        error: "A valid Idempotency-Key header is required",
        requestId,
      });
      return;
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      res.status(415).json({
        error: "Unsupported image content type",
        allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
        requestId,
      });
      return;
    }

    const bucketName = process.env.AWS_BUCKET_NAME;

    if (!bucketName) {
      log("ERROR", "aws_bucket_not_configured", { requestId });

      res.status(500).json({
        error: "Unable to generate upload URL",
        requestId,
      });
      return;
    }

    const cleanFilename = sanitizeFilename(filename);
    const idempotencyKey = hashValue(idempotencyHeader);

    const requestHash = hashValue(
      JSON.stringify({
        filename: cleanFilename,
        contentType,
      }),
    );

    const imageId = randomUUID();
    const objectKey = `uploads/${imageId}/${cleanFilename}`;

    const now = Math.floor(Date.now() / 1000);

    const record = await getOrCreateUploadRecord({
      idempotencyKey,
      requestHash,
      imageId,
      key: objectKey,
      filename: cleanFilename,
      contentType,
      createdAt: new Date().toISOString(),
      expiresAt: now + 86400,
    });

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: record.key,
      ContentType: record.contentType,
      Metadata: {
        imageid: record.imageId,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60,
    });

    log("INFO", "presigned_upload_url_created", {
      requestId,
      imageId: record.imageId,
      bucket: bucketName,
      key: record.key,
      contentType: record.contentType,
    });

    res.status(200).json({
      imageId: record.imageId,
      uploadUrl,
      key: record.key,
      expiresIn: 60,
      requestId,
    });
  } catch (error: unknown) {
    if (error instanceof IdempotencyConflictError) {
      log("WARN", "idempotency_key_conflict", {
        requestId,
      });

      res.status(409).json({
        error: "Idempotency key was already used for a different request.",
        requestId,
      });
      return;
    }

    log("ERROR", "presigned_upload_url_generation_failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: "Unable to generate upload URL",
      requestId,
    });
  }
};
