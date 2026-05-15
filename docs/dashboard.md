# Dashboard

Última revisión contra código: 2026-05-04.

Fuente principal: `src/routes/dashboard.routes.ts`, `src/modules/dashboard/*`.

## Propósito

El dashboard entrega un overview listo para pintar por rol. La UI no debería recalcular reglas de negocio; debe renderizar `widgets` y, cuando necesite compatibilidad o detalle, leer los bloques `supervisor` o `guia`.

## Ruta

`GET /dashboard/overview`

Requiere autenticación.

Roles soportados:

- `SUPER_ADMIN`
- `SUPERVISOR`
- `GUIA`

Si llega otro rol, responde `403 FORBIDDEN`.

## Query

| Campo | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | día actual según offset | Día de referencia. |
| `tzOffsetMinutes` | number | `-300` | Offset respecto a UTC. Bogotá = `-300`. |
| `upcomingLimit` | number | `8`, máximo `20` | Límite de hitos para supervisor. |
| `availableAtencionesLimit` | number | `10`, máximo `50` | Límite de atenciones disponibles para guía. |

## Respuesta base

```json
{
  "data": {
    "role": "GUIA",
    "date": "2026-05-04",
    "tzOffsetMinutes": -300,
    "generatedAt": "2026-05-04T15:00:00.000Z",
    "serverTime": "2026-05-04T15:00:00.000Z",
    "dateContext": {
      "date": "2026-05-04",
      "timezoneHint": "UTC-05:00"
    },
    "widgets": []
  },
  "meta": null,
  "error": null
}
```

## Widgets

Cada widget tiene esta forma:

```json
{
  "id": "guia-next-turno",
  "type": "card",
  "title": "Próximo turno",
  "subtitle": "Tu siguiente experiencia ya está lista.",
  "tone": "info",
  "icon": "ticket",
  "data": {},
  "actions": [
    {
      "label": "Ver detalles",
      "action": "navigate",
      "to": "/turnos/1"
    }
  ]
}
```

Tipos:

- `card`
- `list`
- `kpi`
- `cta`
- `alert`

Tonos:

- `neutral`
- `info`
- `success`
- `warning`
- `danger`

## Overview para supervisor y super admin

Para `SUPER_ADMIN` y `SUPERVISOR`, la respuesta incluye `supervisor`.

Métricas calculadas para el día:

- número de recaladas del día;
- atenciones que intersectan el día;
- turnos asociados a atenciones que intersectan el día;
- breakdown por estado de turno;
- guías activos, asignados y libres;
- hitos próximos;
- conteo de recaladas vencidas pendientes de zarpe (`overdueRecaladas`).

Shape:

```json
{
  "supervisor": {
    "counts": {
      "recaladas": 2,
      "atenciones": 4,
      "turnos": 40,
      "turnosAssigned": 10,
      "turnosAvailable": 20,
      "turnosInProgress": 2,
      "turnosDone": 6,
      "turnosCanceled": 2,
      "overdueRecaladas": 1
    },
    "guides": {
      "activos": 15,
      "asignados": 8,
      "libres": 7
    },
    "turnosBreakdown": {
      "AVAILABLE": 20,
      "ASSIGNED": 10
    },
    "alerts": [
      {
        "code": "OVERDUE_RECALADAS",
        "label": "1 recalada vencida pendiente de zarpe",
        "count": 1
      }
    ],
    "upcoming": []
  }
}
```

`supervisor.alerts` es opcional. Cuando aplica, incluye objetos `{ code, label, count }`. El
código `OVERDUE_RECALADAS` corresponde a recaladas con `status = ACTIVO`,
`operationalStatus = ARRIVED` y `fechaSalida < now`.

Widgets posibles:

- `sup-overdue-recaladas` (solo aparece si hay vencidas pendientes; navega a
  `/recaladas?overdueDeparture=true`)
- `sup-operation-today`
- `sup-alerts`
- `sup-guides`
- `sup-upcoming`

Hitos posibles:

- `RECALADA_ARRIVAL`
- `RECALADA_DEPARTURE`
- `ATENCION_START`
- `ATENCION_END`

## Overview para guía

Para `GUIA`, la respuesta incluye `guia`.

Shape:

```json
{
  "guia": {
    "nextTurno": null,
    "activeTurno": null,
    "atencionesDisponibles": []
  }
}
```

Reglas:

- El sistema resuelve la fila `Guia` desde el `usuarioId`.
- Si el usuario no tiene fila `Guia`, devuelve `nextTurno: null`, `activeTurno: null` y `atencionesDisponibles: []`.
- `activeTurno` representa turno en curso.
- `nextTurno` representa el próximo turno asignado del guía.
- `atencionesDisponibles` se limita con `availableAtencionesLimit`.
- Los widgets de semana del guía se calculan con el rango semanal según `date` y `tzOffsetMinutes`.

Widgets posibles:

- `guia-active-turno`
- `guia-next-turno`
- `guia-disponibles`
- `guia-week-kpis`
- `guia-empty`

## Reglas de negocio

- El backend decide qué datos corresponden a cada rol.
- La UI puede ordenar o dar estilo, pero no cambiar semántica de estados.
- Los clientes deben tratar `widgets` como la capa principal de presentación.
- Los bloques `supervisor` y `guia` se mantienen como datos raw de compatibilidad.

## Errores

- `400 VALIDATION_ERROR` si `date` no es `YYYY-MM-DD` o límites salen de rango.
- `401 UNAUTHORIZED` si no hay sesión válida.
- `403 FORBIDDEN` si el rol no es soportado por dashboard.
