# Documentación funcional de gestionguias-api

Última revisión contra código: 2026-06-04.

Esta carpeta documenta el comportamiento observable de la API principal. La fuente de verdad técnica sigue siendo el código en `src/routes`, `src/modules` y `prisma/schema.prisma`; estos documentos explican ese comportamiento para producto, frontend, mobile y pruebas manuales.

## Índice vigente

| Documento | Alcance |
| --- | --- |
| [fundamentos.md](./fundamentos.md) | Convenciones globales: prefijo, envelope, errores, roles, plataformas y estados. |
| [auth.md](./auth.md) | Autenticación, sesiones, refresh, logout, verificación de email y contraseñas. |
| [usuarios.md](./usuarios.md) | Perfil, onboarding, listado administrativo, guías y administración de usuarios. |
| [catalog.md](./catalog.md) | Países, buques, puertos y muelles. |
| [reacaladas.md](./reacaladas.md) | Agenda madre de recaladas y estados operativos. |
| [atenciones.md](./atenciones.md) | Ventanas operativas dentro de una recalada y materialización de turnos. |
| [turnos.md](./turnos.md) | Ciclo de vida de cupos, asignación, claim, check-in, check-out y no-show. |
| [disponibilidad.md](./disponibilidad.md) | Disponibilidad global, modo Manual/FIFO configurable y penalización por NO_SHOW. |
| [dashboard.md](./dashboard.md) | Overview por rol y widgets listos para clientes. |
| [mailing.md](./mailing.md) | Invitaciones, correo de prueba y flujos de email transaccional. |
| [docs-logs-api.md](./docs-logs-api.md) | Contrato con el microservicio de logs. |
| [historias-usuario](./historias-usuario/README.md) | Lógica de negocio narrada como historias de usuario. |

## Separación nueva de auth y usuarios

El documento antiguo `auth-usuarios.md` mezclaba autenticación con administración de usuarios. Desde esta revisión:

- `auth.md` documenta identidad, tokens, sesiones y flujos sensibles.
- `usuarios.md` documenta perfiles, onboarding, RBAC de usuarios y guías.
- `auth-usuarios.md` queda como archivo de compatibilidad con enlaces a ambos documentos.

## Cambios recientes documentados

- `disponibilidad.md`: disponibilidad global por guia, modo `MANUAL_RECLAMO` por defecto y `FIFO_GLOBAL` activable desde configuracion operativa.
- `turnos.md`: reclamo bloqueado en FIFO, disponibilidad global obligatoria y reasignacion automatica tras NO_SHOW solo en `FIFO_GLOBAL`.
- `realtime.md`: eventos `disponibilidad:globalChanged` y `operational-config:changed`; tabla de invalidaciones actualizada.
- `mailing.md`: documentacion actualizada para proveedor Brevo (HTTP API) en reemplazo del proveedor anterior.
- `auth.md` detalla la separacion entre cierre de sesion actual, cierre de una sesion especifica y cierre de todas las sesiones.
- `auth.md` documenta `isCurrent` en `GET /auth/sessions` para que los clientes identifiquen la sesion del access token actual.
- `auth.md` aclara que refrescar una sesion revocada manualmente responde `401` sin cerrar las demas sesiones.
- `historias-usuario/01-autenticacion-sesion.md` incluye criterios funcionales para revocar una sesion mobile desde web sin perder la sesion web.
- `catalog.md`, `reacaladas.md` y `atenciones.md`: puertos/muelles como catálogos operativos, selección en recaladas y evaluación de cierre por supervisor.

## Convenciones de lectura

- Las rutas se describen sin repetir el prefijo completo. Si `API_PREFIX=/api/v1`, entonces `POST /auth/login` significa `POST /api/v1/auth/login`.
- Las respuestas exitosas usan el envelope `{ data, meta, error }`, salvo respuestas `204`.
- Los errores de negocio usan el middleware global y mantienen el mismo envelope con `data: null`.
- Las fechas deben enviarse como ISO 8601 salvo que el schema indique un formato específico.
- Los roles válidos son `SUPER_ADMIN`, `SUPERVISOR` y `GUIA`.
- Las plataformas válidas para auth son `WEB` y `MOBILE`, recibidas por `X-Client-Platform`.
