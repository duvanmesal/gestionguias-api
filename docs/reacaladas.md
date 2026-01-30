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
