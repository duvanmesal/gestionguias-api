# 1. Auth + Usuarios/Roles (implementado)

## 1.1 Objetivo

Proveer un mecanismo robusto de **autenticación** y **autorización** para la API GestiónGuias, asegurando:

* **Identidad verificable** con credenciales (email + contraseña).
* **Tokens JWT de acceso** para peticiones stateless (corto plazo).
* **Tokens de refresco persistidos en DB**, con rotación y revocación.
* **RBAC** (control de acceso basado en roles) con tres roles principales: `SUPER_ADMIN`, `SUPERVISOR`, `GUIA`.
* **Seeds iniciales** para garantizar un arranque controlado con un `SUPER_ADMIN`.

Este apartado ya se encuentra **implementado** en el repositorio.

---

## 1.2 Alcance

* **Login/logout/refresh** con políticas de seguridad.
* **Rotación de refresh tokens** con detección de reuso y revocación en cascada.
* **Gestión de usuarios (CRUD)** con restricciones por rol.
* **Autenticación con JWT** en todos los endpoints protegidos.
* **Mecanismos de validación y auditoría** (opcionalmente con `AuditLog`).

---

## 1.3 Modelo de datos (Prisma)

```prisma
enum Rol {
  SUPER_ADMIN
  SUPERVISOR
  GUIA
}

model Usuario {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  nombres      String
  apellidos    String
  rol          Rol
  activo       Boolean   @default(true)

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  refreshTokens RefreshToken[]
}

model RefreshToken {
  id           String   @id @default(cuid())
  userId       String
  usuario      Usuario  @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String   @unique
  issuedAt     DateTime @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?
  replacedBy   RefreshToken? @relation("Replacements", fields: [replacedById], references: [id])

  ip           String?
  userAgent    String?
  deviceId     String?

  @@index([userId])
  @@index([expiresAt])
}
```

### Consideraciones de diseño

* Se guarda **solo el hash** de refresh tokens (con pepper).
* Se mantiene un **árbol de reemplazos** (`replacedById`) para detectar reuso.
* Se registra **contexto del dispositivo** (IP, userAgent, deviceId).
* `activo` permite deshabilitar usuarios sin borrarlos.

---

## 1.4 Contratos HTTP (envelope `{data, meta, error}`)

### POST `/auth/login`

* **Body:**

```json
{ "email": "user@example.com", "password": "Str0ngP@ss!" }
```

* **Respuesta 200:**

```json
{
  "data": {
    "user": {
      "id": "cus_123",
      "email": "user@example.com",
      "rol": "SUPERVISOR",
      "nombres": "Ana",
      "apellidos": "Pérez"
    },
    "tokens": {
      "accessToken": "JWT...",
      "accessTokenExpiresIn": 900,
      "refreshToken": "rt_...",
      "refreshTokenExpiresAt": "2025-10-28T00:00:00Z"
    }
  },
  "meta": null,
  "error": null
}
```

* **Errores posibles:** `401` credenciales inválidas, `423` usuario inactivo.

---

### POST `/auth/refresh`

* **Body:**

```json
{ "refreshToken": "rt_..." }
```

* **Respuesta 200:** entrega nuevos access y refresh tokens.
* **Errores posibles:**

  * `401` → token inválido o expirado.
  * `409` → token reutilizado (indica posible robo; se revoca toda la cadena).

---

### POST `/auth/logout`

* **Body:**

```json
{ "refreshToken": "rt_current" }
```

* Acción: marca `revokedAt` del refresh actual.
* Respuesta: `204 No Content`.

---

### POST `/auth/logout-all`

* **Auth requerida:** `Authorization: Bearer <accessToken>`.
* Acción: revoca **todos** los refresh tokens asociados al usuario.
* Respuesta: `204 No Content`.

---

### GET `/auth/me`

* **Auth:** `Authorization: Bearer <accessToken>`.
* Respuesta 200:

```json
{
  "data": {
    "id": "cus_123",
    "email": "user@example.com",
    "rol": "GUIA",
    "nombres": "Luisa",
    "apellidos": "Gómez"
  },
  "meta": null,
  "error": null
}
```

---

### CRUD Usuarios (RBAC)

* `GET /users` → solo **SUPER_ADMIN**.
* `POST /users` → solo **SUPER_ADMIN**.
* `GET /users/:id` → **SUPER_ADMIN** o propietario.
* `PATCH /users/:id` → **SUPER_ADMIN** o propietario (limitado).
* `DELETE /users/:id` → solo **SUPER_ADMIN** (o desactivar con `activo=false`).

---

## 1.5 Flujos de autenticación

### Login

1. Validación (`Zod`) de email/password.
2. Verificación de usuario activo y contraseña (Argon2id).
3. Emisión de **access token JWT** (ej. 15m).
4. Generación de **refresh token opaco** (hash en DB).
5. Respuesta con ambos tokens.

### Refresh

1. Validación de token recibido.
2. Verificación en DB (`revokedAt=null && expiresAt>now`).
3. **Rotación**: se crea nuevo refresh, se revoca el anterior y se enlaza con `replacedById`.
4. Detección de reuso → revocación en cascada.
5. Respuesta con tokens nuevos.

