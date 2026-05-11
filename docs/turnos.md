# Turnos

Última revisión contra código: 2026-05-10.

Fuente principal: `src/routes/turno.routes.ts`, `src/modules/turnos/*`, `src/modules/atenciones/*`, `prisma/schema.prisma`.

## Propósito

Un turno es un cupo materializado dentro de una atención. Tiene número, ventana, estado, guía opcional y marcas reales de ejecución.

## Estados

`TurnoStatus`:

- `AVAILABLE`: cupo libre.
- `ASSIGNED`: cupo asignado a un guía.
- `IN_PROGRESS`: guía hizo check-in.
- `COMPLETED`: guía hizo check-out.
- `CANCELED`: cupo cancelado.
- `NO_SHOW`: guía no se presentó.

## Reglas de acceso

Todas las rutas requieren autenticación.

| Acción | Roles |
| --- | --- |
| Listado global | `SUPERVISOR`, `SUPER_ADMIN` |
| Mis turnos, próximo, activo, claim, check-in, check-out | `GUIA` |
| Detalle | `SUPERVISOR`, `SUPER_ADMIN`; `GUIA` solo si es su turno |
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
| `PATCH` | `/turnos/:id/check-in` | Inicia turno. |
| `PATCH` | `/turnos/:id/check-out` | Completa turno. |
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
- La atención y la recalada deben estar operables.
- El guía no puede tener otro turno `IN_PROGRESS`.
- El turno debe estar `AVAILABLE` y sin `guiaId`.
- El guía no puede tener otro turno en la misma atención.
- El turno no puede solaparse con otro turno `ASSIGNED` o `IN_PROGRESS` del guía.
- La asignación se hace de forma atómica.

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

## Check-in

`PATCH /turnos/:id/check-in`

Reglas:

- Solo `GUIA`.
- El turno debe existir y estar operable.
- Debe estar `ASSIGNED`.
- Debe tener guía asignado.
- El guía autenticado debe ser el guía del turno.
- Se permite check-in hasta 30 minutos antes de `fechaInicio`.
- No se permite check-in después de `fechaFin`.
- FIFO de check-in está desactivado actualmente (`ENFORCE_FIFO_CHECKIN = false`).
- Al aplicar, `status = IN_PROGRESS` y se escribe `checkInAt`.

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

Reglas:

- Solo `SUPERVISOR` o `SUPER_ADMIN`.
- La atención y recalada deben estar operables.
- Solo se puede marcar desde `ASSIGNED`.
- No se puede marcar antes de `fechaInicio`.
- Agrega observación `NO_SHOW` y, si existe razón, `NO_SHOW: razón`.
- Al aplicar, `status = NO_SHOW`.

### Penalizacion y reasignacion automatica tras NO_SHOW

Despues de marcar el turno como `NO_SHOW`, el sistema ejecuta en segundo plano:

1. **Penaliza al guia ausente**: escribe `pendingPenalty = true` en su fila `Guia`.
2. **Notifica al guia**: emite `disponibilidad:penalizado` con mensaje explicativo.
3. **Reasigna automaticamente**: busca al siguiente guia en la cola de disponibilidad de la atencion que no tenga turno asignado. Si existe, le asigna el turno liberado y emite `turno:assigned`.

El `pendingPenalty` se consume la proxima vez que el guia marca disponibilidad en una atencion futura, ubicandole al final de la cola en esa ocasion. Ver [disponibilidad.md](./disponibilidad.md) para el flujo completo.

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
