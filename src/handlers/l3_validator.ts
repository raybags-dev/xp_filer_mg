import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Handler } from "aws-lambda";

import type { PipelineEvent } from "../types/pipeline.js";
import { log, logError } from "../utils/logger.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-central-1",
});

const ALLOWED_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const handler: Handler<PipelineEvent, PipelineEvent> = async (
  event,
): Promise<PipelineEvent> => {
  const { bucket, key, imageId, correlationId } = event;

  log("INFO", "l3_validation_started", {
    imageId,
    bucket,
    key,
    correlationId,
  });

  try {
    if (!bucket || !key || !imageId) {
      throw new Error("Pipeline event is missing required fields");
    }

    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const expectedContentType = ALLOWED_TYPES[extension];

    if (!expectedContentType) {
      throw new Error(`Invalid file extension: .${extension}`);
    }

    const result = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!result.ContentLength || result.ContentLength <= 0) {
      throw new Error("Uploaded image is empty");
    }

    if (result.ContentType !== expectedContentType) {
      throw new Error(
        `Content type mismatch. Expected ${expectedContentType}, received ${result.ContentType ?? "unknown"}`,
      );
    }

    log("INFO", "l3_validation_completed", {
      imageId,
      bucket,
      key,
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      correlationId,
    });

    return {
      ...event,
      status: "VALIDATED",
    };
  } catch (error: unknown) {
    logError("l3_validation_failed", error, {
      imageId,
      bucket,
      key,
      correlationId,
    });

    throw error;
  }
};
