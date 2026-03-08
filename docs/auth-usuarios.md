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

---

## 1.4.1 Login

### **POST `/auth/login`**

Inicia sesión con email y contraseña.
Crea una **sesión** en base de datos y emite:

* **Access Token (JWT)** para consumir endpoints protegidos
* **Refresh Token** (opaco) para rotación

📌 **Comportamiento por plataforma:**

* **WEB:** el refresh token **NO** viaja en el JSON, se guarda en **cookie HttpOnly `rt`**
* **MOBILE:** el refresh token **SÍ** viaja en el JSON (porque no hay cookies HttpOnly confiables)

---

### **Auth requerida**

❌ No

---

### **Headers obligatorios**

| Header              | Valores          | Descripción                               |
| ------------------- | ---------------- | ----------------------------------------- |
| `X-Client-Platform` | `WEB` | `MOBILE` | Define el comportamiento de sesión/tokens |

---

### **Body**

```json
{
  "email": "user@example.com",
  "password": "Str0ngP@ss!",
  "deviceId": "optional-string"
}
```

📌 Reglas del body:

* `email`: formato email válido
* `password`: mínimo 8, máximo 72
* `deviceId`:

  * **obligatorio si `X-Client-Platform = MOBILE`**
  * opcional en WEB

---

### **Qué hace exactamente**

1. Valida `req.body` con **Zod**
2. Verifica que el usuario exista y esté **activo**
3. Verifica la contraseña
4. Crea una **Session** con:

   * `platform`, `deviceId`, `ip`, `userAgent`
   * `refreshTokenHash` + `refreshExpiresAt`
5. Firma `accessToken` con:

   * `userId`, `email`, `rol`, `sid` (sessionId), `aud`
6. Devuelve tokens:

   * **WEB:** setea cookie `rt` y devuelve solo access token en JSON
   * **MOBILE:** devuelve access + refresh en JSON

---

### **Respuesta 200 (MOBILE)**

```json
{
  "data": {
    "user": {
      "id": "cus_123",
      "email": "user@example.com",
      "nombres": "Ana",
      "apellidos": "Pérez",
      "rol": "SUPERVISOR",
      "activo": true,
      "emailVerifiedAt": null,
      "createdAt": "2026-01-26T20:40:07.423Z",
      "updatedAt": "2026-01-26T20:40:07.423Z"
    },
    "tokens": {
      "accessToken": "JWT...",
      "accessTokenExpiresIn": 900,
      "refreshToken": "rt_...",
      "refreshTokenExpiresAt": "2026-03-06T01:21:04.776Z"
    },
    "session": {
      "id": "ses_123",
      "platform": "MOBILE",
      "createdAt": "2026-02-04T01:21:04.776Z"
    }
  },
  "meta": null,
  "error": null
}
```

---

### **Respuesta 200 (WEB)**

📌 En **WEB**, el refresh token se entrega como **cookie HttpOnly** llamada `rt` con `SameSite=Strict` y `Path=<API_PREFIX>/auth/refresh` (ej: `/api/v1/auth/refresh`).

