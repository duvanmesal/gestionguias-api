# Mailing e invitaciones

Última revisión contra código: 2026-05-11.

Fuente principal: `src/routes/invitations.routes.ts`, `src/routes/email.routes.ts`, `src/routes/notifications.routes.ts`, `src/modules/invitations/*`, `src/modules/notifications/*`, `src/libs/email.ts`, `src/libs/push.ts`, `src/config/env.ts`.

## Propósito

Este documento cubre:

- invitaciones administrativas;
- reenvío de invitaciones;
- consulta de invitaciones;
- endpoints técnicos de email;
- correos transaccionales usados por auth.
- notificaciones operativas por email y push.

La autenticación y recuperación de contraseña se explican funcionalmente en [auth.md](./auth.md).

## Variables relevantes

| Variable | Default |
| --- | --- |
| `EMAIL_PROVIDER` | `production`: `brevo`; `development`/`test`: `outbox` |
| `BREVO_API_KEY` | vacío |
| `BREVO_API_BASE_URL` | `https://api.brevo.com` |
| `EMAIL_FROM` | `Gestion de Guias <duvanmesa2415@gmail.com>` |
| `APP_LOGIN_URL` | `http://localhost:3001/login` |
| `APP_RESET_PASSWORD_URL` | `http://localhost:3001/reset-password` |
| `APP_VERIFY_EMAIL_URL` | `http://localhost:3001/verify-email` |
| `INVITE_TTL_HOURS` | `24` |
| `PASSWORD_RESET_TTL_MINUTES` | `15` |
| `EMAIL_VERIFY_TTL_MINUTES` | `60` |
| `LOGOUT_ALL_CODE_TTL_MINUTES` | `10` |
| `PUSH_NOTIFICATIONS_ENABLED` | `false` |
| `FIREBASE_PROJECT_ID` | vacío |
| `FIREBASE_CLIENT_EMAIL` | vacío |
| `FIREBASE_PRIVATE_KEY` | vacío |

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

## Transporte de email

El servicio usa dos transportes:

- `brevo`: envía correos reales por HTTP hacia Brevo Transactional Email API.
- `outbox`: no envía red; registra el correo generado como salida local segura. Es el fallback por defecto en `development` y `test`.

En producción, configurar en Render:

- `EMAIL_PROVIDER=brevo`
- `BREVO_API_KEY`
- `BREVO_API_BASE_URL=https://api.brevo.com`
- `EMAIL_FROM` con un remitente permitido por Brevo
- URLs públicas del front en `APP_LOGIN_URL`, `APP_RESET_PASSWORD_URL` y `APP_VERIFY_EMAIL_URL`

## Emails técnicos

### Verificar configuración de email

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

## Notificaciones operativas

Al crear una recalada o una atención, el API encola entregas de notificación para todos los guías activos operativos:

- usuario con `rol = GUIA`;
- `usuario.activo = true`;
- relación `Guia` existente.

Tipos soportados:

| Tipo | Disparador | Canales |
| --- | --- | --- |
| `RECALADA_CREATED` | `POST /recaladas` exitoso | `EMAIL` y, si está habilitado, `PUSH` |
| `ATENCION_CREATED` | `POST /atenciones` exitoso | `EMAIL` y, si está habilitado, `PUSH` |

Las notificaciones no bloquean la creación. Si falla el enqueue, el endpoint conserva su respuesta `201`; si falla el despacho, la entrega queda en `FAILED` con `attempts`, `lastError` y `nextRetryAt` para reintento.

Persistencia:

- `notification_deliveries`: tipo, canal, destinatario, `recaladaId`, `atencionId`, estado, payload, intentos y reintento.
- `push_device_tokens`: token único FCM/APNS, plataforma, `deviceId`, estado activo y timestamps.

El job `notification-delivery` procesa entregas `PENDING` o `FAILED` vencidas. Los correos se envían de forma individual, sin BCC.

### Endpoints de push token

Todas las rutas requieren `requireAuth`.

`POST /notifications/push-token`

```json
{
  "token": "fcm_or_apns_token",
  "platform": "ANDROID",
  "deviceId": "device-id-local"
}
```

Reglas:

- `platform`: `ANDROID`, `IOS` o `WEB`.
- `token` es único y se hace upsert para el usuario autenticado.
- Reactiva tokens previamente desactivados si el mismo dispositivo se registra de nuevo.

`DELETE /notifications/push-token`

```json
{
  "token": "fcm_or_apns_token",
  "deviceId": "device-id-local"
}
```

Reglas:

- Desactiva tokens activos del usuario por `token`, `deviceId` o ambos.
- Se usa en logout o cambio de dispositivo.

### Firebase / FCM

El proveedor push usa Firebase Admin SDK, pero permanece inactivo por defecto.

Para activar push real en Render:

- `PUSH_NOTIFICATIONS_ENABLED=true`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

`FIREBASE_PRIVATE_KEY` puede cargarse con saltos escapados (`\n`); el API los normaliza antes de inicializar Firebase.

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
