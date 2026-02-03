# 🎟️ **Módulo Turnos — Configuración de Base de Datos (Prisma + Seeds)**

## 1. Objetivo

Establecer una base de datos **sólida, consistente y preparada para alta concurrencia** para el manejo de **Turnos**, asegurando:

* Control de **cupo real** (no contadores en memoria).
* Asignación **uno a uno** entre turno y guía.
* Trazabilidad completa del ciclo de vida del turno.
* Separación clara entre **estado operativo del turno** y estados de la atención/recalada.
* Integridad referencial con **Atenciones, Guías y Usuarios**.
* Preparación para operación real (check-in, check-out, no-show, cancelaciones).

Esta configuración es la base sobre la cual se construirán los **servicios, endpoints y reglas de negocio** del módulo Turnos (Fase 2 y Fase 3).

---

## 2. Qué es un Turno en el sistema

Un **Turno** representa un **slot operativo indivisible** dentro de una **Atención**.

En términos simples:

> Turno = “un cupo real y único dentro de una atención, que puede ser tomado por un solo guía”.

Características clave:

* Cada turno:

  * pertenece a **una sola Atención**
  * tiene un **número secuencial** (`numero`)
  * puede estar **libre, asignado, en progreso o finalizado**
* Un turno **no se comparte**
* El cupo **se controla en base de datos**, no con cálculos en el front

En operación portuaria:

> Turno = “el derecho efectivo de un guía a atender en una ventana específica”.

---

## 3. Cambios realizados en Prisma Schema

### 3.1 Nuevos enums

#### `TurnoStatus`

Representa el **estado operativo real** del turno a lo largo de su ciclo de vida.

```ts
AVAILABLE
ASSIGNED
IN_PROGRESS
COMPLETED
CANCELED
NO_SHOW
```

**Interpretación:**

* `AVAILABLE`: turno libre, sin guía asignado.
* `ASSIGNED`: turno tomado/asignado, pero aún no iniciado.
* `IN_PROGRESS`: atención en curso (check-in realizado).
* `COMPLETED`: atención finalizada correctamente.
* `CANCELED`: turno cancelado manualmente.
* `NO_SHOW`: el guía no se presentó.

---

### 3.2 Modelo `Turno` (versión actual)

La entidad `Turno` representa la **unidad mínima de cupo operativo** del sistema.

#### Campos clave

##### **Identidad**

* `id` (PK autoincremental)

##### **Relaciones**

* `atencionId` → `Atencion` ✅
* `guiaId` → `Guia` (opcional) ✅
* `createdById` → `Usuario` (auditoría) ✅

##### **Orden y ventana**

* `numero` (obligatorio)

  * secuencial dentro de la atención
  * empieza en `1`
  * único por atención

* `fechaInicio`

* `fechaFin`

> Estas fechas se copian desde la Atención al momento de materializar el turno, para permitir análisis históricos incluso si la Atención cambia.

##### **Estado operativo**

* `status` (`TurnoStatus`) → default `AVAILABLE`

##### **Control operativo**

* `checkInAt` (opcional)
* `checkOutAt` (opcional)

##### **Auditoría de cancelación**

* `canceledAt` (opcional)

##### **Timestamps**

* `createdAt`
* `updatedAt`

---

### 3.3 Índices e integridad

Se agregaron índices y restricciones para **garantizar cupo real y evitar inconsistencias**.

#### Índices y uniques clave

* **Un turno pertenece a una sola atención**

  * FK: `Turno.atencionId → Atencion.id`

* **Un número de turno es único dentro de una atención**

  * Unique compuesto:

    ```
    @@unique([atencionId, numero])
    ```

* **Un guía no puede tener dos turnos en la misma atención**

  * Unique compuesto:

    ```
    @@unique([atencionId, guiaId])
    ```

    *(Permite múltiples `guiaId = null`, pero solo uno distinto de null)*

* Índices operativos:

  * `atencionId`
  * `guiaId`
  * `status`

---

## 4. Estrategia de cupo real (decisión de diseño clave)

En este sistema:

❌ **No existe** un contador de cupos disponibles.
✅ El cupo **es la cantidad de registros `Turno` en DB**.

Ventajas de esta estrategia:

* No hay sobrecupo.
* No hay race conditions por cálculo.
* La base de datos es la **fuente única de verdad**.
* Compatible con alta concurrencia (varios guías reclamando a la vez).

Esta decisión es la base para:

* asignación supervisada
* autoclaim por guía
* métricas reales
* auditoría completa

