# 📦 Módulo Atenciones — Configuración de Base de Datos (Prisma + Seeds)

## 1. Objetivo

Establecer una base de datos sólida y escalable para el manejo de **Atenciones**, asegurando:

* Ventanas operativas trazables **dentro de una Recalada** (quién atiende, cuándo, y con qué cupo).
* Separación clara entre **estado administrativo** y **estado operativo** de la atención.
* Integridad referencial con **Recaladas**, **Supervisores** y (a futuro) **Turnos**.
* Auditoría completa: quién creó y quién canceló.
* Datos de ejemplo consistentes para entorno de desarrollo.

Esta configuración es la base sobre la cual se construirán los **servicios, endpoints y lógica de negocio** del módulo Atenciones (Fase 2).

---

## 2. Qué es una Atención en el sistema

Una **Atención** es una **ventana operativa** asociada a una **Recalada**:

* define un **intervalo de tiempo** (`fechaInicio` → `fechaFin`)
* define un **cupo** (`turnosTotal`) que representa capacidad de atención
* queda bajo responsabilidad de un **Supervisor**
* mantiene estados operativos (abierta/cerrada/cancelada) independientes del estado administrativo

En operación portuaria:

> Atención = “una franja horaria de atención planificada dentro de una recalada, con cupo controlado”.

---

## 3. Cambios realizados en Prisma Schema

### 3.1 Nuevos enums

#### `AtencionOperativeStatus`

Representa el **estado operativo real** de la atención (flujo del día a día), independiente del estado administrativo (`StatusType`).

```ts
OPEN
CLOSED
CANCELED
```

**Interpretación:**

* `OPEN`: atención activa/operativa.
* `CLOSED`: atención finalizada (histórica).
* `CANCELED`: atención cancelada con auditoría.

---

### 3.2 Modelo `Atencion` (versión actual)

La entidad `Atencion` representa la **unidad operativa** dentro de una `Recalada`.

Campos clave:

* **Identidad**

  * `id` (PK autoincremental)

* **Relaciones**

  * `recaladaId` → `Recalada` ✅
  * `supervisorId` → `Supervisor` ✅
  * `createdById` → `Usuario` ✅ (auditoría de creación)
  * `canceledById` → `Usuario` (auditoría de cancelación, opcional)
  * `turnos` → `Turno[]` (relación preparada para Fase 2/3)

* **Ventana operativa**

  * `fechaInicio` (obligatoria)
  * `fechaFin` (obligatoria en la estrategia recomendada para evitar ambigüedad)

* **Capacidad**

  * `turnosTotal` (obligatorio) → cupo total de la atención

* **Información operativa**

  * `descripcion` (opcional)

* **Estados**

  * `status` (`StatusType`) → estado administrativo del registro (default `ACTIVO`)
  * `operationalStatus` (`AtencionOperativeStatus`) → estado operativo real (default `OPEN`)

* **Auditoría de cancelación**

  * `canceledAt` (opcional)
  * `cancelReason` (opcional)
  * `canceledById` (opcional)

* **Timestamps**

  * `createdAt`
  * `updatedAt`

---

### 3.3 Índices e integridad

Se agregaron índices y claves foráneas para optimizar filtros y preservar integridad:

**Índices recomendados / implementados**

* Consultas por recalada:

  * `recaladaId`
  * `(recaladaId, fechaInicio)` (útil para agenda y orden temporal)
* Consultas por supervisor:

  * `supervisorId`
* Estados:

  * `status`
  * `operationalStatus`

**Integridad referencial**

* `Atencion.recaladaId` referencia `Recalada.id`
* `Atencion.supervisorId` referencia `Supervisor.id`
* `Atencion.createdById` referencia `Usuario.id`
* `Atencion.canceledById` referencia `Usuario.id`

La base queda lista para que en Fase 2 se implementen validaciones como:

* no solapamiento por recalada
* ventana dentro del rango de la recalada
* bloqueo si la recalada está cancelada/zarpe

---

