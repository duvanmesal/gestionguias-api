# 0) Fundamentos (Base de todo)

## 0.1 Propósito y responsabilidades

* **Propósito:** proveer una **columna vertebral transversal** (config, logs, validación, errores, DB, JWT, CI/CD) para que TODOS los módulos compartan el mismo estilo y contratos.
* **Responsabilidades clave:**

  1. **Configuración** (env) validada y centralizada.
  2. **Servidor HTTP** Express con middlewares estándar (CORS, Helmet, JSON).
  3. **Logger** consistente (pino + pino-http).
  4. **Modelo de errores** uniforme y envelope `{data, meta, error}`.
  5. **Validación** con Zod en **entrada** (body/query/params).
  6. **Prisma** (PostgreSQL): cliente único, transacciones, gestión de migraciones.
  7. **JWT**: firma/verificación (access/refresh), RBAC básico.
  8. **Healthcheck** y (luego) readiness/liveness.
  9. **CI/CD** mínimo viable.
* **No-responsable (anti-objetivos):**

  * Lógica de negocio, reglas de dominio, consultas complejas → van en módulos (Auth, Recaladas, etc.).
  * Render/SSR, websockets, colas: fuera de “Fundamentos” (pueden añadirse después).

---

## 0.2 Estructura de carpetas (mínima y extensible)

```
apps/api/
  prisma/
    schema.prisma
  src/
    app.ts                # Composición de middlewares y rutas
    server.ts             # Bootstrap del server
    config/env.ts         # Carga y validación del .env (Zod)
    prisma/client.ts      # PrismaClient singleton
    libs/                 # utilidades transversales
      logger.ts           # pino
      errors.ts           # jerarquía de errores
      http.ts             # helpers de respuesta estándar
      jwt.ts              # helpers JWT
      zod-mw.ts           # middleware validate()
      auth.ts             # requireAuth
      rbac.ts             # requireRoles
    middlewares/
      request-logger.ts   # pino-http
      error-handler.ts    # handler central de errores
    routes/
      health.ts           # /health
```

> **Mejorar/adaptar:** añadir `tests/`, `scripts/seed.ts`, `docs/` (OpenAPI/Insomnia), `.husky/` (pre-commit), `config/` por entorno.

---

## 0.3 Configuración (ENV) con validación estricta

**Objetivo:** fallar *rápido* si falta algo crítico. Evita “config by convention” silenciosa.

**Ejemplo (básico, mejorar para prod):**

```ts
// src/config/env.ts
import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development","test","production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:4200,http://localhost:8100")
});

export const env = Env.parse(process.env);
export const corsOrigins = env.CORS_ORIGINS.split(",").map(s=>s.trim());
```

**Cómo mejorarlo:**

* Soporte de múltiples `.env` por entorno; claves KMS/Secrets Manager; configuración jerárquica (convict/envalid).

---

## 0.4 Logging y trazabilidad

**Objetivo:** logs legibles en dev y estructurados en prod.

**Ejemplo (mínimo):**

```ts
// src/libs/logger.ts
import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV === "development"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined
});
```

```ts
// src/middlewares/request-logger.ts
import pinoHttp from "pino-http";
import { logger } from "../libs/logger";
export const requestLogger = pinoHttp({ logger });
```

**Cómo mejorarlo:**

* **correlationId** por request (X-Request-Id).
* Exportar a **Cloud Logging**, **ELK**, **OpenTelemetry**.
* Campos: userId, rol, ip, latency.

---

## 0.5 Modelo de error y envelope de respuesta

**Objetivo:** una sola forma de entregar éxito/fracaso.

**Ejemplo (mínimo):**

```ts
// src/libs/errors.ts
export class AppError extends Error {
  constructor(public status:number, public code:string, message:string, public details?:any) { super(message); }
}
export class ValidationAppError extends AppError { constructor(msg="Validation error", d?:any){ super(400,"VALIDATION_ERROR",msg,d);} }
export class UnauthorizedError extends AppError { constructor(msg="Unauthorized"){ super(401,"UNAUTHORIZED",msg);} }
export class ForbiddenError extends AppError { constructor(msg="Forbidden"){ super(403,"FORBIDDEN",msg);} }
export class NotFoundError extends AppError { constructor(msg="Not found"){ super(404,"NOT_FOUND",msg);} }
export class ConflictError extends AppError { constructor(msg="Conflict"){ super(409,"CONFLICT",msg);} }
export class BusinessError extends AppError { constructor(msg="Business rule violation", d?:any){ super(422,"BUSINESS_RULE_VIOLATION",msg,d);} }
```

