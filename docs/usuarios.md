# Usuarios, perfiles y guías

Última revisión contra código: 2026-05-16.

Fuente principal: `src/routes/users.routes.ts`, `src/modules/users/*`, `src/modules/auth/auth.schemas.ts`, `prisma/schema.prisma`.

## Propósito

El módulo `users` administra perfiles, onboarding, consulta de guías y operaciones administrativas de usuarios. La autenticación y sesiones están documentadas en [auth.md](./auth.md).

## Roles

Roles válidos:

- `SUPER_ADMIN`
- `SUPERVISOR`
- `GUIA`

Estados de perfil:

- `INCOMPLETE`
- `COMPLETE`

Tipos de documento:

- `CC`
- `CE`
- `PAS`
- `NIT`
- `OTRO`

## Reglas globales del módulo

- Todas las rutas bajo `/users` requieren `requireAuth`.
- `/users/me`, `/users/me/profile` y `/users/me` son rutas self-service.
- `/users/guides` es un lookup operativo reducido para supervisión.
- `/users/me/disponibilidad` permite al guía gestionar su disponibilidad global.
- `/users` y `/users/search` son listados administrativos para `SUPER_ADMIN`.
- Un owner puede consultar/editar su propio usuario con restricciones.
- Solo `SUPER_ADMIN` puede desactivar usuarios.
- No existe ruta pública activa para reactivar usuarios, aunque hay usecase/controller interno.

## Rutas

| Método | Ruta | Roles | Descripción |
| --- | --- | --- | --- |
| `GET` | `/users/me` | Usuario autenticado | Perfil extendido del usuario autenticado. |
| `GET` | `/users/me/disponibilidad` | `GUIA` | Consulta disponibilidad global del guía autenticado. |
| `PATCH` | `/users/me/disponibilidad` | `GUIA` | Actualiza disponibilidad global del guía autenticado. |
| `PATCH` | `/users/me/profile` | Usuario autenticado | Completa onboarding obligatorio. |
| `PATCH` | `/users/me` | Usuario autenticado | Actualiza nombres, apellidos o teléfono propios. |
| `GET` | `/users/guides` | `SUPERVISOR`, `SUPER_ADMIN` | Lookup reducido de guías. |
| `GET` | `/users/search` | `SUPER_ADMIN` | Alias del listado administrativo. |
| `GET` | `/users` | `SUPER_ADMIN` | Listado administrativo paginado. |
| `POST` | `/users` | `SUPER_ADMIN` | Crea usuario por administración. |
| `PATCH` | `/users/:id/password` | Owner | Cambia contraseña del propio usuario. |
| `PATCH` | `/users/:id` | Owner o `SUPER_ADMIN` | Actualiza usuario con restricciones por rol. |
| `GET` | `/users/:id` | Owner o `SUPER_ADMIN` | Consulta detalle de usuario. |
| `DELETE` | `/users/:id` | `SUPER_ADMIN` | Desactiva usuario y revoca tokens. |

## Perfil autenticado

`GET /users/me`

Devuelve datos del usuario autenticado incluyendo:

- `emailVerifiedAt`
- `profileStatus`
- `profileCompletedAt`
- `documentType`
- `documentNumber`
- relación `guia`
- relación `supervisor`
- `guiaId`, `supervisorId`
- `pendingPenalty`
- `disponibleParaTurnos`
- `disponibilidadUpdatedAt`
- `turnoAssignmentMode`

Usar este endpoint para bootstrap de sesión y onboarding en frontend/mobile.

## Disponibilidad global del guía

`GET /users/me/disponibilidad`

Devuelve la disponibilidad global del guía autenticado y el modo operativo activo:

```json
{
  "data": {
    "guiaId": "guia_id",
    "disponibleParaTurnos": true,
    "disponibilidadUpdatedAt": "2026-05-16T01:52:00.000Z",
    "pendingPenalty": false,
    "turnoAssignmentMode": "MANUAL_RECLAMO"
  },
  "meta": null,
  "error": null
}
```

`PATCH /users/me/disponibilidad`

```json
{
  "disponible": true
}
```

Reglas:

