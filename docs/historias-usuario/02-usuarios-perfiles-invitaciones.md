# 02. Usuarios, Perfiles e Invitaciones

## Proposito del dominio

Usuarios define quien puede entrar al sistema, que rol tiene y si esta habilitado para operar. Invitaciones permite crear accesos controlados para nuevos usuarios, con contrasena temporal, rol definido y expiracion.

## HU-USR-01 - Consultar mi informacion personal

Como usuario autenticado, quiero consultar mis datos, para revisar mi informacion y permitir que la interfaz personalice mi experiencia.

Criterios de aceptacion:

- El usuario debe estar autenticado.
- El sistema devuelve informacion basica, rol, estado activo y estado del perfil.
- Si el usuario ya tiene relacion operativa (`Guia` o `Supervisor`), el sistema puede exponer los identificadores necesarios para operar.

## HU-USR-02 - Actualizar mis datos basicos

Como usuario autenticado, quiero actualizar mis nombres, apellidos y telefono, para mantener mi perfil al dia.

Criterios de aceptacion:

- El usuario solo puede actualizar sus propios datos.
- El usuario no puede cambiar su rol ni su estado activo desde este flujo.
- Debe existir al menos un campo para actualizar.
- La accion queda auditada.

## HU-USR-03 - Completar perfil inicial

Como usuario invitado o recien creado, quiero completar mi perfil, para quedar habilitado con informacion operativa suficiente.

Criterios de aceptacion:

- El usuario debe existir.
- Si el perfil ya esta completo, no puede completarse de nuevo.
- Si se informa documento, la combinacion tipo/documento debe ser unica.
- El sistema registra `profileStatus = COMPLETE` y `profileCompletedAt`.
- Si el rol es `GUIA`, se crea o asegura la relacion `Guia`.
- Si el rol es `SUPERVISOR`, se crea o asegura la relacion `Supervisor`.
- El numero de documento se enmascara en respuestas y auditoria cuando corresponde.

Reglas de negocio:

- Un usuario no es solo credencial: para operar como guia o supervisor debe tener la relacion de dominio correspondiente.
- La finalizacion del perfil conecta la cuenta de usuario con su rol operativo.

## HU-USR-04 - Listar usuarios administrativamente

Como super administrador, quiero listar usuarios con filtros, para administrar el acceso del sistema.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede acceder al listado completo.
- El listado soporta paginacion.
- El listado permite filtrar por texto, rol, activo, estado de perfil y rangos de creacion/actualizacion.
- Los resultados incluyen identificadores operativos de guia o supervisor cuando existan.

## HU-USR-05 - Crear usuario administrativamente

Como super administrador, quiero crear un usuario con rol definido, para habilitar acceso manualmente.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede crear usuarios por este flujo.
- El correo debe ser unico.
- La contrasena debe cumplir politica de seguridad.
- El rol debe ser uno de los roles soportados.
- La contrasena se almacena hasheada.
- La accion queda auditada.

## HU-USR-06 - Editar usuario administrativamente

Como super administrador, quiero editar datos, rol o estado de un usuario, para corregir o ajustar su acceso.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede cambiar rol o estado activo.
- El propietario puede editar algunos datos propios, pero no puede cambiar rol ni activo.
- Si cambia el rol, se registra auditoria especifica de cambio de rol.
- Si el usuario no existe, se informa como no encontrado.

Reglas de negocio:

- Cambiar el rol es una accion sensible.
- La interfaz puede mostrar campos distintos segun si el actor es propietario o super administrador, pero el backend conserva la regla dura.

## HU-USR-07 - Desactivar usuario

Como super administrador, quiero desactivar usuarios, para retirar acceso sin borrar su historial.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede desactivar usuarios.
- El usuario debe existir.
- No se puede desactivar una cuenta que ya esta inactiva.
- Un usuario no puede desactivarse a si mismo.
- Al desactivar, se revocan sesiones/tokens activos.
- La accion queda auditada como evento relevante.

## HU-USR-08 - Activar usuario

Como super administrador, quiero reactivar usuarios, para devolver acceso cuando sea permitido.

Criterios de aceptacion:

- El usuario debe existir.
- No se puede activar una cuenta que ya esta activa.
- El campo `activo` pasa a `true`.
- La accion queda auditada.

## HU-USR-09 - Cambiar mi contrasena desde usuarios

