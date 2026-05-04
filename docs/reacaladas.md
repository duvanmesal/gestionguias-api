# Recaladas

Última revisión contra código: 2026-05-04.

Fuente principal: `src/routes/recaladas.routes.ts`, `src/modules/recaladas/*`, `prisma/schema.prisma`.

## Propósito

Una recalada es la agenda madre de llegada/salida de un buque. Agrupa atenciones y, por transitividad, turnos.

## Estados

Estado administrativo (`status`):

- `ACTIVO`
- `INACTIVO`
- `SUSPENDIDO`

Estado operativo (`operationalStatus`):

- `SCHEDULED`
- `ARRIVED`
- `DEPARTED`
- `CANCELED`

Fuente (`fuente`):

- `MANUAL`
- `IMPORT`
- `API`

## Reglas de acceso

Todas las rutas requieren autenticación.

| Acción | Roles |
| --- | --- |
| Listar, detalle, atenciones de recalada | `GUIA`, `SUPERVISOR`, `SUPER_ADMIN` |
| Crear, editar, arrive, depart, cancel, delete safe | `SUPERVISOR`, `SUPER_ADMIN` |

## Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/recaladas` | Lista recaladas con filtros. |
| `GET` | `/recaladas/:id` | Detalle de recalada. |
| `GET` | `/recaladas/:id/atenciones` | Atenciones asociadas a una recalada. |
| `POST` | `/recaladas` | Crea recalada. |
| `PATCH` | `/recaladas/:id` | Edita recalada según estado. |
| `PATCH` | `/recaladas/:id/arrive` | Marca arribo real. |
| `PATCH` | `/recaladas/:id/depart` | Marca zarpe real. |
| `PATCH` | `/recaladas/:id/cancel` | Cancela recalada. |
| `DELETE` | `/recaladas/:id` | Eliminación física segura. |

## Crear recalada

`POST /recaladas`

```json
{
  "buqueId": 1,
  "paisOrigenId": 1,
  "fechaLlegada": "2026-05-10T13:00:00.000Z",
  "fechaSalida": "2026-05-10T23:00:00.000Z",
  "terminal": "Terminal de Cruceros",
  "muelle": "Muelle 1",
  "pasajerosEstimados": 2500,
  "tripulacionEstimada": 900,
  "observaciones": "Operación regular",
  "fuente": "MANUAL"
}
```

Reglas:

- `buqueId` y `paisOrigenId` deben existir.
- `fechaSalida`, si se envía, debe ser mayor o igual a `fechaLlegada`.
- Si `fuente` es `MANUAL` o no se envía, `fechaSalida` no puede estar en el pasado.
- Si `fuente` es `IMPORT`, se permite importar fechas pasadas.
- `pasajerosEstimados`, si se envía, debe ser al menos `1`.
- No se permite solapar recaladas activas del mismo buque.
- Si el actor supervisor no tiene fila `Supervisor`, el sistema la crea automáticamente.
- `codigoRecalada` se genera como `RA-YYYY-000001` usando el id autoincremental.

Respuesta exitosa: `201`.

## Listar recaladas

`GET /recaladas`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `from` | date | - |
| `to` | date | - |
| `operationalStatus` | enum | - |
| `buqueId` | number | - |
| `paisOrigenId` | number | - |
| `q` | string | - |
| `page` | number | `1` |
| `pageSize` | number | `20`, máximo `100` |

Reglas de filtros:

- `to` debe ser mayor o igual a `from`.
- El rango de fechas busca recaladas cuya ventana se cruza con `[from, to]`.
- `q` busca por `codigoRecalada`, `observaciones` o nombre de buque.

La respuesta incluye `meta` con `hasNextPage`, `hasPrevPage`, `from`, `to`, `q` y filtros aplicados.

## Editar recalada

`PATCH /recaladas/:id`

Campos posibles cuando la recalada está `SCHEDULED`:

- `buqueId`
- `paisOrigenId`
- `fechaLlegada`
- `fechaSalida`
- `terminal`
- `muelle`
- `pasajerosEstimados`
- `tripulacionEstimada`
- `observaciones`
- `fuente`

Campos posibles cuando está `ARRIVED`:

- `fechaSalida`
- `terminal`
- `muelle`
- `pasajerosEstimados`
- `tripulacionEstimada`
- `observaciones`

Reglas:

- No se puede editar si está `DEPARTED` o `CANCELED`.
- Debe enviarse al menos un campo permitido para el estado actual.
- Si cambian buque o fechas, se revalida solapamiento del buque.
- Si cambian fechas, no se permite dejar atenciones existentes fuera de la nueva ventana.
- Si se cambia `buqueId` o `paisOrigenId`, deben existir.

## Marcar arribo

`PATCH /recaladas/:id/arrive`

Body opcional:

```json
{
  "arrivedAt": "2026-05-10T13:10:00.000Z"
}
```

Reglas:

- Solo desde `SCHEDULED`.
- No se puede si está `DEPARTED` o `CANCELED`.
- Si no se envía `arrivedAt`, usa `now`.
- `arrivedAt` no puede ser futuro.
- `arrivedAt` no puede registrarse más de 24 horas antes de `fechaLlegada`.
- Al aplicar, escribe `operationalStatus = ARRIVED`, `arrivedAt`, limpia `canceledAt` y `cancelReason`.

## Marcar zarpe

`PATCH /recaladas/:id/depart`

Body opcional:

```json
{
  "departedAt": "2026-05-10T23:10:00.000Z"
}
```

Reglas:

- Solo desde `ARRIVED`.
- No se puede si está `CANCELED`.
- Si ya está `DEPARTED`, se rechaza.
- Si no se envía `departedAt`, usa `now`.
- `departedAt` no puede ser futuro.
- Si existe `arrivedAt`, `departedAt` debe ser posterior.
- `departedAt` no puede registrarse más de 24 horas antes de `fechaSalida`.
- No se puede zarpar si existen atenciones abiertas; deben cerrarse o cancelarse primero.

## Cancelar recalada

`PATCH /recaladas/:id/cancel`

```json
{
  "reason": "Cancelación por cambio de itinerario"
}
```

Reglas:

- No se puede cancelar si está `DEPARTED`.
- No se puede cancelar si ya está `CANCELED`.
- Si está `ARRIVED`, solo `SUPER_ADMIN` puede cancelar.
- No se puede cancelar si tiene atenciones o turnos activos; deben resolverse primero.
- Al cancelar escribe `operationalStatus = CANCELED`, `canceledAt` y `cancelReason`.

## Eliminación física segura

`DELETE /recaladas/:id`

Reglas:

- Solo se permite si la recalada está `SCHEDULED`.
- No puede tener atenciones.
- No puede tener turnos.
- Si no cumple, se debe usar cancelación.
- Respuesta exitosa:

```json
{
  "data": {
    "deleted": true,
    "id": 1
  },
  "meta": null,
  "error": null
}
```

## Eventos en tiempo real

Eventos emitidos a supervisores:

- `recalada:created`
- `recalada:updated`
- `recalada:arrived`
- `recalada:departed`
- `recalada:canceled`

## Auditoría

Eventos funcionales observados:

- `recaladas.create.success`
- `recaladas.create.failed`
- `recaladas.update.success`
- `recaladas.update.failed`
- `recaladas.arrive.success`
- `recaladas.arrive.failed`
- `recaladas.depart.success`
- `recaladas.depart.failed`
- `recaladas.cancel.success`
- `recaladas.cancel.failed`
- `recaladas.deleteSafe.success`
- `recaladas.deleteSafe.failed`
- `recaladas.list`
