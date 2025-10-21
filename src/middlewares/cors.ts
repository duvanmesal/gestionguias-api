import cors from "cors";
import { Application } from "express";
import { buildCorsOptions } from "../config/cors";
import { corsOrigins } from "../config/env";

export function applyCors(app: Application) {
    const allowedHeaders = [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Client-Platform",
      "X-Request-Id", // <- clave para tu error
    ];

    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
    const corsOptions: cors.CorsOptions = {
    origin: corsOrigins,
    credentials: true,
    methods,
    allowedHeaders,
    exposedHeaders: ["Set-Cookie", "X-Request-Id"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
  app.options("*", cors(corsOptions));
  app.use(cors(corsOptions));
}
