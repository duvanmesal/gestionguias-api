# Auth y usuarios

Última revisión contra código: 2026-05-04.

Este archivo se conserva solo por compatibilidad con referencias antiguas. La documentación vigente quedó separada:

- [auth.md](./auth.md): autenticación, sesiones, refresh tokens, logout, verificación de email y contraseñas.
- [usuarios.md](./usuarios.md): perfil, onboarding, guías, listado administrativo y administración de usuarios.

Motivo de la separación:

- `auth` vive en `src/modules/auth` y `src/routes/auth.routes.ts`.
- `users` vive en `src/modules/users` y `src/routes/users.routes.ts`.
- Ambos módulos se cruzan, pero sus reglas de negocio y permisos no son iguales.

Para nuevas integraciones o pruebas, usar siempre los documentos separados.
