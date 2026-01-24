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

**Filtros disponibles**

* `q`: búsqueda por nombre o código (opcional)
* `status`: `ACTIVO` | `INACTIVO`
* `page`, `pageSize`

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

**Filtros disponibles**

* `q`: búsqueda por nombre o naviera (opcional)
* `paisId`: filtrar por país
* `status`: `ACTIVO` | `INACTIVO`
* `page`, `pageSize`

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

