# Autenticación, sesión y seguridad de cuenta

Última revisión contra código: 2026-05-04.

Fuente principal: `src/routes/auth.routes.ts`, `src/modules/auth/*`, `src/middlewares/clientPlatform.ts`, `src/libs/jwt.ts`, `src/libs/crypto.ts`, `src/config/env.ts`.

## Propósito

El módulo `auth` controla identidad, sesiones, tokens, verificación de email y flujos sensibles de contraseña. No administra usuarios como catálogo; esa responsabilidad está en [usuarios.md](./usuarios.md).

## Reglas globales del módulo

- Las rutas de login, refresh, recuperación, verificación, logout y cambio de contraseña usan rate limiters específicos.
- `X-Client-Platform` es obligatorio en los endpoints que usan `detectClientPlatform`.
- Valores aceptados: `web` o `mobile`; internamente se normalizan a `WEB` y `MOBILE`.
- En `WEB`, el refresh token viaja en cookie httpOnly `rt`.
- En `MOBILE`, el refresh token viaja en el JSON de respuesta y en el body de refresh.
- `MOBILE` debe enviar `deviceId` en login.
- Los refresh tokens se guardan hasheados, se rotan en cada refresh y tienen detección de reutilización.
- Si se detecta reutilización/race de refresh token, se revocan todas las sesiones del usuario.
- Los flujos sensibles no deben exponer si un email existe, salvo errores ya definidos por el contrato.

## Rutas

| Método | Ruta | Auth | Plataforma | Descripción |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | No | `WEB`/`MOBILE` | Inicia sesión y crea una sesión persistente. |
| `POST` | `/auth/refresh` | No | `WEB`/`MOBILE` | Rota refresh token y emite access token nuevo. |
| `POST` | `/auth/forgot-password` | No | `WEB`/`MOBILE` | Solicita correo de recuperación. |
| `POST` | `/auth/reset-password` | No | `WEB`/`MOBILE` | Consume token de recuperación y cambia contraseña. |
| `POST` | `/auth/verify-email/request` | No | `WEB`/`MOBILE` | Solicita verificación de email. |
| `POST` | `/auth/verify-email/confirm` | No | `WEB`/`MOBILE` | Confirma email por token o por email + código. |
| `POST` | `/auth/logout` | Sí | `WEB`/`MOBILE` | Cierra la sesión actual. |
| `POST` | `/auth/logout-all/request` | Sí | `WEB`/`MOBILE` | Envía código de confirmación para cerrar todas las sesiones. |
| `POST` | `/auth/logout-all` | Sí | `WEB`/`MOBILE` | Consume código y revoca todas las sesiones del usuario. |
| `GET` | `/auth/me` | Sí | No requiere header de plataforma | Devuelve perfil autenticado desde auth. |
| `GET` | `/auth/sessions` | Sí | No requiere header de plataforma | Lista sesiones activas del usuario. |
| `DELETE` | `/auth/sessions/:sessionId` | Sí | No requiere header de plataforma | Revoca una sesión propia. |
| `POST` | `/auth/change-password` | Sí | `WEB`/`MOBILE` | Cambia contraseña del usuario autenticado. |

## Login

### Request

```json
{
  "email": "guia@example.com",
  "password": "Password123!",
  "deviceId": "device-mobile-1"
}
```

`deviceId` es obligatorio solo para `MOBILE`.

### Respuesta MOBILE

```json
{
  "data": {
    "user": {
      "id": "user_id",
      "email": "guia@example.com",
      "nombres": "Ana",
      "apellidos": "Pérez",
      "rol": "GUIA",
      "activo": true,
      "emailVerifiedAt": null
    },
    "tokens": {
      "accessToken": "...",
      "accessTokenExpiresIn": 900,
      "refreshToken": "...",
      "refreshTokenExpiresAt": "2026-05-11T10:00:00.000Z"
    },
    "session": {
      "id": "session_id",
      "platform": "MOBILE",
      "createdAt": "2026-05-04T10:00:00.000Z"
    }
  },
  "meta": null,
  "error": null
}
```

### Respuesta WEB

La respuesta no incluye `tokens.refreshToken`. El refresh token se envía en cookie:

- nombre: `rt`
- `httpOnly: true`
- `secure: true`
- `sameSite: strict`
- path: `${API_PREFIX}/auth/refresh`

## Refresh

### WEB

- Header: `X-Client-Platform: web`.
- Body: vacío.
- El backend lee la cookie `rt`.
- Si no existe cookie, responde `400 BAD_REQUEST`.

### MOBILE

```json
{
  "refreshToken": "..."
}
```

### Reglas

- El refresh token debe existir, no estar expirado y pertenecer a una sesión activa.
- La plataforma de la sesión debe coincidir con `X-Client-Platform`.
- El usuario debe estar activo.
- El token se rota atómicamente.
- Si la sesión ya fue revocada manualmente, el refresh responde `401 UNAUTHORIZED` sin afectar otras sesiones.
- Si una carrera de rotación indica reutilización del refresh token, se revocan todas las sesiones del usuario y se responde `409 CONFLICT`.

## Logout

`POST /auth/logout` requiere access token válido. Revoca la sesión identificada por `sid` en el token.

- En `WEB`, limpia la cookie `rt`.
- En `MOBILE`, no usa cookie.
- Respuesta exitosa: `204 No Content`.

## Logout de todas las sesiones

El cierre total usa dos pasos.