## 4. Estrategia de capacidad (`turnosTotal`) y preparación para el futuro

En el diseño actual:

* `turnosTotal` define la **capacidad máxima** de una atención.
* La relación `Atencion -> Turno[]` permite en el futuro:

  * asignación de guías
  * control de cupo real
  * métricas operativas (ocupados, libres, cancelados)

⚠️ Importante: **en esta fase (Fase 1)** no se documentan endpoints ni reglas operativas completas; solo el modelo y seeds.

---

## 5. Seeds (Datos de desarrollo)

### 5.1 Objetivo de las seeds

Las seeds permiten:

* Inicializar usuarios base (SUPER_ADMIN, SUPERVISOR, GUIAS).
* Crear catálogos esenciales (Países, Buques).
* Crear recaladas dev (como base operativa).
* Proveer **atenciones de ejemplo** asociadas a recaladas, listas para pruebas.

---

### 5.2 Datos sembrados (DEV)

En entorno `development` se crean:

* **Recaladas de ejemplo**

  * 2 recaladas en `SCHEDULED` y `ACTIVO`
  * con `codigoRecalada` definitivo `RA-YYYY-000123`

* **Atenciones de ejemplo**

  * 2 atenciones por cada recalada (total 4)
  * ventanas de 4h y 3h, con un gap de 1h (sin solape)
  * `operationalStatus = OPEN`
  * `status = ACTIVO`
  * `turnosTotal`:

    * Atención A: 6
    * Atención B: 4

**Ventanas sembradas (como se verificó en DB):**

* Recalada 1 (id=1):

  * Atención 1: 01:33 → 05:33 (cupo 6)
  * Atención 2: 06:33 → 09:33 (cupo 4)

* Recalada 2 (id=2):

  * Atención 3: 01:33 → 05:33 (cupo 6)
  * Atención 4: 06:33 → 09:33 (cupo 4)

---

### 5.3 Verificaciones realizadas (comandos)

Se verificó correctamente que:

✅ Recaladas existen y están en `SCHEDULED/ACTIVO`
✅ Atenciones existen y están en `OPEN/ACTIVO`
✅ Las ventanas están dentro del rango de cada recalada
✅ El cupo coincide con la capacidad definida por atención

**Recaladas:**

```sql
SELECT r.id, r."codigoRecalada", b.nombre AS buque,
       r."fechaLlegada", r."fechaSalida", r."operationalStatus", r.status
FROM recaladas r
JOIN buques b ON b.id = r."buqueId"
ORDER BY r.id DESC;
```

**Atenciones:**

```sql
SELECT a.id, a."recaladaId", a."turnosTotal",
       a."fechaInicio", a."fechaFin", a."operationalStatus", a.status
FROM atenciones a
ORDER BY a.id DESC;
```

> Nota: aunque ya existe relación con `turnos`, **los endpoints de turnos no se abordan en esta fase**. La Fase 2 definirá el contrato de API de atenciones y luego se decidirá cuándo exponer turnos.

---

## 6. Resultado de la fase

✅ Modelo `Atencion` profesional y escalable
✅ Estados operativos claros (`AtencionOperativeStatus`)
✅ Auditoría lista (created/canceled)
✅ Seeds consistentes: atenciones reales de ejemplo por recalada
✅ Base preparada para implementar **Fase 2: servicios + endpoints + reglas de negocio**

Esto cierra la **Fase 1: Prisma + Seeds** del módulo Atenciones.

Perfecto. Abajo te dejo el **bloque completo para pegar en tu documento de Atenciones**, agregando la sección de **endpoints (Fase 2)** con el mismo estilo exaustivo que usaste en Recaladas.

> ✅ Esto está alineado con lo que ya implementamos en código:

* `POST /atenciones` crea Atención + **materializa turnos 1..N**
* `GET /atenciones` lista con filtros + paginación + **solapamiento de ventana**
* `GET /atenciones/:id` trae detalle con relaciones (incluye turnos)

---

# 🪟 **2. Endpoints del módulo Atenciones (Fase 2)**

