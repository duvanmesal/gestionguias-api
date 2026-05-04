# Mailing e invitaciones

Última revisión contra código: 2026-05-04.

Fuente principal: `src/routes/invitations.routes.ts`, `src/routes/email.routes.ts`, `src/modules/invitations/*`, `src/libs/email.ts`, `src/config/env.ts`.

## Propósito

Este documento cubre:

- invitaciones administrativas;
- reenvío de invitaciones;
- consulta de invitaciones;
- endpoints de prueba SMTP;
- correos transaccionales usados por auth.

La autenticación y recuperación de contraseña se explican funcionalmente en [auth.md](./auth.md).

## Variables relevantes

| Variable | Default |
| --- | --- |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | vacío |
| `SMTP_PASS` | vacío |
| `EMAIL_FROM` | `duvanmesa2415@gmail.com` |
| `APP_LOGIN_URL` | `http://localhost:3001/login` |
| `APP_RESET_PASSWORD_URL` | `http://localhost:3001/reset-password` |
| `APP_VERIFY_EMAIL_URL` | `http://localhost:3001/verify-email` |
| `INVITE_TTL_HOURS` | `24` |
| `PASSWORD_RESET_TTL_MINUTES` | `15` |
| `EMAIL_VERIFY_TTL_MINUTES` | `60` |
| `LOGOUT_ALL_CODE_TTL_MINUTES` | `10` |

## Invitaciones

Todas las rutas de `/invitations` requieren:

- `requireAuth`
- rol `SUPER_ADMIN`

### Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/invitations` | Crea o reenvía invitación según estado previo. |
| `GET` | `/invitations` | Lista invitaciones con filtros simples. |
| `POST` | `/invitations/:invitationId/resend` | Reenvía invitación por id. |
| `POST` | `/invitations/resend-by-email` | Reenvía última invitación por email. |
| `GET` | `/invitations/by-email/:email` | Obtiene última invitación por email. |

### Crear invitación

`POST /invitations`

```json
{
  "email": "guia@example.com",
  "role": "GUIA"
}
```

Reglas:

- Normaliza email a minúsculas.
- `role` acepta cualquier valor de `RolType`.
- Si existe usuario con ese email y `profileStatus = COMPLETE`, responde `409 CONFLICT`.
- Si existe invitación activa `PENDING` no expirada para el email, responde `409 CONFLICT`.
- Genera contraseña temporal.
- Hashea contraseña temporal.
- Genera token de invitación y lo guarda hasheado.
- Crea o actualiza usuario incompleto para la invitación.
- Si el rol es `GUIA`, crea/actualiza fila `Guia`.
- Si el rol es `SUPERVISOR`, crea/actualiza fila `Supervisor`.
- Si ya existía una invitación previa no activa, la reutiliza como `RESENT`; si no, crea una nueva como `CREATED`.
- Envía correo de invitación.

Respuesta si crea:

- Status: `201`
- `data.action = "CREATED"`

Respuesta si reutiliza/reenvía:

- Status: `200`
- `data.action = "RESENT"`

En `development`, la respuesta incluye `tempPassword`. Fuera de development no debe exponerse.

```json
{
  "data": {
    "action": "CREATED",
    "invitation": {
      "id": "invitation_id",
      "email": "guia@example.com",
      "role": "GUIA",
      "expiresAt": "2026-05-05T10:00:00.000Z",
      "status": "PENDING"
    },
    "tempPassword": "solo_en_development"
  },
  "meta": null,
  "error": null
}
```

### Fallo de email al crear

Si falla el envío:

- En `production`, intenta marcar la invitación como `EXPIRED` y lanza error.
- En `development`, mantiene la invitación `PENDING` y permite usar la `tempPassword` devuelta.

### Listar invitaciones

`GET /invitations?status=PENDING&email=guia@example.com`

Filtros:

- `status`
- `email`

Reglas:

- Devuelve lista simple en `data`.
- El repositorio limita internamente a 100 resultados y ordena por `createdAt desc`.
- No hay paginación pública real en este endpoint.

### Reenviar por id

`POST /invitations/:invitationId/resend`

Reglas:

- `invitationId` debe ser `cuid`.
- Si no existe, `404`.
- Si está `USED`, `400`.
- Genera nueva contraseña temporal, token y expiración.
- Actualiza la invitación a `PENDING`.
- Envía correo.
- Respuesta exitosa: `204 No Content`.

### Reenviar por email

`POST /invitations/resend-by-email`

```json
{
  "email": "guia@example.com"
}
```

Reglas:

- Busca la última invitación del email.
- Si no existe, `404`.
- Si está `USED`, `400`.
- Renueva contraseña temporal, token y expiración.
- Respuesta exitosa: `204 No Content`.

### Última invitación por email

`GET /invitations/by-email/:email`

Reglas:

- Valida email como path param.
- Busca la última invitación detallada.
- Si no existe, `404`.
- Devuelve invitación con datos de inviter y user según select actual.

## Estados de invitación

- `PENDING`
- `USED`
- `EXPIRED`

Funciones internas del service:

- `findValidInvitation(email)`
- `markInvitationAsUsed(...)`
- `expireOldInvitations(...)`

No tienen ruta pública observada.

## Emails técnicos

### Verificar conexión SMTP

`GET /emails/verify`

Respuesta:

```json
{
  "data": {
    "ok": true
  },
  "meta": null,
  "error": null
}
```

### Enviar correo de prueba

`POST /emails/test`

```json
{
  "to": "destino@example.com",
  "subject": "Prueba",
  "message": "Mensaje de prueba"
}
```

Respuesta:

```json
{
  "data": {
    "to": "destino@example.com",
    "subject": "Prueba"
  },
  "meta": null,
  "error": null
}
```

Nota: estas rutas no tienen `requireAuth` en el router actual. Si se exponen en ambientes no locales, deben protegerse.

## Correos transaccionales usados por auth

El servicio de email también envía:

- invitación con contraseña temporal;
- recuperación de contraseña;
- verificación de email por link;
- verificación de email por link + código mobile;
- código de logout-all.

Los templates usan `APP_NAME` si existe; default: `Gestión de Guías Turísticos`.

## Seguridad

- No guardar ni loggear contraseñas temporales fuera del flujo previsto.
- No exponer `tempPassword` fuera de `development`.
- No loggear tokens crudos.
- Los tokens se guardan hasheados.
- Los correos de recovery y verificación tienen respuestas genéricas para reducir enumeración.

## Auditoría

Eventos relevantes:

- `invitations.create.success`
- `invitations.create.failed`
- `invitations.create.http_ok`
- `invitations.email.sent`
- `invitations.email.failed`
- `invitations.list.http_ok`
- `invitations.resend.http_ok`
- `invitations.resendByEmail.http_ok`
- `invitations.getLastByEmail.http_ok`
