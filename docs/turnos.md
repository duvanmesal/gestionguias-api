# Turnos

Última revisión contra código: 2026-05-16.

Fuente principal: `src/routes/turno.routes.ts`, `src/modules/turnos/*`, `src/modules/atenciones/*`, `prisma/schema.prisma`.

## Propósito

Un turno es un cupo materializado dentro de una atención. Tiene número, ventana, estado, guía opcional y marcas reales de ejecución.

## Estados

`TurnoStatus`:

- `AVAILABLE`: cupo libre.
- `ASSIGNED`: cupo asignado a un guía. Incluye también la sub-fase de **check-in pendiente**: cuando `checkInRequestedAt` está presente y ni `checkInConfirmedAt` ni `checkInRejectedAt` están registrados, el turno permanece en `ASSIGNED` esperando confirmación o rechazo del supervisor.
- `IN_PROGRESS`: el supervisor confirmó el check-in del guía. `checkInAt` se materializa al momento de la confirmación.
- `COMPLETED`: guía hizo check-out.
- `CANCELED`: cupo cancelado.
- `NO_SHOW`: guía no se presentó.

## Doble check-in (Epica 5)

El check-in se realiza dentro de la aplicación en dos pasos, sin dispositivos
externos:

1. El guía asignado solicita el check-in con `PATCH /turnos/:id/check-in`. El
   turno permanece en `ASSIGNED` y se registra `checkInRequestedAt`.
2. El supervisor consulta los pendientes con `GET /turnos/check-ins/pending` y:
   - confirma con `PATCH /turnos/:id/check-in/confirm`: el turno pasa a
     `IN_PROGRESS`, se materializa `checkInAt` con la hora de la confirmación
     y se registran `checkInConfirmedAt` + `checkInConfirmedById`.
   - rechaza con `PATCH /turnos/:id/check-in/reject` enviando `{ reason }`
     (obligatorio): el turno permanece en `ASSIGNED` y se registran
     `checkInRejectedAt`, `checkInRejectedById` y `checkInRejectReason`. En esta
     épica el rechazo no genera `NO_SHOW` automáticamente ni habilita reintento
     desde el guía; el supervisor puede liberar, marcar `NO_SHOW` (Épica 6) o
     gestionar manualmente.
3. El check-out solo es viable cuando el turno está en `IN_PROGRESS`. Mientras
   el check-in esté pendiente, el endpoint de check-out rechaza la operación
   con conflicto controlado.

## Reglas de acceso

Todas las rutas requieren autenticación.

| Acción | Roles |
| --- | --- |
| Listado global | `SUPERVISOR`, `SUPER_ADMIN` |
| Mis turnos, próximo, activo, claim, check-in (solicitar), check-out | `GUIA` |
| Detalle | `SUPERVISOR`, `SUPER_ADMIN`; `GUIA` solo si es su turno |
| Confirmar/rechazar check-in, listar pendientes | `SUPERVISOR`, `SUPER_ADMIN` |
| Assign, no-show, cancel | `SUPERVISOR`, `SUPER_ADMIN` |
| Unassign | Ruta exige `GUIA`, pero el caso de uso soporta supervisor/super admin si el guard lo permite |

Nota: la ruta activa de `PATCH /turnos/:id/unassign` usa `requireGuia`; por eso, en HTTP hoy está orientada a guía aunque el usecase tenga lógica para supervisor.

## Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/turnos` | Lista global con filtros. |
| `GET` | `/turnos/me` | Lista turnos del guía autenticado. |
| `GET` | `/turnos/me/next` | Próximo turno del guía. |
| `GET` | `/turnos/me/active` | Turno activo `IN_PROGRESS` del guía. |
| `GET` | `/turnos/:id` | Detalle de turno con autorización por actor. |
| `POST` | `/turnos/:id/claim` | El guía toma un turno específico. |
| `PATCH` | `/turnos/:id/assign` | Supervisor asigna un turno a un guía. |
| `PATCH` | `/turnos/:id/unassign` | Libera un turno asignado. |
| `PATCH` | `/turnos/:id/check-in` | Guía solicita check-in (Epica 5). No inicia el turno. |
| `PATCH` | `/turnos/:id/check-in/confirm` | Supervisor confirma el check-in. El turno pasa a `IN_PROGRESS`. |
| `PATCH` | `/turnos/:id/check-in/reject` | Supervisor rechaza el check-in. Requiere `reason`. |
| `GET` | `/turnos/check-ins/pending` | Listado de check-ins pendientes (supervisor). |
| `PATCH` | `/turnos/:id/check-out` | Completa turno. Requiere `IN_PROGRESS`. |
| `PATCH` | `/turnos/:id/no-show` | Marca inasistencia. |
| `PATCH` | `/turnos/:id/cancel` | Cancela turno disponible o asignado. |

