# GestionGuias API

API para gestión de turnos de guías turísticos en el puerto de Cartagena.

## 🚀 Tecnologías

- **Backend**: Express.js + TypeScript
- **Base de datos**: PostgreSQL + Prisma ORM
- **Autenticación**: JWT (access + refresh tokens)
- **Validación**: Zod
- **Logging**: Pino
- **Contenedores**: Docker
- **CI/CD**: GitHub Actions

## 🏗️ Arquitectura

\`\`\`
src/
├── config/           # Configuración y variables de entorno
├── libs/            # Utilidades transversales (JWT, errores, HTTP)
├── middlewares/     # Middlewares de Express
├── prisma/          # Cliente de Prisma
├── routes/          # Rutas de la API
├── app.ts           # Configuración de Express
└── server.ts        # Punto de entrada del servidor
\`\`\`

## 🔧 Desarrollo

### Prerrequisitos

- Node.js 18+
- PostgreSQL 15+
- Docker (opcional)

### Configuración inicial

1. Clonar el repositorio
2. Instalar dependencias: `npm install`
3. Copiar variables de entorno: `cp .env.example .env`
4. Configurar la base de datos en `.env`
5. Ejecutar migraciones: `npm run prisma:migrate`
6. Iniciar en modo desarrollo: `npm run dev`

### Scripts disponibles

- `npm run dev` - Desarrollo con hot reload
- `npm run build` - Compilar TypeScript
- `npm start` - Ejecutar versión compilada
- `npm run prisma:generate` - Generar cliente Prisma
- `npm run prisma:migrate` - Ejecutar migraciones
- `npm run prisma:studio` - Abrir Prisma Studio

## 🐳 Docker

### Desarrollo
\`\`\`bash
docker-compose up -d
\`\`\`

### Producción
\`\`\`bash
docker build -t gestionguias-api .
docker run -p 3000:3000 --env-file .env gestionguias-api
\`\`\`

## 🚀 Despliegue

### Automático (GitHub Actions)
- Push a `main` → build y push a GHCR
- Tags `v*.*.*` → release con versionado semántico

### Manual
\`\`\`bash
./scripts/deploy.sh production latest
\`\`\`

## 📊 Monitoreo

- **Health check**: `GET /health`
- **Readiness check**: `GET /health/ready`
- **Logs**: Estructurados con Pino (JSON en producción)

## 🔐 Seguridad

- JWT con access/refresh tokens
- RBAC por roles (SUPER_ADMIN, SUPERVISOR, GUIA)
- Validación estricta con Zod
- Headers de seguridad con Helmet
- CORS configurado

## 📝 API Documentation

La documentación completa de la API estará disponible en `/docs` (próximamente).

## 🤝 Contribución

1. Fork del proyecto
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -m 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.
