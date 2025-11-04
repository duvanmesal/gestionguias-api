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

## 4.1 POST `/invitations` (solo `SUPER_ADMIN`)

**Crea y envía** la invitación:

* **Body**: `{ email, rol }`
* Genera `tokenOpaco` (para link) y `tempPassword` (para primer login). Guarda **hashes** y `expiresAt = now + 24h`.
* **Envía email** (HTML + botón “Ir al Login” → URL del Front).
* **Respuesta**: `{ data: { invitationId, expiresAt }, ... }`

## 4.2 POST `/auth/login`

Extiende el login para aceptar **contraseña temporal**:

* Si el usuario **no existe** y `Invitation` válida → **(opción A)** crea el usuario en ese momento con `profileStatus=INCOMPLETE` y `passwordHash = hash(tempPassword)`.
* Si el usuario **existe** y está en `INCOMPLETE` y la invitación sigue **vigente** → permite login con **tempPassword**.
* En ambos casos: emite **access** + **refresh** (rotación), `me.profileStatus` va en el JWT/response para que el Front **redirija a /onboarding**. 

## 4.3 GET `/auth/me`

Devuelve el usuario autenticado (incluye `profileStatus`), igual que en tu diseño base. 

## 4.4 PATCH `/users/me/profile`

**Completa** el perfil (Zod valida). Si ok → `profileStatus=COMPLETE` + `profileCompletedAt=now()`. A partir de aquí se accede al resto del sistema.

## 4.5 (Opcional) GET `/invitations/:token`

Solo **valida** visualmente si el token sigue vigente (útil si quieres mostrar “esta invitación está OK, presiona el botón para ir al login”). El backend **nunca** devuelve el token en claro; valida comparando **hash**.

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
