# Disponibilidad global y modo de asignacion

Ultima revision contra codigo: 2026-05-16.

Fuente principal: `src/routes/users.routes.ts`, `src/routes/operational-config.routes.ts`, `src/modules/users/*`, `src/modules/operational-config/*`, `src/modules/disponibilidad/_usecases/autoAssign.usecase.ts`, `src/modules/turnos/*`, `prisma/schema.prisma`.

## Proposito

La disponibilidad principal del sistema es global por guia. Un guia se marca disponible o no disponible para participar en turnos operativos; esa marca gobierna el reclamo manual y alimenta la asignacion FIFO cuando el modo automatico este activo.

El modo de asignacion es global para toda la operacion:

- `MANUAL_RECLAMO`: default. El guia disponible y no penalizado reclama turnos desde la UI.
- `FIFO_GLOBAL`: apagado por defecto. El sistema asigna automaticamente por disponibilidad global; los endpoints de reclamo quedan bloqueados con `409 CONFLICT`.

La disponibilidad por atencion (`/atenciones/:id/disponibilidad`) queda como flujo legacy y no gobierna la UI principal.

## Modelo de datos

### Guia

```prisma
model Guia {
  disponibleParaTurnos    Boolean   @default(false)
  disponibilidadUpdatedAt DateTime?
  pendingPenalty          Boolean   @default(false)
}
```

`disponibilidadUpdatedAt` define el orden FIFO global. Si el guia esta penalizado (`pendingPenalty = true`), no puede reclamar manualmente ni entrar a la asignacion FIFO.

### OperationalConfig

```prisma
enum TurnoAssignmentMode {
  MANUAL_RECLAMO
  FIFO_GLOBAL
}

model OperationalConfig {
  id                  String              @id @default("global")
  turnoAssignmentMode TurnoAssignmentMode @default(MANUAL_RECLAMO)
  updatedById         String?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
}
```

El registro singleton `global` se crea por migracion con `MANUAL_RECLAMO`.

## Rutas de configuracion operativa

Todas requieren autenticacion.

| Metodo | Ruta | Rol | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/operational-config` | `SUPERVISOR`, `SUPER_ADMIN` | Consulta el modo global activo. |
| `PATCH` | `/operational-config/turnos-assignment-mode` | `SUPERVISOR`, `SUPER_ADMIN` | Cambia el modo global. |

Body:

```json
{
  "turnoAssignmentMode": "FIFO_GLOBAL"
}
```

Respuesta:

```json
{
  "data": {
    "id": "global",
    "turnoAssignmentMode": "FIFO_GLOBAL",
    "updatedById": "user_id",
    "createdAt": "2026-05-16T00:00:00.000Z",
    "updatedAt": "2026-05-16T00:05:00.000Z"
  },
  "meta": null,
  "error": null
}
```

Eventos:

- `operational-config:changed` a supervisores, administradores y guias.

## Rutas de disponibilidad global

| Metodo | Ruta | Rol | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/users/me/disponibilidad` | `GUIA` | Consulta la disponibilidad global propia. |
| `PATCH` | `/users/me/disponibilidad` | `GUIA` | Cambia la disponibilidad global propia. |

Body:

```json
{
  "disponible": true
}
```

Respuesta:

```json
{
  "data": {
    "guiaId": "guia_id",
    "disponibleParaTurnos": true,
    "disponibilidadUpdatedAt": "2026-05-16T01:52:00.000Z",
    "pendingPenalty": false,
    "turnoAssignmentMode": "MANUAL_RECLAMO"
  },
  "meta": null,
  "error": null
}
```

Reglas:

- Solo aplica para usuarios con fila `Guia`.
- El usuario del guia debe estar activo.
- Un guia con `pendingPenalty = true` no puede marcarse disponible.
- Al marcarse no disponible, `disponibilidadUpdatedAt` se limpia.
- Al marcarse disponible en modo `FIFO_GLOBAL`, se intenta asignar cupos abiertos de forma asincrona.

Eventos:

- `disponibilidad:globalChanged` al guia y a supervisores/administradores.

## Modo manual

En `MANUAL_RECLAMO`:

- `POST /atenciones/:id/claim` y `POST /turnos/:id/claim` siguen siendo la via principal para guias.
- El backend bloquea el reclamo si el guia no esta disponible globalmente.
- El backend bloquea el reclamo si el guia tiene `pendingPenalty = true`.
- No se asignan turnos automaticamente al marcar arribo, crear atencion o aumentar cupos.

## Modo FIFO global

En `FIFO_GLOBAL`:

- Los endpoints de claim responden `409 CONFLICT` con mensaje de modo FIFO activo.
- El sistema asigna automaticamente turnos `AVAILABLE` a guias elegibles.
- Un guia elegible debe estar activo, disponible, sin penalizacion pendiente y con `disponibilidadUpdatedAt` no nulo.
- El orden es `disponibilidadUpdatedAt ASC`, luego `id ASC`.
- Se excluyen guias con turno en la misma atencion o con turno `ASSIGNED`/`IN_PROGRESS` solapado.
- La asignacion corre al marcar arribo de recalada, al crear o actualizar cupos de una atencion operable, al marcar disponibilidad y despues de `NO_SHOW`.

## Disponibilidad por atencion legacy

Las rutas antiguas siguen existiendo para compatibilidad:

| Metodo | Ruta | Rol |
| --- | --- | --- |
| `POST` | `/atenciones/:id/disponibilidad` | `GUIA` |
| `DELETE` | `/atenciones/:id/disponibilidad` | `GUIA` |
| `GET` | `/atenciones/:id/disponibilidad` | `SUPERVISOR`, `SUPER_ADMIN` |
| `GET` | `/atenciones/:id/disponibilidad/me` | `GUIA` |

Estas rutas ya no gobiernan el flujo principal de reclamo ni el selector Manual/FIFO. La fuente operativa principal es `Guia.disponibleParaTurnos`.
