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
