# Documentación funcional de gestionguias-api

Última revisión contra código: 2026-05-04.

Esta carpeta documenta el comportamiento observable de la API principal. La fuente de verdad técnica sigue siendo el código en `src/routes`, `src/modules` y `prisma/schema.prisma`; estos documentos explican ese comportamiento para producto, frontend, mobile y pruebas manuales.

## Índice vigente

| Documento | Alcance |
| --- | --- |
| [fundamentos.md](./fundamentos.md) | Convenciones globales: prefijo, envelope, errores, roles, plataformas y estados. |
| [auth.md](./auth.md) | Autenticación, sesiones, refresh, logout, verificación de email y contraseñas. |
| [usuarios.md](./usuarios.md) | Perfil, onboarding, listado administrativo, guías y administración de usuarios. |
| [catalog.md](./catalog.md) | Países y buques. |
| [reacaladas.md](./reacaladas.md) | Agenda madre de recaladas y estados operativos. |
| [atenciones.md](./atenciones.md) | Ventanas operativas dentro de una recalada y materialización de turnos. |
| [turnos.md](./turnos.md) | Ciclo de vida de cupos, asignación, claim, check-in, check-out y no-show. |
| [dashboard.md](./dashboard.md) | Overview por rol y widgets listos para clientes. |
| [mailing.md](./mailing.md) | Invitaciones, correo de prueba y flujos de email transaccional. |
| [docs-logs-api.md](./docs-logs-api.md) | Contrato con el microservicio de logs. |
| [historias-usuario](./historias-usuario/README.md) | Lógica de negocio narrada como historias de usuario. |

## Separación nueva de auth y usuarios

El documento antiguo `auth-usuarios.md` mezclaba autenticación con administración de usuarios. Desde esta revisión:

- `auth.md` documenta identidad, tokens, sesiones y flujos sensibles.
- `usuarios.md` documenta perfiles, onboarding, RBAC de usuarios y guías.
- `auth-usuarios.md` queda como archivo de compatibilidad con enlaces a ambos documentos.

## Convenciones de lectura

- Las rutas se describen sin repetir el prefijo completo. Si `API_PREFIX=/api/v1`, entonces `POST /auth/login` significa `POST /api/v1/auth/login`.
- Las respuestas exitosas usan el envelope `{ data, meta, error }`, salvo respuestas `204`.
- Los errores de negocio usan el middleware global y mantienen el mismo envelope con `data: null`.
- Las fechas deben enviarse como ISO 8601 salvo que el schema indique un formato específico.
- Los roles válidos son `SUPER_ADMIN`, `SUPERVISOR` y `GUIA`.
- Las plataformas válidas para auth son `WEB` y `MOBILE`, recibidas por `X-Client-Platform`.
