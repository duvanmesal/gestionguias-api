# 📦 Módulo Recaladas — Configuración de Base de Datos (Prisma + Seeds)

## 1. Objetivo

Establecer una base de datos sólida y escalable para el manejo de **Recaladas**, asegurando:

* Identificación única y trazable de cada recalada.
* Separación clara entre **estado administrativo** y **estado operativo**.
* Soporte para operación real (fechas programadas vs reales).
* Integridad referencial con Buques, Países, Supervisores, Atenciones y Turnos.
* Datos de ejemplo consistentes para entorno de desarrollo.

Esta configuración es la base sobre la cual se construirán los servicios, endpoints y lógica de negocio del módulo Recaladas.

---

## 2. Cambios realizados en Prisma Schema

### 2.1 Nuevos enums

#### `RecaladaOperativeStatus`

Representa el **estado operativo real** de la recalada, independiente del estado administrativo (`StatusType`).

```ts
SCHEDULED
ARRIVED
DEPARTED
CANCELED
```

#### `RecaladaSource`

Indica el origen de creación de la recalada (útil para auditoría e importaciones futuras).

```ts
MANUAL
IMPORT
API
```

---

### 2.2 Modelo `Recalada` (versión actual)

La entidad `Recalada` actúa como el **evento madre** del sistema operativo.

Campos clave:

* **Identidad**

  * `id` (PK autoincremental)
  * `codigoRecalada` (string, único, obligatorio)

* **Relaciones**

  * `buqueId` → `Buque`
  * `paisOrigenId` → `Pais`
  * `supervisorId` → `Supervisor`

* **Fechas**

  * `fechaLlegada` (programada, obligatoria)
  * `fechaSalida` (programada, opcional)
  * `arrivedAt` (real, opcional)
  * `departedAt` (real, opcional)

* **Estados**

  * `status` (`StatusType`) → estado administrativo del registro
  * `operationalStatus` (`RecaladaOperativeStatus`) → estado operativo real

* **Datos operativos**

  * `terminal`
  * `muelle`
  * `pasajerosEstimados`
  * `tripulacionEstimada`
  * `observaciones`
  * `fuente` (`RecaladaSource`, default `MANUAL`)

* **Auditoría de cancelación**

  * `canceledAt`
  * `cancelReason`

* **Timestamps**

  * `createdAt`
  * `updatedAt`

---

### 2.3 Índices e integridad

Se agregaron índices para optimizar los casos de uso más frecuentes:

* Búsqueda por fecha:

  * `fechaLlegada`
* Agenda por buque:

  * `(buqueId, fechaLlegada)`
* Agenda operativa:

  * `(operationalStatus, fechaLlegada)`
* Agenda por país:

  * `(paisOrigenId, fechaLlegada)`
* Unicidad:

  * `codigoRecalada` (UNIQUE)

Además, se definieron claves foráneas con `ON UPDATE CASCADE` y `ON DELETE RESTRICT` para preservar integridad referencial.

---

## 3. Estrategia de generación de `codigoRecalada`

* El `codigoRecalada` es **obligatorio y único**.
* Formato definido:

  ```
  RA-YYYY-000123
  ```
* En producción:

  * El código se genera **después del INSERT**, utilizando el `id` autogenerado.
  * Esto garantiza unicidad, trazabilidad y ausencia de colisiones.
* En seeds:

  * Se utiliza un código temporal único únicamente para cumplir la restricción `@unique`.
  * Inmediatamente después se reemplaza por el código definitivo.
  * El uso de valores aleatorios **solo existe en la seed**, nunca en lógica de negocio.

---

## 4. Seeds (Datos de desarrollo)

### 4.1 Objetivo de las seeds

Las seeds permiten:

* Inicializar usuarios base (SUPER_ADMIN, SUPERVISOR, GUIAS).
* Crear catálogos esenciales (Países, Buques).
* Garantizar consistencia referencial.
* Proveer **recaladas de ejemplo** listas para pruebas funcionales en desarrollo.

---

### 4.2 Datos sembrados

En entorno `development`:

* **Usuarios**

  * 1 SUPER_ADMIN
  * 1 SUPERVISOR
  * 2 GUIAS
* **Catálogos**

  * Países (ISO-2)
  * Buques con país asociado
* **Recaladas de ejemplo**

  * Recaladas en estado `SCHEDULED`
  * Asociadas a buques, país de origen y supervisor
  * Con `codigoRecalada` final (no quedan códigos temporales)

---

### 4.3 Verificaciones realizadas

Se validó correctamente que:

* No existen `codigoRecalada` con prefijo `TEMP`.
* La tabla `recaladas` contiene todas las columnas nuevas.
* Los índices y claves foráneas están activos.
* Prisma Client está sincronizado con la base de datos.
* No existe drift entre schema y migraciones.

---

