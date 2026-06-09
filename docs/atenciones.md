# Atenciones

Última revisión contra código: 2026-06-04.

Fuente principal: `src/routes/atenciones.routes.ts`, `src/modules/atenciones/*`, `src/modules/recaladas/*`, `prisma/schema.prisma`.

## Propósito

Una atención es una ventana operativa dentro de una recalada. Al crearla, se materializan turnos numerados del `1` al `turnosTotal`.

## Estados

Estado administrativo (`status`):

- `ACTIVO`
- `INACTIVO`
- `SUSPENDIDO`

Estado operativo (`operationalStatus`):

- `OPEN`
- `CLOSED`
- `CANCELED`

## Reglas de acceso

Todas las rutas requieren autenticación.

| Acción | Roles |
| --- | --- |
| Listar, detalle, turnos, summary | `GUIA`, `SUPERVISOR`, `SUPER_ADMIN` |
| Claim de atención | `GUIA` |
| Crear, editar, cancelar, cerrar, evaluar | `SUPERVISOR`, `SUPER_ADMIN` |

## Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/atenciones` | Lista atenciones con filtros. |
| `GET` | `/atenciones/:id` | Detalle de atención. |
| `GET` | `/atenciones/:id/turnos` | Turnos de la atención. |
| `GET` | `/atenciones/:id/summary` | Conteo de turnos por estado. |
| `POST` | `/atenciones/:id/claim` | Toma el primer turno disponible de la atención. |
| `POST` | `/atenciones` | Crea atención y turnos. |
| `PATCH` | `/atenciones/:id` | Edita planificación/cupo/estado administrativo. |
| `PATCH` | `/atenciones/:id/cancel` | Cancela atención. |
| `PATCH` | `/atenciones/:id/close` | Cierra atención. |
| `PATCH` | `/atenciones/:id/evaluation` | Crea o actualiza evaluación de cierre. |

## Crear atención

`POST /atenciones`

```json
{
  "recaladaId": 1,
  "fechaInicio": "2026-05-10T14:00:00.000Z",
  "fechaFin": "2026-05-10T18:00:00.000Z",
  "turnosTotal": 20,
  "descripcion": "Atención de cruceristas"
}
```

Reglas:

- `fechaFin` debe ser mayor o igual a `fechaInicio`.
- `turnosTotal` debe ser entero positivo, máximo `5000`.
- La recalada debe existir.
- La recalada debe estar `ACTIVO`, no `CANCELED`, no `DEPARTED` y no vencida por `fechaSalida < now`.
- La ventana de atención debe estar dentro de la ventana de recalada.
- `fechaInicio` y `fechaFin` no pueden estar en el pasado.
- No puede solaparse con otra atención activa de la misma recalada. La comparación usa intervalos semiabiertos `[fechaInicio, fechaFin)`, por lo que una atención puede empezar exactamente cuando otra termina.
- Si el actor supervisor no tiene fila `Supervisor`, el sistema la crea automáticamente.
- La creación materializa turnos atómicamente.
- Después de crear correctamente, encola notificaciones operativas `ATENCION_CREATED` para guías activos. Este enqueue no bloquea la respuesta.
- Emite realtime `atencion:nueva` a la sala `guias` con `notificationId` y datos básicos de la atención.
- Si el modo global es `FIFO_GLOBAL` y la atención ya es operable, intenta asignar turnos disponibles por disponibilidad global. En `MANUAL_RECLAMO` no autoasigna.

Respuesta exitosa: `201`.

## Listar atenciones

`GET /atenciones`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `from` | date | - |
| `to` | date | - |
| `recaladaId` | number | - |
| `buqueId` | number | - |
| `supervisorId` | string | - |
| `status` | `StatusType` | - |
| `operationalStatus` | `AtencionOperativeStatus` | - |
| `pendingEval` | `"true" \| "false" \| boolean` | - |
| `page` | number | `1` |
| `pageSize` | number | `20`, máximo `100` |

