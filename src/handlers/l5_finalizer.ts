import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

import type { Handler } from "aws-lambda";

import type { CompletionMessage, PipelineEvent } from "../types/pipeline.js";

import { log, logError } from "../utils/logger.js";

const region = process.env.AWS_REGION || "eu-central-1";

const s3Client = new S3Client({ region });
const sqsClient = new SQSClient({ region });

export const handler: Handler<
  PipelineEvent,
  { status: string; imageId: string; eventId: string }
> = async (event) => {
  const { bucket, key, imageId, correlationId, processedAt, outputs } = event;

  log("INFO", "l5_finalization_started", {
    imageId,
    bucket,
    key,
    correlationId,
  });

  try {
    if (event.status !== "PROCESSED") {
      throw new Error(
        `Cannot finalize image with status: ${event.status ?? "UNKNOWN"}`,
      );
    }

    if (!processedAt) {
      throw new Error("Pipeline event is missing processedAt");
    }

    if (!outputs) {
      throw new Error("Pipeline event is missing processing outputs");
    }

    const expectedPrefix = `processed/${imageId}/`;

    // 1. Verify that every expected output exists.
    await Promise.all(
      Object.entries(outputs).map(async ([outputName, output]) => {
        if (output.bucket !== bucket) {
          throw new Error(
            `${outputName} output references an unexpected bucket`,
          );
        }

        if (!output.key.startsWith(expectedPrefix)) {
          throw new Error(
            `${outputName} output references an unexpected S3 key`,
          );
        }

        const head = await s3Client.send(
          new HeadObjectCommand({
            Bucket: output.bucket,
            Key: output.key,
          }),
        );

        if (!head.ContentLength || head.ContentLength <= 0) {
          throw new Error(
            `${outputName} output is missing or empty: ${output.key}`,
          );
        }

        if (head.ContentType && head.ContentType !== output.contentType) {
          throw new Error(
            `${outputName} output has an unexpected content type`,
          );
        }

        log("INFO", "l5_output_verified", {
          imageId,
          outputName,
          outputKey: output.key,
          sizeBytes: head.ContentLength,
          correlationId,
        });
      }),
    );

    // 2. Prepare completion notification.
    const completionQueueUrl = process.env.COMPLETION_QUEUE_URL;

    if (!completionQueueUrl) {
      throw new Error("COMPLETION_QUEUE_URL is not configured");
    }

    const completionMessage: CompletionMessage = {
      eventId: `${imageId}:IMAGE_PROCESSED`,
      event: "IMAGE_PROCESSED",
      imageId,
      bucket,
      key,
      status: "SUCCESS",
      processedAt,
      correlationId,
      outputs,
    };

    // 3. Publish completion notification.
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: completionQueueUrl,
        MessageBody: JSON.stringify(completionMessage),
      }),
    );

    log("INFO", "l5_completion_notification_sent", {
      imageId,
      eventId: completionMessage.eventId,
      outputs,
      correlationId,
    });

    return {
      status: "SUCCESS",
      imageId,
      eventId: completionMessage.eventId,
    };
  } catch (error: unknown) {
    logError("l5_finalization_failed", error, {
      imageId,
      bucket,
      key,
      correlationId,
    });

    throw error;
  }
};
