export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogContext {
  requestId?: string;
  imageId?: string;
  executionId?: string;
  bucket?: string;
  key?: string;
  [key: string]: unknown;
}

export const log = (
  level: LogLevel,
  message: string,
  context: LogContext = {},
): void => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serialized = JSON.stringify(entry);

  switch (level) {
    case "ERROR":
      console.error(serialized);
      break;

    case "WARN":
      console.warn(serialized);
      break;

    default:
      console.log(serialized);
  }
};

export const logError = (
  message: string,
  error: unknown,
  context: LogContext = {},
): void => {
  const errorDetails =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : {
          message:
            typeof error === "object" && error !== null
              ? (JSON.stringify(error) ?? String(error))
              : String(error),
        };

  log("ERROR", message, {
    ...context,
    error: errorDetails,
  });
};