Regla: `to` debe ser mayor o igual a `from`.

`pendingEval=true` filtra **atenciones cerradas sin evaluación registrada**
(equivale a `operationalStatus = CLOSED` y sin `AtencionEvaluation` asociada).
Es la lista que alimenta la alerta accionable "pendientes de evaluar" del
dashboard/bandeja web (`/atenciones?pendingEval=true`). Se combina con los
demás filtros (`from`, `to`, `recaladaId`, etc.).

## Editar atención

`PATCH /atenciones/:id`

```json
{
  "fechaInicio": "2026-05-10T15:00:00.000Z",
  "fechaFin": "2026-05-10T19:00:00.000Z",
  "turnosTotal": 25,
  "descripcion": "Nueva descripción",
  "status": "ACTIVO"
}
```

Campos permitidos:

- `fechaInicio`
- `fechaFin`
- `turnosTotal`
- `descripcion`
- `status`

Reglas:

- No se puede editar si la atención está `CANCELED` o `CLOSED`.
- Si cambia la ventana, la recalada debe seguir siendo operable.
- La nueva ventana debe estar dentro de la recalada.
- La nueva ventana no puede estar en el pasado.
- La nueva ventana no puede solaparse con otra atención activa de la misma recalada. La comparación usa intervalos semiabiertos `[fechaInicio, fechaFin)`, por lo que una atención puede empezar exactamente cuando otra termina.
- Si cambia la ventana, no pueden existir turnos `ASSIGNED` o `IN_PROGRESS`.
- Al cambiar `turnosTotal`, el sistema ajusta turnos de forma atómica.
- No se puede reducir el cupo si existen turnos asignados en números mayores al nuevo total.
- Si el modo global es `FIFO_GLOBAL` y quedan turnos disponibles, intenta asignarlos por disponibilidad global. En `MANUAL_RECLAMO` no autoasigna.

## Cancelar atención

`PATCH /atenciones/:id/cancel`

```json
{
  "reason": "Cancelada por instrucción operativa"
}
```

Reglas:

- `reason` es obligatorio, mínimo 3 y máximo 500 caracteres.
- Si ya está `CANCELED`, la operación es idempotente y devuelve la atención.
- No se puede cancelar si está `CLOSED`.
- No se puede cancelar si la recalada está `CANCELED` o `DEPARTED`.
- No se puede cancelar si existen turnos `IN_PROGRESS`.
- La cancelación marca la atención como `CANCELED` y cancela turnos vivos permitidos dentro de la transacción.

## Cerrar atención

`PATCH /atenciones/:id/close`

Body opcional compatible:

```json
{
  "evaluation": {
    "calificacion": 5,
    "estadoFinal": "SATISFACTORIA",
    "observaciones": "Operación cerrada sin novedades"
  }
}
```

Reglas:

- Si ya está `CLOSED`, la operación es idempotente y devuelve la atención.
- Si ya está `CLOSED` y se envía evaluación, la evaluación se crea o actualiza sin reabrir la atención.
- No se puede cerrar si está `CANCELED`.
- No se puede cerrar si la recalada está `CANCELED` o `DEPARTED`.
- No se puede cerrar si existen turnos `AVAILABLE`, `ASSIGNED` o `IN_PROGRESS`.
- Al cerrar, `operationalStatus = CLOSED`.
- Si el body incluye `evaluation`, se guarda en la misma operación.

## Evaluar atención

`PATCH /atenciones/:id/evaluation`

```json
{
  "calificacion": 4,
  "estadoFinal": "CON_NOVEDADES",
  "observaciones": "Se reportaron ajustes menores de operación"
}
```

Reglas:

- Solo `SUPERVISOR` y `SUPER_ADMIN`.
- `calificacion` debe estar entre `1` y `5`.
- `estadoFinal` acepta `SATISFACTORIA`, `CON_NOVEDADES` o `NO_SATISFACTORIA`.
- La operación es upsert one-to-one por atención.
- No se puede evaluar una atención cancelada.
- Emite realtime `atencion:evaluation:updated`.

