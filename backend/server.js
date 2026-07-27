import app from "./app.js";
import { connectDb } from "./src/db/mongoose.js";
import logger from "./src/utils/logger.js";

const PORT = process.env.PORT || 5000;

let server;

connectDb()
  .then(() => {
    server = app.listen(PORT, () => {
      logger.info(`AI Study Assistant backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });

// Handle graceful shutdown on signals sent by hosting platforms (e.g., Railway/Docker)
const shutdown = (signal) => {
  logger.info(`Received ${signal}. Closing HTTP server...`);
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed. Exiting process.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));