### Logout

* Revoca el refresh actual (`revokedAt=now`).

### Logout-all

* Revoca todos los refresh asociados al usuario (`revokedAt=now`).

---

## 1.6 Validaciones y seguridad

### Schemas (Zod)

* `loginSchema { email, password }`
* `refreshSchema { refreshToken }`
* `createUserSchema { email, password, nombres, apellidos, rol }`
* `updateUserSchema { nombres?, apellidos?, rol?, activo? }`

### Helpers

* `hashPassword` / `verifyPassword` (Argon2id).
* `signAccess`, `verifyAccess` (JWT HS256).
* `generateRefreshOpaque`, `hashRefreshToken`.

### Middlewares

* `requireAuth`: valida access token, carga `req.user`.
* `requireRoles(...roles)`: compara `req.user.rol`.
* `validate(schema)`: valida body/params/query.

---

## 1.7 Seeds iniciales

```ts
const email = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@local.test";
const pass  = process.env.SEED_SUPERADMIN_PASS  ?? "ChangeMe!123";
```

* Se crea usuario `SUPER_ADMIN` si no existe.
* Comando: `npm run prisma:seed`.
* Mejora: ejecutar solo bajo bandera en CI; no imprimir contraseñas en logs.

---

## 1.8 Consideraciones de seguridad

* **Access tokens** cortos (ej. 15m).
* **Refresh tokens** largos (ej. 30d), persistidos con hash+pepper.
* **Rotación obligatoria** en cada refresh.
* **Detección de reuso** con revocación en cascada.
* **Rate limiting** en login/refresh.
* **Registro de IP/User-Agent/DeviceId** para auditoría.
* **Seeds protegidos** por variables de entorno.
* **Errores normalizados** con envelope `{data, meta, error}`.

---

### **1.9 Cambio de contraseña (implementado)**

El sistema implementa un mecanismo seguro para el **cambio de contraseña de usuarios autenticados**, pensado especialmente para:

* Usuarios que ingresan con una **contraseña temporal**.
* Usuarios que desean **actualizar sus credenciales** de forma voluntaria.
* Reforzar seguridad invalidando sesiones activas tras el cambio.

Este endpoint **ya se encuentra implementado** en el repositorio.

---

### **1.9.1 Cambio de contraseña**

#### POST `/auth/change-password`

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Headers obligatorios:**
  `X-Client-Platform: WEB | MOBILE`

* **Body**
  Se admite **uno de los dos campos** para la contraseña actual (compatibilidad):

```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewStrongPass123!"
}
```

o

```json
{
  "oldPassword": "OldPass123!",
  "newPassword": "NewStrongPass123!"
}
```

---

### **Reglas de negocio**

* El usuario **solo puede cambiar su propia contraseña**.
* Se valida la contraseña actual antes de aplicar el cambio.
* La nueva contraseña debe cumplir reglas de complejidad:

  * mínimo 8 caracteres
  * mayúscula, minúscula, número y carácter especial
* La nueva contraseña **no puede ser igual** a la anterior.
* Tras el cambio:

  * Se actualiza el `passwordHash`.
  * Se **revocan todas las sesiones activas** del usuario para forzar re-login.

---

### **Respuesta 200**

```json
{
  "data": {
    "message": "Password changed successfully"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

* `400` → validación fallida (password débil o igual a la anterior).
* `401` → contraseña actual incorrecta o usuario no autorizado.
* `404` → usuario no encontrado.

---

### **Consideraciones de seguridad**

* La contraseña nunca se expone ni se almacena en texto plano.
* Se utiliza hashing seguro (`Argon2id`).
* La revocación de sesiones evita el uso de tokens antiguos.
* El endpoint está protegido con:

  * `requireAuth`
  * validación estricta con `Zod`
  * rate limiting para mitigar ataques de fuerza bruta.

---

## **1.10 Recuperación de contraseña (Forgot Password)**

El sistema implementa un flujo seguro de **recuperación de contraseña** para usuarios que han olvidado sus credenciales, sin comprometer la seguridad ni exponer información sensible sobre la existencia de cuentas.

Este mecanismo **ya se encuentra implementado** en el repositorio.

---

### **1.10.1 Solicitud de recuperación**

#### POST `/auth/forgot-password`

Permite solicitar un enlace de recuperación enviando únicamente el correo electrónico.

* **Auth requerida:** ❌ No

* **Headers obligatorios:**
  `X-Client-Platform: WEB | MOBILE`

* **Body:**

```json
{
  "email": "user@example.com"
}
```

---

### **Reglas de negocio**

* El endpoint **siempre responde exitosamente**, independientemente de si el email existe o no.
* Si el email:

  * **no existe**, o
  * corresponde a un usuario **inactivo (`activo=false`)**

  → **no se genera token ni se envía correo**.
* Si el usuario existe y está activo:

  * Se genera un **token de recuperación de un solo uso**.
  * Se guarda **únicamente el hash del token** en base de datos.
  * Se invalidan tokens de recuperación previos no utilizados.
  * Se envía un **correo con enlace de restablecimiento**.
* El token:

  * Tiene un **TTL configurable** (`PASSWORD_RESET_TTL_MINUTES`, default 15).
  * Puede usarse **una sola vez**.
  * Expira automáticamente.

Este diseño evita **enumeración de usuarios** y ataques de fuerza bruta por inferencia.

---

### **Respuesta 200**

```json
{
  "data": {
    "message": "If the email exists, you will receive password reset instructions."
  },
  "meta": null,
  "error": null
}
```

> ⚠️ La respuesta es **intencionalmente genérica** por motivos de seguridad.

---

### **Modelo de datos asociado (Prisma)**

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  user      Usuario  @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
  @@index([usedAt])
}
```

