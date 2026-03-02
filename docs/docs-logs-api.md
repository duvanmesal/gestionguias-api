# 🧩 Sistema Global de Logs (API `gestionguias-api` + microservicio `corpoturismo-logs-service`)

> Esta documentación describe **cómo funciona** y **cómo extender** el sistema de logs/auditoría que integraste en tu API.  
> Está pensada para que otra IA o un dev nuevo pueda entender el diseño, replicarlo módulo por módulo y depurarlo sin adivinar nada.

---

## 0) Objetivo (por qué existe esto)

Centralizar eventos operativos/auditables (y posteriormente mailing) en un microservicio dedicado con MongoDB, para lograr:

- **Trazabilidad**: seguir una petición de punta a punta (por `requestId`).
- **Auditoría**: quién hizo qué, sobre qué entidad y cuándo (actor/target).
- **Observabilidad**: detectar errores recurrentes, picos, endpoints fallando, etc.
- **Aislamiento**: el logging **nunca debe tumbar tu API** (fail-silent).

---

## 1) Arquitectura (vista general)

### 1.1 Componentes

**En `gestionguias-api`:**
- `requestContext` (middleware): genera/propaga `x-request-id` y mide duración.
- `requestLogger` (pino-http): log HTTP en consola (o destino configurado por `logger`).
- `responseLog` (middleware): al terminar la respuesta, publica un log estructurado al microservicio.
- `errorHandler` (middleware): unifica el formato de error HTTP y además publica `http.error`.
- `libs/logs/*`: “facade” (builder + client + service) para publicar eventos al microservicio.

**En `corpoturismo-logs-service`:**
- Endpoints de ingesta/consulta (`POST /logs`, `GET /logs`, `GET /logs/stats`, etc.)
- MongoDB + índices (incluye TTL para retención automática).

### 1.2 Flujo de una petición típica

1. Entra request a Express.
2. `requestContext`:
   - obtiene `x-request-id` o genera UUID
   - guarda `req.requestId`
   - guarda `req.startAt` para calcular duración
   - responde con `x-request-id` al cliente
3. `requestLogger` (pino-http):
   - usa el requestId ya definido (si existe)
   - clasifica nivel según status
4. Router / controller / service (lógica de negocio):
   - publica logs de auditoría con `logsService.audit(req, {...})`
5. Response sale.
6. `responseLog` escucha `finish`:
   - calcula status + duración
   - publica `http.response` al microservicio
7. Si explota algo:
   - `errorHandler` normaliza, responde JSON estándar
   - publica `http.error` al microservicio

---

## 2) Variables de entorno (API)

Archivo: `src/config/env.ts`

```ts
// Logs microservice (global)
LOGS_SERVICE_URL: z.string().url().default("http://localhost:4010"),
LOGS_INGEST_API_KEY: z.string().default(""),
LOGS_ENABLED: z.coerce.boolean().default(true),
LOGS_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1500),

// Identidad del servicio emisor
SERVICE_NAME: z.string().default("gestionguias-api"),
```

### 2.1 Semántica

- `LOGS_ENABLED`
  - `false`: desactiva todo (no se envía nada).
- `LOGS_SERVICE_URL`
  - URL base del microservicio.  
  - En Docker **debe** apuntar al hostname del container: `http://logs-service:4010`.
- `LOGS_INGEST_API_KEY`
  - API Key para ingesta (`POST /logs`, `/logs/batch`), se envía como header `x-api-key`.
  - Si está vacío, **no se envía nada** (por diseño).
- `LOGS_TIMEOUT_MS`
  - Timeout de red (abort controller). Recomendado corto (1–2s).
- `SERVICE_NAME`
  - Identidad del emisor (útil si después hay más servicios publicando logs).

---

## 3) Contratos en Express (tipos)

Archivo: `src/types/express.d.ts`

```ts
declare module "express-serve-static-core" {
  interface Request {
    clientPlatform?: "WEB" | "MOBILE"
    requestId?: string
    startAt?: bigint | number
    user?: any
  }
}
```

### 3.1 Campos usados por el logging

- `req.clientPlatform`: se setea por tu middleware de platform (ya existente en tu proyecto).
- `req.requestId`: se setea en `requestContext`.
- `req.startAt`: se setea en `requestContext` y se usa para `durationMs`.
- `req.user`: se setea por tu auth middleware (JWT).  
  El builder toma `id|userId|sub`, `email`, `role`.