## Listado global

`GET /turnos`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `dateFrom` | date | inicio de hoy si no se envían fechas |
| `dateTo` | date | fin de hoy si no se envían fechas |
| `dateField` | `overlap`, `createdAt`, `checkInAt`, `checkOutAt`, `canceledAt` | `overlap` |
| `atencionId` | number | - |
| `recaladaId` | number | - |
| `buqueId` | number | - |
| `status` | `TurnoStatus` | - |
| `guiaId` | string | - |
| `assigned` | boolean/string | - |
| `page` | number | `1` |
| `pageSize` | number | `20`, máximo `100` |

Reglas:

- Si se envía `dateFrom` y `dateTo`, `dateTo` debe ser mayor o igual a `dateFrom`.
- Si no se envía ninguna fecha, el rango default es el día actual local del servidor.
- `dateField=overlap` filtra turnos cuya ventana se cruza con el rango.
- `assigned=true` exige `guiaId != null`; `assigned=false` exige `guiaId = null`.

## Mis turnos

`GET /turnos/me`

Usa filtros similares al listado global, pero:

- Siempre filtra por el `guiaId` del usuario autenticado.
- No acepta `assigned`.
- Requiere rol `GUIA`.

## Próximo y activo

`GET /turnos/me/next`

Devuelve el próximo turno del guía cuando existe.

`GET /turnos/me/active`

Devuelve el turno `IN_PROGRESS` del guía cuando existe.

Ambos responden `data: null` si no hay resultado.

## Detalle de turno

`GET /turnos/:id`

Reglas:

- `SUPERVISOR` y `SUPER_ADMIN` pueden consultar cualquier turno.
- `GUIA` solo puede consultar turnos donde `turno.guiaId` coincida con su fila `Guia`.
- Si no coincide, responde `403 FORBIDDEN`.

## Claim de turno específico

`POST /turnos/:id/claim`

Reglas:

- Solo rol `GUIA`.
- El usuario debe tener fila `Guia`.
- El modo global debe ser `MANUAL_RECLAMO`; si está `FIFO_GLOBAL`, responde `409 CONFLICT`.
- La atención y la recalada deben estar operables.
- El guía debe estar disponible globalmente (`disponibleParaTurnos = true`).
- El guía no puede tener `pendingPenalty = true`.
- El guía no puede tener otro turno `IN_PROGRESS`.
- El turno debe estar `AVAILABLE` y sin `guiaId`.
- **El turno debe ser el primer turno disponible de su atención (menor `numero` con `status = AVAILABLE` y sin `guiaId`).** Si existe otro turno disponible con `numero` menor, responde `409 CONFLICT` con el mensaje
  `"Debes tomar primero el turno disponible más antiguo de esta atención"`.
- El guía no puede tener otro turno en la misma atención.
- El turno no puede solaparse con otro turno `ASSIGNED` o `IN_PROGRESS` del guía.
- La asignación se hace de forma atómica; la verificación de "primer disponible"
  se repite dentro de la transacción para resolver concurrencia.
- Para tomar el primer turno disponible sin tener que conocer su id se prefiere
  `POST /atenciones/:id/claim`, que aplica las mismas reglas y siempre asigna el
  turno con `numero` ascendente más bajo.

## Asignación manual

`PATCH /turnos/:id/assign`

```json
{
  "guiaId": "guia_id"
}
```

Reglas:

- Solo `SUPERVISOR` o `SUPER_ADMIN`.
- `guiaId` es obligatorio y debe existir.
- El usuario del guía debe estar activo.
- El guía debe estar disponible globalmente.
- El guía no puede tener `pendingPenalty = true`.
- El guía no puede tener un turno `IN_PROGRESS`.
- La atención y recalada deben estar operables.
- El turno debe estar `AVAILABLE` y sin guía.
- El guía no puede tener otro turno en la misma atención.
- El horario no puede solaparse con otro turno `ASSIGNED` o `IN_PROGRESS` del guía.
- La asignación se hace de forma atómica.

## Desasignar turno

`PATCH /turnos/:id/unassign`

```json
{
  "reason": "El guía reportó indisponibilidad"
}
```

Reglas:

- La atención y recalada deben estar operables.
- Si el actor es `GUIA`, solo puede liberar su propio turno.
- No se puede liberar un turno `IN_PROGRESS` o `COMPLETED`.
- Solo se puede liberar desde `ASSIGNED`.
- Al liberar, el turno vuelve a estar disponible y sin guía.

## Cancelar turno

`PATCH /turnos/:id/cancel`

```json
{
  "cancelReason": "Cupo retirado de operación"
}
```

Reglas:

- Solo `SUPERVISOR` o `SUPER_ADMIN`.
- La atención y recalada deben estar operables.
- Solo se puede cancelar si el turno está `AVAILABLE` o `ASSIGNED`.
- No se puede cancelar `IN_PROGRESS`, `COMPLETED`, `CANCELED` ni `NO_SHOW`.
- Esta regla preserva métricas de inasistencia y finalización.

## Check-in (solicitud del guía)

`PATCH /turnos/:id/check-in`

Reglas:

- Solo `GUIA`.
- El turno debe existir y estar operable.
- Debe estar `ASSIGNED`.
- Debe tener guía asignado.
- El guía autenticado debe ser el guía del turno.
- Se permite la solicitud hasta 30 minutos antes de `fechaInicio`.
- No se permite la solicitud después de `fechaFin`.
- FIFO de check-in está desactivado actualmente (`ENFORCE_FIFO_CHECKIN = false`).
- No debe existir solicitud pendiente previa ni una solicitud rechazada.
- Al aplicar, el turno **permanece `ASSIGNED`** y se escribe `checkInRequestedAt`.
  El turno solo pasa a `IN_PROGRESS` cuando el supervisor confirma el check-in.

## Confirmar check-in (supervisor)

`PATCH /turnos/:id/check-in/confirm`

Reglas:

- Solo `SUPERVISOR` o `SUPER_ADMIN`.
- El turno debe existir y estar operable.
- Debe estar `ASSIGNED` con `checkInRequestedAt` presente y sin
  `checkInConfirmedAt` ni `checkInRejectedAt`.
- Al aplicar, `status = IN_PROGRESS`, se escriben `checkInConfirmedAt`,
  `checkInConfirmedById` y se materializa `checkInAt` con la hora de la
  confirmación.

## Rechazar check-in (supervisor)

`PATCH /turnos/:id/check-in/reject`

```json
{
  "reason": "El guía no estaba en el punto de encuentro"
}
```

Reglas:

- Solo `SUPERVISOR` o `SUPER_ADMIN`.
- El turno debe existir y estar operable.
- Debe estar `ASSIGNED` con `checkInRequestedAt` presente y sin
  `checkInConfirmedAt` ni `checkInRejectedAt`.
- `reason` es obligatorio (mínimo 1 carácter, máximo 500).
- Al aplicar, el turno permanece `ASSIGNED` y se escriben
  `checkInRejectedAt`, `checkInRejectedById` y `checkInRejectReason`.
- El rechazo **no** genera `NO_SHOW` automáticamente; eso queda para Epica 6.
- En esta épica no se permite reintento desde el guía después de un rechazo;
  el supervisor decide la siguiente acción manual (liberar, marcar `NO_SHOW`,
  reasignar).

## Check-ins pendientes (supervisor)

`GET /turnos/check-ins/pending`

Query opcional:

- `atencionId` — filtra por una atención.
- `recaladaId` — filtra por una recalada.
- `page`, `pageSize` — paginación estándar.

Devuelve los turnos en `ASSIGNED` con `checkInRequestedAt` registrado y sin
confirmación ni rechazo, ordenados por `checkInRequestedAt` ascendente.

## Check-out

`PATCH /turnos/:id/check-out`