Como usuario, quiero cambiar mi propia contrasena desde mi perfil, para proteger mi acceso.

Criterios de aceptacion:

- Solo el propietario de la cuenta puede cambiar su contrasena por este flujo.
- La cuenta debe estar activa.
- La contrasena actual es obligatoria.
- La contrasena actual debe ser correcta.
- Al cambiarla, se revocan sesiones activas.
- La accion queda auditada.

## HU-USR-10 - Buscar guias para asignacion operativa

Como supervisor, quiero buscar guias activos, para asignar turnos correctamente.

Criterios de aceptacion:

- `SUPERVISOR` y `SUPER_ADMIN` pueden usar el lookup.
- Por defecto se devuelven guias activos.
- Se puede filtrar por texto en nombres, apellidos o correo.
- La respuesta devuelve datos minimos: `guiaId`, nombres, apellidos, email y activo.
- El resultado esta limitado para uso operativo rapido.

## HU-INV-01 - Invitar usuario

Como super administrador, quiero invitar a una persona por correo y rol, para incorporarla al sistema de forma controlada.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede crear invitaciones.
- El correo se normaliza.
- Si ya existe un usuario completo con ese correo, no se puede crear invitacion.
- Si existe una invitacion activa pendiente, no se duplica.
- El sistema crea o actualiza un usuario incompleto con contrasena temporal.
- Si el rol invitado es `GUIA`, se asegura la relacion `Guia`.
- Si el rol invitado es `SUPERVISOR`, se asegura la relacion `Supervisor`.
- Se genera token, hash de token, contrasena temporal y fecha de expiracion.
- Se envia correo de invitacion.
- En desarrollo, si falla el envio de correo, la invitacion puede conservarse pendiente y devolver la contrasena temporal para pruebas.
- En produccion, si falla el envio de correo, el flujo debe tratarse como fallo.

Reglas de negocio:

- Una invitacion representa una puerta de entrada temporal.
- Una invitacion usada no debe reabrirse como si fuera nueva sin generar credenciales nuevas.
- El correo de invitacion es parte funcional del alta.

## HU-INV-02 - Reenviar invitacion

Como super administrador, quiero reenviar una invitacion no usada, para que el invitado reciba credenciales nuevas.

Criterios de aceptacion:

- La invitacion debe existir.
- No se puede reenviar una invitacion en estado `USED`.
- El sistema genera nueva contrasena temporal, nuevo token y nueva expiracion.
- Si el usuario no existe o no esta asociado, se crea o asocia.
- Se envia correo con la nueva informacion.
- La accion queda auditada.

## HU-INV-03 - Reenviar invitacion por correo

Como super administrador, quiero reenviar la ultima invitacion de un correo, para resolver casos donde no tengo el id de invitacion a mano.

Criterios de aceptacion:

- El correo se normaliza.
- Debe existir una invitacion previa para ese correo.
- No se puede reenviar si la invitacion esta usada.
- El comportamiento de credenciales nuevas es igual al reenvio por id.

## HU-INV-04 - Listar invitaciones

Como super administrador, quiero listar invitaciones, para ver estado de incorporacion de usuarios.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede listar invitaciones.
- Se puede filtrar por estado o correo.
- El listado queda auditado.

## HU-INV-05 - Consultar ultima invitacion por correo

Como super administrador, quiero consultar la ultima invitacion asociada a un correo, para diagnosticar problemas de acceso.

Criterios de aceptacion:

- Debe existir invitacion para el correo.
- Si no existe, se informa como no encontrada.
- La consulta queda auditada.

## HU-INV-06 - Marcar invitacion como usada

Como sistema, quiero marcar una invitacion como usada cuando el usuario completa el flujo correspondiente, para cerrar la puerta temporal.

Criterios de aceptacion:

- Se registra `usedAt`.
- Se asocia el usuario que uso la invitacion.
- La invitacion cambia a estado `USED`.
- La accion puede quedar auditada.

## Estados relevantes

### Estado de perfil

- `INCOMPLETE`: usuario creado o invitado que aun no termino datos operativos.
- `COMPLETE`: usuario listo para operar segun su rol.

### Estado de invitacion

- `PENDING`: invitacion activa o reutilizable antes de vencimiento.
- `USED`: invitacion consumida.
- `EXPIRED`: invitacion vencida o invalidada.
