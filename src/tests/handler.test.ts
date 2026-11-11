import { SQSEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AWS SDK SFN client
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

// 2. Mock the AWS SDK SFN client cleanly
vi.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: vi.fn(() => ({
    send: sendMock,
  })),
  StartExecutionCommand: vi.fn((input) => input),
}));

import { handler } from "../handlers/l2_sqsListner.js";

describe("SQS Listener Lambda Handler Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STATE_MACHINE_ARN =
      "arn:aws:states:eu-central-1:640127756629:stateMachine:MockPipeline";
  });

  it("should process SQS event records and trigger Step Functions", async () => {
    const mockS3Event = {
      Records: [
        {
          s3: {
            bucket: { name: "review-data-main" },
            object: { key: "uploads/sample-image.png" },
          },
        },
      ],
    };

    const mockEvent: SQSEvent = {
      Records: [
        {
          messageId: "1",
          receiptHandle: "handle1",
          body: JSON.stringify(mockS3Event),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: "abc",
          eventSource: "aws:sqs",
          eventSourceARN:
            "arn:aws:sqs:eu-central-1:640127756629:image-upload-queue",
          awsRegion: "eu-central-1",
        },
      ],
    };

    sendMock.mockResolvedValueOnce({ executionArn: "arn:aws:states:..." });

    await handler(mockEvent, {} as any, {} as any);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stateMachineArn: process.env.STATE_MACHINE_ARN,
      }),
    );
  });
});