```json
{
  "data": {
    "user": { "...": "..." },
    "tokens": {
      "accessToken": "JWT...",
      "accessTokenExpiresIn": 900,
      "refreshTokenExpiresAt": "2026-03-06T01:21:04.776Z"
    },
    "session": {
      "id": "ses_123",
      "platform": "WEB",
      "createdAt": "2026-02-04T01:21:04.776Z"
    }
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                           |
| ------ | ------------------------------------------------ |
| `400`  | Falta `X-Client-Platform` o tiene valor inválido |
| `400`  | `deviceId` faltante cuando es `MOBILE`           |
| `401`  | Credenciales inválidas                           |
| `400`  | Body inválido según Zod                          |

---

## 1.4.2 Refresh (rotación de sesión)

### **POST `/auth/refresh`**

Renueva tokens usando el refresh token actual y ejecuta **rotación**.
Si detecta reuso de token revocado, revoca **todas** las sesiones del usuario.

📌 **Comportamiento por plataforma:**

* **WEB:** toma el refresh token desde cookie HttpOnly `rt` (sin body)
* **MOBILE:** toma el refresh token desde el body `{ refreshToken }`

---

### **Auth requerida**

❌ No (pero requiere refresh token válido)

---

### **Headers obligatorios**

| Header              | Valores          | Descripción                    |
| ------------------- | ---------------- | ------------------------------ |
| `X-Client-Platform` | `WEB` | `MOBILE` | Define si se lee cookie o body |

---

### **Body**

**Solo aplica para MOBILE**

```json
{
  "refreshToken": "rt_..."
}
```

📌 En **WEB** el body no se usa.

---

### **Qué hace exactamente**

1. Valida `X-Client-Platform`
2. Obtiene el refresh token:

   * WEB: `cookies.rt`
   * MOBILE: `body.refreshToken`
3. Busca la sesión por `refreshTokenHash`
4. Reglas:

   * si no existe → `401`
   * si está revocada → revoca todas las sesiones y responde `409`
   * si expiró → `401`
5. Rota:

   * genera nuevo refresh
   * actualiza la sesión con el nuevo hash y fechas
6. Firma nuevo access token
7. Responde:

   * WEB: setea nueva cookie `rt` y no devuelve refresh en JSON
   * MOBILE: devuelve refresh en JSON

---

### **Respuesta 200 (MOBILE)**

```json
{
  "data": {
    "tokens": {
      "accessToken": "JWT...",
      "accessTokenExpiresIn": 900,
      "refreshToken": "rt_new...",
      "refreshTokenExpiresAt": "2026-03-06T01:21:04.776Z"
    },
    "session": { "id": "ses_123" }
  },
  "meta": null,
  "error": null
}
```

---

### **Respuesta 200 (WEB)**

📌 Devuelve access token en JSON y manda el refresh por cookie `rt`.

```json
{
  "data": {
    "tokens": {
      "accessToken": "JWT...",
      "accessTokenExpiresIn": 900,
      "refreshTokenExpiresAt": "2026-03-06T01:21:04.776Z"
    },
    "session": { "id": "ses_123" }
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                                            |
| ------ | ----------------------------------------------------------------- |
| `400`  | Falta o es inválido `X-Client-Platform`                           |
| `400`  | WEB: no existe cookie `rt`                                        |
| `400`  | MOBILE: no viene `refreshToken` en body                           |
| `401`  | Token inválido / no existe / expirado                             |
| `409`  | Reuso de token revocado (posible robo). Revoca todas las sesiones |

---

## 1.4.3 Logout (cerrar sesión actual)

### **POST `/auth/logout`**

Cierra la sesión actual (la del access token con `sid`).
Revoca la sesión en BD y, en WEB, intenta limpiar la cookie `rt`.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

---

### **Headers obligatorios**

| Header              | Valores          | Descripción                                |
| ------------------- | ---------------- | ------------------------------------------ |
| `X-Client-Platform` | `WEB` | `MOBILE` | Necesario para decidir si se limpia cookie |

---

### **Body**

❌ No usa body

---

### **Qué hace exactamente**

1. Lee `sid` desde el access token (`req.user.sid`)
2. Revoca la sesión asociada (`logout(sessionId)`)
3. Si es WEB:

   * limpia cookie `rt`
4. Responde `204 No Content`

---

### **Respuesta 204**

Sin body.

---

### **Errores posibles**

| Código | Motivo                                      |
| ------ | ------------------------------------------- |
| `401`  | Access token ausente o inválido             |
| `400`  | No existe `sid` dentro del token            |
| `400`  | Falta/valor inválido de `X-Client-Platform` |

---

## 1.4.4 Logout de todas las sesiones

### **POST `/auth/logout-all`**

Cierra **todas** las sesiones activas del usuario (WEB y MOBILE) en todos los dispositivos.
Útil si el usuario sospecha robo de sesión, perdió el celular, o quiere “salir de todo”.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

---

### **Headers obligatorios**

| Header              | Valores          | Descripción                           |
| ------------------- | ---------------- | ------------------------------------- |
| `X-Client-Platform` | `WEB` | `MOBILE` | Se usa para limpieza de cookie en WEB |

---

### **Body**

❌ No usa body

---

### **Qué hace exactamente**

1. Extrae el `userId` del access token.
2. Revoca **todas** las sesiones del usuario en base de datos (incluye la actual).
3. En **WEB**, limpia la cookie `rt` para evitar que el navegador siga intentando refresh.
4. Responde `204 No Content`.

📌 Importante:

* Después de esto, cualquier access token que aún “no haya expirado” puede seguir siendo válido si tu sistema no valida sesión por request.
  Pero en tu flujo real, al expirar el access token, **ya no habrá refresh posible** y el usuario queda fuera.
* Si tu middleware valida que el `sid` exista/esté activo, el logout-all invalida todo de inmediato.

---

### **Respuesta 204**

Sin body.

---

### **Errores posibles**

| Código | Motivo                                     |
| ------ | ------------------------------------------ |
| `401`  | Access token inválido o ausente            |
| `400`  | Falta `X-Client-Platform` o valor inválido |

---

### **Consideraciones de diseño**

* Recomendado exponerlo en UI como: **“Cerrar sesión en todos los dispositivos”**
* Para MOBILE: después de `204`, el cliente debe **borrar** cualquier refresh token guardado en Secure Storage.

---

## 1.4.5 Perfil del usuario autenticado

### **GET `/auth/me`**

Devuelve la información del usuario autenticado a partir del access token.
Se usa para:

* hidratar el estado de sesión en front
* validar rol/permisos
* mostrar perfil y estado de verificación

📌 Ojo: este endpoint **no renueva tokens**. Solo lee “quién soy”.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

---

### **Headers obligatorios**

| Header              | Valores          | Descripción                               |
| ------------------- | ---------------- | ----------------------------------------- |
| `X-Client-Platform` | `WEB` | `MOBILE` | Mantiene consistencia en auditoría / logs |

---

### **Query params**

Ninguno.

---

### **Body**

❌ No usa body.

---

### **Qué hace exactamente**

1. Valida access token y extrae `userId` (y opcionalmente `sid`).
2. Busca el usuario en base de datos.
3. Verifica reglas mínimas:

   * usuario existe
   * usuario activo
4. Devuelve el perfil “safe” (sin password hash, sin secretos).

---

### **Respuesta 200**

```json
{
  "data": {
    "id": "cus_123",
    "email": "user@example.com",
    "nombres": "Ana",
    "apellidos": "Pérez",
    "rol": "SUPERVISOR",
    "activo": true,
    "profileStatus": "COMPLETE",
    "emailVerifiedAt": "2026-01-26T20:40:07.423Z",
    "createdAt": "2026-01-26T20:40:07.423Z",
    "updatedAt": "2026-02-03T20:10:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                                    |
| ------ | --------------------------------------------------------- |
| `401`  | Access token inválido o ausente                           |
| `404`  | Usuario no existe (token viejo o data inconsistente)      |
| `403`  | Usuario inactivo/bloqueado (si lo manejas como forbidden) |

---

### **Consideraciones para FRONT / MOBILE**

* Úsalo al iniciar la app si ya tienes un access token en memoria.
* Si `/auth/me` responde `401`, intenta:

  1. `POST /auth/refresh`
  2. luego reintenta `GET /auth/me`
  3. si falla, limpia sesión y manda a login

---

### CRUD Usuarios (RBAC)

## 1.4.6 Listado administrativo de usuarios

### **GET `/users`**

Obtiene un listado **paginado** de usuarios con filtros combinables, búsqueda textual, rango de fechas y ordenamiento.

📌 Este endpoint es la **base** de `/users/search` (alias).

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Query params disponibles**

Todos opcionales y combinables:

| Parámetro       | Tipo    | Descripción                                                 |
| --------------- | ------- | ----------------------------------------------------------- |
| `page`          | number  | Página (default `1`)                                        |
| `pageSize`      | number  | Tamaño (1–100, default `20`)                                |
| `search`        | string  | Busca en `nombres`, `apellidos`, `email` (case-insensitive) |
| `rol`           | enum    | `SUPER_ADMIN` | `SUPERVISOR` | `GUIA`                       |
| `activo`        | boolean | `true` / `false`                                            |
| `profileStatus` | enum    | `INCOMPLETE` | `COMPLETE`                                   |
| `createdFrom`   | date    | `createdAt >=`                                              |
| `createdTo`     | date    | `createdAt <=`                                              |
| `updatedFrom`   | date    | `updatedAt >=`                                              |
| `updatedTo`     | date    | `updatedAt <=`                                              |
| `orderBy`       | enum    | `createdAt` | `updatedAt` | `email`                         |
| `orderDir`      | enum    | `asc` | `desc`                                              |

📌 Fechas: `YYYY-MM-DD` o ISO.

---

### **Ejemplos**

**Buscar por texto**

```
GET /users?search=ana
```

**Filtrar guías activos**

```
GET /users?rol=GUIA&activo=true
```

**Ordenar por email**

```
GET /users?orderBy=email&orderDir=asc
```

---

### **Reglas de negocio**

* Solo accesible por `SUPER_ADMIN`.
* Paginación siempre aplicada (aunque no mandes params).
* Ordenamiento solo por campos permitidos (whitelist).
* Validación estricta con Zod sobre `req.query` (coerción a number/boolean/date).

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": "cus_123",
      "email": "guia1@test.com",
      "nombres": "Carlos",
      "apellidos": "Rodríguez",
      "rol": "GUIA",
      "activo": true,
      "profileStatus": "COMPLETE",
      "createdAt": "2026-01-26T20:40:07.423Z",
      "updatedAt": "2026-01-26T20:40:07.423Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "totalPages": 1
  },
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                       |
| ------ | ---------------------------- |
| `401`  | Token inválido o ausente     |
| `403`  | No es `SUPER_ADMIN`          |
| `400`  | Query params inválidos (Zod) |

---

## 1.4.7 Creación de usuario (admin)

### **POST `/users`**

Crea un usuario desde administración (RBAC).
Se usa para crear Supervisores/Guías (o SuperAdmin si lo permites) y dejarlo listo para completar perfil.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Body**

```json
{
  "email": "nuevo@gestionguias.com",
  "password": "Str0ngP@ss!",
  "nombres": "Ana",
  "apellidos": "Pérez",
  "rol": "GUIA",
  "activo": true
}
```

📌 Reglas típicas (según tu estándar):

* `email` válido y único (case-insensitive recomendado).
* `password` válido (mín/max; si aplicas política).
* `rol` dentro de enum permitido.
* `activo` opcional (default `true`).

---

### **Qué hace exactamente**

1. Valida body con **Zod**.
2. Verifica si existe usuario con ese email:

   * si existe → `409 Conflict`.
3. Hashea contraseña.
4. Crea usuario con estado inicial:

   * `profileStatus` usualmente `INCOMPLETE` (hasta completar perfil).
5. Devuelve el usuario “safe” (sin password).

---

### **Respuesta 201**

```json
{
  "data": {
    "id": "cus_999",
    "email": "nuevo@gestionguias.com",
    "nombres": "Ana",
    "apellidos": "Pérez",
    "rol": "GUIA",
    "activo": true,
    "profileStatus": "INCOMPLETE",
    "createdAt": "2026-02-04T02:10:00.000Z",
    "updatedAt": "2026-02-04T02:10:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | No es `SUPER_ADMIN`      |
| `400`  | Body inválido (Zod)      |
| `409`  | Email ya registrado      |

---

### **Consideraciones**

* Este endpoint es “admin-only”. Para onboarding externo, tu sistema usa **Invitations** (más seguro).
* Si quieres forzar verificación email, puedes crear con `emailVerifiedAt = null` y disparar flujo de verificación/invitación.

---

## 1.4.8 Obtener usuario por ID (admin)

### **GET `/users/:id`**

Obtiene el detalle de un usuario específico para administración.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción    |
| ----- | ------ | -------------- |
| `id`  | string | ID del usuario |

---

### **Qué hace exactamente**

1. Valida `id` (formato esperado).
2. Busca el usuario.
3. Si no existe → `404`.
4. Devuelve el usuario “safe”.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": "cus_123",
    "email": "guia1@test.com",
    "nombres": "Carlos",
    "apellidos": "Rodríguez",
    "rol": "GUIA",
    "activo": true,
    "profileStatus": "COMPLETE",
    "emailVerifiedAt": "2026-01-26T20:40:07.423Z",
    "createdAt": "2026-01-26T20:40:07.423Z",
    "updatedAt": "2026-02-03T20:10:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | No es `SUPER_ADMIN`      |
| `404`  | Usuario no existe        |
| `400`  | `id` inválido            |

---

## 1.4.9 Actualización de usuario (admin)

### **PATCH `/users/:id`**

Actualiza campos administrativos de un usuario existente (perfil básico, rol, estado activo, etc.) sin exponer datos sensibles.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción    |
| ----- | ------ | -------------- |
| `id`  | string | ID del usuario |

---

### **Body**

Todos los campos son opcionales (se actualiza solo lo enviado):

```json
{
  "email": "nuevo@email.com",
  "nombres": "Carlos",
  "apellidos": "Rodríguez",
  "rol": "GUIA",
  "activo": true,
  "profileStatus": "COMPLETE"
}
```

📌 Reglas típicas:

* `email` si se envía: debe ser válido y no estar ocupado por otro usuario.
* `rol`: solo valores del enum.
* `activo`: boolean real.
* `profileStatus`: solo enum permitido.
* No se actualiza contraseña aquí (eso va por flujo dedicado: change-password o reset).

---

### **Qué hace exactamente**

1. Valida `id` y `body` con **Zod**.
2. Busca el usuario:

   * si no existe → `404`.
3. Si se envía `email`, valida unicidad:

   * si ya existe en otro usuario → `409 Conflict`.
4. Aplica el update solo de los campos presentes.
5. Devuelve el usuario “safe” (sin password hash ni tokens).

---

### **Respuesta 200**

```json
{
  "data": {
    "id": "cus_123",
    "email": "nuevo@email.com",
    "nombres": "Carlos",
    "apellidos": "Rodríguez",
    "rol": "GUIA",
    "activo": true,
    "profileStatus": "COMPLETE",
    "createdAt": "2026-01-26T20:40:07.423Z",
    "updatedAt": "2026-02-04T02:20:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                              |
| ------ | ----------------------------------- |
| `401`  | Token inválido o ausente            |
| `403`  | No es `SUPER_ADMIN`                 |
| `404`  | Usuario no existe                   |
| `400`  | Body inválido (Zod)                 |
| `409`  | Email ya registrado en otro usuario |

---

### **Consideraciones de negocio**

* Cambiar `rol` puede afectar permisos inmediatamente.
* Cambiar `activo=false` debería impedir login y/o consumo de endpoints si tu middleware lo valida.
* Si tu sistema tiene auditoría, este endpoint debería registrar quién actualizó y qué cambió.

---

## 1.4.10 Eliminación de usuario (admin)

### **DELETE `/users/:id`**

Elimina un usuario desde administración.

📌 Nota importante (define el comportamiento real del sistema):

* Si tu implementación es **borrado lógico**, normalmente hace `activo=false` (y opcionalmente marca `deletedAt`).
* Si es **borrado físico**, elimina el registro (menos recomendable si hay auditoría/relaciones).

Mimi lo documenta como “admin delete” y tú ajustas una línea según cómo lo tengas en el service.

---

### **Auth requerida**

✅ Sí

`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción    |
| ----- | ------ | -------------- |
| `id`  | string | ID del usuario |

---

### **Body**

❌ No usa body.

---

### **Qué hace exactamente**

1. Valida `id`.
2. Busca el usuario:

   * si no existe → `404`.
3. Aplica eliminación según estrategia:

   * **Soft delete (recomendado):** marca `activo=false` (y opcional `deletedAt`).
   * **Hard delete:** elimina registro.
4. (Recomendado) Revoca sesiones del usuario si existe `logout-all` interno por seguridad.
5. Responde `204 No Content`.

---

### **Respuesta 204**

Sin body.

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | No es `SUPER_ADMIN`      |
| `404`  | Usuario no existe        |
| `400`  | `id` inválido            |

---

### **Consideraciones de diseño**

* Soft delete suele ser mejor para:

  * auditoría
  * integridad referencial (Turnos/Atenciones/Recaladas ligadas al usuario)
  * evitar “agujeros” históricos en reportes
* Si haces hard delete, asegura que Prisma no te bloquee por relaciones (o define cascadas con cuidado).

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

---

### **1.11 Restablecer contraseña (Reset Password)**

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

# **1.12 Verificación y activación de cuenta (Verify Email) — multi-plataforma (implementado)**

Este módulo implementa un flujo de **verificación de correo** para activar cuentas y confirmar propiedad del email, **sin filtrar información sensible** (anti-enumeración).

📌 **Comportamiento por plataforma (header `X-Client-Platform`):**

* **WEB:** se envía **solo link con token**.
* **MOBILE:** se envía **código de 6 dígitos** + debajo **link con token** como alternativa (fallback web).

Esto mejora UX en mobile (sin salir de la app) y mantiene el flujo estándar web.

---

## **1.12.1 Solicitud de verificación**

### **POST `/auth/verify-email/request`**

Permite solicitar un mensaje de verificación enviando únicamente el correo electrónico.

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

* El endpoint **siempre responde exitosamente** (respuesta “ciega”), exista o no el correo.
* Si el email:

  * **no existe**, o
  * pertenece a un usuario **inactivo (`activo=false`)**
    → **no se genera token ni se envía correo** (pero la respuesta sigue siendo genérica).
* Si el usuario existe y está activo:

  * Si **ya está verificado** (`emailVerifiedAt != null`) → **no-op** (misma respuesta genérica).
  * Si **no está verificado**:

    * Se genera un **token** de verificación (1 uso) y se guarda **solo el hash**.
    * Si `X-Client-Platform=MOBILE`:

      * Se genera además un **código de 6 dígitos** (OTP) y se guarda **solo su hash** (`codeHash`).
      * El email incluye **código + link**.
    * Si `X-Client-Platform=WEB`:

      * El email incluye **solo link**.
    * Se **invalidan tokens previos** activos del usuario (`usedAt = now`) para higiene.

---

### **Respuesta 200 (genérica)**

```json
{
  "data": {
    "message": "If the email exists, a verification message has been sent"
  },
  "meta": null,
  "error": null
}
```

---

### **Notas de implementación**

* Link apunta al frontend:

  * `APP_VERIFY_EMAIL_URL?token=xxxxx`
* TTL configurable:

  * `EMAIL_VERIFY_TTL_MINUTES` (aplica tanto a token como a código)

---

## 🗃️ Modelo de datos asociado (Prisma)

### Usuario

```prisma
model Usuario {
  // ...
  emailVerifiedAt DateTime?
  // ...
}
```

### Token de verificación (con soporte para código mobile)

```prisma
model EmailVerificationToken {
  id        String   @id @default(cuid())

  userId    String
  user      Usuario  @relation(fields: [userId], references: [id], onDelete: Cascade)

  tokenHash String   @unique
  codeHash  String?
  expiresAt DateTime
  usedAt    DateTime?

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([userId, codeHash])
  @@index([expiresAt])
  @@index([usedAt])
  @@map("email_verification_tokens")
}
```

📌 **Seguridad:**

* No se guarda `token` ni `code` en texto plano.
* `tokenHash`: HMAC + `TOKEN_PEPPER`
* `codeHash`: HMAC + `TOKEN_PEPPER` usando namespace `email_verify_code:` (ej. `email_verify_code:123456`)

---

## **1.12.2 Confirmación de verificación (implementado)**

### **POST `/auth/verify-email/confirm`**

Confirma la propiedad del correo electrónico consumiendo un token o código previamente generado.

* **Auth requerida:** ❌ No
* **Headers obligatorios:**
  `X-Client-Platform: WEB | MOBILE`

---

### **Modos soportados (2 formas)**

#### A) Confirmación por Token (WEB o fallback desde MOBILE)

**Body:**

```json
{
  "token": "token_plano_del_link"
}
```

#### B) Confirmación por Código (MOBILE)

**Body:**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

📌 Reglas del body:

* Debe enviarse **solo una forma**:

  * `token` **o**
  * `(email + code)`
* `code` debe ser exactamente **6 dígitos**.

---

### **Reglas de negocio**

Para ambos métodos, se valida:

* El token/código debe:

  * existir en BD (por `tokenHash` o por `user.email + codeHash`)
  * **no estar usado** (`usedAt = null`)
  * **no estar expirado** (`expiresAt > now`)
* El usuario asociado debe:

  * existir
  * estar **activo** (`activo = true`)

Al confirmar exitosamente:

* Se actualiza: `usuario.emailVerifiedAt = now`
* Se marca el registro de verificación como usado: `usedAt = now`
* Se invalidan otros tokens activos del mismo usuario (`usedAt = now`) para higiene
* Todo ocurre de forma **atómica** (transacción) para evitar doble consumo (double submit).

---

### **Respuesta 200**

```json
{
  "data": {
    "message": "Email verified successfully"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

|  Código | Motivo                                                                       |
| ------: | ---------------------------------------------------------------------------- |
|     400 | Token inválido/expirado/usado → `"Invalid or expired token"`                 |
|     400 | Código inválido/expirado/usado → `"Invalid or expired code"`                 |
|     400 | Usuario inactivo (se responde igual que inválido para no filtrar)            |
| 422/400 | Body inválido (por Zod): no envía forma válida o mezcla token con email+code |

---

## 🧪 Cómo probar (Postman)

### Caso 1: WEB (solo link)

1. `POST /auth/verify-email/request`

* Header: `X-Client-Platform: WEB`
* Body: `{ "email": "..." }`

2. Revisar email:

* Debe incluir **solo link**, sin código.

3. `POST /auth/verify-email/confirm`

* Header: `X-Client-Platform: WEB`
* Body: `{ "token": "..." }`

### Caso 2: MOBILE (código + link)

1. `POST /auth/verify-email/request`

* Header: `X-Client-Platform: MOBILE`

2. Revisar email:

* Debe incluir **código 6 dígitos** + link fallback.

3. `POST /auth/verify-email/confirm`

* Header: `X-Client-Platform: MOBILE`
* Body: `{ "email": "...", "code": "123456" }`

### Caso 3: Expiración / inválido

* Token/código inválido o expirado → `400` con mensaje genérico correspondiente.

---

## 🧾 Observabilidad (logs/audit)

Se registran eventos de auditoría para trazabilidad:

* `auth.verify_email.requested`
* `auth.verify_email.sent` (incluye `platform` y `mode: code+link | link`)
* `auth.verify_email.confirmed` (`method: token | code`)
* `auth.verify_email.already_verified`

---

# **1.13 Perfil y settings de usuario (implementado)**

Este bloque agrupa los endpoints orientados a la **gestión del perfil del usuario autenticado**, evitando el uso de identificadores explícitos (`:id`) desde el frontend y simplificando los flujos de edición de cuenta.

Estos endpoints **ya se encuentran implementados** en el repositorio.

---

## **1.13.1 Actualizar datos básicos del perfil**

#### PATCH `/users/me`

Permite al usuario autenticado **actualizar sus propios datos básicos** sin necesidad de enviar su identificador, usando el contexto del access token.

* **Auth requerida:**
  `Authorization: Bearer <accessToken>`

* **Headers obligatorios:**
  Ninguno adicional (❌ `X-Client-Platform` **no aplica** en este endpoint)

* **Body (al menos un campo):**

```json
{
  "nombres": "Duvan",
  "apellidos": "Mesa",
  "telefono": "+57 300 123 4567"
}
```

Todos los campos son **opcionales**, pero el body **no puede estar vacío**.

---

### **Reglas de negocio**

* El usuario **solo puede actualizar su propia información**.

* El identificador del usuario se obtiene desde el access token (`req.user.userId`).

* Campos permitidos:

  * `nombres`
  * `apellidos`
  * `telefono`

* Campos **no permitidos** (ignorados o rechazados por validación):

  * `email`
  * `rol`
  * `activo`
  * `profileStatus`
  * cualquier campo sensible o administrativo

* El endpoint es independiente del rol (`SUPER_ADMIN`, `SUPERVISOR`, `GUIA`).

* Si no se envía ningún campo válido → **error de validación**.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": "cus_123",
    "email": "user@example.com",
    "nombres": "Duvan",
    "apellidos": "Mesa",
    "telefono": "+57 300 123 4567",
    "rol": "GUIA",
    "activo": true,
    "profileStatus": "COMPLETE",
    "createdAt": "2026-01-20T10:00:00Z",
    "updatedAt": "2026-01-26T14:30:00Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

* `400` → body vacío o sin campos permitidos.
* `401` → access token inválido o ausente.
* `404` → usuario no encontrado (caso excepcional).

---

### **Consideraciones de diseño**

* El endpoint evita el uso de `:id` para:

  * reducir acoplamiento del frontend
  * prevenir errores de autorización
* La validación estricta se realiza con `Zod`.
* Los cambios quedan registrados en logs para auditoría.
* Pensado para pantallas de **“Editar perfil” / “Settings”** del usuario.

---

## **Relación con otros endpoints**

| Endpoint                  | Uso principal                             |
| ------------------------- | ----------------------------------------- |
| `PATCH /users/me`         | Edición rápida de datos básicos           |
| `PATCH /users/me/profile` | Completar perfil obligatorio (onboarding) |
| `PATCH /users/:id`        | Gestión administrativa (RBAC)             |

---

# **1.14 Búsqueda y filtros de usuarios (implementado)**

Este endpoint permite **listar, buscar y filtrar usuarios** de forma avanzada, pensado para **escalar** cuando el sistema tenga cientos o miles de registros.

Se utiliza tanto para **pantallas administrativas** como para futuros casos de exportación, dashboards o reportes.

---

## **1.14.1 Listado y búsqueda de usuarios**

#### GET `/users/search`

Permite obtener un listado paginado de usuarios aplicando **múltiples filtros combinables**, búsqueda textual, rangos de fechas y ordenamiento.

> Este endpoint es un **alias explícito** del listado administrativo de usuarios (`GET /users`), con el mismo comportamiento.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Query params disponibles**

Todos los parámetros son **opcionales** y pueden combinarse libremente.

| Parámetro       | Tipo    | Descripción                                                      |
| --------------- | ------- | ---------------------------------------------------------------- |
| `page`          | number  | Página a consultar (default: `1`)                                |
| `pageSize`      | number  | Tamaño de página (1–100, default: `20`)                          |
| `search`        | string  | Búsqueda por `nombres`, `apellidos` o `email` (case-insensitive) |
| `rol`           | enum    | Rol del usuario (`SUPER_ADMIN`, `SUPERVISOR`, `GUIA`)            |
| `activo`        | boolean | Estado del usuario (`true` / `false`)                            |
| `profileStatus` | enum    | Estado del perfil (`INCOMPLETE`, `COMPLETE`)                     |
| `createdFrom`   | date    | Fecha mínima de creación (`createdAt >=`)                        |
| `createdTo`     | date    | Fecha máxima de creación (`createdAt <=`)                        |
| `updatedFrom`   | date    | Fecha mínima de actualización (`updatedAt >=`)                   |
| `updatedTo`     | date    | Fecha máxima de actualización (`updatedAt <=`)                   |
| `orderBy`       | enum    | Campo de orden (`createdAt`, `updatedAt`, `email`)               |
| `orderDir`      | enum    | Dirección de orden (`asc`, `desc`)                               |

📌 Las fechas aceptan formato `YYYY-MM-DD` o ISO completo.

---

### **Ejemplos de uso**

**Buscar guías activos**

```
GET /users/search?rol=GUIA&activo=true
```

**Buscar por texto**

```
GET /users/search?search=ana
```

**Filtrar por rango de fechas**

```
GET /users/search?createdFrom=2026-01-01&createdTo=2026-01-31
```

**Ordenar por email**

```
GET /users/search?orderBy=email&orderDir=asc
```

**Combinación avanzada**

```
GET /users/search?page=1&pageSize=10&rol=GUIA&activo=true&profileStatus=COMPLETE&orderBy=createdAt&orderDir=desc
```

---

### **Reglas de negocio**

* El endpoint:

  * solo es accesible por `SUPER_ADMIN`
  * **no utiliza body** (todos los filtros van por query params)
* Los filtros se aplican **solo si están presentes**.
* Los filtros pueden combinarse sin restricciones.
* La búsqueda textual (`search`) es:

  * case-insensitive
  * aplicada sobre `nombres`, `apellidos` y `email`
* La paginación es **obligatoria internamente**, aunque el cliente no envíe parámetros.
* Los rangos de fechas:

  * validan coherencia (`from <= to`)
  * se aplican sobre `createdAt` y `updatedAt`
* El ordenamiento:

  * solo permite campos explícitos (whitelist)
  * evita SQL/ORM injection por diseño

---

### **Validación**

* Validación estricta con **Zod** sobre `req.query`.
* Valores inválidos producen error `400`:

  * fechas inválidas
  * enums fuera de rango
  * `pageSize` fuera de límites
  * booleanos no permitidos (ej: `activo=banana`)
* Los parámetros válidos son **coercidos a tipos reales** (`number`, `boolean`, `Date`) antes de llegar al service.

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": "cus_123",
      "email": "guia1@test.com",
      "nombres": "Carlos",
      "apellidos": "Rodríguez",
      "rol": "GUIA",
      "activo": true,
      "profileStatus": "COMPLETE",
      "createdAt": "2026-01-26T20:40:07.423Z",
      "updatedAt": "2026-01-26T20:40:07.423Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "totalPages": 1
  },
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                |
| ------ | ------------------------------------- |
| `401`  | Token inválido o ausente              |
| `403`  | Rol sin permisos (`no SUPER_ADMIN`)   |
| `400`  | Parámetros inválidos (validación Zod) |

---

### **Consideraciones de diseño**

* El endpoint está preparado para:

  * crecimiento del número de usuarios
  * filtros compuestos
  * futuras extensiones (export, dashboards)
* El filtrado se realiza en la base de datos (Prisma).
* Pensado para uso administrativo, no público.
* Compatible con cache HTTP si se requiere a futuro.

---

# **1.15 Perfil del usuario autenticado (implementado)**

Este endpoint permite obtener el **perfil del usuario actualmente autenticado**, sin necesidad de conocer su `id`, y sin depender de endpoints administrativos.

Es clave para:

* **frontends** (mostrar datos del usuario logueado),
* **autocompletar formularios**,
* **obtener el `guiaId` / `supervisorId`** cuando aplica,
* y soportar flujos como **Turnos/Claim/Assign** sin “hackear” búsquedas.

---

## **1.15.1 Obtener perfil actual**

#### GET `/users/me`

Devuelve la información del usuario autenticado (`req.user.userId`), incluyendo (si existen) sus relaciones `guia` y `supervisor`.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**
  `SUPER_ADMIN`, `SUPERVISOR`, `GUIA`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Body**

❌ No usa body.

---

### **Reglas de negocio**

* El endpoint:

  * requiere JWT válido.
  * identifica al usuario mediante `req.user.userId` (payload del access token).
  * **no permite consultar a otros usuarios** (es “self only”).
* Incluye información base del usuario:

  * `id`, `email`, `rol`, `activo`, `profileStatus`, etc.
* Incluye relaciones si existen:

  * `guia` (ej: `guia.id`, `telefono`, `direccion`)
  * `supervisor` (ej: `supervisor.id`, `telefono`)
* Si por alguna razón el `userId` autenticado no existe en BD → `404`.

---

### **Validación**

* No hay Zod de body/query porque no recibe payload.
* La validación ocurre por:

  * middleware `requireAuth` (token válido)
  * existencia del usuario en DB (`findUnique`)

---

### **Respuesta 200**

```json
{
  "data": {
    "id": "cml30bpm10005ih4da8iukdfz",
    "email": "guia1@test.com",
    "nombres": "Carlos",
    "apellidos": "Rodríguez",
    "telefono": "3000000000",
    "rol": "GUIA",
    "activo": true,
    "profileStatus": "COMPLETE",
    "profileCompletedAt": "2026-02-03T22:10:01.000Z",
    "documentType": "CC",
    "createdAt": "2026-01-26T20:40:07.423Z",
    "updatedAt": "2026-02-03T22:15:25.100Z",
    "guia": {
      "id": "cml4abcd0000xxx999",
      "telefono": "3000000000",
      "direccion": "Cartagena"
    },
    "supervisor": null
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| -----: | ------------------------ |
|  `401` | Token inválido o ausente |
|  `404` | Usuario no encontrado    |

---

### **Motivo de diseño**

* Evita que el frontend dependa de endpoints administrativos (como `GET /users/:id`) para obtener datos del usuario logueado.
* Permite que un guía obtenga su propio `guiaId` de forma segura.
* Reduce fricción para módulos operativos como **Turnos**, **Atenciones** y **Claim**.

---

# 👤 1.17 Lookup seguro de Guías (SUPERVISOR) — `GET /users/guides`

Este endpoint existe para resolver un problema operativo real:

* El **Supervisor** necesita **listar/seleccionar guías** (por ejemplo, para **asignar turnos**)
* Pero **no debe tener** acceso a:

  * listado completo de usuarios (`GET /users`)
  * filtros peligrosos (rol=SUPER_ADMIN)
  * CRUD administrativo

✅ Solución: un endpoint **dedicado**, con **campos mínimos** y **filtros controlados**.

---

## ✅ 1.17.1 Listar guías (lookup operativo)

### **GET `/users/guides`**

Retorna un listado **paginado** (opcional) de usuarios cuyo rol es **GUIA**, pensado para UI de selección/autocomplete.

---

### Auth requerida

✅ Sí
`Authorization: Bearer <accessToken>`

---

### Roles permitidos

* `SUPERVISOR`
* `SUPER_ADMIN` (también puede usarlo)

📌 **No** accesible por `GUIA`.

---

### Headers

| Header        | Valor            |
| ------------- | ---------------- |
| Authorization | Bearer `<token>` |

*(Si en tu API es estándar incluir `X-Client-Platform`, puedes mantenerlo, pero este endpoint no depende de plataforma.)*

---

### Query params (controlados)

Todos opcionales:

| Param      | Tipo    | Default                | Descripción                                                   |
| ---------- | ------- | ---------------------- | ------------------------------------------------------------- |
| `search`   | string  | —                      | Busca por `nombres`, `apellidos` o `email` (case-insensitive) |
| `activo`   | boolean | `true` *(recomendado)* | Filtra guías activos                                          |
| `page`     | number  | `1`                    | Paginación                                                    |
| `pageSize` | number  | `20`                   | Tamaño (1–100 recomendado)                                    |

📌 Importante (seguridad):

* No se permite `rol` en query.
* El servicio **fuerza** `rol = GUIA` internamente.

---

### Qué hace exactamente

1. Valida query con **Zod** (`listGuidesQuerySchema`).
2. Fuerza `rol = GUIA` (aunque el cliente intente colarse).
3. Aplica búsqueda textual sobre:

   * `nombres`
   * `apellidos`
   * `email`
4. Aplica filtro `activo` si viene (o default `true`).
5. Retorna solo campos mínimos, útiles para UI de asignación:

   * `guiaId`
   * `nombres`, `apellidos`
   * `email`
   * `activo`

---

### Respuesta 200 (ejemplo)

```json
{
  "data": [
    {
      "guiaId": "cml4abcd0000xxx999",
      "nombres": "Carlos",
      "apellidos": "Rodríguez",
      "email": "guia1@test.com",
      "activo": true
    },
    {
      "guiaId": "cml4abcd0000xxx998",
      "nombres": "Laura",
      "apellidos": "Pineda",
      "email": "guia2@test.com",
      "activo": true
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "totalPages": 1
  },
  "error": null
}
```

---

### Ejemplos de uso

**Autocomplete de guías activos**

```
GET /users/guides?search=car&page=1&pageSize=10
```

**Listar solo activos (default recomendado)**

```
GET /users/guides
```

**Ver también inactivos (si el UI lo requiere)**

```
GET /users/guides?activo=false
```

---

### Errores posibles

| Código | Motivo                                 |
| -----: | -------------------------------------- |
|  `401` | Token inválido o ausente               |
|  `403` | Rol sin permisos (no supervisor/admin) |
|  `400` | Query inválida (Zod)                   |

---

### Relación con el Front (caso Turnos)

En UI de asignación de turnos (panel Supervisor):

* Input “Seleccionar guía” (typeahead)
* Llama a `GET /users/guides?search=...`
* Usa `guiaId` para:

  * `PATCH /turnos/:id/assign { guiaId }`

✅ Con esto evitas usar `GET /users` (admin-only) y reduces exposición.

---

### Motivo de diseño (por qué este endpoint existe)

* Evita dar CRUD a Supervisores solo para poder “seleccionar guías”.
* Controla superficie de ataque (no hay filtro por rol ni datos sensibles).
* Resuelve el caso real de operación (asignación rápida en turnero).

---


# **1.16 Definition of Done (actualizado)**

* Login / Refresh / Logout / Logout-all funcionando correctamente.
* CRUD de usuarios con RBAC activo.
* Seeds iniciales ejecutados.
* Tokens gestionados con rotación, hash y detección de reuso.
* Validaciones estrictas con Zod.
* Logs mostrando entradas/salidas de forma consistente.
* **Forgot Password implementado y validado (email “ciego”, token 1-uso con TTL, hash en DB, invalidación de tokens previos).** *25/01/2026*
* **Reset Password implementado y validado (token 1-uso, expiración, cambio de hash, invalidación de tokens activos, revocación de sesiones).** *25/01/2026*
* **Change Password implementado y validado (compatibilidad oldPassword/currentPassword, password policy, revocación de sesiones).** *25/01/2026*
* **Rutas protegidas con `X-Client-Platform` donde aplica (WEB/MOBILE).** *25/01/2026*
* **Rate limiting aplicado a endpoints sensibles (`login`, `forgot-password`, `reset-password`, `change-password`).** *25/01/2026*
* **Flujo completo probado: forgot-password → reset-password → login con nueva contraseña.** *25/01/2026*
* **Verify Email Request implementado y validado (respuesta “ciega”, token 1-uso con TTL, hash en DB, invalidación de tokens previos, envío de correo con link).** *25/01/2026*
* **Migración aplicada: `Usuario.emailVerifiedAt` + tabla `email_verification_tokens`.** *25/01/2026*
* **Variables de entorno configuradas: `APP_VERIFY_EMAIL_URL`, `EMAIL_VERIFY_TTL_MINUTES`.** *25/01/2026*
* **Verify Email Confirm implementado y validado (token 1-uso, expiración, consumo `usedAt`, marca `emailVerifiedAt`, invalidación de tokens restantes, transacción).** *26/01/2026*
* **PATCH `/users/me` implementado y validado (edición de perfil propio sin `:id`, validación estricta).** *29/01/2026*
* **Búsqueda y filtros de usuarios implementado (`GET /users` y `GET /users/search`) con paginación, búsqueda, filtros por rol/estado/perfil, rangos de fechas y ordenamiento.** *29/01/2026*
* **Pruebas en Postman cubriendo casos válidos, combinados y de error para filtros administrativos.** *29/01/2026*
* **GET `/users/me` implementado y validado (consulta del usuario autenticado, incluye relaciones `guia`/`supervisor` si existen).** *03/02/2026*
* **Pruebas en Postman verificando que GUIA obtiene `guia.id` para operar Turnos/Claim.** *03/02/2026*
* * ✅ `GET /users/guides` implementado (SUPERVISOR/SUPER_ADMIN).
* ✅ Query limitada por schema (sin filtros peligrosos).
* ✅ Respuesta retorna `guiaId` (no solo `userId`) para flujos operativos.
* ✅ Probado en Postman:

  * 200 con supervisor
  * 403 con guía
  * búsqueda con `search`
  * filtro `activo`

* **Verify Email multi-plataforma implementado (WEB link-only, MOBILE code+link fallback).** *05/03/2026*
* **Verify Email Confirm soporta 2 métodos: token OR (email+code 6 dígitos) con apply atómico.** *05/03/2026*
* **Migración aplicada: `EmailVerificationToken.codeHash?` + índice `@@index([userId, codeHash])`.** *05/03/2026*
