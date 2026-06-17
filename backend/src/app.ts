import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { apiRouter } from "./routes";

export const app = express();

// Behind Nginx in production. Twilio signature validation uses TWILIO_WEBHOOK_URL from env,
// not the URL reconstructed by Express (protocol/host/port).
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    // Explicit allowlist from FRONTEND_URL + CORS_ALLOWED_ORIGINS (see backend/.env.example).
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
