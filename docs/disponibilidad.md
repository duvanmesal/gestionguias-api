# Disponibilidad y Asignacion Automatica

Ultima revision contra codigo: 2026-05-10.

Fuente principal: `src/routes/atenciones.routes.ts`, `src/modules/disponibilidad/*`, `src/modules/turnos/_usecases/noShow.usecase.ts`, `src/modules/recaladas/_usecases/arrive.usecase.ts`, `prisma/schema.prisma`.

## Proposito

La disponibilidad reemplaza el modelo de "first click" (claim directo) por una cola ordenada y justa. El flujo es:

1. El supervisor crea una atencion y todos los guias son notificados por socket.
2. Los guias marcan disponibilidad antes de que el buque arribe.
3. Al marcar el arribo de la recalada, el sistema asigna turnos automaticamente en orden de cola.
4. Si un guia hace NO_SHOW, el siguiente en cola recibe el turno y el ausente queda penalizado para la siguiente atencion.

## Modelo de datos

### Disponibilidad

```prisma
model Disponibilidad {
  id         String   @id @default(cuid())
  atencionId Int
  guiaId     String
  marcadoAt  DateTime @default(now())
  penalizado Boolean  @default(false)

  atencion Atencion @relation(fields: [atencionId], references: [id])
  guia     Guia     @relation(fields: [guiaId], references: [id])

  @@unique([atencionId, guiaId])
  @@index([atencionId])
}
```

Un guia solo puede tener una fila por atencion. Si intenta marcar dos veces, el sistema responde `409 CONFLICT`.

### Campo pendingPenalty en Guia

```prisma
model Guia {
  pendingPenalty Boolean @default(false)
  ...
}
```

Se activa cuando el guia hace NO_SHOW. Se consume (y se vuelve `false`) la proxima vez que el guia marca disponibilidad. Mientras esta activo, su fila de disponibilidad se crea con `penalizado: true`, lo que lo ubica al final de la cola.

## Rutas

Todas requieren autenticacion.

| Metodo | Ruta | Rol | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/atenciones/:id/disponibilidad` | `GUIA` | Marcar disponibilidad para la atencion. |
| `DELETE` | `/atenciones/:id/disponibilidad` | `GUIA` | Desmarcar (solo antes del arribo). |
| `GET` | `/atenciones/:id/disponibilidad` | `SUPERVISOR`, `SUPER_ADMIN` | Ver cola ordenada de guias disponibles. |
| `GET` | `/atenciones/:id/disponibilidad/me` | `GUIA` | Consultar el propio estado de disponibilidad. |

## Marcar disponibilidad

`POST /atenciones/:id/disponibilidad`

No requiere body.

Reglas:

- El usuario debe tener fila `Guia` activa.
- La atencion debe existir, estar `ACTIVO` y en estado operativo `OPEN`.
- La recalada asociada debe estar `SCHEDULED`. Si ya esta `ARRIVED`, `DEPARTED` o `CANCELED`, el sistema rechaza con `409 CONFLICT`.
- El guia no puede tener ya una disponibilidad para esa atencion.
- El guia no puede tener ya un turno asignado en esa atencion.
- Si `guia.pendingPenalty === true`: la disponibilidad se crea con `penalizado: true` y se limpia `pendingPenalty` en la misma transaccion. El guia quedara al final de la cola.
- Si `pendingPenalty === false`: se crea con `penalizado: false` y se ordena por `marcadoAt`.

Respuesta exitosa `201`:

```json
{
  "data": {
    "id": "disp_id",
    "atencionId": 5,
    "guiaId": "guia_id",
    "marcadoAt": "2026-05-10T14:30:00.000Z",
    "penalizado": false,
    "posicion": 2
  },
  "meta": null,
  "error": null
}
```

Eventos emitidos:

- `disponibilidad:marcada` a `supervisors` con `{ atencionId, guiaId, guiaUserId, penalizado, posicion, total }`.
- `disponibilidad:marcada` al guia autenticado con el mismo payload mas `tuPosicion`.

## Desmarcar disponibilidad

`DELETE /atenciones/:id/disponibilidad`

Reglas:

- El usuario debe tener fila `Guia`.
- La disponibilidad debe existir para esa atencion.
- Si la recalada ya arribo (`ARRIVED`) y el guia tiene un turno asignado en esa atencion, no puede desmarcar.
- Si la recalada esta `ARRIVED` pero el guia no tiene turno asignado, si puede desmarcar.

Respuesta exitosa `204 No Content`.

## Ver cola de disponibilidad

`GET /atenciones/:id/disponibilidad`

Solo para `SUPERVISOR` y `SUPER_ADMIN`.

Respuesta: lista ordenada de disponibilidades con datos del guia, posicion, `penalizado` y `marcadoAt`. La cola se ordena `penalizado ASC, marcadoAt ASC`.

## Consultar mi disponibilidad

`GET /atenciones/:id/disponibilidad/me`

Solo para `GUIA`. Devuelve el estado propio: si el guia esta en la cola, su posicion y si tiene penalizacion activa. Si no ha marcado, `data: null`.

## Orden de la cola

La cola usa el criterio `ORDER BY penalizado ASC, marcadoAt ASC`:

1. Primero los guias sin penalizacion, ordenados por el momento en que marcaron.
2. Al final los guias penalizados, tambien ordenados por `marcadoAt` entre ellos.

El guia que marca primero queda en posicion 1 y recibe el turno de menor numero al asignarse.

## Asignacion automatica al marcar arribo

Cuando el supervisor marca el arribo de una recalada (`PATCH /recaladas/:id/arrive`), el sistema dispara `autoAssignTurnosForRecaladaUsecase`:

1. Obtiene todas las atenciones `OPEN` de la recalada.
2. Para cada atencion, obtiene la cola de disponibilidad y los turnos `AVAILABLE` en orden `numero ASC`.
3. Asigna en paralelo: cola[0] → turno[1], cola[1] → turno[2], etc.
4. Si hay mas guias que turnos, los del final de la cola quedan sin turno.
5. Si hay mas turnos que guias, los turnos sobrantes quedan `AVAILABLE`.
6. Emite `turno:assigned` por cada asignacion a `atencion:{id}`, `supervisors` y `guia:{userId}`.
7. Emite `atencion:asignacionCompleta` a `supervisors` con el total de asignados.

La asignacion es transaccional dentro de cada atencion.

## Penalizacion y reasignacion en NO_SHOW

Cuando el supervisor marca `PATCH /turnos/:id/no-show`:

1. El turno pasa a estado `NO_SHOW`.
2. Se registra `pendingPenalty = true` en el guia ausente.
3. Se emite `disponibilidad:penalizado` al guia ausente con mensaje explicativo.
4. El sistema busca al siguiente guia en la cola de disponibilidad que aun no tenga turno en la atencion.
5. Si existe, se le asigna el turno liberado y se emite `turno:assigned`.
6. La reasignacion es asincrona (no bloquea la respuesta HTTP del supervisor).

## Notas de mantenimiento

- Un guia con `pendingPenalty = true` que no haya marcado disponibilidad en ninguna atencion conservara la penalizacion indefinidamente hasta que lo haga.
- El campo `penalizado` en `Disponibilidad` es historico: refleja si el guia tenia penalty cuando marco, independientemente de lo que ocurra despues.
- Si se cancela una atencion, las filas de `Disponibilidad` quedan huerfanas (no se borran). Esto es intencional para no perder trazabilidad del intento de participacion.
