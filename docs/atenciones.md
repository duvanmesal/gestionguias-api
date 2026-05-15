# Atenciones

Última revisión contra código: 2026-05-11.

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
| Crear, editar, cancelar, cerrar | `SUPERVISOR`, `SUPER_ADMIN` |

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
- No puede solaparse con otra atención activa de la misma recalada.
- Si el actor supervisor no tiene fila `Supervisor`, el sistema la crea automáticamente.
- La creación materializa turnos atómicamente.
- Después de crear correctamente, encola notificaciones operativas `ATENCION_CREATED` para guías activos. Este enqueue no bloquea la respuesta.
- Emite realtime `atencion:nueva` a la sala `guias` con `notificationId` y datos básicos de la atención.

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
| `page` | number | `1` |
| `pageSize` | number | `20`, máximo `100` |

Regla: `to` debe ser mayor o igual a `from`.

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
- La nueva ventana no puede solaparse con otra atención activa de la misma recalada.
- Si cambia la ventana, no pueden existir turnos `ASSIGNED` o `IN_PROGRESS`.
- Al cambiar `turnosTotal`, el sistema ajusta turnos de forma atómica.
- No se puede reducir el cupo si existen turnos asignados en números mayores al nuevo total.

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

Reglas:

- Si ya está `CLOSED`, la operación es idempotente y devuelve la atención.
- No se puede cerrar si está `CANCELED`.
- No se puede cerrar si la recalada está `CANCELED` o `DEPARTED`.
- No se puede cerrar si existen turnos `AVAILABLE`, `ASSIGNED` o `IN_PROGRESS`.
- Al cerrar, `operationalStatus = CLOSED`.

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

## Claim por atención

`POST /atenciones/:id/claim`

Reglas:

- Solo rol `GUIA`.
- El usuario autenticado debe tener fila `Guia`.
- La cuenta del guía debe estar activa.
- El guía no puede tener un turno `IN_PROGRESS`.
- La atención y la recalada deben estar operables.
- No puede tener ya un turno asignado en esa atención.
- Toma el primer turno `AVAILABLE` por `numero ASC`.
- Valida que el turno candidato no se solape con otros turnos `ASSIGNED` o `IN_PROGRESS` del guía.
- Usa transacción y reintentos limitados para manejar concurrencia.

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
