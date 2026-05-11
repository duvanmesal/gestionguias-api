import cors from "cors";
import { Application } from "express";
import { corsOrigins } from "../config/env";

const nativeAppOrigins = [
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
];

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
    origin: [...new Set([...corsOrigins, ...nativeAppOrigins])],
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
