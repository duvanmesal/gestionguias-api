# Realtime Socket.IO

Este documento describe el contrato realtime de `gestionguias-api` consumido por web y mobile. Socket.IO complementa las consultas HTTP y React Query; no reemplaza endpoints ni cambia permisos HTTP.

## Conexion

- URL/path: mismo host de la API, path `/socket.io`.
- Auth: enviar access token en `handshake.auth.token`.
- La conexion se rechaza si el token falta, es invalido, expiro, no trae `sid`, la sesion no existe, esta revocada, expiro por refresh, el usuario esta inactivo o el token quedo por detras de `lastRotatedAt`.
- El servidor no envia refresh tokens, datos sensibles ni perfiles completos en eventos realtime.

## Salas automaticas

Cada socket autenticado entra automaticamente a:

| Sala | Quien entra | Uso |
| --- | --- | --- |
| `user:{userId}` | El usuario autenticado | Cambios de sesiones y datos propios. |
| `session:{sid}` | La sesion del access token | Cierre remoto de una sesion especifica. |
| `guia:{userId}` | Usuarios `GUIA` | Cambios de turnos que afectan al guia. |
| `supervisors` | `SUPERVISOR` y `SUPER_ADMIN` | Cambios operativos de recaladas, atenciones, turnos y catalogos. |
| `admins` | `SUPER_ADMIN` | Eventos administrativos de usuarios e invitaciones. |

## Salas manuales

Los clientes pueden entrar o salir de salas de detalle cuando la pantalla esta activa:

| Evento cliente | Payload aceptado | Sala | Regla |
| --- | --- | --- | --- |
| `join:atencion` | `number` o `{ "atencionId": number }` | `atencion:{id}` | Usuario autenticado y atencion existente. |
| `leave:atencion` | `number` o `{ "atencionId": number }` | `atencion:{id}` | Usuario autenticado. |
| `join:recalada` | `number` o `{ "recaladaId": number }` | `recalada:{id}` | Usuario autenticado y recalada existente. |
| `leave:recalada` | `number` o `{ "recaladaId": number }` | `recalada:{id}` | Usuario autenticado. |

La autorizacion de lectura de estas salas sigue la superficie HTTP actual: detalle/listado de recaladas y atenciones requiere autenticacion; mutaciones siguen restringidas en sus endpoints.

## Eventos y payloads

Los payloads deben mantenerse pequenos y seguros. La forma base usa IDs, estado y metadatos operativos:

```json
{
  "turnoId": 123,
  "atencionId": 45,
  "recaladaId": 6,
  "status": "ASSIGNED",
  "guiaId": "perfil-guia-id"
}
```

### Auth y sesiones

| Evento | Sala destino | Payload | Uso cliente |
| --- | --- | --- | --- |
| `auth:sessionRevoked` | `session:{sid}` | `{ sessionId, userId, reason }` | Cerrar solo el cliente conectado a esa sesion. |
| `auth:sessionsChanged` | `user:{userId}` | `{ userId }` | Refrescar lista de sesiones. |

Razones esperadas: `logout`, `logout_all`, `session_revoked`, `password_change`, `user_deactivated`.

### Turnos

| Evento | Destinos | Payload minimo |
| --- | --- | --- |
| `turno:assigned` | `atencion:{id}`, `recalada:{id}`, `guia:{userId}`, `supervisors` | `turnoId`, `atencionId`, `recaladaId`, `status`, `guiaId` |
| `turno:claimed` | Igual | Igual |
| `turno:checkedIn` | Igual | Igual |
| `turno:checkedOut` | Igual | Igual |
| `turno:unassigned` | Igual, incluyendo el guia previo cuando aplica | Igual |
| `turno:noShow` | Igual | Igual |
| `turno:canceled` | Igual | Igual |

Los jobs automaticos tambien emiten eventos de turno y agregan `source: "job"` en el payload.

### Atenciones

| Evento | Destinos | Payload minimo |
| --- | --- | --- |
| `atencion:created` | `atencion:{id}`, `recalada:{id}`, `supervisors` | `atencionId`, `recaladaId`, `status`, `operationalStatus` |
| `atencion:updated` | Igual | Igual |
| `atencion:canceled` | Igual | Igual |
| `atencion:closed` | Igual | Igual |
| `atencion:nueva` | `guias` (sala broadcast de todos los guias) | `atencionId`, `recaladaId`, `fechaInicio`, `fechaFin` |
| `atencion:asignacionCompleta` | `supervisors` | `atencionId`, `asignados` |