## **2.1 Creación de atención (ventana operativa + cupo)**

#### **POST `/atenciones`**

Permite **crear una Atención** dentro de una **Recalada**, definiendo:

* una **ventana operativa** (`fechaInicio` → `fechaFin`)
* un **cupo** (`turnosTotal`)
* un responsable (**Supervisor**, resuelto desde el usuario autenticado)

Además, en esta implementación se **materializan automáticamente** los `Turnos` asociados a la Atención:

✅ Se crean `turnosTotal` registros en `Turno`, numerados `1..N`.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

> La verificación se aplica en ruta mediante `requireSupervisor`.

---

### **Headers obligatorios**

| Header              | Valor              |
| ------------------- | ------------------ |
| `Authorization`     | `Bearer <token>`   |
| `Content-Type`      | `application/json` |
| `X-Client-Platform` | `WEB` / `MOBILE`   |

---

### **Body**

#### **Campos obligatorios**

| Campo         | Tipo           | Descripción                               |
| ------------- | -------------- | ----------------------------------------- |
| `recaladaId`  | number         | Identificador de la Recalada padre        |
| `fechaInicio` | datetime (ISO) | Inicio de la ventana operativa            |
| `fechaFin`    | datetime (ISO) | Fin de la ventana operativa               |
| `turnosTotal` | number         | Cupo total de la atención (crea N turnos) |

#### **Campos opcionales**

| Campo         | Tipo   | Descripción                    |
| ------------- | ------ | ------------------------------ |
| `descripcion` | string | Nota operativa (máx 500 chars) |

---

### **Ejemplo request mínimo**

```json
{
  "recaladaId": 1,
  "fechaInicio": "2026-02-01T08:00:00.000Z",
  "fechaFin": "2026-02-01T12:00:00.000Z",
  "turnosTotal": 6
}
```

---

### **Ejemplo request completo**

```json
{
  "recaladaId": 1,
  "fechaInicio": "2026-02-01T08:00:00.000Z",
  "fechaFin": "2026-02-01T12:00:00.000Z",
  "turnosTotal": 6,
  "descripcion": "Ventana mañana (grupo A)"
}
```

---

### **Reglas de negocio**

* La Recalada debe existir.

  * Si `recaladaId` no existe → `404`.

* Regla de fechas:

  * `fechaFin` debe ser **mayor o igual** a `fechaInicio`.
  * Si no cumple → `400`.

* Estados iniciales automáticos:

  * `status = ACTIVO`
  * `operationalStatus = OPEN`

* Supervisor responsable:

  * Se resuelve desde el **usuario autenticado**.
  * Si el usuario no tiene `Supervisor` asociado, el sistema **crea uno** automáticamente (defensa para integridad referencial).

* Creación de turnos:

  * Al crear la atención, se crean `turnosTotal` registros en `Turno`.
  * Se asigna `numero = 1..N`.
  * Se heredan `fechaInicio` y `fechaFin` a cada turno.
  * Esta operación se ejecuta en una **transacción**.

---

### **Validación**

* Validación estricta con **Zod** sobre `req.body`.
* Conversión automática:

  * fechas ISO → `Date`
  * números → `number`
* Errores de validación → `400`.

---

### **Respuesta 201**

