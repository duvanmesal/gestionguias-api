# Integración con microservicio de logs

Última revisión contra código: 2026-05-04.

Fuentes principales:

- API principal: `src/libs/logs/*`, `src/middlewares/requestContext.ts`, `src/middlewares/response-log.ts`, `src/middlewares/error-handler.ts`.
- Logs service: `corpoturismo-logs-service/src/modules/logs/*`, `corpoturismo-logs-service/src/app.ts`, `corpoturismo-logs-service/src/config/env.ts`.

## Propósito

`corpoturismo-logs-service` centraliza logs estructurados, auditoría técnica y consultas de trazabilidad. La API principal puede enviar logs HTTP y eventos funcionales mediante `logsService.audit(...)`.

## Variables en gestionguias-api

| Variable | Default |
| --- | --- |
| `LOGS_SERVICE_URL` | `http://localhost:4010` |
| `LOGS_INGEST_API_KEY` | vacío |
| `LOGS_ENABLED` | `true` |
| `LOGS_TIMEOUT_MS` | `1500` |
| `SERVICE_NAME` | `gestionguias-api` |

## Variables en corpoturismo-logs-service

| Variable | Default |
| --- | --- |
| `PORT` | `4010` |
| `MONGO_DB` | `corpoturismo_db_logs` |
| `LOG_RETENTION_DAYS` | `30` |
| `MAIL_RETENTION_DAYS` | `90` |
| `INGEST_API_KEY` | requerido, mínimo 16 caracteres |
| `READ_API_KEY` | requerido, mínimo 16 caracteres |
| `CORS_ORIGIN` | `*` |

## Rutas del logs service

Base del servicio: `/logs`.

| Método | Ruta | API key | Descripción |
| --- | --- | --- | --- |
| `POST` | `/logs` | Ingesta | Inserta un log. |
| `POST` | `/logs/batch` | Ingesta | Inserta lote de logs. |
| `GET` | `/logs` | Lectura | Consulta logs con filtros. |
| `GET` | `/logs/stats` | Lectura | Consulta agregados. |
| `GET` | `/logs/:id` | Lectura | Detalle por id Mongo. |

Health:

- `GET /`
- `GET /health`
- `GET /health/ready`

## Ingesta simple

`POST /logs`

```json
{
  "level": "info",
  "event": "turnos.assign.success",
  "message": "Turno assigned",
  "service": "gestionguias-api",
  "requestId": "req_123",
  "actor": {
    "userId": "user_id",
    "email": "supervisor@example.com",
    "role": "SUPERVISOR"
  },
  "target": {
    "entity": "Turno",
    "id": "123"
  },
  "http": {
    "method": "PATCH",
    "path": "/api/v1/turnos/123/assign",
    "status": 200,
    "ip": "127.0.0.1",
    "userAgent": "Mozilla/5.0",
    "durationMs": 120
  },
  "meta": {
    "guiaId": "guia_id"
  },
  "ts": "2026-05-04T15:00:00.000Z"
}
```

Respuesta:

```json
{
  "data": {
    "id": "mongo_id"
  },
  "meta": null,
  "error": null
}
```

## Ingesta batch

`POST /logs/batch`

```json
{
  "items": [
    {
      "level": "info",
      "event": "http.response",
      "service": "gestionguias-api"
    }
  ]
}
```

Reglas:

- `items`: mínimo 1, máximo 500.
- Cada item pasa por sanitización.
- Si un item no trae `requestId`, hereda el del request context.
- Mongo usa `insertMany(..., { ordered: false })`.

Respuesta:

```json
{
  "data": {
    "insertedCount": 1
  },
  "meta": null,
  "error": null
}
```

## Schema de log

Niveles válidos:

- `info`
- `warn`
- `error`

Campos:

| Campo | Regla |
| --- | --- |
| `level` | Obligatorio. |
| `event` | Obligatorio, 2 a 120 caracteres. |
| `message` | Opcional, máximo 2000. |
| `service` | Opcional, máximo 120. |
| `requestId` | Opcional, máximo 120. |
| `actor.userId` | Opcional, máximo 120. |
| `actor.email` | Opcional, email válido. |
| `actor.role` | Opcional, máximo 80. |
| `target.entity` | Opcional, máximo 80. |
| `target.id` | Opcional, máximo 120. |
| `target.email` | Opcional, email válido. |
| `http.status` | 100 a 599. |
| `http.durationMs` | 0 a 60000. |
| `meta` | Objeto libre, sanitizado. |
| `ts` | ISO datetime opcional. Si no llega, se usa `new Date()`. |

## Consulta

`GET /logs`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `from` | ISO datetime | - |
| `to` | ISO datetime | - |
| `level` | `info`, `warn`, `error` | - |
| `event` | string | - |
| `service` | string | - |
| `actorUserId` | string | - |
| `requestId` | string | - |
| `entity` | string | - |
| `entityId` | string | - |
| `q` | string | - |
| `page` | number | `1` |
| `pageSize` | number | `25`, máximo `200` |
| `sort` | `ts` | `ts` |
| `order` | `asc`, `desc` | `desc` |

Respuesta:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  },
  "error": null
}
```

## Detalle

`GET /logs/:id`

Reglas:

- Si `id` no es `ObjectId` válido, devuelve `404`.
- Si no existe, devuelve `404`.
- El 404 usa `code = NOT_FOUND` y `message = Log not found`.

## Stats

`GET /logs/stats`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| filtros de lectura | iguales a `/logs` salvo paginación/sort | - |
| `topEventsLimit` | number | `10`, máximo `50` |
| `tz` | string | `UTC` |

Respuesta:

```json
{
  "data": {
    "byLevel": [],
    "topEvents": [],
    "errorsByDay": []
  },
  "meta": null,
  "error": null
}
```

Reglas:

- `byLevel` agrupa por `level`.
- `topEvents` agrupa por `event`.
- `errorsByDay` filtra `level=error` y agrupa por día usando `tz`.

## Sanitización

El logs service sanitiza en `LogsService` antes de persistir.

Reglas:

- Redacción recursiva en objetos y arrays.
- Headers y claves sensibles se reemplazan por `[REDACTED]`.
- No se debe persistir saltándose `sanitizeLogPayload(...)`.

## Separación de llaves

- Ingesta usa `INGEST_API_KEY`.
- Lectura usa `READ_API_KEY`.

No se debe permitir lectura con llave de ingesta ni escritura con llave de lectura.

## Uso desde gestionguias-api

La API principal emite:

- logs HTTP vía `responseLog`;
- errores HTTP vía `error-handler`;
- eventos funcionales vía `logsService.audit(...)`.

Los eventos funcionales deben incluir, cuando aplique:

- `event`
- `actor`
- `target`
- `meta`
- `message`

No se deben enviar:

- contraseñas;
- hashes;
- tokens;
- códigos de verificación;
- secretos de entorno;
- documentos completos si no son necesarios.