- Solo rol `GUIA`.
- El usuario debe tener fila `Guia` y estar activo.
- Si `pendingPenalty = true`, el sistema rechaza marcarse disponible.
- Al marcarse disponible, se actualiza `disponibilidadUpdatedAt`.
- Al marcarse no disponible, `disponibilidadUpdatedAt` queda en `null`.

## Completar perfil

`PATCH /users/me/profile`

```json
{
  "nombres": "Ana",
  "apellidos": "Pérez",
  "telefono": "+57 300 123 4567",
  "documentType": "CC",
  "documentNumber": "123456789",
  "currentPassword": "Password123!",
  "newPassword": "NewPassword123!"
}
```

Reglas:

- Solo se puede completar si `profileStatus` no es `COMPLETE`.
- `documentType` debe ser uno de `CC`, `CE`, `PAS`, `NIT` u `OTRO`.
- `documentNumber` se normaliza quitando espacios, guiones y puntos, y se convierte a mayúsculas.
- Valida unicidad por `documentType + documentNumber`.
- Valida la contraseña actual usando `currentPassword` u `oldPassword`.
- La nueva contraseña debe cumplir la misma complejidad de auth y ser distinta de la actual.
- Escribe perfil, `passwordHash`, `profileStatus = COMPLETE` y `profileCompletedAt = now` de forma atómica.
- Si el rol es `GUIA`, crea/actualiza la relación `Guia`.
- Si el rol es `SUPERVISOR`, crea/actualiza la relación `Supervisor`.
- Revoca las sesiones activas del usuario al completar onboarding, porque el flujo incluye cambio de contraseña.
- Emite `auth:sessionRevoked` a cada sesión afectada y `auth:sessionsChanged` al usuario.
- Los clientes web/mobile deben limpiar la sesión local y pedir login nuevamente tras completar onboarding.
- La respuesta enmascara `documentNumber`.

Errores frecuentes:

- `404 NOT_FOUND` si el usuario no existe.
- `401 UNAUTHORIZED` si la contraseña actual no coincide.
- `400 BAD_REQUEST` si la nueva contraseña es igual a la actual.
- `422 BUSINESS_RULE_VIOLATION` si el perfil ya está completo.
- `409 CONFLICT` si el documento ya existe en otro usuario.

## Actualizar mi perfil

`PATCH /users/me`

```json
{
  "nombres": "Ana María",
  "telefono": "+57 300 123 4567"
}
```

Campos permitidos:

- `nombres`
- `apellidos`
- `telefono`

Debe enviarse al menos un campo. No permite cambiar rol, estado activo, email ni documento.

## Lookup de guías

`GET /users/guides`

Query:

| Campo | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `activo` | boolean/string | `true` | Filtra guías activos o inactivos. |
| `disponible` | boolean/string | - | Filtra por disponibilidad global. |
| `penalizado` | boolean/string | - | Filtra por penalización pendiente. |
| `search` | string | - | Busca por nombres, apellidos o email. |

Respuesta reducida:

```json
{
  "data": [
    {
      "guiaId": "guia_id",
      "nombres": "Ana",
      "apellidos": "Pérez",
      "email": "ana@example.com",
      "activo": true,
      "disponibleParaTurnos": true,
      "disponibilidadUpdatedAt": "2026-05-16T01:52:00.000Z",
      "pendingPenalty": true,
      "penaltyExpiresAt": "2026-05-18T03:25:00.000Z",
      "penaltyReason": "No se presentó en el punto acordado"
    }
  ],
  "meta": null,
  "error": null
}
```

Reglas:

- Solo devuelve usuarios con rol `GUIA`.
- No expone documento, teléfono ni otros datos administrativos.
- Expone disponibilidad global y penalización pendiente para filtros operativos.
- Epica 6: `pendingPenalty` es un indicador **derivado** de `GuiaPenalty`. Si
  un registro tiene `pendingPenalty = true` pero ya no hay penalización
  vigente, el listado devuelve `false` y oculta `penaltyExpiresAt` /
  `penaltyReason`. Cuando hay penalización vigente, ambos campos vienen
  poblados y la UI los muestra (ej. "Hasta 18 may 22:25").
- Límite interno de consulta: 500 registros.

