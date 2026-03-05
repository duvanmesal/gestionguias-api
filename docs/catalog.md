# 📚 Catálogos — Países y Buques

## 1. Introducción

El módulo de **Catálogos** provee datos maestros centralizados que sirven como referencia para los módulos operativos del sistema (Recaladas, Atenciones y Turnos).
Su objetivo es garantizar **consistencia**, **reutilización**, **integridad referencial** y una **experiencia de usuario uniforme** tanto en aplicaciones web como móviles.

Los catálogos están diseñados para ser de **baja frecuencia de cambio**, con acceso restringido mediante control de roles (RBAC).

---

## 2. Catálogo de Países

### 2.1 Descripción

El catálogo de **Países** contiene los países reconocidos que pueden asociarse a:

* Buques (bandera o país de origen)
* Recaladas (origen o destino)
* Reportes e interfaces del sistema

Es un catálogo estable, administrado únicamente por roles de alto nivel.

### 2.2 Modelo de datos

| Campo       | Tipo     | Descripción                     |
| ----------- | -------- | ------------------------------- |
| `id`        | number   | Identificador único             |
| `codigo`    | string   | Código del país (ISO o interno) |
| `nombre`    | string   | Nombre oficial del país         |
| `status`    | enum     | `ACTIVO` | `INACTIVO`           |
| `createdAt` | datetime | Fecha de creación               |
| `updatedAt` | datetime | Fecha de última actualización   |

### 2.3 Reglas de negocio

* `codigo` es **obligatorio y único**.
* `nombre` es **obligatorio y único**.
* No se permite eliminar un país si existen buques asociados.
* Los países pueden desactivarse (`status = INACTIVO`) sin ser eliminados físicamente.
* Solo usuarios con rol **SUPER_ADMIN** pueden crear o eliminar países.
* Usuarios **SUPERVISOR** pueden listar, consultar y actualizar.

---

## 3. Catálogo de Buques

### 3.1 Descripción

El catálogo de **Buques** contiene los buques de crucero que realizan recaladas.
Cada buque puede estar asociado a un país (bandera) y se utiliza como referencia directa en las recaladas.

### 3.2 Modelo de datos

| Campo       | Tipo        | Descripción                       |
| ----------- | ----------- | --------------------------------- |
| `id`        | number      | Identificador único               |
| `nombre`    | string      | Nombre del buque                  |
| `paisId`    | number (FK) | País de bandera                   |
| `capacidad` | number      | Capacidad de pasajeros (opcional) |
| `naviera`   | string      | Compañía operadora (opcional)     |
| `status`    | enum        | `ACTIVO` | `INACTIVO`             |
| `createdAt` | datetime    | Fecha de creación                 |
| `updatedAt` | datetime    | Fecha de última actualización     |

### 3.3 Reglas de negocio

* `nombre` es **obligatorio y único**.
* `paisId` debe referenciar un país existente.
* `capacidad`, si se envía, debe ser un número positivo.
* No se elimina físicamente un buque:

  * La operación DELETE aplica **soft delete** (`status = INACTIVO`).
* Los buques inactivos no aparecen en endpoints de selección (`lookup`).
* Acceso controlado por roles:

  * **SUPER_ADMIN**: crear, eliminar (soft delete).
  * **SUPERVISOR**: listar, consultar y actualizar.

---

## 4. Endpoints disponibles

### 4.1 Países

| Método | Endpoint                | Descripción                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | `/api/v1/paises`        | Listar países (con filtros y paginación) |
| GET    | `/api/v1/paises/:id`    | Obtener país por ID                      |
| POST   | `/api/v1/paises`        | Crear país                               |
| PATCH  | `/api/v1/paises/:id`    | Actualizar país                          |
| DELETE | `/api/v1/paises/:id`    | Eliminar país                            |
| GET    | `/api/v1/paises/lookup` | Listado liviano para selects             |

Listo, Duvan. Mimi se metió al código real (routes + Zod + service) y aquí van los **3 primeros endpoints de Países** documentados “nivel 1.12+”, tal cual funcionan hoy ✅

---

## 4.1.1 Lookup de Países (para selects)

### **GET `/api/v1/paises/lookup`**

