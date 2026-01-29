# Mailing (Invitaciones y flujos por Email) — **implementado**

---

# 1) Objetivo y alcance

* **Sustituir registro abierto** por **alta vía invitación** emitida por un rol autorizado (p. ej., `SUPER_ADMIN`).
* **Email de invitación** con: saludo atractivo, **usuario (email)**, **contraseña temporal**, breve explicación y **botón centrado** que lleva al **Login**.
* **Primer ingreso** siempre en `profileStatus = INCOMPLETE`; se redirige a **/onboarding** para completar datos.
* Si **no completa** y cierra sesión/pestaña, tiene **24 h** para volver; luego **expira** y requiere **nueva invitación**.
* Los **links/credenciales** de invitación **expiran** a las **24 h**.
* Todo con **envelope de respuesta** y **logging estructurado** (pino) iguales al resto de la API.

---

# 2) Cambios de modelo (Prisma)

## 2.1 Usuario

Añade los campos de estado de perfil:

* `profileStatus` enum: `INCOMPLETE` | `COMPLETE`
* `profileCompletedAt` `DateTime?` (marca de tiempo al completar)
* (Opcional) `invitedAt` `DateTime?` para auditoría

> Mantienes tu esquema y RBAC existentes (`SUPER_ADMIN`, `SUPERVISOR`, `GUIA`), tokens de acceso **JWT** + refresh tokens rotados, y CRUD de usuarios.

## 2.2 Invitation (tabla nueva)

* `id` (cuid)
* `email` (destinatario)
* `rol` (`SUPER_ADMIN` | `SUPERVISOR` | `GUIA`)
* `tokenHash` (**hash** del token opaco que se envía por email)
* `tempPasswordHash` (**nunca** guardar en claro)
* `expiresAt` (`now()+24h`)
* `usedAt` `DateTime?`
* `inviterId` (FK a `Usuario`)
* `userId` `String?` (si decides **pre-crear** el usuario en estado inactivo/INCOMPLETE)
* `status` enum: `PENDING` | `USED` | `EXPIRED`

> **Notas de diseño**
>
> * Guarda **hashes** (token y temp password), nunca valores en claro.
> * Puedes **pre-crear** el `Usuario` con `profileStatus=INCOMPLETE` y `activo=true` (o `false` si prefieres que “nazca” al primer login).
> * Indexa `expiresAt` y `status` para validaciones rápidas.

---

# 3) Reglas de negocio (24 h y estados)

* **Invitación válida** solo si `now <= expiresAt` y `status = PENDING`.
* **Primer login**:

  * Solo con `email` + **contraseña temporal** **válidas** y **vigentes**.
  * Al usarse, marca `Invitation.usedAt = now()` y `status = USED`.
* **Sesión cerrada antes de completar**: puede re-ingresar dentro de **24 h**.
* **Expirada**: retorna error de **invitación expirada**; requiere **reenviar** invitación.
* **Compleción de perfil** (PATCH `/users/me/profile`): set `profileStatus=COMPLETE` + `profileCompletedAt=now()`. A partir de ahí, **nunca** vuelve a ver onboarding (enforce en backend con middleware).

---

# 4) Endpoints (contratos y expectativas)

> Mantén el **envelope `{data, meta, error}`** y códigos coherentes con tu handler de errores/validación Zod.

---

## **4.1 Crear invitación (invite-or-resend) (implementado)**

#### POST `/invitations`