## 5. Resultado de la fase

✅ Base de datos lista para operación real
✅ Modelo Recalada profesional y escalable
✅ Seeds consistentes y seguras
✅ Preparado para implementar servicios y endpoints

Esta fase cierra la **Fase 1: Prisma + Seeds** del módulo Recaladas.

---

# 🛳️ **2. Endpoints del módulo Recaladas**

## **2.1 Creación de recalada (agenda madre)**

#### POST `/recaladas`

Permite **crear una recalada** que actúa como el **evento madre** del sistema operativo.
Desde esta entidad se derivan posteriormente **Atenciones** y **Turnos**.

La creación de una recalada **no representa una llegada real**, sino una **programación operativa inicial**.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

---

### **Headers obligatorios**

| Header              | Valor              |
| ------------------- | ------------------ |
| `Content-Type`      | `application/json` |
| `X-Client-Platform` | `WEB` / `MOBILE`   |

---

### **Body**

#### **Campos obligatorios**

| Campo          | Tipo           | Descripción                      |
| -------------- | -------------- | -------------------------------- |
| `buqueId`      | number         | Identificador del buque asociado |
| `paisOrigenId` | number         | País de origen del buque         |
| `fechaLlegada` | datetime (ISO) | Fecha programada de llegada      |

---

#### **Campos opcionales**

| Campo                 | Tipo           | Descripción                                     |
| --------------------- | -------------- | ----------------------------------------------- |
| `fechaSalida`         | datetime (ISO) | Fecha programada de salida                      |
| `terminal`            | string         | Terminal portuaria                              |
| `muelle`              | string         | Muelle asignado                                 |
| `pasajerosEstimados`  | number         | Número estimado de pasajeros                    |
| `tripulacionEstimada` | number         | Número estimado de tripulación                  |
| `observaciones`       | string         | Comentarios operativos                          |
| `fuente`              | enum           | Origen del registro (`MANUAL`, `IMPORT`, `API`) |

---

### **Ejemplo de request mínimo**

```json
{
  "buqueId": 1,
  "paisOrigenId": 1,
  "fechaLlegada": "2026-02-01T10:00:00.000Z"
}
```

---

### **Ejemplo de request completo**

```json
{
  "buqueId": 1,
  "paisOrigenId": 1,
  "fechaLlegada": "2026-02-01T10:00:00.000Z",
  "fechaSalida": "2026-02-01T18:00:00.000Z",
  "terminal": "Terminal Internacional",
  "muelle": "Muelle Norte",
  "pasajerosEstimados": 2400,
  "tripulacionEstimada": 1100,
  "observaciones": "Arribo sujeto a condiciones climáticas",
  "fuente": "MANUAL"
}
```

---

### **Reglas de negocio**

* La recalada:

  * **siempre inicia** con:

    * `operationalStatus = SCHEDULED`
    * `status = ACTIVO`
* `codigoRecalada`:

  * se genera automáticamente
  * es único y definitivo
  * formato: `RA-YYYY-000123`
* `fechaSalida`:

  * es opcional
  * si existe, debe ser **mayor o igual** a `fechaLlegada`
* El `supervisorId`:

  * se resuelve automáticamente desde el usuario autenticado
  * si el usuario no tiene supervisor asociado, se crea uno
* No se crean:

  * atenciones
  * turnos
  * registros operativos reales (`arrivedAt`, `departedAt`)

Este endpoint **solo agenda**, no ejecuta operación real.

---

### **Validación**

* Validación estricta con **Zod** sobre `req.body`.
* Conversión automática de tipos:

  * fechas → `Date`
  * números → `number`
* Errores de validación producen respuesta `400`.

---

### **Respuesta 201**

