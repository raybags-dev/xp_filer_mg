import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSignedUrlMock, getOrCreateUploadRecordMock } = vi.hoisted(() => ({
  getSignedUrlMock: vi.fn(),
  getOrCreateUploadRecordMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({})),
  PutObjectCommand: vi.fn((input) => input),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

// IMPORTANT: This path must match the controller import.
vi.mock("../service/idempotencyStore.js", () => {
  class IdempotencyConflictError extends Error {
    constructor() {
      super(
        "Idempotency key has already been used with different upload details",
      );

      this.name = "IdempotencyConflictError";
    }
  }

  return {
    getOrCreateUploadRecord: getOrCreateUploadRecordMock,
    IdempotencyConflictError,
  };
});

import app from "../app.js";
import { IdempotencyConflictError } from "../service/idempotencyStore.js";

describe("Presigned URL Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.AWS_BUCKET_NAME = "image-data-processor-rb-2026";
    process.env.AWS_REGION = "eu-central-1";

    getOrCreateUploadRecordMock.mockImplementation(async (record) => record);

    getSignedUrlMock.mockResolvedValue(
      "https://mock-s3-presigned-url.amazonaws.com/test-upload",
    );
  });

  it("returns 400 when filename or type is missing", async () => {
    const response = await request(app)
      .get("/api/presigned-url?filename=photo.jpg")
      .set("Idempotency-Key", "test-key-12345");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Missing or invalid");
  });

  it("returns 400 when idempotency key is missing", async () => {
    const response = await request(app).get(
      "/api/presigned-url?filename=photo.jpg&type=image/jpeg",
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Idempotency-Key");
  });

  it("rejects unsupported content types", async () => {
    const response = await request(app)
      .get("/api/presigned-url?filename=photo.gif&type=image/gif")
      .set("Idempotency-Key", "test-key-12345");

    expect(response.status).toBe(415);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
    expect(getOrCreateUploadRecordMock).not.toHaveBeenCalled();
  });

  it("generates a presigned URL for a valid upload", async () => {
    const response = await request(app)
      .get("/api/presigned-url?filename=photo.jpg&type=image/jpeg")
      .set("Idempotency-Key", "test-key-12345");

    expect(response.status).toBe(200);

    expect(response.body.imageId).toBeDefined();

    expect(response.body.uploadUrl).toBe(
      "https://mock-s3-presigned-url.amazonaws.com/test-upload",
    );

    expect(response.body.key).toMatch(/^uploads\/[0-9a-f-]{36}\/photo\.jpg$/);

    expect(response.body.expiresIn).toBe(60);
    expect(response.body.requestId).toBeDefined();

    expect(getOrCreateUploadRecordMock).toHaveBeenCalledTimes(1);
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when an idempotency key conflicts", async () => {
    getOrCreateUploadRecordMock.mockRejectedValueOnce(
      new IdempotencyConflictError(),
    );

    const response = await request(app)
      .get("/api/presigned-url?filename=photo.jpg&type=image/jpeg")
      .set("Idempotency-Key", "conflicting-key-123");

    expect(response.status).toBe(409);

    expect(response.body.error).toContain("Idempotency key was already used");

    expect(response.body.requestId).toBeDefined();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("returns 500 when presigned URL generation fails", async () => {
    getSignedUrlMock.mockRejectedValueOnce(new Error("AWS S3 error"));

    const response = await request(app)
      .get("/api/presigned-url?filename=photo.jpg&type=image/jpeg")
      .set("Idempotency-Key", "test-key-12345");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Unable to generate upload URL");
    expect(response.body.requestId).toBeDefined();
  });
});