---

## 5. Seeds (Datos de desarrollo)

### 5.1 Objetivo de las seeds

Las seeds de Turnos permiten:

* Verificar que el cupo se materializa correctamente.
* Probar consultas de turnero desde el primer día.
* Tener datos reales para Postman y UI sin lógica adicional.

---

### 5.2 Datos sembrados (DEV)

En entorno `development`:

* Los **Turnos NO se crean manualmente en seeds**.
* Los turnos se **materializan automáticamente** al crear Atenciones.

Regla aplicada en seeds:

> Por cada Atención creada, se generan automáticamente `turnosTotal` turnos con:
>
> * `numero = 1..N`
> * `status = AVAILABLE`
> * `guiaId = null`

Ejemplo real:

* Atención con `turnosTotal = 6`
  → Turnos: `#1` a `#6`
* Atención con `turnosTotal = 4`
  → Turnos: `#1` a `#4`

---

### 5.3 Verificaciones realizadas (comandos)

Se verificó correctamente que:

✅ Los turnos existen por cada atención
✅ El número es secuencial y único por atención
✅ Todos inician en `AVAILABLE`
✅ `guiaId` es `null` al inicio

**Consulta de verificación:**

```sql
SELECT t.id, t."atencionId", t.numero, t.status, t."guiaId"
FROM turnos t
ORDER BY t."atencionId", t.numero;
```

---

## 6. Preparación para fases posteriores

Aunque en esta fase **no se exponen endpoints**, el modelo queda preparado para:

* Asignación por supervisor
* Autoclaim por guía
* Check-in / Check-out
* No-show automático
* Reportes operativos
* Auditoría y métricas históricas

Nada de esto requiere cambios de esquema.

---

## 7. Resultado de la fase

✅ Modelo `Turno` profesional y consistente
✅ Estados operativos claros (`TurnoStatus`)
✅ Cupo real garantizado por DB
✅ Uniques estratégicos contra sobreasignación
✅ Seeds indirectas confiables (vía Atenciones)
✅ Base lista para implementar **Fase 2: Endpoints de Turnos**

Esto cierra la **Fase 1: Prisma + Seeds** del módulo Turnos.

---

Perfecto, Duvan. Seguimos **ordenados y con narrativa clara** 👌
Aquí tienes la **documentación completa de la Fase 2 del módulo Turnos (Servicios + Endpoints)**, alineada **1:1 con lo que ya implementaste y decidiste** (assign / unassign / claim), y escrita con nivel **proyecto de grado + sistema real**.

Puedes pegar esto **debajo de la Fase 1** en `turnos.md`.

---

# 🎟️ **Módulo Turnos — Endpoints y Lógica de Negocio (Fase 2)**

## 1. Objetivo de la Fase 2

Implementar la **lógica operativa real** del módulo Turnos, permitiendo:

* Asignación controlada por supervisor.
* Reasignaciones seguras (sin dejar turnos “pegados”).
* Autoclaim por parte del guía (modo operativo real).
* Control de cupo **en base de datos**, sin cálculos en memoria.
* Protección contra inconsistencias y condiciones de carrera.

Esta fase convierte el modelo de Turnos en un **módulo funcional y usable** por el front y por la operación diaria.

---

## 2. Principios de diseño aplicados

Antes de entrar a endpoints, es importante dejar explícitos los principios que guían toda la Fase 2:

* **DB como fuente de verdad**
  El cupo se controla por registros `Turno`, no por contadores.

* **Un turno = un guía**
  Garantizado por unique `(atencionId, guiaId)`.

* **Estados explícitos, no implícitos**
  Nada se “deduce”; todo queda persistido (`AVAILABLE`, `ASSIGNED`, etc.).

* **Transacciones en operaciones críticas**
  Asignación y autoclaim son atómicos y seguros ante concurrencia.

* **Separación de responsabilidades**

  * Supervisor asigna / desasigna.
  * Guía reclama su cupo.

---

## 3. Endpoints del módulo Turnos

---

## ✅ 3.1 Asignación manual de turno (modo supervisor)

#### PATCH `/turnos/:id/assign`

Permite a un **Supervisor** asignar explícitamente un turno a un guía específico.

Este endpoint representa el **modo controlado** de operación.

---

### Auth requerida

✅ Sí

**Roles permitidos:**

* `SUPERVISOR`
* `SUPER_ADMIN`

---

### Headers obligatorios