Devuelve un listado **liviano** de países **ACTIVOS**, pensado para dropdowns/selects en Web y Mobile.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`
(Se controla con `requireSupervisor` en rutas.)

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Query params**

Ninguno.

---

### **Qué hace exactamente**

1. Filtra por `status = "ACTIVO"`.
2. Ordena por `nombre ASC`.
3. Devuelve solo campos livianos: `id`, `codigo`, `nombre`.

---

### **Respuesta 200**

```json
{
  "data": [
    { "id": 1, "codigo": "CO", "nombre": "Colombia" },
    { "id": 2, "codigo": "ES", "nombre": "España" }
  ],
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | Rol sin permisos         |

---

---

## 4.1.2 Listado de Países (filtros + paginación)

### **GET `/api/v1/paises`**

Lista países con paginación y filtros combinables. Ideal para pantallas administrativas.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Query params disponibles**

Todos son opcionales (pero paginación tiene defaults):

| Parámetro  | Tipo   | Descripción                                                |
| ---------- | ------ | ---------------------------------------------------------- |
| `q`        | string | Busca por `nombre` o `codigo` (contains, case-insensitive) |
| `codigo`   | string | Filtro exacto por código (`equals`)                        |
| `status`   | enum   | `ACTIVO` | `INACTIVO`                                      |
| `page`     | number | Default `1`                                                |
| `pageSize` | number | Default `10`, máximo `100`                                 |

📌 Validación real (Zod):

* `q`: `trim().min(1).max(60)` (si mandas vacío, da 400)
* `codigo`: `trim().min(2).max(10)`
* `page`: int positivo (default 1)
* `pageSize`: int positivo, max 100 (default 10)

---

### **Ejemplos de uso**

**Buscar por texto**

```
GET /api/v1/paises?q=co
```

**Filtrar por status**

```
GET /api/v1/paises?status=ACTIVO&page=1&pageSize=10
```

**Filtro exacto por código**

```
GET /api/v1/paises?codigo=CO
```

---

### **Qué hace exactamente**

1. Valida `req.query` con Zod.
2. Construye `where`:

   * `status` si viene.
   * `codigo` exacto si viene.
   * `q` aplica `OR` sobre:

     * `nombre contains q (insensitive)`
     * `codigo contains q (insensitive)`
3. Ordena por `updatedAt DESC`.
4. Aplica paginación (`skip/take`).
5. Devuelve `{ items, total, page, pageSize }`.

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": 1,
      "codigo": "CO",
      "nombre": "Colombia",
      "status": "ACTIVO",
      "createdAt": "2026-01-10T12:00:00.000Z",
      "updatedAt": "2026-02-01T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 1
  },
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                                     |
| ------ | ---------------------------------------------------------- |
| `401`  | Token inválido o ausente                                   |
| `403`  | Rol sin permisos                                           |
| `400`  | Query params inválidos (Zod: enums/fechas/números/strings) |

---

---

## 4.1.3 Obtener País por ID

### **GET `/api/v1/paises/:id`**

Obtiene un país específico por su `id`.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción     |
| ----- | ------ | --------------- |
| `id`  | number | Entero positivo |

📌 Validación real: `z.coerce.number().int().positive()`

---

### **Qué hace exactamente**

1. Valida `id`.
2. Busca el país por `id`.
3. Si no existe, responde **404** con error estandarizado.
4. Si existe, devuelve el país con campos completos.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 1,
    "codigo": "CO",
    "nombre": "Colombia",
    "status": "ACTIVO",
    "createdAt": "2026-01-10T12:00:00.000Z",
    "updatedAt": "2026-02-01T12:00:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Respuesta 404**

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "País no encontrado"
  }
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | Rol sin permisos         |
| `400`  | `id` inválido (Zod)      |
| `404`  | País no encontrado       |

---

## 4.1.4 Crear País

### **POST `/api/v1/paises`**

