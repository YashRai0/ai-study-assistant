import app from "./app.js";
import { connectDb } from "./src/db/mongoose.js";
import logger from "./src/utils/logger.js";

const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`AI Study Assistant backend running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });
