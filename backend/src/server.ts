import { app } from "./app";
import { env } from "./config/env";
import { closeDatabase, connectDatabase } from "./database/connection";

const startServer = async (): Promise<void> => {
  await connectDatabase();

  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
};

const shutdown = async (): Promise<void> => {
  await closeDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void startServer().catch((error) => {
  console.error("Failed to start server.", error);
  void closeDatabase().finally(() => {
    process.exit(1);
  });
});