Crea una invitación para un email o **reutiliza** una existente, regenerando credenciales temporales y reenviando el correo.

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`

* **Headers obligatorios:**
  Ninguno adicional

* **Body:**

```json
{
  "email": "user@example.com",
  "role": "GUIA"
}
```

---

### **Reglas de negocio**

* El endpoint normaliza el email (`trim` + `toLowerCase()`).
* Si existe un usuario con ese email y `profileStatus = COMPLETE`:

  * retorna conflicto (`User with this email already exists`).
* Si existe una invitación **activa** (`status=PENDING` y `expiresAt > now`):

  * retorna conflicto (`An active invitation already exists for this email`).
* Si el usuario no existe o está `INCOMPLETE`:

  * se crea/actualiza usuario con password temporal (hash) y `activo=true`.
* Se crea o actualiza la invitación:

  * se regeneran: `tempPassword`, `token`, `expiresAt`
  * queda en estado `PENDING`, `usedAt=null`.
* Si el envío de email falla:

  * se hace rollback mínimo marcando invitación como `EXPIRED`.

---

### **Respuesta 201 (CREATED)**

```json
{
  "data": {
    "action": "CREATED",
    "invitation": {
      "id": "inv_123",
      "email": "user@example.com",
      "role": "GUIA",
      "expiresAt": "2026-01-30T20:00:00.000Z",
      "status": "PENDING"
    }
  },
  "meta": null,
  "error": null
}
```

---

### **Respuesta 200 (RESENT)**

```json
{
  "data": {
    "action": "RESENT",
    "invitation": {
      "id": "inv_123",
      "email": "user@example.com",
      "role": "GUIA",
      "expiresAt": "2026-01-30T20:00:00.000Z",
      "status": "PENDING"
    }
  },
  "meta": null,
  "error": null
}
```

> En `NODE_ENV=development` el backend puede incluir `tempPassword` en el response para testing.

---

### **Errores posibles**

* `401` → token inválido o ausente.
* `403` → rol sin permisos (`no SUPER_ADMIN`).
* `409` → usuario existe y está `COMPLETE`.
* `409` → ya existe invitación activa vigente (PENDING no expirada).
* `422` → validación fallida (email inválido, role inválido).

---

### **Consideraciones de seguridad**

* Password temporal y token se almacenan como **hashes**, nunca en texto plano.
* Recomendado aplicar rate limit por IP y por email destino.
* No se debe filtrar información sensible sobre existencia de usuarios (este endpoint es admin-only, pero se mantiene higiene).

---

### **Flujo resumido (crear invitación)**

1. Admin llama `POST /invitations`.
2. Backend valida usuario/invitación activa.
3. Genera `tempPassword` + `token` + `expiresAt`.
4. Upsert de usuario + create/update de invitación (PENDING).
5. Envía correo.
6. Responde 201 o 200 según corresponda.

---

## **4.2 Listar invitaciones (implementado)**

#### GET `/invitations`

Lista invitaciones con filtros opcionales (status/email). Pensado para uso administrativo.

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`

* **Headers obligatorios:**
  Ninguno adicional

* **Query params (opcionales):**

| Parámetro | Tipo   | Descripción                         |
| --------- | ------ | ----------------------------------- |
| `status`  | enum   | `PENDING` | `USED` | `EXPIRED`      |
| `email`   | string | Filtra por email (case-insensitive) |

Ejemplo:

```
GET /invitations?status=PENDING&email=user@example.com
```

---

### **Reglas de negocio**

* Devuelve los elementos ordenados por `createdAt desc`.
* El filtro `email` se normaliza a lowercase.

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": "inv_123",
      "email": "user@example.com",
      "role": "GUIA",
      "status": "PENDING",
      "expiresAt": "2026-01-30T20:00:00.000Z",
      "inviter": {
        "id": "usr_admin",
        "email": "admin@corp.com",
        "nombres": "Admin",
        "apellidos": "Principal"
      },
      "user": {
        "id": "usr_456",
        "email": "user@example.com",
        "profileStatus": "INCOMPLETE"
      }
    }
  ],
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

* `401` → token inválido o ausente.
* `403` → rol sin permisos.
* `400` → query inválida (si se valida con Zod a futuro).

---

## **4.3 Reenviar invitación por ID (implementado)**

#### POST `/invitations/:invitationId/resend`

Reenvía una invitación existente identificada por `invitationId`, regenerando credenciales y enviando nuevamente el correo.

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`

* **Headers obligatorios:**
  Ninguno adicional

* **Params:**

```
invitationId: cuid
```

---

### **Reglas de negocio**

* Si no existe invitación → `404`.
* Si está `USED` → `400` (no se puede reenviar una invitación consumida).
* Se regeneran:

  * `tempPassword`
  * `token`
  * `expiresAt`
* Se actualiza la invitación a:

  * `status=PENDING`
  * `usedAt=null`
* Se crea/actualiza usuario y se enlaza `userId` en la invitación si faltaba.

---

### **Respuesta 204**

```
(no content)
```

---

### **Errores posibles**

* `401` → token inválido o ausente.
* `403` → rol sin permisos.
* `404` → invitación no encontrada.
* `400` → invitación usada (no reenviable).
* `422` → `invitationId` inválido (validación Zod).

---

### **Consideraciones de seguridad**

* Recomendado rate limiting.
* No devolver credenciales temporales por API.

---

## **4.4 Reenviar invitación por email (implementado)**

#### POST `/invitations/resend-by-email`

Reenvía la invitación **más reciente** asociada a un email **sin necesidad de invitationId**, útil para escalar soporte/backoffice.

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`