---

## 4) Middlewares (API)

### 4.1 `requestContext`

Archivo: `src/middlewares/requestContext.ts`

Responsabilidades:
- Asegurar un `requestId` único por request.
- Propagar `x-request-id` al cliente.
- Marcar inicio para medir tiempo total.

Reglas:
- Si el cliente envía `x-request-id`, se respeta.
- Si no, se genera UUID (crypto).

### 4.2 `requestLogger` (pino-http)

Archivo: `src/middlewares/request-logger.ts`

Responsabilidades:
- Loguear en consola (o salida configurada del logger) en cada request.
- Reusar `req.requestId` si existe.

Detalles clave:
- `genReqId`:
  - intenta `req.requestId` (del `requestContext`)
  - fallback a header
  - y si no existe, pino-http genera uno interno
- `customLogLevel`:
  - 4xx -> warn
  - 5xx/err -> error
  - 3xx -> silent
  - 2xx -> info

### 4.3 `responseLog`

Archivo: `src/middlewares/response-log.ts`

```ts
res.on("finish", () => {
  logsService.httpLog(req, res, {
    event: "http.response",
    meta: { clientPlatform: req.clientPlatform },
  })
})
```

Responsabilidad:
- Publicar un evento final por request:
  - status
  - duración
  - requestId
  - path, método, ip, userAgent
  - actor si hay usuario autenticado

**Nota:** se ejecuta incluso si hubo error (igual se dispara `finish` cuando Express ya respondió).

### 4.4 `errorHandler`

Archivo: `src/middlewares/error-handler.ts`

Responsabilidades:
- Normalizar salida HTTP de errores (formato `error { code, message, details }`).
- Publicar un evento `http.error` con nivel `error` (o `warn` si tú lo quisieras).

Casos cubiertos:
- JSON inválido (`entity.parse.failed` o `SyntaxError` con `body`).
- Zod validation error -> `VALIDATION_ERROR` (400).
- Prisma:
  - `P2002` unique -> `CONFLICT` (409)
  - `P2025` not found -> `NOT_FOUND` (404)
  - Otros `Pxxxx` -> `PRISMA_Pxxxx` (500)
- `AppError` (tus errores de dominio) -> status y code propio.
- Fallback -> `INTERNAL_SERVER_ERROR` (500)

Publicación al logs-service:
- Cada error que se responde se acompaña de un `logsService.audit(req, { event: "http.error", level: "error", ... })`
- Se adjunta `httpStatus` y `clientPlatform`.

---

## 5) `libs/logs` (API)

Ubicación: `src/libs/logs/*`

### 5.1 Modelo de evento (payload)

Archivo: `logs.builder.ts`

Campos principales (`LogsItem`):

```ts
type LogsItem = {
  level: "info" | "warn" | "error"
  event: string
  message?: string
  service: string
  requestId?: string
  actor?: { userId?: string; email?: string; role?: string }
  target?: { entity?: string; id?: string; email?: string }
  http?: {
    method?: string
    path?: string
    status?: number
    ip?: string
    userAgent?: string
    durationMs?: number
  }
  meta?: Record<string, any>
  ts: string
}
```

#### Reglas de construcción
- `service`: siempre `env.SERVICE_NAME`.
- `requestId`: de `req.requestId` o header `x-request-id`.
- `actor`: se infiere de `req.user` si existe.
- `http`: siempre adjunta method/path/ip/userAgent/duration; status se añade en response.
- `ts`: ISO string (UTC).

### 5.2 Cliente HTTP hacia logs-service

Archivo: `logs.client.ts`

Características:
- **Fail-silent total**: si falla, la API sigue viva.
- **Timeout** con `AbortController` (`LOGS_TIMEOUT_MS`).
- Retries livianos (0 a 2, por defecto 1):
  - reintenta solo en 5xx o errores de red
  - si logs-service responde 4xx, no reintenta (payload malo o API key mala)

Headers de ingesta:
- `content-type: application/json`
- `x-api-key: LOGS_INGEST_API_KEY`

Endpoints usados:
- `POST /logs` (evento único)
- `POST /logs/batch` (para futuro, si quieres bulk)

