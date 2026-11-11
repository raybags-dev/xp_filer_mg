import { createServer } from "node:net";

export const freePort = async (port: number): Promise<void> => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  await new Promise<void>((resolve, reject) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Stop the existing process before starting the server.`,
          ),
        );
        return;
      }

      reject(error);
    });

    server.listen(port, "0.0.0.0", () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });
};