Crea un país en el catálogo. Pensado para administración (alta de datos maestros).

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`
(En rutas: `requireSuperAdmin`.)

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Body**

```json
{
  "codigo": "CO",
  "nombre": "Colombia",
  "status": "ACTIVO"
}
```

📌 Validación real (Zod, típico en tu módulo):

* `codigo`: string `trim`, min 2, max 10
* `nombre`: string `trim`, min 2, max 80 (aprox según estándar)
* `status`: `ACTIVO | INACTIVO` (opcional, default suele ser `ACTIVO` si no lo mandas)

---

### **Qué hace exactamente**

1. Valida `req.body` con **Zod**.
2. Verifica unicidad:

   * `codigo` único
   * `nombre` único
     Si se repite → `409 Conflict`.
3. Crea el país.
4. Devuelve el país creado.

---

### **Respuesta 201**

```json
{
  "data": {
    "id": 10,
    "codigo": "CO",
    "nombre": "Colombia",
    "status": "ACTIVO",
    "createdAt": "2026-02-04T03:05:00.000Z",
    "updatedAt": "2026-02-04T03:05:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                        |
| ------ | ----------------------------- |
| `401`  | Token inválido o ausente      |
| `403`  | No es `SUPER_ADMIN`           |
| `400`  | Body inválido (Zod)           |
| `409`  | `codigo` o `nombre` ya existe |

---

### **Consideraciones**

* Normaliza `codigo` (ej: `CO`) en el cliente para evitar duplicados por casing.
* Si tu sistema usa seeds, este endpoint es para administración manual.

---

---

## 4.1.5 Actualizar País

### **PATCH `/api/v1/paises/:id`**

Actualiza campos de un país existente. Permite cambios administrativos como nombre, código o status.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`
(En rutas: `requireSupervisor`.)

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción     |
| ----- | ------ | --------------- |
| `id`  | number | Entero positivo |

---

### **Body**

Campos opcionales (se actualiza solo lo enviado):

```json
{
  "codigo": "CO",
  "nombre": "República de Colombia",
  "status": "ACTIVO"
}
```

📌 Validación:

* `codigo` (si viene): string trim, min 2, max 10
* `nombre` (si viene): string trim, min 2, max 80
* `status` (si viene): `ACTIVO | INACTIVO`

---

### **Qué hace exactamente**

1. Valida `id` y `body` con **Zod**.
2. Busca el país:

   * si no existe → `404`.
3. Si se envía `codigo` o `nombre`, valida unicidad:

   * si ya existe en otro país → `409 Conflict`.
4. Aplica el update.
5. Devuelve el país actualizado.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 10,
    "codigo": "CO",
    "nombre": "República de Colombia",
    "status": "ACTIVO",
    "createdAt": "2026-01-10T12:00:00.000Z",
    "updatedAt": "2026-02-04T03:10:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                        |
| ------ | ----------------------------- |
| `401`  | Token inválido o ausente      |
| `403`  | Rol sin permisos              |
| `400`  | `id` o body inválidos (Zod)   |
| `404`  | País no encontrado            |
| `409`  | `codigo` o `nombre` ya existe |

---

### **Reglas de negocio**

* Se permite desactivar un país (`status=INACTIVO`) sin borrarlo.
* Desactivar afecta pantallas de selección: `lookup` no lo devuelve.

---

---

## 4.1.6 Eliminar País (hard delete con protección referencial)

### **DELETE `/api/v1/paises/:id`**

Elimina un país **físicamente** de base de datos.

🚨 Tiene una regla crítica:
**No se permite eliminar si existen buques asociados.**

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

| Param | Tipo   | Descripción     |
| ----- | ------ | --------------- |
| `id`  | number | Entero positivo |

---

### **Body**

❌ No usa body.

---

### **Qué hace exactamente**

1. Valida `id`.
2. Busca el país:

   * si no existe → `404`.
3. Verifica integridad:

   * si hay buques con `paisId = id` → **409 Conflict**.
4. Si pasa, ejecuta **delete físico**.
5. Responde `204 No Content`.

---

### **Respuesta 204**

Sin body.

---

### **Respuesta 409 (ejemplo)**

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "CONFLICT",
    "message": "No se puede eliminar el país porque tiene buques asociados"
  }
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | No es `SUPER_ADMIN`      |
| `400`  | `id` inválido            |
| `404`  | País no encontrado       |
| `409`  | Tiene buques asociados   |

---

### **Recomendación de UX**

En UI admin, muestra:

* Acción principal: **Desactivar** (PATCH status=INACTIVO)
* Acción peligrosa: **Eliminar** (solo si no tiene buques)

---

## 4.1.7 Bulk Upload de Países (JSON)

### **POST `/api/v1/paises/bulk`**

Carga masiva de países vía JSON. Soporta:

* **UPSERT**: crea si no existe, actualiza si ya existe (por `codigo`).
* **CREATE_ONLY**: crea solo si no existe (si existe, lo omite).

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

`Content-Type: application/json`

---

### **Body**

```json
{
  "mode": "UPSERT",
  "dryRun": false,
  "items": [
    { "codigo": "CO", "nombre": "Colombia", "status": "ACTIVO" },
    { "codigo": "ES", "nombre": "España" }
  ]
}
```

#### **Campos**

| Campo    | Tipo    | Requerido | Descripción                            |
| -------- | ------- | --------- | -------------------------------------- |
| `mode`   | enum    | No        | `UPSERT` (default) | `CREATE_ONLY`     |
| `dryRun` | boolean | No        | Si `true`, valida y simula sin guardar |
| `items`  | array   | Sí        | Lista de países (1..500)               |

#### **Item**

| Campo    | Tipo   | Requerido | Descripción                                                 |
| -------- | ------ | --------- | ----------------------------------------------------------- |
| `codigo` | string | Sí        | `trim`, min 2, max 10                                       |
| `nombre` | string | Cond.     | Requerido al crear (UPSERT cuando no existe, y CREATE_ONLY) |
| `status` | enum   | No        | `ACTIVO \| INACTIVO` (default: `ACTIVO`)                    |

---

### **Qué hace exactamente**

1. Valida el payload con Zod (`items` máximo **500**).
2. Detecta duplicados dentro del payload por `codigo` (marca error por índice).
3. Busca países existentes por `codigo`.
4. Según `mode`:

   * **CREATE_ONLY**: crea los que no existen.
   * **UPSERT**: crea los que no existen y actualiza `nombre/status` si cambia.
5. Devuelve resumen + errores por fila.

---

### **Respuesta 200**

```json
{
  "data": {
    "mode": "UPSERT",
    "dryRun": false,
    "requested": 2,
    "created": 2,
    "updated": 0,
    "skipped": 0,
    "failed": 0,
    "errors": []
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                       |
| ------ | -------------------------------------------- |
| `401`  | Token inválido o ausente                     |
| `403`  | No es `SUPER_ADMIN`                          |
| `400`  | Body inválido (Zod), ej. items vacío o > 500 |

📌 Errores por item (no aborta todo): se reflejan en `data.errors[]`, por ejemplo:

* Duplicado en payload
* Violación de unique (`codigo` o `nombre`) a nivel BD (Prisma `P2002`)

---

## 4.1.8 Bulk Upload de Países (CSV/XLSX)

### **POST `/api/v1/paises/bulk/file?mode=UPSERT&dryRun=false`**

Carga masiva de países vía archivo **CSV o XLSX**, enviándolo como **raw body** (binario).

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Query params**

| Parámetro | Tipo    | Default  | Descripción             |
| --------- | ------- | -------- | ----------------------- |
| `mode`    | enum    | `UPSERT` | `UPSERT \| CREATE_ONLY` |
| `dryRun`  | boolean | `false`  | Simula sin guardar      |

---

### **Headers**

✅ Obligatorio según el archivo:

* CSV: `Content-Type: text/csv` (o `text/plain`)
* XLSX: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### **Formato del archivo**

#### CSV (columnas)

`codigo,nombre,status`

Ejemplo:

```csv
codigo,nombre,status
CO,Colombia,ACTIVO
ES,España,ACTIVO
```

#### XLSX

* Se lee **la primera hoja**.
* La primera fila debe ser headers: `codigo | nombre | status`.

📌 Headers son **flexibles**:

* Insensible a mayúsculas/minúsculas.
* Ignora tildes y espacios (ej: `Código`, `codigo`, `CÓDIGO` funcionan igual).

---

### **Respuesta 200**

Misma estructura que `/bulk` (JSON), con resumen y errores por índice.

---

### **Errores posibles**

| Código | Motivo                                     |
| ------ | ------------------------------------------ |
| `401`  | Token inválido o ausente                   |
| `403`  | No es `SUPER_ADMIN`                        |
| `400`  | Archivo vacío, sin filas, formato inválido |
| `400`  | Query inválida (`mode`, `dryRun`)          |

---

## 4.2.7 Bulk Upload de Buques (JSON)

### **POST `/api/v1/buques/bulk`**

Carga masiva de buques vía JSON. Soporta UPSERT con **reglas de seguridad** para no alterar historial cuando un buque ya está referenciado en recaladas.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Headers obligatorios**

`Content-Type: application/json`

---

### **Body**

```json
{
  "mode": "UPSERT",
  "dryRun": false,
  "force": false,
  "items": [
    {
      "codigo": "MSC-001",
      "nombre": "MSC Seaview",
      "paisId": 5,
      "capacidad": 5200,
      "naviera": "MSC Cruises",
      "status": "ACTIVO"
    }
  ]
}
```

#### **Campos**

| Campo    | Tipo    | Requerido | Descripción                                            |
| -------- | ------- | --------- | ------------------------------------------------------ |
| `mode`   | enum    | No        | `UPSERT` (default) | `CREATE_ONLY`                     |
| `dryRun` | boolean | No        | Si `true`, valida y simula sin guardar                 |
| `force`  | boolean | No        | Si `true`, permite cambios sensibles aun con recaladas |
| `items`  | array   | Sí        | Lista de buques (1..500)                               |

#### **Item**

| Campo       | Tipo   | Requerido | Descripción                                  |
| ----------- | ------ | --------- | -------------------------------------------- |
| `codigo`    | string | Sí        | Identificador estable. `trim`, min 2, max 20 |
| `nombre`    | string | Cond.     | Requerido al crear                           |
| `paisId`    | number | No        | Debe existir                                 |
| `capacidad` | number | No        | Positivo, máximo 200000                      |
| `naviera`   | string | No        | Texto, recomendado min 2                     |
| `status`    | enum   | No        | `ACTIVO \| INACTIVO`                         |

---

### **Reglas de negocio (UPSERT SAFE)**

✅ UPSERT usa **`codigo` como llave** (create si no existe, update si existe).

**Si el buque ya tiene recaladas asociadas** (`recalada.buqueId`), entonces:

* Por defecto (`force=false`) **NO se permite cambiar**:

  * `nombre`
  * `paisId`

Esto evita cambios “retroactivos” que alteren la lectura histórica.

✅ Si el admin realmente necesita hacerlo, debe enviar `force=true`.

---

### **Qué hace exactamente**

1. Valida payload con Zod (`items` máximo 500).
2. Valida duplicados dentro del payload por `codigo`.
3. Prefetch de buques existentes por `codigo`.
4. Valida masivamente que `paisId` existan (si vienen).
5. Obtiene conteo de recaladas por buque para aplicar regla `UPSERT SAFE`.
6. Ejecuta create/update de forma parcial y reporta errores por item.

---

### **Respuesta 200**

```json
{
  "data": {
    "mode": "UPSERT",
    "dryRun": false,
    "force": false,
    "requested": 1,
    "created": 1,
    "updated": 0,
    "skipped": 0,
    "failed": 0,
    "errors": []
  },
  "meta": null,
  "error": null
}
```

---

### **Ejemplo de error por regla UPSERT SAFE**

Si intentas cambiar `nombre` con recaladas y `force=false`:

```json
{
  "data": {
    "mode": "UPSERT",
    "dryRun": false,
    "force": false,
    "requested": 1,
    "created": 0,
    "updated": 0,
    "skipped": 0,
    "failed": 1,
    "errors": [
      {
        "index": 0,
        "codigo": "MSC-001",
        "message": "No se permite cambiar nombre: buque tiene recaladas (use force=true si aplica)",
        "details": { "recaladas": 12 }
      }
    ]
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                   |
| ------ | ---------------------------------------- |
| `401`  | Token inválido o ausente                 |
| `403`  | No es `SUPER_ADMIN`                      |
| `400`  | Body inválido (Zod)                      |
| `200`  | Parcial con fallos (ver `data.errors[]`) |

Errores por item típicos:

* `paisId` no existe
* Unique violation (`codigo` o `nombre`) en BD (Prisma `P2002`)
* Duplicado por `codigo` dentro del payload

---

### 4.2 Buques

| Método | Endpoint                | Descripción                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | `/api/v1/buques`        | Listar buques (con filtros y paginación) |
| GET    | `/api/v1/buques/:id`    | Obtener buque por ID                     |
| POST   | `/api/v1/buques`        | Crear buque                              |
| PATCH  | `/api/v1/buques/:id`    | Actualizar buque                         |
| DELETE | `/api/v1/buques/:id`    | Desactivar buque (soft delete)           |
| GET    | `/api/v1/buques/lookup` | Listado liviano para selects             |

---

## 4.2.1 Lookup de Buques (para selects)

### **GET `/api/v1/buques/lookup`**

Devuelve un listado **liviano** de buques **ACTIVOS**, pensado para selects (crear/editar Recaladas, filtros, etc.).

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`
(Controlado por `requireSupervisor`.)

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Query params**

Ninguno.

---

### **Qué hace exactamente**

1. Filtra por `status = "ACTIVO"`.
2. Ordena por `nombre ASC`.
3. Devuelve campos livianos del buque y referencia del país:

   * `id`, `nombre`
   * `pais: { id, codigo }`

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": 12,
      "nombre": "MSC Seaview",
      "pais": { "id": 1, "codigo": "MT" }
    },
    {
      "id": 15,
      "nombre": "Norwegian Dawn",
      "pais": { "id": 2, "codigo": "BS" }
    }
  ],
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | Rol sin permisos         |

---

---

## 4.2.2 Listado de Buques (filtros + paginación)

### **GET `/api/v1/buques`**

Lista buques con paginación y filtros combinables. Ideal para administración.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Query params disponibles**

Todos opcionales (paginación con defaults):

| Parámetro  | Tipo   | Descripción                                                 |
| ---------- | ------ | ----------------------------------------------------------- |
| `q`        | string | Busca por `nombre` o `naviera` (contains, case-insensitive) |
| `paisId`   | number | Filtra por país de bandera                                  |
| `status`   | enum   | `ACTIVO` | `INACTIVO`                                       |
| `page`     | number | Default `1`                                                 |
| `pageSize` | number | Default `10`, máximo `100`                                  |

📌 Validación real (Zod, siguiendo tu estándar):

* `q`: `trim().min(1).max(60)` (vacío → 400)
* `paisId`: `coerce.number().int().positive()`
* `status`: enum `ACTIVO | INACTIVO`
* `page`: int positivo (default 1)
* `pageSize`: int positivo, max 100 (default 10)

---

### **Ejemplos de uso**

**Buscar por texto**

```
GET /api/v1/buques?q=msc
```

**Filtrar por país**

```
GET /api/v1/buques?paisId=1
```

**Filtrar por status y paginar**

```
GET /api/v1/buques?status=ACTIVO&page=1&pageSize=20
```

**Combinado**

```
GET /api/v1/buques?q=cruise&paisId=2&status=ACTIVO&page=1&pageSize=10
```

---

### **Qué hace exactamente**

1. Valida `req.query` con Zod.
2. Construye `where`:

   * `status` si viene.
   * `paisId` si viene.
   * `q` aplica `OR` sobre:

     * `nombre contains q (insensitive)`
     * `naviera contains q (insensitive)`
3. Ordena por `updatedAt DESC`.
4. Aplica paginación (`skip/take`).
5. Devuelve lista y meta.

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": 12,
      "nombre": "MSC Seaview",
      "paisId": 1,
      "capacidad": 5200,
      "naviera": "MSC Cruises",
      "status": "ACTIVO",
      "createdAt": "2026-01-10T12:00:00.000Z",
      "updatedAt": "2026-02-01T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 1
  },
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                       |
| ------ | ---------------------------- |
| `401`  | Token inválido o ausente     |
| `403`  | Rol sin permisos             |
| `400`  | Query params inválidos (Zod) |

---

## 4.2.3 Obtener Buque por ID

### **GET `/api/v1/buques/:id`**

Obtiene el detalle de un buque específico por `id`.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción     |
| ----- | ------ | --------------- |
| `id`  | number | Entero positivo |

📌 Validación: `z.coerce.number().int().positive()`

---

### **Qué hace exactamente**

1. Valida `id`.
2. Busca el buque por `id`.
3. Si no existe → `404`.
4. Si existe, devuelve el buque con sus campos.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 12,
    "nombre": "MSC Seaview",
    "paisId": 1,
    "capacidad": 5200,
    "naviera": "MSC Cruises",
    "status": "ACTIVO",
    "createdAt": "2026-01-10T12:00:00.000Z",
    "updatedAt": "2026-02-01T12:00:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Respuesta 404 (ejemplo)**

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Buque no encontrado"
  }
}
```

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | Rol sin permisos         |
| `400`  | `id` inválido            |
| `404`  | Buque no encontrado      |

---

## 4.2.4 Crear Buque

### **POST `/api/v1/buques`**

Crea un buque en el catálogo. Se usa para administración de datos maestros.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`
(En rutas: `requireSuperAdmin`.)

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Body**