## Turnos de una atención

`GET /atenciones/:id/turnos`

Devuelve los slots de la atención ordenados por `numero ASC`.

## Summary

`GET /atenciones/:id/summary`

Respuesta:

```json
{
  "data": {
    "turnosTotal": 20,
    "availableCount": 10,
    "assignedCount": 5,
    "inProgressCount": 1,
    "completedCount": 3,
    "canceledCount": 1,
    "noShowCount": 0
  },
  "meta": null,
  "error": null
}
```

El límite operativo `turnosTotal` se mantiene en caché en memoria como apoyo de
lectura. La base de datos sigue siendo la fuente final; la caché se actualiza al
crear o editar la atención y se invalida al cancelar o cerrar.

## Claim por atención

`POST /atenciones/:id/claim`

Este es el flujo principal del reclamo en modo `MANUAL_RECLAMO`. Asigna el
primer turno disponible de la atención sin que el guía deba conocer su id.

Reglas:

- Solo rol `GUIA`.
- El modo global debe ser `MANUAL_RECLAMO`; si está `FIFO_GLOBAL`, responde `409 CONFLICT`.
- El usuario autenticado debe tener fila `Guia`.
- La cuenta del guía debe estar activa.
- El guía debe estar disponible globalmente (`disponibleParaTurnos = true`).
- El guía no puede tener `pendingPenalty = true`.
- El guía no puede tener un turno `IN_PROGRESS`.
- La atención y la recalada deben estar operables.
- No puede tener ya un turno asignado en esa atención.
- Toma el primer turno `AVAILABLE` por `numero ASC`.
- Valida que el turno candidato no se solape con otros turnos `ASSIGNED` o `IN_PROGRESS` del guía.
- Usa transacción y reintentos limitados para manejar concurrencia.

Mensajes de negocio observables (texto en español, devueltos como `error.message`):

- `"El modo FIFO está activo. Los turnos se asignan automáticamente."`
- `"El usuario autenticado no está registrado como guía"`
- `"Tu cuenta de guía está inactiva"`
- `"Debes marcarte disponible para tomar un turno"`
- `"No puedes tomar turno porque tienes una penalización pendiente"`
- `"Ya tienes un turno en curso. Finalízalo antes de tomar otro."`
- `"Ya tienes un turno asignado en esta atención"`
- `"Ya tienes un turno asignado en ese horario en otra atención"`
- `"No hay cupos disponibles para esta atención"`
- `"No fue posible tomar cupo: alta concurrencia, intenta de nuevo"`

> `POST /turnos/:id/claim` queda como variante para reclamar un turno
> específico, pero solo permite hacerlo cuando el turno indicado es el primer
> disponible de su atención. Web y mobile usan este endpoint únicamente cuando
> el guía abre el detalle de un turno específico. Ver `docs/turnos.md`.

## Eventos en tiempo real

Eventos emitidos:

- `atencion:created`
- `atencion:updated`
- `atencion:canceled`
- `atencion:closed`
- `atencion:nueva` para la sala `guias` cuando se crea una atención. Payload mínimo: `notificationId`, `atencionId`, `recaladaId`, `fechaInicio`, `fechaFin`, `turnosTotal`, `descripcion`.

Algunos se emiten a supervisores y al room específico de la atención.

## Auditoría

Eventos funcionales observados:

- `atenciones.create.success`
- `atenciones.create.failed`
- `atenciones.update.success`
- `atenciones.update.failed`
- `atenciones.cancel.success`
- `atenciones.cancel.failed`
- `atenciones.cancel.noop`
- `atenciones.close.success`
- `atenciones.close.failed`
- `atenciones.close.noop`
- `atenciones.claim.success`
- `atenciones.claim.failed`
- `atenciones.summary`
- `atenciones.summary.failed`
