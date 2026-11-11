import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import { log } from "../utils/logger.js";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-central-1",
});

const documentClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME;

export interface UploadIdempotencyRecord {
  idempotencyKey: string;
  requestHash: string;
  imageId: string;
  key: string;
  filename: string;
  contentType: string;
  createdAt: string;
  expiresAt: number;
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super(
      "Idempotency key has already been used with different upload details",
    );
    this.name = "IdempotencyConflictError";
  }
}

const getRecord = async (
  idempotencyKey: string,
): Promise<UploadIdempotencyRecord | undefined> => {
  if (!TABLE_NAME) {
    throw new Error("IDEMPOTENCY_TABLE_NAME is not configured");
  }

  const result = await documentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { idempotencyKey },
      ConsistentRead: true,
    }),
  );

  return result.Item as UploadIdempotencyRecord | undefined;
};

export const getOrCreateUploadRecord = async (
  record: UploadIdempotencyRecord,
): Promise<UploadIdempotencyRecord> => {
  if (!TABLE_NAME) {
    throw new Error("IDEMPOTENCY_TABLE_NAME is not configured");
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    await documentClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
        ConditionExpression:
          "attribute_not_exists(idempotencyKey) OR expiresAt <= :now",
        ExpressionAttributeValues: {
          ":now": now,
        },
      }),
    );

    log("INFO", "idempotency_record_created", {
      imageId: record.imageId,
      idempotencyKey: record.idempotencyKey,
    });

    return record;
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      error.name !== "ConditionalCheckFailedException"
    ) {
      throw error;
    }

    const existingRecord = await getRecord(record.idempotencyKey);

    if (!existingRecord) {
      throw new Error(
        "Idempotency record could not be retrieved after a conditional write conflict",
      );
    }

    if (existingRecord.expiresAt <= now) {
      return getOrCreateUploadRecord(record);
    }

    if (existingRecord.requestHash !== record.requestHash) {
      throw new IdempotencyConflictError();
    }

    log("INFO", "idempotency_record_reused", {
      imageId: existingRecord.imageId,
      idempotencyKey: record.idempotencyKey,
    });

    return existingRecord;
  }
};