```json
{
  "nombre": "MSC Seaview",
  "paisId": 1,
  "capacidad": 5200,
  "naviera": "MSC Cruises",
  "status": "ACTIVO"
}
```

📌 Validación real (Zod, según estándar de tu módulo):

* `nombre`: string `trim`, min 2, max 120
* `paisId`: `coerce.number().int().positive()`
* `capacidad`: opcional, int positivo (tope alto, ej 200000)
* `naviera`: opcional, string trim, min 2, max 80
* `status`: `ACTIVO | INACTIVO` (opcional, default suele ser `ACTIVO`)

---

### **Qué hace exactamente**

1. Valida `req.body` con Zod.
2. Verifica unicidad de `nombre`:

   * si ya existe → `409 Conflict`.
3. Verifica integridad referencial:

   * valida que exista el País con `paisId`.
   * si no existe → `400 Bad Request`.
4. Crea el buque.
5. Devuelve el buque creado.

---

### **Respuesta 201**

```json
{
  "data": {
    "id": 30,
    "nombre": "MSC Seaview",
    "paisId": 1,
    "capacidad": 5200,
    "naviera": "MSC Cruises",
    "status": "ACTIVO",
    "createdAt": "2026-02-04T03:40:00.000Z",
    "updatedAt": "2026-02-04T03:40:00.000Z"
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
| `400`  | Body inválido (Zod)                 |
| `400`  | `paisId` no existe                  |
| `409`  | Ya existe un buque con ese `nombre` |

---

### **Consideraciones**

* Si el cliente permite `status=INACTIVO` al crear, ese buque no aparecerá en `/lookup`.
* Para UI, es mejor crear en ACTIVO y usar PATCH para desactivar.

---

## 4.2.5 Actualizar Buque

### **PATCH `/api/v1/buques/:id`**

Actualiza campos administrativos de un buque existente. Permite cambiar país, naviera, capacidad, status, etc.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`
(En rutas: `requireSupervisor`.)

