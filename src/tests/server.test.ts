import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../app.js";

describe("Express Application", () => {
  it("returns a healthy response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("healthy");
    expect(response.body.service).toBe("xp-filer-mg-v1");
  });

  it("returns a request ID", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body.status).toBe("healthy");
  });

  it("preserves a valid incoming request ID", async () => {
    const requestId = "test-request-12345";

    const response = await request(app)
      .get("/health")
      .set("X-Request-ID", requestId);

    expect(response.headers["x-request-id"]).toBe(requestId);
  });

  it("returns security headers from Helmet", async () => {
    const response = await request(app).get("/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
  });

  it("returns the HTML 404 page for unknown browser routes", async () => {
    const response = await request(app).get("/unknown-route");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("Page not found");
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const response = await request(app).get("/api/unknown-route");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Route not found");
    expect(response.body.requestId).toBeDefined();
  });
});