```json
{
  "data": {
    "id": 10,
    "recaladaId": 1,
    "supervisorId": "sup-123",
    "fechaInicio": "2026-02-01T08:00:00.000Z",
    "fechaFin": "2026-02-01T12:00:00.000Z",
    "turnosTotal": 6,
    "descripcion": "Ventana mañana (grupo A)",
    "status": "ACTIVO",
    "operationalStatus": "OPEN",
    "recalada": {
      "id": 1,
      "codigoRecalada": "RA-2026-000001",
      "buque": { "id": 1, "nombre": "Wonder of the Seas" }
    },
    "supervisor": {
      "id": "sup-123",
      "usuario": { "id": "u-1", "email": "supervisor@test.com" }
    },
    "turnos": [
      { "id": 501, "numero": 1, "status": "AVAILABLE" },
      { "id": 502, "numero": 2, "status": "AVAILABLE" }
    ],
    "createdAt": "2026-02-01T07:59:55.000Z",
    "updatedAt": "2026-02-01T07:59:55.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                      |
| -----: | ------------------------------------------- |
|  `401` | Token inválido o ausente                    |
|  `403` | Rol sin permisos (`requireSupervisor`)      |
|  `400` | Error de validación (Zod), fechas inválidas |
|  `404` | La Recalada no existe                       |

---

### **Consideraciones de diseño**

* Este endpoint inaugura la **Fase 2** del módulo Atenciones.
* Está diseñado para:

  * planificación operativa por recalada
  * control de cupo mediante materialización de turnos
  * crecimiento hacia asignación de guías en Turnos

---

## **2.2 Listado de atenciones (panel de gestión / búsqueda)**

#### **GET `/atenciones`**

Permite listar atenciones con filtros y paginación, pensado para:

* panel de supervisión
* vista agenda por rangos
* búsquedas por Recalada, Supervisor y estados

No modifica información, solo consulta.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`
  * `GUIA`

---

### **Headers obligatorios**

| Header              | Valor            |
| ------------------- | ---------------- |
| `Authorization`     | `Bearer <token>` |
| `X-Client-Platform` | `WEB` / `MOBILE` |

---

### **Query params**

#### **Filtros por fecha (ventana operativa)**

| Parámetro | Tipo           | Descripción      |
| --------- | -------------- | ---------------- |
| `from`    | datetime (ISO) | Inicio del rango |
| `to`      | datetime (ISO) | Fin del rango    |

**Regla aplicada: solapamiento de ventana**

Una atención se incluye si su intervalo `[fechaInicio, fechaFin]` **intersecta** con `[from, to]`.

* Si `from` y `to`:

  * `fechaFin >= from` **AND** `fechaInicio <= to`
* Si solo `from`:

  * `fechaFin >= from`
* Si solo `to`:

  * `fechaInicio <= to`

---

#### **Filtros operativos y administrativos**

| Parámetro           | Tipo                             | Descripción           |
| ------------------- | -------------------------------- | --------------------- |
| `recaladaId`        | number                           | Filtra por Recalada   |
| `supervisorId`      | string                           | Filtra por Supervisor |
| `status`            | enum (`StatusType`)              | Estado administrativo |
| `operationalStatus` | enum (`AtencionOperativeStatus`) | Estado operativo      |

---

#### **Paginación**

| Parámetro  | Tipo   | Default | Descripción                    |
| ---------- | ------ | ------- | ------------------------------ |
| `page`     | number | `1`     | Página actual                  |
| `pageSize` | number | `20`    | Registros por página (máx 100) |

---

### **Ejemplos de uso**

**Agenda por recalada**

```
GET /atenciones?recaladaId=1&page=1&pageSize=20
```

**Agenda por ventana**

```
GET /atenciones?from=2026-02-01T00:00:00.000Z&to=2026-02-02T00:00:00.000Z
```

**Filtrar por estado operativo**

```
GET /atenciones?operationalStatus=OPEN
```

---

### **Reglas de negocio**

* Este endpoint:

  * NO crea
  * NO cambia estados
  * NO modifica cupos
* Orden:

  * por `fechaInicio ASC`
* Filtros combinables.

---

### **Validación**

* Zod valida `req.query`.
* Convierte automáticamente `from/to/recaladaId/page/pageSize`.
* Regla: si existen `from` y `to`, se valida `to >= from`.

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": 10,
      "recaladaId": 1,
      "fechaInicio": "2026-02-01T08:00:00.000Z",
      "fechaFin": "2026-02-01T12:00:00.000Z",
      "turnosTotal": 6,
      "status": "ACTIVO",
      "operationalStatus": "OPEN"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false,
    "from": "2026-02-01T00:00:00.000Z",
    "to": "2026-02-02T00:00:00.000Z",
    "filters": {
      "recaladaId": 1,
      "supervisorId": null,
      "status": null,
      "operationalStatus": null
    }
  },
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                      |
| -----: | --------------------------- |
|  `401` | Token inválido o ausente    |
|  `403` | Rol sin permisos            |
|  `400` | Error de validación (query) |