---

### **Headers obligatorios**

Ninguno adicional.

---

### **Path params**

| Param | Tipo   | Descripción     |
| ----- | ------ | --------------- |
| `id`  | number | Entero positivo |

---

### **Body**

Campos opcionales (solo se actualiza lo enviado):

```json
{
  "nombre": "MSC Seaview",
  "paisId": 2,
  "capacidad": 5300,
  "naviera": "MSC Cruises",
  "status": "ACTIVO"
}
```

📌 Validación:

* `nombre` (si viene): string trim min 2 max 120
* `paisId` (si viene): int positivo
* `capacidad` (si viene): int positivo
* `naviera` (si viene): string trim min 2 max 80
* `status` (si viene): enum `ACTIVO | INACTIVO`

---

### **Qué hace exactamente**

1. Valida `id` y `body` con Zod.
2. Busca el buque:

   * si no existe → `404`.
3. Si se envía `nombre`, valida unicidad:

   * si existe en otro buque → `409`.
4. Si se envía `paisId`, valida existencia del país:

   * si no existe → `400`.
5. Actualiza solo los campos presentes.
6. Devuelve el buque actualizado.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 30,
    "nombre": "MSC Seaview",
    "paisId": 2,
    "capacidad": 5300,
    "naviera": "MSC Cruises",
    "status": "ACTIVO",
    "createdAt": "2026-02-04T03:40:00.000Z",
    "updatedAt": "2026-02-04T03:45:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                |