- `atencion:nueva` se emite cuando un supervisor crea una atencion, para que todos los guias puedan reaccionar (toast, badge, actualizar lista de atenciones pendientes de disponibilidad).
- `atencion:asignacionCompleta` se emite tras el auto-assign al arribo, informando cuantos turnos quedaron asignados en esa atencion.

Cuando una atencion cancelada afecta turnos asignados, tambien se emite `turno:canceled` a los guias afectados.

### Disponibilidad

| Evento | Destinos | Payload | Uso cliente |
| --- | --- | --- | --- |
| `disponibilidad:marcada` | `supervisors`, `guia:{userId}` | `atencionId`, `guiaId`, `guiaUserId`, `penalizado`, `posicion`, `total` (+ `tuPosicion` al propio guia) | Supervisor actualiza cola en vivo; guia ve su posicion. |
| `disponibilidad:penalizado` | `guia:{userId}` del guia ausente | `turnoId`, `atencionId`, `mensaje` | Toast de aviso al guia que hizo NO_SHOW. |

### Recaladas

| Evento | Destinos | Payload minimo |
| --- | --- | --- |
| `recalada:created` | `recalada:{id}`, `supervisors` | `recaladaId`, `status`, `operationalStatus` |
| `recalada:updated` | Igual | Igual |
| `recalada:arrived` | Igual | Igual |
| `recalada:departed` | Igual | Igual |
| `recalada:canceled` | Igual | Igual |

### Administracion

| Evento | Destinos | Uso |
| --- | --- | --- |
| `user:created` | `admins` | Refrescar usuarios. |
| `user:updated` | `admins`, `user:{userId}` | Refrescar usuarios y perfil propio si coincide. |
| `user:deactivated` | `admins` | Refrescar usuarios y cerrar sesiones afectadas por `auth:sessionRevoked`. |
| `guides:lookupChanged` | `admins`, `supervisors` | Refrescar lookup de guias para asignacion. |
| `invitation:created` | `admins` | Refrescar invitaciones. |
| `invitation:resent` | `admins` | Refrescar invitaciones. |
| `invitation:used` | `admins` | Refrescar invitaciones. |
| `invitation:expired` | `admins` | Refrescar invitaciones. |
| `catalog:pais:created` | `admins`, `supervisors` | Refrescar paises. |
| `catalog:pais:updated` | `admins`, `supervisors` | Refrescar paises. |
| `catalog:pais:removed` | `admins`, `supervisors` | Refrescar paises. |
| `catalog:pais:bulkChanged` | `admins`, `supervisors` | Refrescar paises. |
| `catalog:buque:created` | `admins`, `supervisors` | Refrescar buques. |
| `catalog:buque:updated` | `admins`, `supervisors` | Refrescar buques. |
| `catalog:buque:removed` | `admins`, `supervisors` | Refrescar buques. |
| `catalog:buque:bulkChanged` | `admins`, `supervisors` | Refrescar buques. |

## Matriz cliente a queries

| Familia evento | Web/mobile debe invalidar |
| --- | --- |
| `auth:sessionRevoked` | Cerrar sesion local solo si coincide la sesion conectada. |
| `auth:sessionsChanged` | Sesiones del usuario. |
| `turno:*` | Turnos, mis turnos, turno detalle, atencion detalle/turnos/resumen, recalada detalle y dashboard. |
| `atencion:*` | Atenciones, atencion detalle/turnos/resumen, recalada detalle/atenciones y dashboard. |
| `disponibilidad:marcada` | Cola de disponibilidad de la atencion activa (supervisor). Posicion propia del guia. |
| `disponibilidad:penalizado` | Estado de penalizacion del guia (banner en UI). |
| `atencion:asignacionCompleta` | Cola de disponibilidad de la atencion; refrescar turnos y summary. |
| `recalada:*` | Recaladas, recalada detalle/atenciones, atenciones y dashboard. |
| `user:*` | Usuarios admin, perfil propio si coincide y lookup de guias cuando aplique. |
| `guides:lookupChanged` | Lookup de guias. |
| `invitation:*` | Invitaciones admin. |
| `catalog:pais:*` | Listas, lookup y detalle de paises. |
| `catalog:buque:*` | Listas, lookup y detalle de buques. |

## Reglas UX

- Las invalidaciones son silenciosas por defecto.
- Mostrar toast solo cuando el evento sea relevante para el usuario actual o para la pantalla activa.
- No hay centro persistente de eventos en esta fase.
- Si el servidor envia `auth:sessionRevoked`, el cliente debe limpiar estado local, desconectar socket y volver a login.