---

### **Consideraciones de diseño**

* Este endpoint es la **vista principal** para gestión de Atenciones.
* Preparado para que el front:

  * pinte calendario
  * filtre por recalada
  * muestre estados operativos claramente

---

## **2.3 Detalle de atención (vista detalle y edición)**

#### **GET `/atenciones/:id`**

Permite consultar el detalle de una atención por `id`.

Usado para:

* vista detalle
* pantalla de edición (cuando agreguemos PATCH)
* auditoría (supervisor, recalada, turnos)

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`
  * `GUIA`

---

### **Headers obligatorios**

| Header              | Valor            |
| ------------------- | ---------------- |
| `Authorization`     | `Bearer <token>` |
| `X-Client-Platform` | `WEB` / `MOBILE` |

---

### **Path params**

| Parámetro | Tipo   | Descripción                  |
| --------- | ------ | ---------------------------- |
| `id`      | number | Identificador de la atención |

---

### **Ejemplo de uso**

```
GET /atenciones/10
```

---

### **Reglas de negocio**

* Si la atención no existe → `404`.
* No modifica estado ni cupo.
* Devuelve relaciones clave:

  * `recalada`
  * `supervisor`
  * `turnos` (ordenados por `numero ASC`)

---

### **Validación**

* Zod valida `req.params.id`.
* `id` se convierte automáticamente a `number`.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 10,
    "recaladaId": 1,
    "supervisorId": "sup-123",
    "fechaInicio": "2026-02-01T08:00:00.000Z",
    "fechaFin": "2026-02-01T12:00:00.000Z",
    "turnosTotal": 6,
    "descripcion": "Ventana mañana (grupo A)",
    "status": "ACTIVO",
    "operationalStatus": "OPEN",
    "recalada": {
      "id": 1,
      "codigoRecalada": "RA-2026-000001",
      "buque": { "id": 1, "nombre": "Wonder of the Seas" }
    },
    "supervisor": {
      "id": "sup-123",
      "usuario": {
        "id": "u-1",
        "email": "supervisor@test.com",
        "nombres": "María",
        "apellidos": "González"
      }
    },
    "turnos": [
      { "id": 501, "numero": 1, "status": "AVAILABLE", "guiaId": null },
      { "id": 502, "numero": 2, "status": "AVAILABLE", "guiaId": null }
    ],
    "createdAt": "2026-02-01T07:59:55.000Z",
    "updatedAt": "2026-02-01T07:59:55.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                       |
| -----: | ---------------------------- |
|  `401` | Token inválido o ausente     |
|  `403` | Rol sin permisos             |
|  `400` | Error de validación (params) |
|  `404` | Atención no existe           |

---

### **Consideraciones de diseño**

* Este endpoint es base directa para:

  * `PATCH /atenciones/:id` (edición)
  * `PATCH /atenciones/:id/close` (cierre operativo)
  * `PATCH /atenciones/:id/cancel` (cancelación con auditoría)
* Mantiene envelope estándar: `{ data, meta, error }`.

---

# ✅ Cierre e inicio de fase

Con la incorporación de:

* **POST `/atenciones`**
* **GET `/atenciones`**
* **GET `/atenciones/:id`**

se da por iniciada formalmente la **Fase 2 del módulo Atenciones: servicios + endpoints + lógica operativa inicial**.

El sistema ahora permite:

✅ Crear ventanas operativas con cupo dentro de una Recalada
✅ Consultar atenciones por rangos, filtros y paginación
✅ Consultar detalle completo (incluyendo turnos materializados)

Siguiente paso natural (cuando tú digas):
➡️ **PATCH /atenciones/:id** (editar ventana/cupo con reglas) y luego **close/cancel** con política clara.

---