| ------ | ------------------------------------- |
| `401`  | Token inválido o ausente              |
| `403`  | Rol sin permisos                      |
| `400`  | `id` o body inválidos (Zod)           |
| `400`  | `paisId` no existe                    |
| `404`  | Buque no encontrado                   |
| `409`  | `nombre` ya está usado por otro buque |

---

### **Reglas de negocio**

* Cambiar `status=INACTIVO` lo saca de `/buques/lookup`.
* `SUPERVISOR` sí puede actualizar (según tu RBAC actual).

---

## 4.2.6 Desactivar Buque (Soft Delete)

### **DELETE `/api/v1/buques/:id`**

No elimina físicamente. Aplica **soft delete**: `status = INACTIVO`.

📌 Esto conserva trazabilidad para recaladas históricas que referencian al buque.

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

| Param | Tipo   | Descripción     |
| ----- | ------ | --------------- |
| `id`  | number | Entero positivo |

---

### **Body**

❌ No usa body.

---

### **Qué hace exactamente**

1. Valida `id`.
2. Busca el buque:

   * si no existe → `404`.
3. Si existe:

   * actualiza `status = INACTIVO`.
4. Responde `204 No Content`.

📌 Comportamiento idempotente:

* Si ya estaba `INACTIVO`, la operación no debería fallar (mantiene INACTIVO).

