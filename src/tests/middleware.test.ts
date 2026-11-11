import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../middleware/errorHandler.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler", () => {
  it("should log the error and return a 500 response", () => {
    const err = new Error("Database connection failed");

    const req = {
      method: "GET",
      originalUrl: "/api/test",
    } as Request;

    const res = {
      locals: {},
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(err, req, res, next);

    expect(consoleSpy).toHaveBeenCalledOnce();

    const loggedEntry = JSON.parse(String(consoleSpy.mock.calls[0][0]));

    expect(loggedEntry.level).toBe("ERROR");
    expect(loggedEntry.message).toBe("http_request_failed");
    expect(loggedEntry.requestId).toBe("unknown");
    expect(loggedEntry.statusCode).toBe(500);

    expect(loggedEntry.error.message).toBe("Database connection failed");

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      error: "Internal server error",
      requestId: "unknown",
    });

    expect(next).not.toHaveBeenCalled();
  });
});