* **Headers obligatorios:**
  Ninguno adicional

* **Body:**

```json
{
  "email": "user@example.com"
}
```

---

### **Reglas de negocio**

* Se busca la invitación más reciente por `createdAt desc`.
* Si no existe invitación para ese email → `404`.
* Si la invitación más reciente está `USED` → `400`.
* Se regeneran credenciales temporales y expiración.
* Se marca invitación como `PENDING` y `usedAt=null`.
* Se crea/actualiza usuario y se enlaza `userId` si aplica.

---

### **Respuesta 204**

```
(no content)
```

---

### **Errores posibles**

* `401` → token inválido o ausente.
* `403` → rol sin permisos.
* `404` → no existe invitación para el email.
* `400` → invitación usada (no reenviable).
* `422` → email inválido (validación Zod).

---

### **Consideraciones de seguridad**

* Evita exponer `invitationId`.
* Recomendado rate limit por IP/email para evitar abuso.

---

### **Flujo resumido (resend-by-email)**

1. Admin envía `{email}`.
2. Backend toma la última invitación.
3. Regenera credenciales + TTL.
4. Envía email.
5. Responde `204`.

---

## **4.5 Obtener última invitación por email (implementado)**

#### GET `/invitations/by-email/:email`

Obtiene la **última invitación** asociada a un email, evitando paginar listas completas.

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`

* **Headers obligatorios:**
  Ninguno adicional

* **Params:**

```
email: string (email válido)
```

Ejemplo:

```
GET /invitations/by-email/user@example.com
```

> Si el cliente requiere encoding:
> `user%40example.com`

---

### **Reglas de negocio**

* Devuelve la invitación más reciente (`createdAt desc`).
* No modifica estado.
* Incluye `inviter` y `user` asociados (si existen).
* Si no hay ninguna invitación para el email → `404`.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": "inv_123",
    "email": "user@example.com",
    "role": "GUIA",
    "status": "PENDING",
    "expiresAt": "2026-01-30T20:00:00.000Z",
    "createdAt": "2026-01-29T18:10:00.000Z",
    "inviter": {
      "id": "usr_admin",
      "email": "admin@corp.com",
      "nombres": "Admin",
      "apellidos": "Principal"
    },
    "user": {
      "id": "usr_456",
      "email": "user@example.com",
      "profileStatus": "INCOMPLETE"
    }
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

* `401` → token inválido o ausente.
* `403` → rol sin permisos.
* `404` → no existe invitación para ese email.
* `422` → email inválido (params Zod).

---

### **Consideraciones de diseño**

* Endpoint explícito para evitar:

  * paginar grandes listados
  * filtrar client-side
* Diseñado para panel administrativo y soporte.

---

# 5) Middleware de negocio

* **`requireAuth`**: igual que hoy para JWT access.
* **`requireRoles`**: idem para RBAC.
* **`requireCompletedProfile`** (nuevo):

  * Si `req.user.profileStatus === "INCOMPLETE"`, responde `409`/`423` con código `PROFILE_INCOMPLETE` para que el Front redirija a **/onboarding**.
  * **Lista blanca** de rutas permitidas en INCOMPLETE: `/auth/*`, `/users/me/profile`, `/health`.

---

# 6) Servicio de Email

## 6.1 Infra (Docker/local y prod)

* **Dev**: agrega `mailpit` (o `mailhog`) al `docker-compose` para capturar correos en local.
* **Prod**: usa proveedor SMTP confiable (SES, SendGrid, Mailersend, etc.).
* Config por **ENV** (valídalo con Zod):

  * `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `APP_LOGIN_URL` (para el botón), `INVITE_TTL_HOURS=24`.

## 6.2 Template (HTML)

* **Asunto**: “Has sido invitado a Gestión de Guías – activa tu acceso (24 h)”.
* **Cuerpo** (breve, atractivo): saludo + explicación corta + **credenciales** (email + contraseña temporal) + **botón centrado** “Ir al Login” (enlace a `APP_LOGIN_URL`).
* Piezas de accesibilidad: preheader, CTA grande, texto alterno con URL de respaldo.
* **No** incrustar el `tokenOpaco` en la URL si el primer login se hace **solo** con email + temp password (más simple). Si lo usas para pre-validación, que sea un **token opaco** con **hash** en DB.

---

# 7) Seguridad y anti-abuso

* **Hash** de `token` y `tempPassword` (usa pepper en ENV). **Nunca** almacenes valores en claro.
* **Rate-limit** en `/auth/login` y `/invitations` (por IP y por email destino).
* **Revocación**: si se detecta re-uso de refresh, revoca la cadena (ya contemplado).
* **TTL** estricto (24 h) y **clock skew** (ej. tolerancia ±2 min).
* **Auditoría** mínima: `invite_created`, `invite_emailed`, `invite_used`, `invite_expired`, `profile_completed`.

---

# 8) Logging (simulación “como si fuera real”)

Usa tu logger **pino**/pino-http para logs **estructurados** (nivel `info`/`warn`/`error`) con **correlationId**. Campos recomendados por evento:

* `invite_created`: `{invitationId, inviterId, email, rol, expiresAt}`
* `invite_emailed`: `{invitationId, email, provider:"SES", messageId}`
* `invite_attempt_login`: `{email, ok, reason?: "expired"|"invalid"}`
* `invite_used`: `{invitationId, userId}`
* `profile_completed`: `{userId, at}`
* `invite_expired`: `{invitationId}` (por job o al validar)

Estos conviven con tu **request logger** y **envelope de errores** ya definidos.

---

# 9) Docker / ENV / Compose

* **API**: añade variables SMTP/APP y `INVITE_TTL_HOURS`. Valídalas con Zod en tu `env.ts`.
* **Compose (dev)**: servicio `mailpit`; API depende de él.
* **CI/CD**: no cambian pasos core; recuerda correr **migraciones Prisma** antes de levantar contenedores.

---

# 10) Flujo extremo a extremo

1. **SUPER_ADMIN** crea invitación → `POST /invitations` → se **envía email**.
2. Invitado abre email → **Login** con **email + temp password** (vigente).
3. Backend valida invitación → **emite tokens** → responde `me.profileStatus="INCOMPLETE"`.
4. Front redirige a **/onboarding** → usuario completa perfil → `PATCH /users/me/profile` → `COMPLETE`.
5. Desde ahora, **tiene acceso total** (según **RBAC** y middlewares).

---

# 11) Expiración y limpieza

* **Validación on-read**: si `now > expiresAt`, devuelve error `INVITE_EXPIRED`.
* **Job opcional** (cada hora): marca `status=EXPIRED` para métricas limpias y dispara logs `invite_expired`.

---

# 12) Cambios en Front (breve)

* En **/login**, soporta mensaje “**Invitación expirada**” y CTA “Solicitar nueva invitación”.
* Tras `login`, si `me.profileStatus === "INCOMPLETE"`, **navega a /onboarding** (bloquea todo lo demás).
* En **/onboarding**, validar y hacer `PATCH /users/me/profile`; si OK, redirigir al **home**.
* Maneja `409/423 PROFILE_INCOMPLETE` devolviendo al Onboarding cuando intente acceder a rutas protegidas.

---

# 13) Pruebas recomendadas

* **Unit**: generación/verificación de `tokenOpaco`, hashing, TTL, esquinas (justo antes/después de 24 h).
* **E2E**:

  * Crear invitación → recibir (Mailpit) → login OK → onboarding → COMPLETE.
  * Re-usar invitación **después de 24 h** → **rechazo**.
  * Intentos múltiples de login con temp password → **rate-limit**.
  * Rutas protegidas con `INCOMPLETE` → **bloqueadas** por middleware.

---

**Estado:** implementado y validado en el repositorio. ✅