---

### **Respuesta 204**

Sin body.

---

### **Errores posibles**

| Código | Motivo                   |
| ------ | ------------------------ |
| `401`  | Token inválido o ausente |
| `403`  | No es `SUPER_ADMIN`      |
| `400`  | `id` inválido            |
| `404`  | Buque no encontrado      |

---

### **Recomendación de UX**

* Etiqueta en admin: **“Desactivar buque”** en lugar de “Eliminar”.
* Si quieres reactivar, hazlo vía `PATCH /buques/:id` con `status=ACTIVO` (si tu negocio lo permite).

---


## 4.2.8 Bulk Upload de Buques (CSV/XLSX)

### **POST `/api/v1/buques/bulk/file?mode=UPSERT&dryRun=false&force=false`**

Carga masiva de buques vía archivo CSV o XLSX como raw binary.

---

### **Auth requerida**

✅ Sí
`Authorization: Bearer <accessToken>`

**Roles permitidos:** `SUPER_ADMIN`

---

### **Query params**

| Parámetro | Tipo    | Default  | Descripción                                 |
| --------- | ------- | -------- | ------------------------------------------- |
| `mode`    | enum    | `UPSERT` | `UPSERT \| CREATE_ONLY`                     |
| `dryRun`  | boolean | `false`  | Simula sin guardar                          |
| `force`   | boolean | `false`  | Permite cambios sensibles aun con recaladas |

