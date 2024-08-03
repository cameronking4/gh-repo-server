import { log } from "./deps.ts";

   await log.setup({
     handlers: {
       console: new log.handlers.ConsoleHandler("INFO"),
       file: new log.handlers.FileHandler("ERROR", {
         filename: "./logs/error.log",
         formatter: "{datetime} {levelName} {msg}",
       }),
     },
     loggers: {
       default: {
         level: "INFO",
         handlers: ["console", "file"],
       },
     },
   });

   export const logger = log.getLogger();