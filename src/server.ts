import "dotenv/config";

import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import app from "./app.js";
import { log, logError } from "./utils/logger.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

export const startServer = (): ReturnType<typeof createServer> => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid server port: ${port}`);
  }

  const server = createServer(app);

  server.on("error", (error: NodeJS.ErrnoException) => {
    logError("server_error", error, {
      port,
      host,
    });
  });

  server.listen(port, host, () => {
    log("INFO", "server_started", {
      host,
      port,
      environment: process.env.NODE_ENV || "development",
      url: `http://localhost:${port}`,
    });
  });

  return server;
};

// Start only when this file is executed directly.
const entryPoint = process.argv[1];

const isMainModule =
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPoint)).href;

if (isMainModule) {
  try {
    startServer();
  } catch (error: unknown) {
    logError("server_startup_failed", error);
    process.exitCode = 1;
  }
}