### 1. Solicitar código

`POST /auth/logout-all/request`

- Requiere sesión autenticada.
- Invalida códigos anteriores.
- Genera código de 6 dígitos.
- TTL: `LOGOUT_ALL_CODE_TTL_MINUTES`, default `10`.
- Envía correo al usuario.
- Respuesta genérica:

```json
{
  "data": {
    "message": "If the account is active, a confirmation code has been sent"
  },
  "meta": null,
  "error": null
}
```

### 2. Confirmar cierre total

`POST /auth/logout-all`

```json
{
  "verification": {
    "method": "code",
    "code": "123456"
  }
}
```

Reglas:

- El usuario debe existir y estar activo.
- Solo se soporta `method: "code"`.
- El código debe existir, no estar usado y no estar expirado.
- Al consumirlo, se revocan todas las sesiones.
- En `WEB`, se limpia la cookie `rt`.
- Respuesta exitosa: `204 No Content`.

## Sesiones

`GET /auth/sessions` devuelve sesiones activas del usuario:

```json
{
  "data": {
    "sessions": [
      {
        "id": "session_id",
        "platform": "WEB",
        "deviceId": null,
        "ip": "127.0.0.1",
        "userAgent": "Mozilla/5.0",
        "createdAt": "2026-05-04T10:00:00.000Z",
        "lastRotatedAt": null,
        "isCurrent": true
      }
    ]
  },
  "meta": null,
  "error": null
}
```

`DELETE /auth/sessions/:sessionId` solo revoca la sesión indicada si pertenece al usuario autenticado. Si esa sesión intenta refrescar después de haber sido revocada, el backend rechaza esa sesión con `401`, pero no cierra las demás. Para cerrar todas las sesiones debe usarse el flujo `logout-all` con código.

## Cambio de contraseña autenticado

`POST /auth/change-password`

```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword123!"
}
```

También se acepta `oldPassword` por compatibilidad, pero no se deben enviar ambos.

Reglas:

- El usuario debe estar activo.
- La contraseña actual debe coincidir.
- La nueva contraseña debe ser distinta.
- La nueva contraseña debe tener 8 a 72 caracteres, mayúscula, minúscula, número y carácter especial.
- Si cambia correctamente, se terminan las sesiones del usuario.
- Respuesta exitosa:

```json
{
  "data": {
    "message": "Password changed successfully"
  },
  "meta": null,
  "error": null
}
```

## Recuperación de contraseña

### Solicitar recuperación

`POST /auth/forgot-password`

```json
{
  "email": "user@example.com"
}
```

Reglas:

- Normaliza email.
- Audita la solicitud.
- Si el usuario no existe o está inactivo, responde éxito genérico y no envía correo.
- Si existe y está activo, invalida tokens previos, crea token hasheado y envía email.
- TTL: `PASSWORD_RESET_TTL_MINUTES`, default `15`.

Respuesta:

```json
{
  "data": {
    "message": "If the email exists, a recovery message has been sent"
  },
  "meta": null,
  "error": null
}
```

### Restablecer contraseña

`POST /auth/reset-password`

```json
{
  "token": "reset_token",
  "newPassword": "NewPassword123!"
}
```

Reglas:

- El token se hashea y se valida contra tokens no usados/no expirados.
- El usuario asociado debe estar activo.
- La nueva contraseña debe ser distinta.
- El token queda usado.
- Se terminan todas las sesiones del usuario.

## Verificación de email

### Solicitar verificación

`POST /auth/verify-email/request`

```json
{
  "email": "user@example.com"
}
```

Reglas:

- Si el usuario no existe, está inactivo o ya verificó email, el endpoint no filtra información innecesaria.
- Invalida tokens activos previos.
- Crea token hasheado.
- En `MOBILE`, además genera código de 6 dígitos.
- TTL: `EMAIL_VERIFY_TTL_MINUTES`, default `60`.

Respuesta:

```json
{
  "data": {
    "message": "If the email exists, a verification message has been sent"
  },
  "meta": null,
  "error": null
}
```

### Confirmar verificación

`POST /auth/verify-email/confirm`

Modo token:

```json
{
  "token": "verify_token"
}
```

Modo código:

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

Reglas:

- Se debe enviar `token` o `email + code`, nunca ambos.
- El token/código debe existir, no estar usado, no estar expirado y pertenecer a usuario activo.
- La confirmación escribe `emailVerifiedAt`.

Respuesta:

```json
{
  "data": {
    "message": "Email verified successfully"
  },
  "meta": null,
  "error": null
}
```

## Perfil desde auth

`GET /auth/me` devuelve el perfil básico del usuario autenticado. Para perfil extendido, onboarding y relaciones `guia`/`supervisor`, usar `GET /users/me`.

## Auditoría

Eventos relevantes observados:

- `auth.login.success`
- `auth.login.failed`
- `auth.refresh.success`
- `auth.refresh.failed`
- `auth.logout`
- `auth.logout_all.code_sent`
- `auth.logout_all.code_confirmed`
- `auth.password_change.completed`
- `auth.password_change.failed`
- `auth.password_reset.requested`
- `auth.password_reset.completed`
- `auth.verify_email.requested`
- `auth.verify_email.already_verified`
- `auth.verify_email.sent`
- `auth.verify_email.confirmed`

No se deben loggear contraseñas, refresh tokens, verification tokens, reset tokens, códigos ni hashes.