---

### **Headers**

* CSV: `Content-Type: text/csv` o `text/plain`
* XLSX: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### **Formato del archivo**

#### CSV (columnas)

`codigo,nombre,paisId,capacidad,naviera,status`

Ejemplo:

```csv
codigo,nombre,paisId,capacidad,naviera,status
MSC-001,MSC Seaview,5,5200,MSC Cruises,ACTIVO
NCL-002,Norwegian Dawn,2,2400,NCL,ACTIVO
```

#### XLSX

* Primera hoja.
* Primera fila: headers.

📌 Headers flexibles (normalización):

* `pais id`, `paisId`, `PAÍS ID` terminan mapeando a `paisId`.

---

### **Respuesta 200**

Misma estructura que `/buques/bulk` (JSON), incluyendo `force` y `errors[]`.

---

### **Errores posibles**

| Código | Motivo                                     |
| ------ | ------------------------------------------ |
| `401`  | Token inválido o ausente                   |
| `403`  | No es `SUPER_ADMIN`                        |
| `400`  | Archivo inválido, vacío, sin filas         |
| `400`  | Query inválida (`mode`, `dryRun`, `force`) |

---

## 4.3 Observaciones y buenas prácticas (Bulk)

* ✅ Usa primero `dryRun=true` para validar el archivo y ver errores sin escribir en BD.
* ✅ Si hay buques ya operados (con recaladas), evita cambiar `nombre` y `paisId` salvo que sea estrictamente necesario, y usa `force=true`.
* ✅ Para cargas grandes, prefiere **CSV/XLSX**.
* 🚫 No se soporta PDF como entrada de bulk.

---


## 5. Seguridad y validación

* Todos los endpoints están protegidos con **JWT (`requireAuth`)**.
* Control de acceso mediante **RBAC**:

  * `SUPER_ADMIN`
  * `SUPERVISOR`
  * `GUIA` (sin acceso a catálogos)
* Validación estricta de entrada con **Zod**:

  * Queries, params y body.
  * `q` vacío se interpreta como no enviado.
* Respuestas estandarizadas:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

---

## 6. Relación con otros módulos

* **Recaladas**

  * Cada recalada referencia un buque.
  * El país se obtiene indirectamente desde el buque.
* **Atenciones**

  * Dependen de la recalada y, por tanto, del buque.
* **Turnos**

  * No se relacionan directamente, pero heredan trazabilidad.

---

## 7. Definition of Done — Catálogos

* CRUD de Países y Buques operativo.
* Filtros y paginación funcionando.
* Acceso controlado por roles.
* Integridad referencial garantizada.
* Soft delete implementado en Buques.
* Endpoints `lookup` disponibles para UI.
* Respuestas estandarizadas y documentadas.
* Migraciones Prisma aplicadas sin errores.
* Pruebas manuales realizadas con Postman.
