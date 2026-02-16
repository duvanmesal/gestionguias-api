# 📊 **Módulo Dashboard — Overview Operativo por Rol (Backend)**

## 1. Objetivo

Proveer un endpoint único `GET /dashboard/overview` que devuelva un **resumen listo para pintar** el dashboard del front, evitando:

- Múltiples llamadas innecesarias (y 403 por permisos cruzados).
- Cálculos duplicados en el front (conteos, disponibilidad, próximos hitos).
- Filtros “peligrosos” que exponen data fuera del rol.

El endpoint está diseñado para ser **rol-aware**:

- `SUPERVISOR` / `SUPER_ADMIN`: vista operativa del puerto (conteos del día + próximos hitos).
- `GUIA`: vista personal (turno activo, próximo turno, atenciones disponibles con cupos reales).

---

## 2. Endpoint principal

### ✅ GET `/dashboard/overview`

**Auth requerida:** ✅ Sí  
**Middleware:** `requireAuth`  
**Roles permitidos:** `GUIA`, `SUPERVISOR`, `SUPER_ADMIN`

**Route:** `src/routes/dashboard.routes.ts`

---

## 3. Query Params y “Día Operativo” por zona horaria

Este endpoint permite pedir el overview para un día específico y resolver correctamente el “hoy” del negocio (por ejemplo Bogotá) aunque el servidor esté en UTC.

### 3.1 `overviewQuerySchema`

Archivo: `src/modules/dashboard/dashboard.schemas.ts`

Query:

- `date?: string`  
  Formato `YYYY-MM-DD`. Si no se envía, se calcula con base en `tzOffsetMinutes`.

- `tzOffsetMinutes: number` (default `-300`)  
  Offset en minutos respecto a UTC. Bogotá = `-300`.

- `upcomingLimit: number` (default `8`)  
  Límite de hitos a retornar para Supervisor.

- `availableAtencionesLimit: number` (default `10`)  
  Límite de atenciones disponibles para Guía.

### 3.2 Cómo se calcula el “día”

El servicio:

1. Obtiene `date`:
   - si viene en query, se usa.
   - si no viene, se deriva del “ahora” con `tzOffsetMinutes` → `YYYY-MM-DD`.

2. Construye un rango UTC `[start, end)` que representa ese día local:
   - `start`: YYYY-MM-DD 00:00 local convertido a UTC
   - `end`: día siguiente 00:00 local convertido a UTC

**Resultado:** conteos y filtros del “día” quedan consistentes con la operación real.

---

## 4. Shape de respuesta

Archivo: `src/modules/dashboard/dashboard.types.ts`

### 4.1 `DashboardOverviewResponse`

```ts
{
  role: RolType;
  date: string; // YYYY-MM-DD según tzOffsetMinutes
  tzOffsetMinutes: number;
  generatedAt: string; // ISO
  supervisor?: SupervisorOverview;
  guia?: GuiaOverview;
}
````

> En la práctica, el front puede pintar widgets con la data agregada en `supervisor` o `guia` (y opcionalmente un arreglo `widgets` si decides exponerlos desde el backend para UI 100% driven por server).

---

## 5. Lógica por rol

Archivo: `src/modules/dashboard/dashboard.service.ts`

### 5.1 Supervisor / Super Admin

Se construye `SupervisorOverview` con:

#### 5.1.1 Conteos del “día”

* `recaladas`: recaladas activas cuya `fechaLlegada` cae dentro del rango del día.
* `atenciones`: atenciones activas que **intersecan** el día:

  * `fechaInicio < end` y `fechaFin > start`
* `turnos`: turnos cuyas atenciones activas intersecan el día.

> Esto evita perder atenciones que inician antes de medianoche o terminan después.

#### 5.1.2 Próximos hitos (`upcoming`)

Se arma una lista de `DashboardMilestone` y se ordena por fecha ascendente:

Tipos (`kind`):

* `RECALADA_ARRIVAL`
* `RECALADA_DEPARTURE`
* `ATENCION_START`
* `ATENCION_END`

Fuentes:

* **Llegadas**: recaladas `SCHEDULED` con `fechaLlegada >= now`.
* **Salidas**: recaladas `ARRIVED` con `fechaSalida != null` y `fechaSalida >= now`.
* **Atención start/end**: atenciones `OPEN` con `fechaInicio >= now` y `fechaFin >= now`.

Cada hito incluye:

* `at` (ISO)
* `title` (texto listo para UI)
* `ref` con IDs (recaladaId / atencionId)

---

### 5.2 Guía

Se construye `GuiaOverview` así:

#### 5.2.1 Determinar `guiaId` a partir del usuario autenticado

* Se busca `Guia` por `usuarioId`.
* Si el usuario no está asociado a guía:

  * se retorna `nextTurno = null`, `activeTurno = null`, `atencionesDisponibles = []` (sin reventar el endpoint).

#### 5.2.2 Turno activo (`activeTurno`)

Se consulta un turno del guía que esté:

* `status = IN_PROGRESS`, o
* fallback operativo:

  * `checkInAt != null` y `checkOutAt = null` con `status in (ASSIGNED, IN_PROGRESS)`

Esto cubre casos donde todavía no estás usando `IN_PROGRESS` de forma estricta pero ya haces check-in/out.

#### 5.2.3 Próximo turno (`nextTurno`)

Primer turno del guía con:

* `status in (ASSIGNED, IN_PROGRESS)`
* atención no vencida (`atencion.fechaFin > now`)
* ordenado por `atencion.fechaInicio asc`

#### 5.2.4 Atenciones disponibles (`atencionesDisponibles`)

Se listan atenciones:

* `status = ACTIVO`
* `operationalStatus = OPEN`
* `fechaFin > now`
* y que tengan **al menos 1 turno AVAILABLE**

Luego se calcula cupo real por atención con `groupBy` de turnos:

* `availableTurnos = count(turnos where status=AVAILABLE)`

**Esto garantiza cupo real**, no estimado por cálculo del front.

---

## 6. Relación con el Front (por qué esto arregla tus 403)

* El dashboard del front ya no necesita llamar `/users/search` cuando el rol no lo permite.
* El front puede renderizar dashboard/sidebars usando:

  * para Supervisor: conteos + upcoming
  * para Guía: activeTurno, nextTurno, atencionesDisponibles
* Se reduce el número de requests y se mejora la estabilidad UX.

---

## 7. Archivos involucrados

* `src/routes/dashboard.routes.ts`
* `src/modules/dashboard/dashboard.controller.ts`
* `src/modules/dashboard/dashboard.schemas.ts`
* `src/modules/dashboard/dashboard.service.ts`
* `src/modules/dashboard/dashboard.types.ts`
* `docs/dashboard.md` ✅ (nuevo)

---

## 8. Resultado

✅ Dashboard “server-driven” por rol
✅ Día consistente por zona horaria (`tzOffsetMinutes`)
✅ Conteos operativos reales (intersección del día)
✅ Hitos próximos ordenados para UI
✅ Guía con flujo real: activo, próximo, disponibles con cupo real
✅ Menos endpoints en el front, menos 403, menos fricción

---
