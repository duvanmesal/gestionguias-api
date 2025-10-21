import type { CorsOptions, CorsOptionsDelegate } from "cors";

function parseAllowedOrigins(envValue?: string): string[] {
  if (!envValue) return [];
  return envValue.split(",").map(s => s.trim()).filter(Boolean);
}

export function buildCorsOptions(): CorsOptionsDelegate {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const allowCredentials =
    String(process.env.CORS_ALLOW_CREDENTIALS ?? "").toLowerCase() === "true";

  // ❗️OJO: NO usar genéricos aquí. Deja el delegate "plano".
  const delegate: CorsOptionsDelegate = (req, cb) => {
    const origin = (req.headers?.origin as string | undefined) ?? undefined;
    const isAllowed = !origin || allowedOrigins.includes(origin);

    const options: CorsOptions = {
      origin: isAllowed ? origin : false,
      credentials: allowCredentials,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      maxAge: 600,
    };

    cb(null, options);
  };

  return delegate;
}