## Listado administrativo

`GET /users` y `GET /users/search`

Ambas rutas delegan al mismo controller.

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `page` | number | `1` |
| `pageSize` | number | `20`, máximo `100` |
| `search` | string | - |
| `rol` | enum `RolType` | - |
| `activo` | boolean/string | - |
| `profileStatus` | enum `ProfileStatus` | - |
| `createdFrom` | date | - |
| `createdTo` | date | - |
| `updatedFrom` | date | - |
| `updatedTo` | date | - |
| `orderBy` | `createdAt`, `updatedAt`, `email` | `createdAt` |
| `orderDir` | `asc`, `desc` | `desc` |

Respuesta:

```json
{
  "data": [
    {
      "id": "user_id",
      "email": "ana@example.com",
      "nombres": "Ana",
      "apellidos": "Pérez",
      "rol": "GUIA",
      "activo": true,
      "profileStatus": "COMPLETE",
      "createdAt": "2026-05-04T10:00:00.000Z",
      "updatedAt": "2026-05-04T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "error": null
}
```

## Crear usuario por administración

`POST /users`

```json
{
  "email": "nuevo@example.com",
  "password": "Password123!",
  "nombres": "Nuevo",
  "apellidos": "Usuario",
  "rol": "GUIA"
}
```

Reglas:

- Solo `SUPER_ADMIN`.
- El schema usado es `createUserSchema`, alias de `registerSchema` en `auth.schemas.ts`.
- Valida email único.
- Hashea password.
- Crea usuario activo.
- Audita `user.created`.

No crea automáticamente `Guia` o `Supervisor`; eso se hace al completar perfil o en flujos de invitación.

## Obtener usuario por ID

`GET /users/:id`

Permisos:

- `SUPER_ADMIN`: cualquier usuario.
- Owner: solo su propio usuario.

La respuesta de detalle es más limitada que `/users/me`; no incluye todos los campos de onboarding.

## Actualizar usuario por ID

`PATCH /users/:id`

```json
{
  "nombres": "Ana",
  "apellidos": "Pérez",
  "rol": "SUPERVISOR",
  "activo": true
}
```

Reglas:

- `SUPER_ADMIN` puede cambiar `nombres`, `apellidos`, `rol` y `activo`.
- Un owner no admin solo puede cambiar `nombres` y `apellidos`.
- Si un owner intenta cambiar `rol` o `activo`, se rechaza.
- Cambios de usuario auditan `user.updated`.
- Cambios de rol auditan `user.role.changed`.

## Cambiar contraseña desde users

`PATCH /users/:id/password`

```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword123!"
}
```

Reglas:

- Solo owner.
- Acepta `currentPassword` u `oldPassword`, pero no ambos.
- El usuario debe estar activo.
- La contraseña actual debe coincidir.
- Revoca sesiones del usuario tras actualizar.
- Respuesta exitosa: `204 No Content`.

Para el endpoint equivalente bajo auth ver [auth.md](./auth.md).

## Desactivar usuario

`DELETE /users/:id`

Reglas:

- Solo `SUPER_ADMIN`.
- No se puede desactivar un usuario inexistente.
- No se puede desactivar un usuario ya inactivo.
- No se permite auto-desactivación.
- Desactiva usuario y revoca refresh tokens activos de forma atómica.
- Audita `user.updated` con nivel `warn`.
- Respuesta exitosa: `204 No Content`.

## Particularidades técnicas que afectan documentación

- Algunos schemas de `users` viven en `src/modules/auth/auth.schemas.ts`: creación, update admin, cambio de contraseña y listado.
- `user.schemas.ts` contiene solo schemas propios de self-service y lookup: `completeProfileSchema`, `updateMeSchema`, `listGuidesQuerySchema`.
- `/users/guides`, `/users/search` y `/users` deben mantenerse antes de `/:id` para evitar matching incorrecto.

## Auditoría

Eventos relevantes observados:

- `user.created`
- `user.updated`
- `user.role.changed`
- `user.profile.completed`
- `users.guia.disponibilidad.updated`

No se deben loggear contraseñas, hashes, tokens ni documentos completos sensibles.
