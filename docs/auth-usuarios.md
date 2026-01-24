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

## 1.9 Definition of Done

* Login/Refresh/Logout/Logout-all/Me funcionando correctamente.
* CRUD de usuarios con RBAC activo.
* Seeds iniciales ejecutados.
* Tokens gestionados con rotación, hash y detección de reuso.
* Validaciones estrictas con Zod.
* Pruebas en Postman cubriendo casos correctos y de error.
* Logs mostrando entradas/salidas de forma consistente.

**Estado:** implementado y validado en el repositorio.