### 5.3 Facade (`logsService`)

Archivo: `logs.service.ts`

```ts
logsService.audit(req, {...})  // eventos de negocio/auditoría
logsService.httpLog(req, res)  // evento final http.response
```

**Diseño importante:** `void sendLog(item)` se dispara sin await para no bloquear requests.

---

## 6) Taxonomía de eventos (convención)

Para que el sistema no se vuelva una selva, usa convención:

### 6.1 Formato recomendado
- `modulo.accion.estado` (3 niveles) o `modulo.accion` (2 niveles)
- Ejemplos:
  - `auth.login.success`
  - `auth.login.failed`
  - `users.create.success`
  - `users.update.failed`
  - `http.response`
  - `http.error`

### 6.2 Niveles
- `info`: operaciones exitosas o informativas.
- `warn`: intentos fallidos esperables (credenciales inválidas, validación, etc.)
- `error`: fallos no esperados (500, Prisma, crash, etc.)

### 6.3 `target` (entidad afectada)
Usa `target` para búsquedas posteriores:
- `target.entity`: `"User" | "Session" | "Recalada" | "Atencion" | ...`
- `target.id`: id principal
- `target.email`: si aplica

### 6.4 `meta` (contexto extra)
Regla: **nunca metas secretos** (password, tokens, api keys).  
`meta` se usa para:
- `reason` (motivo del fallo)
- `platform`, `ip`, `userAgent`
- `sessionId`
- contadores, flags, etc.

---

## 7) Integración módulo por módulo (patrón DRY)

La meta: que todos los módulos logueen de forma consistente sin copiar y pegar ruido.

### 7.1 Dónde loguear (regla práctica)
- En **service** cuando se decide el resultado de negocio:
  - create/update/cancel/assign, etc.
- En **controller** solo cuando:
  - quieres log de “entrada” (debug) o de trazas de request
  - pero los eventos auditables mejor en service

### 7.2 Checklist para agregar logs a un módulo nuevo
1. Identifica **acciones auditables** (CRUD + acciones especiales):
   - crear, actualizar, cancelar, asignar, cerrar, reabrir, etc.
2. Para cada acción, define eventos:
   - `mod.action.success`
   - `mod.action.failed` (cuando aplica)
3. Define `target`:
   - entidad + id
4. Define `meta`:
   - campos relevantes (sin secretos)
5. Asegura que los métodos del service reciben `req: Request`
   - Si no quieres acoplar el service al request, alternativa:
     - pasar `ctx` (requestId, user, platform, ip) y construir logs con eso  
     (pero hoy ya estás usando `req`, así que mantén consistencia).
6. Si una acción puede fallar por motivos esperables:
   - log en `warn` con `meta.reason`

### 7.3 Plantillas rápidas

**Success**
```ts
logsService.audit(req, {
  event: "recaladas.create.success",
  target: { entity: "Recalada", id: String(recalada.id) },
  meta: { shipId: recalada.buqueId, eta: recalada.eta },
  message: "Recalada created",
})
```

**Fail esperado**
```ts
logsService.audit(req, {
  event: "recaladas.create.failed",
  level: "warn",
  target: { entity: "Recalada" },
  meta: { reason: "overlap_window", eta: data.eta },
  message: "Create recalada failed",
})
```

**Fail no esperado**
- No necesitas hacerlo en todos lados: `errorHandler` ya publica `http.error`.  
- Pero si quieres contexto extra del dominio, puedes auditar justo antes de lanzar el error.

---

## 8) Microservicio `corpoturismo-logs-service` (lo mínimo que debes saber)

> Fuente: `log-docs.zip` (docs del microservicio).

### 8.1 DB y colecciones
- DB: `corpoturismo_db_logs`
- Colecciones:
  - `logs` (en uso)
  - `mails` (preparada para fase siguiente)

### 8.2 Endpoints relevantes

**Health**
- `GET /health`

**Ingesta**
- `POST /logs` (1 evento)
- `POST /logs/batch` (batch)

**Consulta (soporte)**
- `GET /logs` (filtros + paginación + full-text)
- `GET /logs/:id`
- `GET /logs/stats`