---

### **Consideraciones de seguridad**

* Nunca se almacena el token en texto plano.
* Los tokens se hashean usando **HMAC + pepper (`TOKEN_PEPPER`)**.
* El flujo es **silencioso** frente a emails inexistentes o usuarios inactivos.
* El endpoint está protegido con:

  * `rate limiting`
  * validación estricta con `Zod`
* El enlace apunta al frontend:

  * `APP_RESET_PASSWORD_URL?token=xxxxx`

---

### **Flujo resumido**

1. Cliente envía email al endpoint `/auth/forgot-password`.
2. Backend valida formato del email.
3. Si el usuario existe y está activo:
   * genera token
   * guarda hash en DB
   * invalida tokens previos
   * envía correo con enlace
4. Backend responde **200 OK** siempre.
5. El frontend redirige al flujo de **reset-password** usando el token.

### **1.11.1 Restablecer contraseña (Reset Password)**

#### POST `/auth/reset-password`

Permite **restablecer la contraseña** usando un **token de recuperación** previamente generado con `POST /auth/forgot-password`.

* **Auth requerida:** ❌ No

* **Headers obligatorios:**
  `X-Client-Platform: WEB | MOBILE`

* **Body:**

```json
{
  "token": "db6600599a5ff80d37c8a4cad534489ee3c7b2c3f41fd3df1a8d0c6bdda2b84a",
  "newPassword": "NuevaPassword1!"
}
```

---

### **Reglas de negocio**

* El token debe cumplir:

  * existir en BD (por `tokenHash`)
  * **no estar usado** (`usedAt = null`)
  * **no estar expirado** (`expiresAt > now`)
* El usuario asociado debe:

  * existir
  * estar **activo** (`activo = true`)
* La nueva contraseña debe:

  * cumplir reglas de complejidad:

    * mínimo 8 caracteres
    * mayúscula, minúscula, número y carácter especial
  * **no puede ser igual** a la contraseña anterior
* Al aplicar el cambio:

  * se actualiza `usuario.passwordHash` (hash seguro)
  * se marca el token como **usado** (`usedAt = now`)
  * se invalidan otros tokens activos del mismo usuario (higiene)
  * se **revocan todas las sesiones** del usuario (`logoutAll`) para forzar re-login
* El proceso se ejecuta de forma **atómica** (transacción) para evitar condiciones de carrera.

---

### **Respuesta 200**

```json
{
  "data": {
    "message": "Password updated successfully"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

* `400` → token inválido/expirado/usado, password débil o igual a la anterior.
* `401` → (no suele aplicarse aquí) el flujo no requiere auth, pero puede usarse si tu handler global lo mapea distinto.
* `404` → (no se expone para seguridad) no se revela si el usuario existe o no; se responde como token inválido.

---

### **Consideraciones de seguridad**

* El token **no se guarda en texto plano**, solo su hash (`tokenHash`) usando HMAC + `TOKEN_PEPPER`.
* Respuesta y errores **no filtran información** del usuario asociado.
* El endpoint está protegido con:

  * `sensitiveLimiter` (rate limiting)
  * validación estricta con `Zod`
  * invalidación de sesiones al finalizar

---

## 1.12 Definition of Done

* Login/Refresh/Logout/Logout-all/Me funcionando correctamente.
* CRUD de usuarios con RBAC activo.
* Seeds iniciales ejecutados.
* Tokens gestionados con rotación, hash y detección de reuso.
* Validaciones estrictas con Zod.
* Pruebas en Postman cubriendo casos correctos y de error.
* Logs mostrando entradas/salidas de forma consistente.
* **Forgot Password implementado y validado (email “ciego”, token 1-uso con TTL, hash en DB, invalidación de tokens previos).** *25/01/2026*
* **Reset Password implementado y validado (token 1-uso, expiración, cambio de hash, invalidación de tokens activos, revocación de sesiones).** *25/01/2026*
* **Change Password implementado y validado (compatibilidad oldPassword/currentPassword, password policy, revocación de sesiones).** *25/01/2026*
* **Rutas protegidas con `X-Client-Platform` donde aplica (WEB/MOBILE).** *25/01/2026*
* **Rate limiting aplicado a endpoints sensibles (`login`, `forgot-password`, `reset-password`, `change-password`).** *25/01/2026*
* **Flujo completo probado: forgot-password → reset-password → login con nueva contraseña.** *25/01/2026*

### **Estado**

**Estado:** implementado y validado en el repositorio.
