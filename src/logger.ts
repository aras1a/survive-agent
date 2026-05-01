import pino from "pino";
import { env } from "./config.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
  base: { service: "survive-agent" },
});

export type Logger = typeof logger;
