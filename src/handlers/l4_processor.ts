import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Handler } from "aws-lambda";
import sharp from "sharp";

import type { PipelineEvent, ProcessingOutputs } from "../types/pipeline.js";

import { log, logError } from "../utils/logger.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-central-1",
});

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;
const THUMBNAIL_QUALITY = 80;

export const handler: Handler<PipelineEvent, PipelineEvent> = async (
  event,
): Promise<PipelineEvent> => {
  const { bucket, key, imageId, correlationId } = event;

  log("INFO", "l4_processing_started", {
    imageId,
    bucket,
    key,
    correlationId,
  });

  try {
    if (event.status !== "VALIDATED") {
      throw new Error(
        `Image cannot be processed from status: ${event.status ?? "UNKNOWN"}`,
      );
    }

    // 1. Download original image from S3.
    const originalResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!originalResponse.Body) {
      throw new Error("S3 returned an empty image body");
    }

    const originalBuffer = Buffer.from(
      await originalResponse.Body.transformToByteArray(),
    );

    if (originalBuffer.length === 0) {
      throw new Error("Uploaded image is empty");
    }

    log("INFO", "l4_original_image_downloaded", {
      imageId,
      originalSizeBytes: originalBuffer.length,
      correlationId,
    });

    // 2. Extract image metadata.
    const image = sharp(originalBuffer);

    const imageMetadata = await image.metadata();

    if (!imageMetadata.width || !imageMetadata.height) {
      throw new Error("Unable to determine image dimensions");
    }

    const processedAt = new Date().toISOString();

    // 3. Generate WebP thumbnail.
    const thumbnailBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: THUMBNAIL_QUALITY,
      })
      .toBuffer();

    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();

    const outputPrefix = `processed/${imageId}`;

    const outputs: ProcessingOutputs = {
      thumbnail: {
        bucket,
        key: `${outputPrefix}/thumbnail.webp`,
        contentType: "image/webp",
        sizeBytes: thumbnailBuffer.length,
      },
      metadata: {
        bucket,
        key: `${outputPrefix}/metadata.json`,
        contentType: "application/json",
      },
      result: {
        bucket,
        key: `${outputPrefix}/processing-result.json`,
        contentType: "application/json",
      },
    };

    // 4. Upload thumbnail.
    await s3Client.send(
      new PutObjectCommand({
        Bucket: outputs.thumbnail.bucket,
        Key: outputs.thumbnail.key,
        Body: thumbnailBuffer,
        ContentType: outputs.thumbnail.contentType,
      }),
    );

    log("INFO", "l4_thumbnail_uploaded", {
      imageId,
      thumbnailKey: outputs.thumbnail.key,
      thumbnailSizeBytes: thumbnailBuffer.length,
      correlationId,
    });

    // 5. Upload image metadata.
    const metadataDocument = {
      schemaVersion: 1,
      imageId,
      correlationId,
      processedAt,

      original: {
        bucket,
        key,
        contentType: originalResponse.ContentType ?? null,
        sizeBytes: originalBuffer.length,
        format: imageMetadata.format ?? null,
        width: imageMetadata.width,
        height: imageMetadata.height,
        channels: imageMetadata.channels ?? null,
        space: imageMetadata.space ?? null,
        hasAlpha: imageMetadata.hasAlpha ?? null,
        orientation: imageMetadata.orientation ?? null,
      },

      thumbnail: {
        bucket: outputs.thumbnail.bucket,
        key: outputs.thumbnail.key,
        contentType: outputs.thumbnail.contentType,
        sizeBytes: thumbnailBuffer.length,
        format: thumbnailMetadata.format ?? null,
        width: thumbnailMetadata.width ?? null,
        height: thumbnailMetadata.height ?? null,
      },
    };

    const metadataBuffer = Buffer.from(
      JSON.stringify(metadataDocument, null, 2),
    );

    await s3Client.send(
      new PutObjectCommand({
        Bucket: outputs.metadata.bucket,
        Key: outputs.metadata.key,
        Body: metadataBuffer,
        ContentType: outputs.metadata.contentType,
      }),
    );

    outputs.metadata.sizeBytes = metadataBuffer.length;

    log("INFO", "l4_metadata_uploaded", {
      imageId,
      metadataKey: outputs.metadata.key,
      correlationId,
    });

    // 6. Write processing result last.
    // This acts as the final processing artifact.
    const processingResult = {
      schemaVersion: 1,
      imageId,
      correlationId,
      status: "SUCCESS",
      processedAt,
      outputs,
    };

    const resultBuffer = Buffer.from(JSON.stringify(processingResult, null, 2));

    await s3Client.send(
      new PutObjectCommand({
        Bucket: outputs.result.bucket,
        Key: outputs.result.key,
        Body: resultBuffer,
        ContentType: outputs.result.contentType,
      }),
    );

    outputs.result.sizeBytes = resultBuffer.length;

    log("INFO", "l4_processing_completed", {
      imageId,
      bucket,
      originalKey: key,
      outputs,
      processedAt,
      correlationId,
    });

    return {
      ...event,
      status: "PROCESSED",
      processedAt,
      outputs,
    };
  } catch (error: unknown) {
    logError("l4_processing_failed", error, {
      imageId,
      bucket,
      key,
      correlationId,
    });

    throw error;
  }
};