```ts
// src/middlewares/error-handler.ts
import { ZodError } from "zod";
import { AppError, ConflictError } from "../libs/errors";

export function errorHandler(err:any, _req:any, res:any, _next:any) {
  if (err instanceof ZodError) {
    return res.status(400).json({ data:null, meta:null, error:{ code:"VALIDATION_ERROR", message:"Invalid input", details: err.flatten() }});
  }
  if (err?.code === "P2002") {
    return res.status(409).json({ data:null, meta:null, error:{ code:"CONFLICT", message:"Unique constraint failed" }});
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ data:null, meta:null, error:{ code:err.code, message:err.message, details:err.details ?? null }});
  }
  return res.status(500).json({ data:null, meta:null, error:{ code:"INTERNAL_SERVER_ERROR", message:"Unexpected error" }});
}
```

```ts
// src/libs/http.ts
export const ok = <T>(data:T, meta:any=null) => ({ data, meta, error:null });
export const created = <T>(data:T) => ({ data, meta:null, error:null });
```

**Cómo mejorarlo:**

* Catálogo de errores por módulo; i18n de mensajes; códigos de negocio propios; mapeo completo Prisma (P2003 FK, P2025 not found).

---

## 0.6 Validación de entrada (Zod) y middleware

**Objetivo:** nunca procesar payloads inválidos; tipado fuerte.

**Ejemplo (mínimo):**

```ts
// src/libs/zod-mw.ts
import { ZodTypeAny } from "zod";
export function validate(s:{body?:ZodTypeAny;query?:ZodTypeAny;params?:ZodTypeAny}) {
  return (req:any,_res:any,next:any)=>{
    try {
      if (s.body) req.body = s.body.parse(req.body);
      if (s.query) req.query = s.query.parse(req.query);
      if (s.params) req.params = s.params.parse(req.params);
      next();
    } catch(e){ next(e); }
  };
}
```

**Cómo mejorarlo:**

* Sanitización, coerción de tipos (fechas, números); mensajes de error custom.

---

## 0.7 Prisma (PostgreSQL): cliente, esquema y transacciones

**Objetivo:** acceso a datos seguro y consistente.

**Ejemplo (mínimo):**

```prisma
// prisma/schema.prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

enum RolType { SUPER_ADMIN SUPERVISOR GUIA }

model Usuario {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  nombre       String
  rol          RolType
  status       String   @default("ACTIVO")
  createdAt    DateTime @default(now())
}
```

```ts
// src/prisma/client.ts
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

**Cómo mejorarlo:**

* Eventos de logging de queries y métricas.
* Índices, FKs, **migraciones versionadas** (requerido en CD).
* **Transacciones** `$transaction()` en operaciones críticas.

---

## 0.8 JWT (access/refresh) y RBAC

**Objetivo:** identidad y autorización básicas desde el día 1.

**Ejemplo (mínimo):**

```ts
// src/libs/jwt.ts
import jwt from "jsonwebtoken";
import { env } from "../config/env";
export const signAccess = (payload:any)=> jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
export const verifyAccess = (t:string)=> jwt.verify(t, env.JWT_ACCESS_SECRET);
export const signRefresh = (payload:any)=> jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });
export const verifyRefresh = (t:string)=> jwt.verify(t, env.JWT_REFRESH_SECRET);
```

```ts
// src/libs/auth.ts
import { verifyAccess } from "./jwt";
import { UnauthorizedError } from "./errors";
export function requireAuth(req:any,_res:any,next:any){
  const token = req.headers.authorization?.replace("Bearer ","");
  if(!token) throw new UnauthorizedError("Missing token");
  try { req.user = verifyAccess(token); next(); }
  catch { throw new UnauthorizedError("Invalid/expired token"); }
}
```

```ts
// src/libs/rbac.ts
import { ForbiddenError, UnauthorizedError } from "./errors";
export const requireRoles = (...roles:string[]) =>
  (req:any,_res:any,next:any)=>{
    if(!req.user) throw new UnauthorizedError();
    if(!roles.includes(req.user.rol)) throw new ForbiddenError("Insufficient role");
    next();
  };
```

**Cómo mejorarlo:**

* Rotación de refresh tokens, **jti** y **blacklist**; permisos por recurso/acción; **scopes**.

---

## 0.9 App, Server y Healthcheck

**Objetivo:** servidor Express uniforme, seguro y observable.

**Ejemplo (mínimo):**

```ts
// src/app.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsOrigins } from "./config/env";
import { requestLogger } from "./middlewares/request-logger";
import { errorHandler } from "./middlewares/error-handler";
import { router as health } from "./routes/health";