```json
{
  "data": {
    "id": 15,
    "codigoRecalada": "RA-2026-000015",
    "fechaLlegada": "2026-02-01T10:00:00.000Z",
    "fechaSalida": "2026-02-01T18:00:00.000Z",
    "status": "ACTIVO",
    "operationalStatus": "SCHEDULED",
    "terminal": "Terminal Internacional",
    "muelle": "Muelle Norte",
    "pasajerosEstimados": 2400,
    "tripulacionEstimada": 1100,
    "observaciones": "Arribo sujeto a condiciones climáticas",
    "fuente": "MANUAL",
    "buque": {
      "id": 1,
      "nombre": "MSC Seaside"
    },
    "paisOrigen": {
      "id": 1,
      "codigo": "IT",
      "nombre": "Italia"
    },
    "supervisor": {
      "id": 3,
      "usuario": {
        "id": "u-123",
        "email": "supervisor@gestionguias.com"
      }
    },
    "createdAt": "2026-02-01T08:30:00.000Z",
    "updatedAt": "2026-02-01T08:30:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                    |
| ------ | ------------------------- |
| `401`  | Token inválido o ausente  |
| `403`  | Rol sin permisos          |
| `400`  | Error de validación (Zod) |
| `404`  | Buque o país no existe    |

---

### **Consideraciones de diseño**

* Este endpoint:

  * define la **base del módulo Recaladas**
  * no depende de Atenciones ni Turnos
* Diseñado para:

  * planificación anticipada
  * importaciones futuras
  * operación real desacoplada
* Compatible con:

  * auditoría
  * trazabilidad completa
  * expansión de estados operativos

---

## **2.2 Listado de recaladas (vista agenda)**

#### **GET `/recaladas`**

Permite **listar recaladas** aplicando filtros avanzados, pensado como la **vista principal de agenda** del sistema.

Este endpoint es utilizado por:

* **Supervisores** → planificación semanal/mensual de recaladas.
* **Guías** → visualización del “calendario operativo” para asignaciones futuras.
* **Administradores** → control global y auditoría.

No modifica estado ni ejecuta operación real, **solo consulta información**.

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

#### **Filtros de agenda (recomendados)**

| Parámetro | Tipo           | Descripción                      |
| --------- | -------------- | -------------------------------- |
| `from`    | datetime (ISO) | Fecha inicio del rango de agenda |
| `to`      | datetime (ISO) | Fecha fin del rango de agenda    |

> El sistema aplica **lógica de solapamiento**:
>
> * Una recalada se incluye si su intervalo `[fechaLlegada, fechaSalida]`
>   **intersecta** con `[from, to]`.
> * Si `fechaSalida` es `null`, se trata como un evento puntual.

---

#### **Filtros operativos**

| Parámetro           | Tipo   | Descripción                                    |
| ------------------- | ------ | ---------------------------------------------- |
| `operationalStatus` | enum   | Estado operativo (`SCHEDULED`, `ARRIVED`, etc) |
| `buqueId`           | number | Filtra por buque                               |
| `paisOrigenId`      | number | Filtra por país de origen                      |

---

#### **Búsqueda libre**

| Parámetro | Tipo   | Descripción                                                               |
| --------- | ------ | ------------------------------------------------------------------------- |
| `q`       | string | Búsqueda textual sobre `codigoRecalada`, `buque.nombre` y `observaciones` |

* Si el valor de `q` tiene formato `RA-YYYY-000123`, la búsqueda es **exacta**.
* En otros casos se utiliza búsqueda parcial (`contains`, case-insensitive).

---

#### **Paginación**

| Parámetro  | Tipo   | Default | Descripción                    |
| ---------- | ------ | ------- | ------------------------------ |
| `page`     | number | `1`     | Página actual                  |
| `pageSize` | number | `20`    | Registros por página (máx 100) |

---

### **Ejemplos de uso**

#### **Agenda semanal**

```
GET /recaladas?from=2026-02-01&to=2026-02-07
```

---

#### **Agenda + búsqueda por buque**

```
GET /recaladas?from=2026-02-01&to=2026-02-07&q=MSC
```

---

#### **Búsqueda directa por código**

```
GET /recaladas?q=RA-2026-000001
```

---

#### **Filtro por estado operativo**

```
GET /recaladas?operationalStatus=SCHEDULED
```

---

#### **Paginación**

```
GET /recaladas?page=2&pageSize=10
```

---

### **Reglas de negocio**

* Este endpoint:

  * **NO** crea ni modifica recaladas.
  * **NO** cambia estados operativos.
  * **NO** genera atenciones ni turnos.

* La consulta:

  * respeta el estado administrativo (`status = ACTIVO`).
  * retorna recaladas ordenadas por `fechaLlegada ASC`.
  * aplica filtros de forma combinable.

* Diseñado para ser:

  * eficiente (índices por fecha y estado)
  * estable para el front
  * reutilizable para calendario semanal/mensual

---

### **Validación**

* Validación estricta con **Zod** sobre `req.query`.
* Conversión automática de tipos (`string → Date`, `string → number`).
* Errores de validación producen respuesta `400`.

---

### **Respuesta 200**

```json
{
  "data": [
    {
      "id": 1,
      "codigoRecalada": "RA-2026-000001",
      "fechaLlegada": "2026-02-01T02:30:14.151Z",
      "fechaSalida": "2026-02-02T02:30:14.151Z",
      "status": "ACTIVO",
      "operationalStatus": "SCHEDULED",
      "terminal": "Terminal de Cruceros",
      "muelle": "Muelle 1",
      "observaciones": "Recalada de prueba (programada).",
      "buque": {
        "id": 1,
        "nombre": "Wonder of the Seas"
      },
      "paisOrigen": {
        "id": 2,
        "codigo": "US",
        "nombre": "Estados Unidos"
      }
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false,
    "q": "RA-2026-000001",
    "filters": {}
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

* Este endpoint es la **pantalla principal del módulo Recaladas**.
* Diseñado para:

  * vista tipo agenda
  * planificación operativa
  * consumo por front web y móvil
* Base directa para:

  * asignación de atenciones
  * generación de turnos
  * visualización por rol

---

## **2.3 Detalle de recalada (vista de detalle)**

#### **GET `/recaladas/:id`**

Permite **consultar el detalle completo de una recalada** a partir de su `id`.

Este endpoint es utilizado por:

* **Guías** → ver información completa antes/durante operación.
* **Supervisores** → revisar y preparar acciones operativas.
* **Administradores** → auditoría y control global.

No modifica estado ni ejecuta operación real, **solo consulta información**, pero es la base para habilitar acciones como **arribar/zarpar/cancelar** en fases posteriores.

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

| Parámetro | Tipo   | Descripción               |
| --------- | ------ | ------------------------- |
| `id`      | number | Identificador de recalada |

---

### **Ejemplo de uso**

```
GET /recaladas/15
```

---

### **Reglas de negocio**

* Este endpoint:

  * **NO** crea ni modifica recaladas.
  * **NO** cambia estados operativos.
  * **NO** genera atenciones ni turnos.
* Si la recalada **no existe**, retorna `404`.
* Se utiliza para:

  * renderizar la **pantalla de detalle**
  * habilitar decisiones y botones del flujo operativo (fase posterior)

---

### **Validación**

* Validación estricta con **Zod** sobre `req.params`.
* Conversión automática:

  * `id` → `number` (via `z.coerce.number()`).
* Errores de validación producen respuesta `400`.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 15,
    "codigoRecalada": "RA-2026-000015",
    "fechaLlegada": "2026-02-01T10:00:00.000Z",
    "fechaSalida": "2026-02-01T18:00:00.000Z",
    "status": "ACTIVO",
    "operationalStatus": "SCHEDULED",
    "terminal": "Terminal Internacional",
    "muelle": "Muelle Norte",
    "pasajerosEstimados": 2400,
    "tripulacionEstimada": 1100,
    "observaciones": "Arribo sujeto a condiciones climáticas",
    "fuente": "MANUAL",
    "buque": {
      "id": 1,
      "nombre": "MSC Seaside"
    },
    "paisOrigen": {
      "id": 1,
      "codigo": "IT",
      "nombre": "Italia"
    },
    "supervisor": {
      "id": 3,
      "usuario": {
        "id": "u-123",
        "email": "supervisor@gestionguias.com",
        "nombres": "Milena",
        "apellidos": "Rojas"
      }
    },
    "createdAt": "2026-02-01T08:30:00.000Z",
    "updatedAt": "2026-02-01T08:30:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                           |
| ------ | -------------------------------- |
| `401`  | Token inválido o ausente         |
| `403`  | Rol sin permisos                 |
| `400`  | Error de validación (params Zod) |
| `404`  | La recalada no existe            |

---

### **Consideraciones de diseño**

* Este endpoint es la **base de la vista de detalle** del módulo Recaladas.
* Mantiene una forma de respuesta consistente con `GET /recaladas` (agenda), pero permite:

  * acceso directo por `id`
  * consumo eficiente por pantallas tipo `/recaladas/:id`
* Preparado para crecimiento:

  * En fases posteriores se puede extender con `include` de **Atenciones** y **Turnos** sin romper el contrato base.

---

## **2.4 Edición de recalada (agenda) con reglas por estado**

#### **PATCH `/recaladas/:id`**

Permite **editar parcialmente** una recalada existente, respetando reglas de negocio basadas en su **estado operativo** (`operationalStatus`).

Este endpoint existe porque la **agenda cambia**: muelle, terminal, estimados, notas y hasta horarios programados pueden ajustarse antes o durante la operación.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

> La verificación de permisos se aplica a nivel de ruta mediante `requireSupervisor`.

---

### **Headers obligatorios**

| Header              | Valor              |
| ------------------- | ------------------ |
| `Authorization`     | `Bearer <token>`   |
| `Content-Type`      | `application/json` |
| `X-Client-Platform` | `WEB` / `MOBILE`   |

---

### **Path params**

| Parámetro | Tipo   | Descripción               |
| --------- | ------ | ------------------------- |
| `id`      | number | Identificador de recalada |

---

### **Body (parcial)**

Todos los campos son **opcionales**, pero se debe enviar **al menos uno**.

#### **Campos permitidos**

| Campo                 | Tipo           | Descripción                        |
| --------------------- | -------------- | ---------------------------------- |
| `buqueId`             | number         | Cambia el buque asociado           |
| `paisOrigenId`        | number         | Cambia el país de origen           |
| `fechaLlegada`        | datetime (ISO) | Ajusta fecha programada de llegada |
| `fechaSalida`         | datetime (ISO) | Ajusta fecha programada de salida  |
| `terminal`            | string         | Terminal portuaria                 |
| `muelle`              | string         | Muelle asignado                    |
| `pasajerosEstimados`  | number         | Número estimado de pasajeros       |
| `tripulacionEstimada` | number         | Número estimado de tripulación     |
| `observaciones`       | string         | Comentarios operativos             |
| `fuente`              | enum           | Origen (`MANUAL`, `IMPORT`, `API`) |

> Nota: el schema es **estricto** (`strict()`), por lo que **cualquier campo no listado** será rechazado.

---

### **Ejemplo de request (cambio simple)**

```
PATCH /recaladas/1
```

```json
{
  "terminal": "Terminal de Cruceros 2",
  "muelle": "Muelle 5",
  "observaciones": "Cambio de muelle por disponibilidad."
}
```

---

### **Ejemplo de request (ajuste de estimados)**

```json
{
  "pasajerosEstimados": 5200,
  "tripulacionEstimada": 1900
}
```

---

### **Reglas de negocio**

Este endpoint aplica reglas según `operationalStatus`:

#### **Si `SCHEDULED`**

✅ Permite editar “casi todo” dentro de los campos soportados por el schema (agenda flexible).

#### **Si `ARRIVED`**

✅ Permite edición **limitada** (ajustes operativos todavía útiles), típicamente:

* `fechaSalida`
* `terminal`
* `muelle`
* `pasajerosEstimados`
* `tripulacionEstimada`
* `observaciones`

> La idea: ya llegó, pero aún pueden ajustarse detalles de salida y notas.

#### **Si `DEPARTED` o `CANCELED`**

⛔ **Bloqueado**. No se permite editar.

---

### **Validación**

* Validación con **Zod** sobre:

  * `req.params.id`
  * `req.body` (parcial, estricto)
* Reglas importantes:

  * Debe enviarse al menos un campo.
  * Si se envían `fechaLlegada` y `fechaSalida`, se valida:

    * `fechaSalida >= fechaLlegada`
* Además del schema, el servicio valida:

  * existencia de `buqueId` si se envía
  * existencia de `paisOrigenId` si se envía
  * coherencia final de fechas combinando valores actuales + patch

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 1,
    "codigoRecalada": "RA-2026-000001",
    "fechaLlegada": "2026-02-01T02:30:14.151Z",
    "fechaSalida": "2026-02-02T02:30:14.151Z",
    "status": "ACTIVO",
    "operationalStatus": "SCHEDULED",
    "terminal": "Terminal de Cruceros 2",
    "muelle": "Muelle 5",
    "pasajerosEstimados": 5000,
    "tripulacionEstimada": 1800,
    "observaciones": "Cambio de muelle por disponibilidad.",
    "fuente": "MANUAL",
    "buque": {
      "id": 1,
      "nombre": "Wonder of the Seas"
    },
    "paisOrigen": {
      "id": 2,
      "codigo": "US",
      "nombre": "Estados Unidos"
    },
    "supervisor": {
      "id": "cml09mohm000413r62uqa6cpk",
      "usuario": {
        "id": "cml09mohi000213r6sppgwve1",
        "email": "supervisor@test.com",
        "nombres": "María",
        "apellidos": "González"
      }
    },
    "createdAt": "2026-01-30T02:30:14.152Z",
    "updatedAt": "2026-01-31T03:36:17.163Z"
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                                 |
| ------ | ------------------------------------------------------ |
| `401`  | Token inválido o ausente                               |
| `403`  | Rol sin permisos (`requireSupervisor`)                 |
| `400`  | Body inválido / patch vacío / fechas inválidas         |
| `400`  | Edición bloqueada por estado (`DEPARTED` / `CANCELED`) |
| `404`  | La recalada no existe                                  |
| `404`  | Buque o país no existe (si se intenta cambiar)         |

---

### **Consideraciones de diseño**

* Este endpoint **no cambia estados operativos** (no hace `ARRIVED`, `DEPARTED` ni `CANCELED`).
* Solo ajusta atributos de la recalada respetando el estado actual.
* Mantiene el envelope consistente con el resto del módulo:

  * `{ data, meta, error }`
* Preparado para extender reglas:

  * excepción para `SUPER_ADMIN` en DEPARTED/CANCELED (si se decide)
  * soporte a limpieza de campos (`null`) si se habilita en schema

---

## **2.5 Eliminación física de recalada (safe delete)**

#### **DELETE `/recaladas/:id`**

Permite **eliminar físicamente** una recalada **solo si es segura de borrar** (“safe delete”).

Este endpoint existe para **limpieza de errores de carga** en desarrollo o para eliminar registros **sin uso** que nunca entraron al flujo operativo.

> ⚠️ Importante: si la recalada ya tiene dependencias (Atenciones/Turnos) o ya avanzó en operación, **NO se elimina**.
> En ese caso se debe usar **cancelación** (endpoint futuro / fase operativa), no delete.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

> La verificación de permisos se aplica a nivel de ruta mediante `requireSupervisor`.

---

### **Headers obligatorios**

| Header              | Valor            |
| ------------------- | ---------------- |
| `Authorization`     | `Bearer <token>` |
| `X-Client-Platform` | `WEB` / `MOBILE` |

---

### **Path params**

| Parámetro | Tipo   | Descripción               |
| --------- | ------ | ------------------------- |
| `id`      | number | Identificador de recalada |

---

### **Ejemplo de uso**

```
DELETE /recaladas/15
```

---

### **Reglas de negocio (Safe Delete)**

Para permitir eliminación física, la recalada debe cumplir:

1. **Debe existir** (si no existe → `404`).
2. **Debe estar en estado operativo `SCHEDULED`**.
   *Si está `ARRIVED`, `DEPARTED` o `CANCELED` → no se elimina físicamente.*
3. **No debe tener dependencias**:

   * **No debe tener Atenciones asociadas.**
   * **No debe tener Turnos asociados** (directos o indirectos vía Atenciones).

Si la recalada tiene dependencias o ya avanzó de estado:

* se rechaza la eliminación
* se indica usar **cancelación** en lugar de delete

Este endpoint es deliberadamente estricto para proteger integridad referencial y trazabilidad.

---

### **Validación**

* Validación estricta con **Zod** sobre `req.params`:

  * `id` → `number` (`z.coerce.number().int().positive()`).
* Errores de validación producen respuesta `400`.

---

### **Respuesta 200 (eliminación exitosa)**

```json
{
  "data": {
    "deleted": true,
    "id": 15
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                                                 |
| ------ | ---------------------------------------------------------------------- |
| `401`  | Token inválido o ausente                                               |
| `403`  | Rol sin permisos (`requireSupervisor`)                                 |
| `400`  | Error de validación (params Zod)                                       |
| `400`  | Recalada no está en `SCHEDULED` → debe usarse cancelación              |
| `400`  | Recalada tiene Atenciones o Turnos asociados → debe usarse cancelación |
| `404`  | La recalada no existe                                                  |

---

### **Consideraciones de diseño**

* Este endpoint:

  * **NO es cancelación**.
  * es **borrado físico controlado**.
* Pensado principalmente para:

  * desarrollo
  * depuración
  * limpieza de registros sin uso
* Mantiene el envelope consistente:

  * `{ data, meta, error }`
* En producción, su uso debe ser:

  * limitado
  * auditado
  * restringido a roles altos (como ya está)

---

## **2.6 Operación real — Arribo (botón “Arribó”)**

#### **PATCH `/recaladas/:id/arrive`**

Marca una recalada como **ARRIVED** y registra la fecha/hora real de arribo en `arrivedAt`.

Este endpoint existe para que el front tenga un botón directo y claro:

✅ **“Arribó”** → el sistema pasa a modo operación real.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

> La verificación de permisos se aplica a nivel de ruta mediante `requireSupervisor`.

---

### **Headers obligatorios**

| Header              | Valor              |
| ------------------- | ------------------ |
| `Authorization`     | `Bearer <token>`   |
| `Content-Type`      | `application/json` |
| `X-Client-Platform` | `WEB` / `MOBILE`   |

---

### **Path params**

| Parámetro | Tipo   | Descripción               |
| --------- | ------ | ------------------------- |
| `id`      | number | Identificador de recalada |

---

### **Body (opcional)**

| Campo       | Tipo           | Descripción                                          |
| ----------- | -------------- | ---------------------------------------------------- |
| `arrivedAt` | datetime (ISO) | Fecha real de arribo. Si no se envía, se usa `now()` |

> El schema es estricto (`strict()`): si mandas campos no soportados, se rechaza.

---

### **Ejemplo de request (sin body → now())**

```
PATCH /recaladas/3/arrive
```

```json
{}
```

---

### **Ejemplo de request (con fecha explícita)**

```json
{
  "arrivedAt": "2026-02-02T20:00:00.000Z"
}
```

---

### **Reglas de negocio**

* La recalada debe existir.

* Solo se permite marcar ARRIVED si:

  * `operationalStatus = SCHEDULED`

* Si la recalada está:

  * `DEPARTED` → ⛔ no se permite
  * `CANCELED` → ⛔ no se permite
  * `ARRIVED` → ⛔ no se permite (ya arribó)

* Si no llega `arrivedAt`, el servicio usa `now()`.

* Al marcar ARRIVED:

  * `operationalStatus` se actualiza a `ARRIVED`
  * `arrivedAt` se setea (real)
  * `canceledAt` y `cancelReason` se limpian a `null` (defensa extra)

---

### **Validación**

* Zod valida:

  * `params.id`
  * `body.arrivedAt` (opcional)
* Errores de validación producen `400`.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 3,
    "codigoRecalada": "RA-2026-000003",
    "fechaLlegada": "2026-02-02T10:00:00.000Z",
    "fechaSalida": "2026-02-02T18:00:00.000Z",
    "arrivedAt": "2026-02-02T20:00:00.000Z",
    "departedAt": null,
    "canceledAt": null,
    "cancelReason": null,
    "status": "ACTIVO",
    "operationalStatus": "ARRIVED",
    "terminal": "Terminal de Cruceros",
    "muelle": "Muelle A",
    "observaciones": "LAB A: para ARRIVE y luego DEPART",
    "fuente": "MANUAL",
    "buque": { "id": 1, "nombre": "Wonder of the Seas" },
    "paisOrigen": { "id": 2, "codigo": "US", "nombre": "Estados Unidos" },
    "createdAt": "2026-01-31T19:39:25.575Z",
    "updatedAt": "2026-01-31T19:40:10.100Z"
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
| `403`  | Rol sin permisos                         |
| `400`  | Error de validación (Zod)                |
| `400`  | Estado inválido (no está en `SCHEDULED`) |
| `404`  | La recalada no existe                    |

---

### **Consideraciones de diseño**

* Este endpoint representa el **inicio de la operación real**.
* Permite que el front active un modo operacional (timeline/acciones).
* En fases posteriores se podrá:

  * abrir/crear Atenciones automáticamente al arribo (si se decide)
  * registrar bitácora de eventos operativos

---

## **2.7 Operación real — Zarpe (botón “Zarpó”)**

#### **PATCH `/recaladas/:id/depart`**

Marca una recalada como **DEPARTED** y registra la fecha/hora real de zarpe en `departedAt`.

Este endpoint existe para que el front tenga un botón claro:

✅ **“Zarpó”** → se cierra la operación y se bloquean cambios grandes.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

---

### **Headers obligatorios**

| Header              | Valor              |
| ------------------- | ------------------ |
| `Authorization`     | `Bearer <token>`   |
| `Content-Type`      | `application/json` |
| `X-Client-Platform` | `WEB` / `MOBILE`   |

---

### **Path params**

| Parámetro | Tipo   | Descripción               |
| --------- | ------ | ------------------------- |
| `id`      | number | Identificador de recalada |

---

### **Body (opcional)**

| Campo        | Tipo           | Descripción                                         |
| ------------ | -------------- | --------------------------------------------------- |
| `departedAt` | datetime (ISO) | Fecha real de zarpe. Si no se envía, se usa `now()` |

---

### **Ejemplo de request (sin body → now())**

```
PATCH /recaladas/3/depart
```

```json
{}
```

---

### **Ejemplo de request (con fecha explícita)**

```json
{
  "departedAt": "2026-02-03T19:40:00.000Z"
}
```

---

### **Reglas de negocio**

* La recalada debe existir.

* Solo se permite marcar DEPARTED si:

  * `operationalStatus = ARRIVED`

* Si la recalada está:

  * `SCHEDULED` → ⛔ no se permite (no puede zarpar sin haber arribado)
  * `CANCELED` → ⛔ no se permite
  * `DEPARTED` → ⛔ no se permite (ya zarpó)

* Si `arrivedAt` existe, el servicio valida que:

  * `departedAt >= arrivedAt`

* Si no llega `departedAt`, el servicio usa `now()`.

---

### **Validación**

* Zod valida:

  * `params.id`
  * `body.departedAt` (opcional)
* Errores de validación producen `400`.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 3,
    "codigoRecalada": "RA-2026-000003",
    "arrivedAt": "2026-02-02T20:00:00.000Z",
    "departedAt": "2026-02-03T19:40:00.000Z",
    "operationalStatus": "DEPARTED",
    "canceledAt": null,
    "cancelReason": null
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                 |
| ------ | -------------------------------------- |
| `401`  | Token inválido o ausente               |
| `403`  | Rol sin permisos                       |
| `400`  | Error de validación (Zod)              |
| `400`  | Estado inválido (no está en `ARRIVED`) |
| `400`  | `departedAt` menor a `arrivedAt`       |
| `404`  | La recalada no existe                  |

---

### **Consideraciones de diseño**

* Este endpoint indica cierre de operación real.
* En la fase actual ya bloquea “cambios grandes” indirectamente, porque:

  * el `PATCH /recaladas/:id` bloquea edición si `DEPARTED`
  * el `DELETE` también bloquea si no está `SCHEDULED`

---

## **2.8 Operación real — Cancelación (botón “Cancelar”)**

#### **PATCH `/recaladas/:id/cancel`**

Marca una recalada como **CANCELED**, registra `canceledAt` y guarda `cancelReason` (si se envía).

Este endpoint existe porque en puerto real:

⚠️ **una recalada puede cancelarse** y el sistema debe mantener consistencia operativa.

---

### **Auth requerida**

`Authorization: Bearer <accessToken>`

* **Roles permitidos:**

  * `SUPER_ADMIN`
  * `SUPERVISOR`

---

### **Headers obligatorios**

| Header              | Valor              |
| ------------------- | ------------------ |
| `Authorization`     | `Bearer <token>`   |
| `Content-Type`      | `application/json` |
| `X-Client-Platform` | `WEB` / `MOBILE`   |

---

### **Path params**

| Parámetro | Tipo   | Descripción               |
| --------- | ------ | ------------------------- |
| `id`      | number | Identificador de recalada |

---

### **Body (opcional en la implementación actual)**

| Campo    | Tipo   | Descripción                                                                              |
| -------- | ------ | ---------------------------------------------------------------------------------------- |
| `reason` | string | Motivo de cancelación (opcional por ahora, puede volverse obligatorio en futuras reglas) |

> El schema actual permite `{}` y `reason?`.

---

### **Ejemplo de request (con razón)**

```
PATCH /recaladas/4/cancel
```

```json
{
  "reason": "Cancelación por condiciones climáticas"
}
```

---

### **Ejemplo de request (sin razón)**

```json
{}
```

---

### **Reglas de negocio**

* La recalada debe existir.

* No se puede cancelar si ya está:

  * `DEPARTED` → ⛔ no permitido
  * `CANCELED` → ⛔ no permitido

* Regla especial de seguridad:

  * Si `operationalStatus = ARRIVED`:

    * ✅ permitir solo a `SUPER_ADMIN`
    * ⛔ `SUPERVISOR` no puede cancelar en ese estado

* Dependencias (Atenciones/Turnos):

  * Si existen Atenciones o Turnos asociados:

    * ⛔ se bloquea la cancelación en esta fase
    * hasta definir política de cascada:

      * cancelar dependencias, o
      * bloquear nuevos, o
      * mantener historiales con estados

* Al cancelar:

  * `operationalStatus = CANCELED`
  * `canceledAt = now()`
  * `cancelReason = reason || null`

---

### **Validación**

* Zod valida:

  * `params.id`
  * `body.reason` (opcional, min 3, max 500)
* Errores de validación producen `400`.

---

### **Respuesta 200**

```json
{
  "data": {
    "id": 4,
    "codigoRecalada": "RA-2026-000004",
    "operationalStatus": "CANCELED",
    "canceledAt": "2026-01-31T19:37:20.185Z",
    "cancelReason": "Cancelación por condiciones climáticas",
    "arrivedAt": null,
    "departedAt": null
  },
  "meta": null,
  "error": null
}
```

---

### **Errores posibles**

| Código | Motivo                                                               |
| ------ | -------------------------------------------------------------------- |
| `401`  | Token inválido o ausente                                             |
| `403`  | Rol sin permisos                                                     |
| `400`  | Error de validación (Zod)                                            |
| `400`  | Estado inválido (`DEPARTED` o ya `CANCELED`)                         |
| `400`  | Cancelación en `ARRIVED` requiere `SUPER_ADMIN`                      |
| `400`  | Tiene Atenciones/Turnos asociados (sin política de cascada definida) |
| `404`  | La recalada no existe                                                |

---

### **Consideraciones de diseño**

* Este endpoint es la alternativa correcta a “delete” cuando:

  * la recalada ya entró a operación o tiene dependencias

* Diseñado para mantener:

  * trazabilidad
  * auditoría
  * consistencia operacional

* Extensión futura (cuando exista cascada):

  * opción A: cancelar atenciones/turnos automáticamente
  * opción B: bloquear creación de nuevos y cerrar los activos
  * opción C: mantener historial pero impedir operación

---

## ✅ Cierre de fase (actualizado)

Con la incorporación de:

* **PATCH `/recaladas/:id/arrive`**
* **PATCH `/recaladas/:id/depart`**
* **PATCH `/recaladas/:id/cancel`**

se completa la **Fase 2 del módulo Recaladas: Operación real (botones del front)**.

El sistema ahora permite:

✅ Agendar recaladas (`POST /recaladas`)
✅ Consultar agenda (`GET /recaladas`)
✅ Ver detalle (`GET /recaladas/:id`)
✅ Ajustar agenda con reglas (`PATCH /recaladas/:id`)
✅ Eliminar físicamente solo si es seguro (`DELETE /recaladas/:id`)
✅ Ejecutar operación real:

* Arribo real (`ARRIVED`)
* Zarpe real (`DEPARTED`)
* Cancelación real (`CANCELED`) con auditoría

Queda listo el terreno para la siguiente expansión:

➡️ **Atenciones** y **Turnos** (y su política de cascada al cancelar).

---
