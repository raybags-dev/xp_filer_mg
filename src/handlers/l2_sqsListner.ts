import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { SQSHandler } from "aws-lambda";

import type { PipelineEvent, S3NotificationRecord } from "../types/pipeline.js";

import { log, logError } from "../utils/logger.js";

const region = process.env.AWS_REGION || "eu-central-1";

const sfnClient = new SFNClient({ region });

const decodeS3Key = (key: string): string =>
  decodeURIComponent(key.replace(/\+/g, " "));

const isS3Notification = (
  value: unknown,
): value is { Records: S3NotificationRecord[] } => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "Records" in value && Array.isArray(value.Records);
};

const processS3Record = async (
  s3Record: S3NotificationRecord,
): Promise<void> => {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;

  if (!stateMachineArn) {
    throw new Error("STATE_MACHINE_ARN is not configured");
  }

  const bucket = s3Record.s3.bucket.name;
  const key = decodeS3Key(s3Record.s3.object.key);

  if (!key.startsWith("uploads/")) {
    log("WARN", "s3_event_ignored_unexpected_prefix", {
      bucket,
      key,
    });
    return;
  }

  const imageId = key.split("/")[1];

  if (!imageId) {
    throw new Error(`Unable to extract image ID from S3 key: ${key}`);
  }

  const event: PipelineEvent = {
    bucket,
    key,
    imageId,
    timestamp: s3Record.eventTime
      ? new Date(s3Record.eventTime).getTime()
      : Date.now(),
    correlationId: imageId,
    status: "RECEIVED",
  };

  log("INFO", "s3_upload_event_received", {
    imageId,
    bucket,
    key,
    correlationId: event.correlationId,
  });

  try {
    const result = await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn,
        name: imageId,
        input: JSON.stringify(event),
      }),
    );

    log("INFO", "step_functions_execution_started", {
      imageId,
      executionArn: result.executionArn,
      correlationId: event.correlationId,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ExecutionAlreadyExists") {
      log("WARN", "duplicate_step_functions_execution_ignored", {
        imageId,
        correlationId: event.correlationId,
      });

      return;
    }

    logError("step_functions_execution_failed", error, {
      imageId,
      bucket,
      key,
      correlationId: event.correlationId,
    });

    throw error;
  }
};

export const handler: SQSHandler = async (event): Promise<void> => {
  log("INFO", "l2_sqs_handler_started", {
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    log("INFO", "sqs_message_received", {
      messageId: record.messageId,
      receiveCount: record.attributes.ApproximateReceiveCount,
    });

    let message: unknown;

    try {
      message = JSON.parse(record.body);
    } catch (error: unknown) {
      logError("invalid_sqs_message_json", error, {
        messageId: record.messageId,
      });

      throw error;
    }

    // Ignore S3 test notifications.
    if (
      typeof message === "object" &&
      message !== null &&
      "Event" in message &&
      message.Event === "s3:TestEvent"
    ) {
      log("INFO", "s3_test_event_ignored", {
        messageId: record.messageId,
      });

      continue;
    }

    if (!isS3Notification(message)) {
      log("WARN", "unsupported_sqs_message_ignored", {
        messageId: record.messageId,
      });

      continue;
    }

    for (const s3Record of message.Records) {
      await processS3Record(s3Record);
    }
  }

  log("INFO", "l2_sqs_handler_completed", {
    recordCount: event.Records.length,
  });
};