### 8.3 Seguridad por API Keys
- Ingesta usa `INGEST_API_KEY` (header `x-api-key`)
- Lectura usa otra key (`READ_API_KEY`) para endpoints GET

### 8.4 Retención TTL
- `LOG_RETENTION_DAYS` define cuántos días se conservan logs.
- Mongo borra automáticamente por TTL (sin cron).

---

## 9) Docker Compose (stack local)

Tu `docker-compose.yml` levanta:

- Postgres (API DB)
- Migrator (prisma migrate deploy)
- Mongo (logs DB)
- Logs service
- API

Puntos importantes:
- `api` debe hablar con `logs-service` usando red Docker:
  - `LOGS_SERVICE_URL: http://logs-service:4010`
- `mongo-logs` expone `27017:27017` para que Mongo Compass (host) se conecte.

### 9.1 Mongo Compass (PC host)
Conéctate a:
- `mongodb://localhost:27017`
- DB: `corpoturismo_db_logs`
- Colección: `logs`

Si tu `mongo` tuviera auth (usuario/pass) sería distinto, pero con el compose actual es conexión simple.

---

## 10) Pruebas (Postman / curl)

### 10.1 Prueba rápida de que la API está enviando logs
1. Levanta stack con Docker.
2. Ejecuta un endpoint (ej: login).
3. Consulta en Mongo:
   - debería existir un documento con `event: "auth.login.success"` o `auth.login.failed`
   - y también uno `http.response`

### 10.2 Validar requestId end-to-end
- En Postman envía header:
  - `x-request-id: test-123`
- La respuesta debe devolver:
  - `x-request-id: test-123`
- En Mongo, busca:
  - `requestId = "test-123"`

---

## 11) Seguridad y privacidad (reglas obligatorias)

### 11.1 Nunca loguear secretos
No mandar en `meta`:
- passwords
- refresh tokens / access tokens
- hashes
- API keys
- cookies completas

### 11.2 PII (datos personales)
Email y userId son normales para auditoría, pero:
- evita registrar documentos de identidad, teléfono completo, direcciones, etc.
- si necesitas, redáctalos parcial (ej: `***1234`)

---

## 12) Troubleshooting (cuando “no veo logs”)

### Caso A: no llega nada al logs-service
Revisar:
- `LOGS_ENABLED=true`
- `LOGS_INGEST_API_KEY` no vacío
- `LOGS_SERVICE_URL` correcto:
  - local sin docker: `http://localhost:4010`
  - dentro de docker: `http://logs-service:4010`
- logs-service arriba:
  - `GET http://localhost:4010/health`

### Caso B: logs-service está arriba pero no guarda
- `INGEST_API_KEY` del logs-service debe ser igual a `LOGS_INGEST_API_KEY` del API.
- Revisa logs del container:
  - `docker logs logs-service`

### Caso C: veo `http.response` pero no eventos de negocio
- Falta instrumentación en services (solo tienes logs automáticos HTTP).
- Agrega `logsService.audit` en acciones clave.

### Caso D: durationMs sale null o rara
- Asegura que `requestContext` corre ANTES que `responseLog`.
- Asegura que no estás sobreescribiendo `req.startAt` en otro middleware.

---

## 13) Roadmap recomendado (siguiente nivel)

- **Batching** (cola in-memory por request o por intervalos cortos, usando `sendBatch`).
- **Enriquecimiento**:
  - `traceId`/`spanId` si algún día usas tracing distribuido.
- **Eventos de dominio** para módulos: Recaladas, Atenciones, Turnos.
- **Mails**:
  - instrumentar `sendPasswordResetEmail`, `sendVerifyEmailEmail`, etc. para registrar `mails.*`
- **Dashboards**:
  - usar `/logs/stats` para páginas admin o panel de soporte.

---

## 14) Apéndice: ejemplo real (Auth)

Tu módulo `auth` ya implementa:

- `auth.login.failed` con `reason`
- `auth.login.success` con `sessionId`
- `auth.refresh.failed/success`
- `auth.password_reset.requested/completed`
- `auth.verify_email.requested/sent/already_verified/confirmed`
- `auth.logout` (single/all)

Esto es exactamente el patrón a replicar en otros módulos.

---

## 15) Archivo recomendado en tu repo

Guarda esta doc en:
- `docs/logs.md` (o `docs/observability/logs.md`)