| Header              | Valor            |
| ------------------- | ---------------- |
| `Authorization`     | `Bearer <token>` |
| `X-Client-Platform` | `WEB` / `MOBILE` |

---

### Path params

| Parámetro | Tipo   | Descripción  |
| --------- | ------ | ------------ |
| `id`      | number | ID del Turno |

---

### Body

```json
{
  "guiaId": "string"
}
```

---

### Qué hace exactamente

1. Valida que el Turno exista.
2. Verifica que el turno esté en estado:

   * `status = AVAILABLE`
   * `guiaId = null`
3. Valida que la Atención y la Recalada permitan operación.
4. Verifica que el guía **no tenga otro turno** en esa atención.
5. Asigna el turno:

   * `guiaId = <guiaId>`
   * `status = ASSIGNED`

---

### Ejemplo de uso

```
PATCH /turnos/43/assign
```

```json
{
  "guiaId": "cml4abcd0000xxx999"
}
```

---

### Respuesta 200 (ejemplo)

```json
{
  "data": {
    "id": 43,
    "numero": 2,
    "status": "ASSIGNED",
    "guiaId": "cml4abcd0000xxx999",
    "atencionId": 8
  },
  "meta": null,
  "error": null
}
```

---

### Reglas de negocio (implementadas)

1. **Turno debe estar disponible**

* Si no → `409`

2. **Atención y Recalada deben permitir operación**

* Si están `CLOSED`, `CANCELED` o `DEPARTED` → `409`

3. **Un guía no puede tener dos turnos en la misma atención**

* Garantizado por unique + validación → `409`

---

### Motivo de existencia

* Asignación controlada por supervisor.
* Flujo administrativo claro.
* Control total del cupo real.

---

## ✅ 3.2 Desasignación de turno (unassign)

#### PATCH `/turnos/:id/unassign`

Permite **liberar un turno asignado**, devolviéndolo a estado disponible.

Este endpoint es **crítico** para la operación diaria.

---

### Auth requerida

✅ Sí

**Roles permitidos:**

* `SUPERVISOR`
* `SUPER_ADMIN`

---

### Body (opcional)

```json
{
  "reason": "string"
}
```

---

### Qué hace exactamente

1. Valida que el Turno exista.
2. Verifica que esté en estado `ASSIGNED`.
3. Bloquea la operación si el turno está:

   * `IN_PROGRESS`
   * `COMPLETED`
4. Libera el turno:

   * `guiaId = null`
   * `status = AVAILABLE`
5. Registra auditoría y razón (si se envía).

---

### Respuesta 200 (ejemplo)

```json
{
  "data": {
    "id": 43,
    "status": "AVAILABLE",
    "guiaId": null
  },
  "meta": null,
  "error": null
}
```

---

### Reglas de negocio (implementadas)

* No se puede liberar un turno en ejecución o finalizado.
* La operación es **idempotente segura** a nivel operativo.
* Diseñado para reasignaciones constantes.

---

### Motivo de existencia

* Evita turnos “pegados”.
* Permite correcciones rápidas.
* Reduce fricción operativa del supervisor.

---

## ✅ 3.3 Autoclaim de turno (modo guía)

#### POST `/atenciones/:id/claim`

Permite que un **Guía** reclame el **primer turno disponible** dentro de una atención.

Este endpoint replica el flujo real del sistema viejo y hace que el sistema se sienta **vivo**.

> Documentado también desde el módulo Atenciones por pertenecer al flujo UI principal.

---

### Qué hace (resumen)

* Busca el primer turno `AVAILABLE` por `numero ASC`.
* Lo asigna al guía autenticado.
* Es transaccional y seguro contra concurrencia.
* Garantiza cero sobrecupo.

---

## 4. Seguridad y concurrencia

* Todas las operaciones críticas usan **transacciones Prisma**.
* Los uniques en DB actúan como última barrera de seguridad.
* No existen estados intermedios ambiguos.

---

## 5. Relación con el Front

Con estos endpoints, el front puede:

* Mostrar slots reales (`GET /atenciones/:id/turnos`)
* Asignar manualmente (drag & drop / botones)
* Permitir que el guía tome cupo
* Mostrar contadores reales por estado

Sin cálculos ni lógica duplicada.

---

## 6. Resultado de la fase

✅ Endpoints operativos reales implementados
✅ Asignación y liberación seguras
✅ Autoclaim transaccional
✅ Sin sobrecupo
✅ Listo para check-in / check-out / no-show

Esto cierra la **Fase 2: Servicios + Endpoints del módulo Turnos**.