Reglas:

- Solo `GUIA`.
- El turno debe estar `IN_PROGRESS`.
- Debe tener guía asignado.
- El guía autenticado debe ser el guía del turno.
- No se puede hacer check-out antes de `fechaInicio`.
- Al aplicar, `status = COMPLETED` y se escribe `checkOutAt`.

## No-show

`PATCH /turnos/:id/no-show`

```json
{
  "reason": "No se presentó en el punto acordado"
}
```

Reglas (Epica 6):

- Solo `SUPERVISOR` o `SUPER_ADMIN`.
- La atención y recalada deben estar operables.
- Solo se puede marcar desde `ASSIGNED`.
- No se puede marcar antes de `fechaInicio`.
- **`reason` es obligatorio** (mínimo 3 caracteres, máximo 500). Antes de Epica 6
  era opcional; ahora cualquier llamada sin motivo responde `400 BAD_REQUEST`.
- Agrega observación `NO_SHOW: razón`.
- Al aplicar, `status = NO_SHOW`.

### Penalizacion persistente y reasignacion tras NO_SHOW (Epica 6)

Despues de marcar el turno como `NO_SHOW`, el sistema ejecuta en segundo plano:

1. **Crea una penalización persistente `GuiaPenalty`** con:
   - `motivo = "NO_SHOW"`,
   - `reason` = el motivo provisto,
   - `startsAt = now`,
   - `expiresAt = now + OperationalConfig.noShowPenaltyDurationHours * 1h`,
   - `createdById` = supervisor que marcó el NO_SHOW (o `null` cuando lo aplica
     el job automático).
2. **Sincroniza `Guia.pendingPenalty = true`** (indicador derivado). Mientras la
   penalización esté vigente, el guía no puede marcar disponibilidad, reclamar
   turnos ni recibir asignación manual ni entrada en FIFO. Cuando la
   penalización expire, los caminos calientes (`claim`, `assign`, `marcar
   disponibilidad`, `dashboard`, listado de guías) ejecutan **lazy sync**:
   bajan `pendingPenalty` a `false` cuando ya no hay penalización vigente.
3. **Notifica al guía**: emite `disponibilidad:penalizado` con `expiresAt` y
   `reason`.
4. **Reasigna automáticamente solo en `FIFO_GLOBAL`**: busca al siguiente guía
   elegible por disponibilidad global (sin penalización vigente y sin solapes).
   Si existe, le asigna el turno liberado y emite `turno:assigned`.

En `MANUAL_RECLAMO`, el sistema penaliza y notifica, pero no reasigna
automáticamente. Ver [disponibilidad.md](./disponibilidad.md) para el flujo completo.

El **job automático** (`turno-automations`) usa el mismo servicio: cuando un
turno `ASSIGNED` supera la ventana de gracia (`NO_SHOW_GRACE_MS`), pasa a
`NO_SHOW` y crea la misma `GuiaPenalty` (con `createdById = null`).

## Gates operativos compartidos

Las operaciones de turno validan que:

- La recalada esté `ACTIVO`.
- La atención esté `ACTIVO`.
- La recalada no esté `CANCELED` ni `DEPARTED`.
- La atención no esté `CANCELED` ni `CLOSED`.

Si falla este gate, la operación responde `409 CONFLICT`.

## Eventos en tiempo real

Eventos emitidos:

- `turno:assigned`
- `turno:claimed`
- `turno:unassigned`
- `turno:canceled`
- `turno:checkedIn`
- `turno:checkedOut`
- `turno:noShow`

Los eventos se emiten a supervisores y, cuando aplica, al room de atención o guía.

## Auditoría

Eventos funcionales observados:

- `turnos.list`
- `turnos.listMe`
- `turnos.getById.success`
- `turnos.getById.failed`
- `turnos.claim.success`
- `turnos.claim.failed`
- `turnos.assign.success`
- `turnos.assign.failed`
- `turnos.unassign.success`
- `turnos.unassign.failed`
- `turnos.cancel.success`
- `turnos.cancel.failed`
- `turnos.checkin.success`
- `turnos.checkin.failed`
- `turnos.checkout.success`
- `turnos.checkout.failed`
- `turnos.noShow.success`
- `turnos.noShow.failed`
