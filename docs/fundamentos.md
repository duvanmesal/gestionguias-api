# Fundamentos de la API

Última revisión contra código: 2026-05-04.

Fuente principal: `src/app.ts`, `src/routes/index.ts`, `src/libs/http.ts`, `src/libs/errors.ts`, `src/middlewares/error-handler.ts`, `prisma/schema.prisma`.

## Prefijo y montaje

La API se monta con `env.API_PREFIX`, cuyo default es `/api/v1`.

Ejemplo:

- Documentación: `POST /auth/login`
- Ruta real default: `POST /api/v1/auth/login`

Health se monta aparte:

- `GET /api/v1/health`
- `GET /api/v1/health/ready`

## Rutas principales

| Base | Documento |
| --- | --- |
| `/auth` | [auth.md](./auth.md) |
| `/users` | [usuarios.md](./usuarios.md) |
| `/invitations` | [mailing.md](./mailing.md) |
| `/emails` | [mailing.md](./mailing.md) |
| `/paises` | [catalog.md](./catalog.md) |
| `/buques` | [catalog.md](./catalog.md) |
| `/recaladas` | [reacaladas.md](./reacaladas.md) |
| `/atenciones` | [atenciones.md](./atenciones.md) |
| `/turnos` | [turnos.md](./turnos.md) |
| `/dashboard` | [dashboard.md](./dashboard.md) |

## Envelope HTTP

Respuestas exitosas con body:

```json
{
  "data": {},
  "meta": null,
  "error": null
}
```

Respuestas paginadas:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  },
  "error": null
}
```

Errores:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {}
  }
}
```

Las respuestas `204` no tienen body.

## Errores estándar

| HTTP | Code | Uso |
| --- | --- | --- |
| `400` | `BAD_JSON` | JSON mal formado. |
| `400` | `VALIDATION_ERROR` | Error de Zod. |
| `400` | `BAD_REQUEST` | Parámetro o acción inválida. |
| `401` | `UNAUTHORIZED` | Falta auth, token inválido o credenciales inválidas. |
| `403` | `FORBIDDEN` | Usuario autenticado sin permisos. |
| `404` | `NOT_FOUND` | Ruta o recurso inexistente. |
| `409` | `CONFLICT` | Conflicto de estado, duplicado o carrera operativa. |
| `422` | `BUSINESS_RULE_VIOLATION` | Regla de negocio no cumplida. |
| `500` | `INTERNAL_SERVER_ERROR` | Error inesperado. |

Prisma:

- `P2002` se mapea a `409 CONFLICT`.
- `P2025` se mapea a `404 NOT_FOUND`.

## Autenticación y autorización

La mayoría de rutas usan `requireAuth` con access token.

Roles válidos:

- `SUPER_ADMIN`
- `SUPERVISOR`
- `GUIA`

Guards usados:

- `requireAuth`
- `requireSuperAdmin`
- `requireSupervisor`
- `requireGuia`
- `requireRoles(...)`
- `requireOwnershipOrRole(...)`

## Plataformas

Auth distingue plataforma con `X-Client-Platform`.

Valores aceptados:

- `web`
- `mobile`

Internamente se usan:

- `WEB`
- `MOBILE`

Esta diferencia afecta login, refresh, cookies, logout y algunos emails de verificación.

## Estados principales

### `StatusType`

- `ACTIVO`
- `INACTIVO`
- `SUSPENDIDO`

Usado como estado administrativo/general.

### `ProfileStatus`

- `INCOMPLETE`
- `COMPLETE`

Controla onboarding de usuario.

### `InvitationStatus`

- `PENDING`
- `USED`
- `EXPIRED`

### `RecaladaOperativeStatus`

- `SCHEDULED`
- `ARRIVED`
- `DEPARTED`
- `CANCELED`

### `AtencionOperativeStatus`

- `OPEN`
- `CLOSED`
- `CANCELED`

### `TurnoStatus`

- `AVAILABLE`
- `ASSIGNED`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELED`
- `NO_SHOW`

## Fechas

- En contratos HTTP se usan fechas ISO 8601, salvo `dashboard.overview.date`, que usa `YYYY-MM-DD`.
- Las validaciones de ventanas operativas viven en cada módulo.
- `dashboard` acepta `tzOffsetMinutes` para calcular el día local de consulta.

## Logs y trazabilidad

La API usa:

- `requestContext` para `requestId`.
- `requestLogger` para logs HTTP locales.
- `responseLog` para enviar logs HTTP al microservicio si está habilitado.
- `logsService.audit(...)` para eventos funcionales.

Variables relevantes:

- `LOGS_SERVICE_URL`
- `LOGS_INGEST_API_KEY`
- `LOGS_ENABLED`
- `LOGS_TIMEOUT_MS`
- `SERVICE_NAME`

Más detalle: [docs-logs-api.md](./docs-logs-api.md).
