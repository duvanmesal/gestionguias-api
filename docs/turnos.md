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

Mimi está **muy orgullosa** de este punto del proyecto 😌.
Aquí tienes la **documentación completa y pulida de la Fase 3: Operaciones Reales**, integrada con lo que ya escribiste y extendida para cubrir **check-in, check-out y no-show** con nivel de **proyecto de grado**.

Puedes copiarla tal cual a `turnos.md` o a la sección correspondiente.

---

# 🟢 Fase 3 — Operaciones Reales del Módulo Turnos

La **Fase 3** introduce los **flujos operativos reales** del día a día, donde los turnos dejan de ser solo “asignaciones administrativas” y pasan a representar **actividad efectiva**, **evidencia operativa** y **métricas medibles**.

Esta fase replica y mejora el comportamiento del sistema legacy, garantizando **seguridad**, **concurrencia correcta** y **trazabilidad completa**.

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
* Diseñado para reasignaciones constantes sin inconsistencias.

---

### Motivo de existencia

* Evita turnos “pegados”.
* Permite correcciones rápidas.
* Reduce fricción operativa del supervisor.

---

## ✅ 3.3 Autoclaim de turno (modo guía)

#### POST `/atenciones/:id/claim`

Permite que un **Guía** reclame el **primer turno disponible** dentro de una atención.

Este endpoint replica el flujo real del sistema anterior y hace que el sistema se sienta **vivo y dinámico**.

> Este endpoint también se documenta en el módulo **Atenciones**, ya que forma parte del flujo principal del UI.

---

### Qué hace (resumen)

* Busca el primer turno con:

  * `status = AVAILABLE`
  * Ordenado por `numero ASC`
* Asigna el turno al guía autenticado.
* Es **transaccional** y seguro contra concurrencia.
* Garantiza **cero sobrecupo**.

---

### Motivo de existencia

* Elimina dependencia del supervisor para cada asignación.
* Permite operación fluida en momentos de alta demanda.
* Replica el comportamiento real del puerto.

---

## ✅ 3.4 Inicio operativo del turno (check-in)

#### PATCH `/turnos/:id/check-in`

Marca el **inicio real y efectivo** del turno.

Este endpoint representa el momento en que el guía **empieza a operar**.

---

### Auth requerida

✅ Sí

**Roles permitidos:**

* `GUIA`

---

### Qué hace exactamente

1. Valida que el turno exista.
2. Verifica que el turno esté en estado `ASSIGNED`.
3. Verifica que el usuario autenticado sea el **guía asignado**.
4. (Opcional) Aplica regla FIFO si está habilitada.
5. Registra:

   * `checkInAt = now()`
   * `status = IN_PROGRESS`

---

### Respuesta 200 (ejemplo)

