# 00. Contexto, Actores y Conceptos

## Vision del producto

Gestion Guias soporta la operacion de guias turisticos asociados a recaladas de buques en Cartagena. El sistema organiza la agenda portuaria, crea ventanas de atencion, materializa cupos como turnos, permite asignar o reclamar turnos y deja trazabilidad de las decisiones operativas.

La aplicacion no es un CRUD generico. Su objetivo principal es mantener consistencia entre:

- la agenda madre de buques (`Recalada`);
- las ventanas de servicio (`Atencion`);
- los cupos materializados (`Turno`);
- los usuarios que operan el sistema;
- la evidencia tecnica y operativa mediante logs.

## Actores

### SUPER_ADMIN

Actor con control administrativo completo.

Responsabilidades principales:

- administrar usuarios, roles e invitaciones;
- crear y mantener catalogos base;
- acceder a toda la supervision operativa;
- cancelar casos mas sensibles, como una recalada ya arribada;
- revisar informacion de control y trazabilidad cuando aplica.

### SUPERVISOR

Actor responsable de coordinar la operacion diaria.

Responsabilidades principales:

- crear y gestionar recaladas;
- crear, editar, cancelar y cerrar atenciones;
- asignar, liberar, cancelar y marcar no-show en turnos;
- consultar dashboard operativo;
- revisar disponibilidad de guias y cupos.

### GUIA

Actor operativo en campo.

Responsabilidades principales:

- consultar sus turnos;
- tomar cupos disponibles cuando el sistema lo permita;
- hacer check-in y check-out en sus turnos;
- liberar sus propios turnos asignados cuando aun no han iniciado;
- revisar el dashboard operativo de su jornada.

## Canales de uso

### WEB

Canal administrativo y de supervision. Usa `X-Client-Platform: WEB`.

Reglas relevantes:

- el refresh token se maneja por cookie HTTP-only;
- las vistas estan orientadas a supervision, gestion y control;
- el acceso se protege por roles y guards.

### MOBILE

Canal operativo para uso en campo. Usa `X-Client-Platform: MOBILE`.

Reglas relevantes:

- el login requiere `deviceId`;
- el refresh token viaja en body;
- la verificacion de correo puede usar codigo de 6 digitos;
- la experiencia se centra en dashboard operativo, turnos, atenciones y acciones rapidas.

## Conceptos de negocio

### Estado administrativo

El estado administrativo indica si un registro esta habilitado como dato maestro o registro activo del sistema.

Valores principales:

- `ACTIVO`
- `INACTIVO`
- `SUSPENDIDO`

Este estado no reemplaza el estado operativo.

### Estado operativo de recalada

La recalada representa el evento madre del buque.

Valores:

- `SCHEDULED`: la recalada esta programada.
- `ARRIVED`: el buque ya arribo.
- `DEPARTED`: el buque ya zarpo.
- `CANCELED`: la recalada fue cancelada.

### Estado operativo de atencion

La atencion representa una ventana de servicio dentro de una recalada.

Valores:

- `OPEN`: la atencion esta abierta a operacion.
- `CLOSED`: la atencion se cerro operativamente.
- `CANCELED`: la atencion fue cancelada.

### Estado de turno

El turno representa un cupo real materializado.

Valores:

- `AVAILABLE`: cupo libre.
- `ASSIGNED`: cupo asignado a un guia.
- `IN_PROGRESS`: guia hizo check-in y el turno esta en curso.
- `COMPLETED`: guia hizo check-out y el turno termino.
- `CANCELED`: turno cancelado manualmente.
- `NO_SHOW`: guia no se presento.

## Reglas transversales del dominio

- Un guia no puede tener dos turnos asignados o en curso en horarios solapados.
- Un guia no puede tomar otro turno si ya tiene uno en curso.
- Las operaciones de turnos dependen del estado de la atencion y de la recalada.
- Una recalada cancelada o zarpada bloquea nuevas operaciones operativas dependientes.
- Una atencion cerrada o cancelada bloquea claim, asignacion, check-in, check-out, no-show y cancelacion de turnos.
- La trazabilidad es parte del producto: los eventos relevantes deben quedar auditados.

## Historia transversal: operar con roles claros

Como usuario del sistema, quiero que mis acciones dependan de mi rol, para que la informacion y las operaciones sensibles esten protegidas.

Criterios de aceptacion:

- `SUPER_ADMIN` puede administrar configuracion, usuarios e invitaciones.
- `SUPERVISOR` puede coordinar operacion, pero no asumir acciones reservadas a `SUPER_ADMIN`.
- `GUIA` solo puede operar su propia actividad.
- Si un usuario intenta ejecutar una accion fuera de su rol, el sistema debe rechazarla.

## Historia transversal: mantener consistencia operativa

Como supervisor, quiero que el sistema impida estados incoherentes, para evitar errores en la operacion real.

Criterios de aceptacion:

- no se puede operar sobre atenciones cerradas o canceladas;
- no se puede operar sobre recaladas canceladas o zarpadas;
- no se pueden crear ventanas fuera del rango de la recalada;
- no se pueden dejar turnos asignados con horarios incoherentes por cambios posteriores;
- las metricas no deben perder el significado de estados terminales como `NO_SHOW` o `COMPLETED`.
