export type PipelineStatus =
  | "RECEIVED"
  | "VALIDATED"
  | "PROCESSED"
  | "COMPLETED";

export interface ProcessingOutput {
  bucket: string;
  key: string;
  contentType: string;
  sizeBytes?: number;
}

export interface ProcessingOutputs {
  thumbnail: ProcessingOutput;
  metadata: ProcessingOutput;
  result: ProcessingOutput;
}

export interface PipelineEvent {
  bucket: string;
  key: string;
  imageId: string;
  timestamp: number;
  correlationId: string;
  status?: PipelineStatus;
  processedAt?: string;
  outputs?: ProcessingOutputs;
}

export interface CompletionMessage {
  eventId: string;
  event: "IMAGE_PROCESSED";
  imageId: string;
  bucket: string;
  key: string;
  status: "SUCCESS";
  processedAt: string;
  correlationId: string;
  outputs: ProcessingOutputs;
}

export interface S3NotificationRecord {
  eventTime?: string;
  eventName?: string;
  s3: {
    bucket: {
      name: string;
    };
    object: {
      key: string;
    };
  };
}
