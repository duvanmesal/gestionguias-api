# Historias de Usuario - Logica de Negocio

Esta carpeta documenta la logica funcional del sistema Gestion Guias en lenguaje humano. No reemplaza los contratos tecnicos de `docs/*.md`; los resume como comportamiento esperado del producto desde el punto de vista de sus actores.

## Como leer esta documentacion

Cada historia usa la forma:

> Como [actor], quiero [accion], para [resultado de negocio].

Despues de cada grupo de historias se incluyen reglas de negocio y criterios de aceptacion. Las reglas estan escritas para validacion funcional, QA, sustentacion del proyecto y alineacion entre backend, front web y mobile.

## Mapa de documentos

1. [Contexto, actores y conceptos](./00-contexto-actores.md)
2. [Autenticacion, sesion y seguridad de cuenta](./01-autenticacion-sesion.md)
3. [Usuarios, perfiles e invitaciones](./02-usuarios-perfiles-invitaciones.md)
4. [Catalogos de paises y buques](./03-catalogos.md)
5. [Operacion: recaladas, atenciones y turnos](./04-operacion-recaladas-atenciones-turnos.md)
6. [Dashboard y trazabilidad](./05-dashboard-trazabilidad.md)
7. [Reglas transversales y criterios de aceptacion](./06-reglas-transversales.md)

## Alcance cubierto

La documentacion cubre:

- roles `SUPER_ADMIN`, `SUPERVISOR` y `GUIA`;
- diferencias entre cliente `WEB` y `MOBILE`;
- ciclo de sesion, verificacion de correo y recuperacion de contrasena;
- administracion de usuarios, perfil inicial e invitaciones;
- catalogos base de paises y buques;
- agenda de recaladas;
- ventanas operativas de atenciones;
- materializacion, asignacion y ejecucion de turnos;
- dashboard por rol;
- auditoria y servicio de logs.

## Fuente de verdad revisada

La fuente principal es el backend `gestionguias-api`, especialmente:

- `src/routes/*`
- `src/modules/*/_usecases/*`
- `src/modules/*/_domain/*`
- `src/modules/*/_data/*`
- `docs/*.md`

Tambien se revisaron consumidores web/mobile para entender como se expresan los flujos en interfaz, y el servicio `corpoturismo-logs-service` para la trazabilidad.

## Nota importante

Esta documentacion describe el comportamiento actual observado. Si una regla cambia en el codigo, este paquete de historias debe actualizarse junto con los contratos tecnicos afectados.