```json
{
  "data": {
    "id": 43,
    "status": "IN_PROGRESS",
    "checkInAt": "2026-02-03T14:10:22.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### Reglas de negocio (implementadas)

* Un turno solo puede iniciar una vez.
* Solo el guía asignado puede iniciar el turno.
* Evita inicios fuera de contexto operativo.

---

### Motivo de existencia

* Marca el **inicio oficial** del servicio.
* Permite métricas reales de operación.
* Sirve como evidencia para auditoría y proyecto de grado.

---

## ✅ 3.5 Cierre operativo del turno (check-out)

#### PATCH `/turnos/:id/check-out`

Marca el **fin real** del turno.

---

### Auth requerida

✅ Sí

**Roles permitidos:**

* `GUIA`

---

### Qué hace exactamente

1. Valida que el turno exista.
2. Verifica que esté en estado `IN_PROGRESS`.
3. Verifica que el usuario sea el guía asignado.
4. Registra:

   * `checkOutAt = now()`
   * `status = COMPLETED`

---

### Respuesta 200 (ejemplo)

```json
{
  "data": {
    "id": 43,
    "status": "COMPLETED",
    "checkOutAt": "2026-02-03T15:02:11.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### Motivo de existencia

* Cierra el ciclo operativo del turno.
* Permite calcular duración real.
* Genera métricas confiables de cumplimiento.

---

## ✅ 3.6 Turno no atendido (no-show)

#### PATCH `/turnos/:id/no-show`

Marca un turno como **NO_SHOW** cuando el guía no se presenta.

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
  "reason": "Guía no se presentó en la ventana asignada"
}
```

---

### Qué hace exactamente

1. Valida que el turno exista.
2. Verifica que esté en estado `ASSIGNED`.
3. Marca:

   * `status = NO_SHOW`
4. Registra la razón en observaciones (si se envía).

---

### Motivo de existencia

* Permite cerrar atenciones limpiamente.
* Evita turnos colgados.
* Base para métricas de incumplimiento.

---

## ✅ 3.7 Endpoints de Turnos para el rol GUIA (operación real)

Estos endpoints existen para soportar el flujo real del guía en la operación diaria, sin depender de endpoints de panel (supervisor) ni de validaciones que obliguen a conocer IDs específicos.

Principio:  
> El backend fuerza el `guiaId` a partir del usuario autenticado (JWT).  
> El front no “dice” qué guía es, solo pregunta por “mis turnos”.

---

### ✅ 3.7.1 Listar mis turnos

#### GET `/turnos/me`

Lista los turnos del guía autenticado con filtros simples (hoy por defecto, o por rango).

**Auth requerida:** ✅ Sí  
**Roles permitidos:** `GUIA`  
**Headers obligatorios:**

| Header              | Valor            |
|-------------------|------------------|
| Authorization      | Bearer `<token>` |
| X-Client-Platform  | WEB / MOBILE     |

**Query params (opcionales):**

| Param      | Tipo     | Descripción |
|-----------|----------|-------------|
| dateFrom  | date     | Inicio del rango (por defecto: hoy 00:00 si no se envía ningún date) |
| dateTo    | date     | Fin del rango (por defecto: hoy 23:59 si no se envía ningún date) |
| status    | enum     | `AVAILABLE`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`, `NO_SHOW` |
| recaladaId| number   | Filtra por recalada de la atención |
| atencionId| number   | Filtra por atención |
| page      | number   | default 1 |
| pageSize  | number   | default 20 (max 100) |

**Reglas de negocio:**
1. El `guiaId` **se fuerza** por el usuario autenticado.
2. No existe `assigned` aquí (ese filtro es de panel). Este endpoint devuelve únicamente turnos del guía.
3. Aplica filtro de solapamiento de fechas:
   - `fechaFin >= dateFrom` (si dateFrom existe)
   - `fechaInicio <= dateTo` (si dateTo existe)

**Ejemplo de uso:**

GET /turnos/me?status=ASSIGNED&dateFrom=2026-02-11&dateTo=2026-02-13

**Respuesta 200 (ejemplo):**
```json
{
  "data": [
    {
      "id": 43,
      "numero": 2,
      "status": "ASSIGNED",
      "guiaId": "cml4abcd0000xxx999",
      "atencionId": 8,
      "fechaInicio": "2026-02-11T13:00:00.000Z",
      "fechaFin": "2026-02-11T15:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "error": null
}
````

**Errores esperados:**

* `401` si no hay sesión (requireAuth)
* `403` si no es `GUIA` (requireGuia)
* `409` si el usuario autenticado no está asociado a un guía (`Guia.usuarioId` no existe)

---

### ✅ 3.7.2 Obtener mi próximo turno

#### GET `/turnos/me/next`

Retorna el próximo turno del guía autenticado ordenado por `fechaInicio ASC` cuyo estado sea `ASSIGNED` o `IN_PROGRESS`.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Qué hace exactamente:**

1. Obtiene el `guiaId` desde el usuario autenticado.
2. Busca el primer turno con:

   * `status IN (ASSIGNED, IN_PROGRESS)`
   * `orderBy fechaInicio asc`

**Respuesta 200:**

* Si existe → `data = Turno`
* Si no existe → `data = null`

**Ejemplo:**

GET /turnos/me/next

**Respuesta 200 (sin turno):**

```json
{ "data": null, "meta": null, "error": null }
```

**Motivo de existencia (UX):**

* Permite al Dashboard del guía mostrar: “Tu siguiente turno es…”
* Reduce fricción al no depender de listas ni IDs.

---

### ✅ 3.7.3 Obtener mi turno activo

#### GET `/turnos/me/active`

Retorna el turno activo del guía autenticado (`status = IN_PROGRESS`) si existe.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Qué hace exactamente:**

1. Obtiene el `guiaId` desde el usuario autenticado.
2. Busca el primer turno con:

   * `status = IN_PROGRESS`

**Respuesta 200:**

* Si existe → `data = Turno`
* Si no existe → `data = null`

**Ejemplo:**

```
GET /turnos/me/active
```

**Motivo de existencia (UX):**

* Permite un botón grande “Continuar turno”
* Evita que el guía se pierda buscando su turno en listas.

---

## 🔐 4. Seguridad y concurrencia

* Todas las operaciones críticas usan **transacciones Prisma**.
* Se emplean `updateMany` condicionales para evitar **race conditions**.
* Los `@@unique` en base de datos actúan como **última barrera de seguridad**.
* No existen estados intermedios ambiguos.

---

## 🖥️ 5. Relación con el Front

Con estos endpoints, el front puede:

* Mostrar slots reales (`GET /atenciones/:id/turnos`)
* Asignar y liberar turnos manualmente
* Permitir autoclaim del guía
* Iniciar y cerrar turnos
* Resolver ausencias
* Mostrar contadores reales por estado

👉 **Sin lógica duplicada ni cálculos en el front**.

---

## 🏁 6. Resultado de la fase

✅ Operación real modelada
✅ Asignación y liberación seguras
✅ Autoclaim transaccional
✅ Check-in / Check-out / No-show implementados
✅ Métricas reales disponibles
✅ Base sólida para reportes y analítica

✨ **Esto cierra formalmente la Fase 3 del módulo Turnos**
---

Sí. Aquí tienes la **Fase 3 completa**, ya con **tu contenido actual** (3.7.3, seguridad, relación con front, etc.) y **con el nuevo agregado** integrado de forma limpia:

* ✅ **(2.2)** `GET /turnos` ahora soporta `guiaId` (panel supervisor)
* ✅ **(2.3)** nuevo `PATCH /turnos/:id/cancel` (cancelación real de turno)

> La única corrección editorial que hago es de estructura: tu doc tenía “Fase 3” repetida. Aquí lo dejo como **una sola Fase 3**, con subsecciones claras.

---

# 🟢 Fase 3 — Operación Real + Ajustes de UX y Acceso (Turnos)

## 1. Objetivo de la Fase 3

La Fase 3 introduce comportamientos y endpoints que reflejan la **operación real diaria**, y además corrige fricciones prácticas del UI:

1. **Operación real del turno**: el turno pasa de ser “un cupo asignado” a ser **actividad trazable** (check-in, check-out, no-show).

2. **Acceso seguro por rol**: un GUIA puede consultar recursos necesarios sin depender del panel, pero **sin exponer datos ajenos**.

3. **UX del panel Supervisor**: permitir filtros prácticos (por guía) y acciones reales (cancelación) para reducir llamadas y evitar endpoints extra.

---

## ✅ 2. Endpoints operativos principales (ciclo de vida)

### ✅ 2.1 Inicio operativo del turno (check-in)

#### PATCH `/turnos/:id/check-in`

Marca el **inicio real** del turno.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Qué hace exactamente:**

1. Valida que el turno exista.
2. Verifica que el turno esté en estado `ASSIGNED`.
3. Verifica que el usuario autenticado sea el guía asignado.
4. (Opcional) Aplica regla FIFO si está habilitada.
5. Actualiza:

   * `checkInAt = now()`
   * `status = IN_PROGRESS`

**Respuesta 200 (ejemplo):**

```json
{
  "data": {
    "id": 43,
    "status": "IN_PROGRESS",
    "checkInAt": "2026-02-03T14:10:22.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### ✅ 2.2 Cierre operativo del turno (check-out)

#### PATCH `/turnos/:id/check-out`

Marca el **fin real** del turno.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Qué hace exactamente:**

1. Valida que el turno exista.
2. Verifica que el turno esté en estado `IN_PROGRESS`.
3. Verifica que el usuario sea el guía asignado.
4. Actualiza:

   * `checkOutAt = now()`
   * `status = COMPLETED`

**Respuesta 200 (ejemplo):**

```json
{
  "data": {
    "id": 43,
    "status": "COMPLETED",
    "checkOutAt": "2026-02-03T15:02:11.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### ✅ 2.3 Turno no atendido (no-show)

#### PATCH `/turnos/:id/no-show`

Marca un turno como `NO_SHOW` cuando el guía no se presenta.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

**Body (opcional):**

```json
{
  "reason": "Guía no se presentó en la ventana asignada"
}
```

**Qué hace exactamente:**

1. Valida que el turno exista.
2. Verifica que esté en estado `ASSIGNED`.
3. Actualiza:

   * `status = NO_SHOW`
4. Agrega evidencia en `observaciones` (si se envía razón).

---

## ✅ 3. Endpoints del rol GUIA (UX real sin panel)

Principio:

> El backend fuerza `guiaId` desde el usuario autenticado (JWT).
> El front no “declara” el guía, solo consulta “mis turnos”.

---

### ✅ 3.1 Listar mis turnos

#### GET `/turnos/me`

Lista los turnos del guía autenticado con filtros simples (hoy por defecto o por rango).

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Query params (opcionales):**

| Param        | Tipo   | Descripción                                                                |
| ------------ | ------ | -------------------------------------------------------------------------- |
| `dateFrom`   | date   | Inicio del rango (por defecto hoy 00:00 si no se envía ningún date)        |
| `dateTo`     | date   | Fin del rango (por defecto hoy 23:59 si no se envía ningún date)           |
| `status`     | enum   | `AVAILABLE`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`, `NO_SHOW` |
| `recaladaId` | number | Filtra por recalada                                                        |
| `atencionId` | number | Filtra por atención                                                        |
| `page`       | number | default 1                                                                  |
| `pageSize`   | number | default 20 (max 100)                                                       |

**Reglas de negocio:**

1. El `guiaId` se fuerza por el usuario autenticado.
2. Aplica solapamiento de fechas:

   * `fechaFin >= dateFrom` (si dateFrom existe)
   * `fechaInicio <= dateTo` (si dateTo existe)
3. Si el usuario no está asociado a un guía → `409`.

---

### ✅ 3.2 Obtener mi próximo turno

#### GET `/turnos/me/next`

Retorna el próximo turno del guía autenticado cuyo estado sea `ASSIGNED` o `IN_PROGRESS`, ordenado por `fechaInicio ASC`.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Respuesta 200:**

* Si existe → `data = Turno`
* Si no existe → `data = null`

---

### ✅ 3.3 Obtener mi turno activo

#### GET `/turnos/me/active`

Retorna el turno activo del guía autenticado (`status = IN_PROGRESS`) si existe.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `GUIA`

**Qué hace exactamente:**

1. Obtiene el `guiaId` desde el usuario autenticado.
2. Busca el primer turno con:

   * `status = IN_PROGRESS`

**Respuesta 200:**

* Si existe → `data = Turno`
* Si no existe → `data = null`

**Ejemplo:**

```
GET /turnos/me/active
```

**Motivo de existencia (UX):**

* Permite un botón grande “Continuar turno”.
* Evita que el guía se pierda buscando su turno en listas.

---

## ✅ 4. Ajustes de acceso + Claim específico de turno (GUIA)

Esta sección resuelve fricción real: permitir que el GUIA consulte recursos necesarios **sin exponer turnos ajenos**, y habilitar toma de turno por ID (no solo FIFO).

---

### ✅ 4.1 GET `/turnos/:id` permitido para GUIA solo si es su turno

**Objetivo (UX / Operación)**
Permitir que el GUIA abra el detalle desde una lista/tarjeta sin usar panel.

**Regla de ACL:**

* `SUPERVISOR` / `SUPER_ADMIN`: puede ver cualquier turno
* `GUIA`: solo si `turno.guiaId === miGuiaId`

**Errores esperados:**

* `403` si GUIA intenta ver turno ajeno
* `409` si el usuario no está asociado a un guía

---

### ✅ 4.2 POST `/turnos/:id/claim` (tomar turno específico)

Permite que un GUIA tome un turno específico si:

* `status = AVAILABLE`
* `guiaId = null`

**Qué hace exactamente (resumen):**

1. Obtiene el `guiaId` real desde el usuario autenticado.
2. Valida existencia.
3. Gate operativo Atención/Recalada (activo, no cerrado/cancelado/departed).
4. Valida disponibilidad (AVAILABLE + guiaId null).
5. Valida que el guía no tenga otro turno en esa atención.
6. Asignación atómica (transacción + `updateMany` condicional):

   * `guiaId = actorGuiaId`
   * `status = ASSIGNED`

---

## ✅ 5. Nuevo agregado Fase 3: mejoras para Panel Supervisor

Aquí se documentan los dos cambios nuevos que implementamos ahora:

1. Filtro `guiaId` en `GET /turnos` (panel)
2. `PATCH /turnos/:id/cancel` (cancelación real de turno)

---

### ✅ 5.1 GET `/turnos` ahora soporta filtro `guiaId` (Panel)

**Qué hace:** permite filtrar turnos por guía desde el panel.

**Motivo:** ver rápido “qué tiene Juan hoy” sin inventar endpoints extra.

**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

**Nuevo Query Param:**

| Param    | Tipo   | Descripción                            |
| -------- | ------ | -------------------------------------- |
| `guiaId` | string | Filtra por `Turno.guiaId` (ID de Guia) |

**Ejemplo (recomendado con rango):**

```
GET /turnos?guiaId=cmll9wob5000g4c60sal5ewg1&dateFrom=2026-02-10&dateTo=2026-02-12&page=1&pageSize=50
```

> Nota operativa: `GET /turnos` por defecto filtra “hoy” si no envías `dateFrom/dateTo`. Para validar seeds históricas, usa rango explícito.

---

### ✅ 5.2 Cancelación real de turno

#### PATCH `/turnos/:id/cancel`

**Qué hace:** cancela un turno registrando evidencia completa:

* `status = CANCELED`
* `canceledAt = now`
* `cancelReason` (opcional)
* `canceledById = actorUserId`

**Motivo:** el modelo y docs ya hablaban de cancelación y el front ya intenta usarlo. Solo faltaba el endpoint real.

**Front:** `turnosApi.cancelTurno()` ya existe.

**Auth requerida:** ✅ Sí
**Roles permitidos:** `SUPERVISOR`, `SUPER_ADMIN`

**Body (opcional):**

```json
{
  "cancelReason": "string"
}
```

**Reglas de negocio implementadas:**

* Si `COMPLETED` → `409`
* Si `IN_PROGRESS` → `409`
* Si ya está `CANCELED` → `409`

**Ejemplo:**

```
PATCH /turnos/6/cancel
```

Body:

```json
{
  "cancelReason": "Cancelación manual por supervisor"
}
```

---

## 🔐 6. Seguridad y concurrencia

* Todas las operaciones críticas usan **transacciones Prisma**.
* Se emplean `updateMany` condicionales para evitar **race conditions**.
* Los `@@unique` en base de datos actúan como **última barrera de seguridad**.
* No existen estados intermedios ambiguos.

---

## 🖥️ 7. Relación con el Front

Con estos endpoints, el front puede:

* Mostrar slots reales (`GET /atenciones/:id/turnos`)
* Asignar y liberar turnos manualmente
* Permitir autoclaim del guía (FIFO o por turno específico)
* Iniciar y cerrar turnos (check-in/check-out)
* Resolver ausencias (no-show)
* Cancelar turnos con trazabilidad real (cancel)
* Filtrar turnos por guía desde panel (`GET /turnos?guiaId=...`)

👉 **Sin lógica duplicada ni cálculos en el front**.

---

## 🏁 8. Resultado de la Fase 3

✅ Operación real modelada
✅ Asignación y liberación seguras
✅ Autoclaim transaccional (FIFO y por ID)
✅ Check-in / Check-out / No-show implementados
✅ Cancelación real de turno implementada (con auditoría)
✅ Panel supervisor más usable (filtro por guía)
✅ Base sólida para reportes y analítica

✨ **Esto cierra formalmente la Fase 3 del módulo Turnos**

---

Si quieres, ahora te dejo también un **bloque “Changelog de endpoints”** (lista final de todos los endpoints del módulo) para que tu doc quede todavía más “audit-able” en sustentación.
