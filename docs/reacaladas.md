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

## 🔚 Cierre de fase (actualizado)

Con los endpoints **POST /recaladas** y **GET /recaladas** se consolida la
**Fase 2: Lógica de negocio base del módulo Recaladas**.

El sistema ahora permite:

✅ Crear eventos operativos programados
✅ Consultar agenda semanal/mensual
✅ Filtrar por estado, buque y país
✅ Buscar por código o texto libre
✅ Preparar el terreno para Atenciones y Turnos

---