const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use("/health", health);
// aquí montaremos /api/v1/*
app.use(errorHandler);
export default app;
```

```ts
// src/routes/health.ts
import { Router } from "express";
import { ok } from "../libs/http";
export const router = Router();
router.get("/", (_req,res)=> res.json(ok({ status:"ok", ts:new Date().toISOString() })));
```

```ts
// src/server.ts
import app from "./app";
import { env } from "./config/env";
app.listen(env.PORT, ()=> console.log(`API on :${env.PORT}`));
```

**Cómo mejorarlo:**

* Endpoints **/readiness** y **/liveness**; límites de tamaño/ratelimit; compresión.

---

## 0.10 Estándares transversales (paginación, fechas, versionado)

* **Envelope:** `{ data, meta, error }`.
* **Paginación:** `?page=1&pageSize=20` → `meta:{ page,pageSize,total }`.
* **Fechas:** ISO 8601 en UTC (parse/serializar con cuidado de zona).
* **Versionado de API:** prefijo `/api/v1` (v2 para breaking changes).

> **Mejorar:** middlewares utilitarios para parseo de fechas y construcción de `meta`.

---

## 0.11 CI: verificación mínima en cada push/PR

**Objetivo:** evitar que código no compilable/migraciones rotas lleguen a main.

**Ejemplo (básico):**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: app_ci }
        ports: ["5432:5432"]
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/app_ci?schema=public
      JWT_ACCESS_SECRET: test_access_secret_123456
      JWT_REFRESH_SECRET: test_refresh_secret_123456
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run build
      # TODO: lint, typecheck, test (añadir cuando existan)
```

**Cómo mejorarlo:**

* Jobs separados (lint, test, build); cachés; cobertura; tests e2e contra DB efímera.

---

## 0.12 Dockerfile e imagen base

**Objetivo:** tener artefacto desplegable y reproducible.

**Ejemplo (básico):**

```dockerfile
# Dockerfile (muy básico; mejorar con multi-stage)
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["node","dist/src/server.js"]
```

**Cómo mejorarlo:**

* **Multi-stage** (deps → build → runtime), copiar sólo `dist/` y Prisma client; reducir tamaño; user no-root.

---

## 0.13 Publicación de imagen (GHCR) y CD placeholder

**Ejemplo (muy básico):**

```yaml
# .github/workflows/docker.yml
name: Docker Build & Push
on:
  push: { branches: ["main"] }
  tags: ["v*.*.*"]
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/gestionguias-api:latest
```

**Script de deploy (placeholder, mejorar y adaptar):**

```bash
# deploy.sh (ejemplo mínimo; debes adaptarlo a tu servidor/Cloud Run)
set -euo pipefail
docker pull ghcr.io/<owner>/gestionguias-api:latest
# Migraciones antes de arrancar:
docker run --rm --network host --env-file .env ghcr.io/<owner>/gestionguias-api:latest npx prisma migrate deploy
# (re)iniciar tu servicio (compose/systemd/k8s/etc)
docker stop api || true
docker rm api || true
docker run -d --name api --env-file .env -p 3000:3000 ghcr.io/<owner>/gestionguias-api:latest
```

**Cómo mejorarlo:**

* **Multi-arch**, tags `:sha-`, `:main`, `:vX.Y.Z`, **cache** de build.
* En cloud: job de migración separado (Cloud Run Jobs / Kubernetes Job).

---

## 0.14 Definition of Done (Fundamentos)

* `GET /health` → **200**.
* `npm run prisma:migrate` → **sin errores**.
* **CI** verde en PR y `main`.
* Imagen publicada en GHCR al crear tag `**v0.1.0**`.

---

### Cierre

Estos **ejemplos son mínimos** y sirven para **arrancar**. Para producción, **mejóralos** con:

* seguridad (ratelimit, CORS por lista blanca, headers estrictos),
* observabilidad (trazas, métricas, APM),
* DX (tests, lint, pre-commit),
* despliegue confiable (migraciones atómicas, health/readiness, rollback),
* hardening de Docker (usuario no root, multi-stage, SBOM).

¿Te armo ahora el **scaffold inicial** con estos archivos (nombres exactos) para que copies/pegues y partamos con el **Apartado 1 (Auth + Usuarios/Roles)** sobre esta base?
