# Reglas transversales y criterios de consistencia

Este documento consolida reglas de negocio que atraviesan varios modulos. Su objetivo es evitar que las historias se interpreten de forma aislada y que los clientes web o mobile dupliquen decisiones que pertenecen al backend.

---

## Reglas de roles y permisos

### RT-01 - Roles reconocidos

El sistema reconoce los roles `SUPER_ADMIN`, `SUPERVISOR` y `GUIA`.

**Reglas**

- No se deben inventar roles nuevos sin una decision explicita del producto.
- `SUPER_ADMIN` administra configuracion, usuarios y operacion completa.
- `SUPERVISOR` opera y supervisa procesos del dominio segun permisos asignados.
- `GUIA` ejecuta flujos de campo y consulta su informacion operativa.

---

### RT-02 - Diferencia entre clientes web y mobile

El sistema distingue clientes `WEB` y `MOBILE`.

**Reglas**

- La sesion, navegacion, refresh y comportamiento del cliente pueden variar por plataforma.
- No se debe simplificar esta diferencia si afecta seguridad o experiencia operativa.
- Mobile prioriza ejecucion en campo; web prioriza administracion, supervision y gestion.

---

### RT-03 - Backend como fuente de reglas

El backend es la fuente de verdad para permisos, estados y validaciones de negocio.

**Reglas**

- Front y mobile no deben habilitar acciones solo por criterios visuales.
- Los clientes pueden ocultar botones por UX, pero el backend siempre debe validar.
- Las metricas, disponibilidad y conflictos operativos deben calcularse en backend.

---

## Reglas de estados

### RT-04 - Estados terminales

Los estados terminales no deben reabrirse o sobrescribirse salvo que exista un flujo explicito.

**Reglas**

- Un turno `COMPLETED`, `CANCELED` o `NO_SHOW` no debe volver a estados vivos por una accion ordinaria.
- Una atencion `CLOSED` o `CANCELED` no debe permitir operaciones de turnos vivos.
- Una recalada `DEPARTED` o `CANCELED` no debe permitir operacion activa.
- Las metricas deben conservar el significado historico de estados terminales.

---

### RT-05 - Separacion entre estado programado y estado real

Las fechas programadas y los momentos reales de ejecucion cumplen funciones distintas.

**Reglas**

- `fechaLlegada` y `fechaSalida` describen la ventana planificada de la recalada.
- `arrivedAt` y `departedAt` describen hechos operativos reales.
- `fechaInicio` y `fechaFin` definen la ventana programada de una atencion o turno.
- `checkInAt` y `checkOutAt` describen ejecucion real del guia.

---

### RT-06 - No aceptar hechos futuros como realizados

Una accion que marca un hecho como ocurrido no debe aceptar una fecha futura.

**Reglas**

- Marcar llegada de recalada requiere que `arrivedAt` no sea futuro.
- Marcar salida de recalada requiere que `departedAt` no sea futuro.
- Check-in y check-out deben respetar las ventanas operativas definidas.
- Una entidad no debe quedar en estado realizado con una fecha real posterior al momento actual.

---

## Reglas de ventanas y conflictos

### RT-07 - Jerarquia temporal

La recalada contiene atenciones y la atencion contiene turnos.

**Reglas**

- Una atencion debe estar dentro de la ventana de su recalada.
- Un turno debe estar dentro de la ventana de su atencion.
- Reducir una ventana padre no debe dejar hijos fuera de rango.
- Cambiar una ventana no debe invalidar actividad viva ya asignada.

---

### RT-08 - Conflicto de guia

Un guia no puede estar comprometido en dos turnos solapados.

**Reglas**

- La asignacion directa debe validar solapamientos.
- La toma voluntaria de turno debe validar solapamientos.
- La toma automatica debe validar solapamientos antes de asignar.
- Los estados terminales no deben bloquear disponibilidad futura.

---

### RT-09 - Actividad viva

Actividad viva significa que todavia puede afectar la operacion.

**Reglas**

- En turnos, actividad viva incluye estados como `AVAILABLE`, `ASSIGNED` e `IN_PROGRESS`, segun el flujo.
- En atenciones, actividad viva excluye estados terminales como `CLOSED` y `CANCELED`.
- En recaladas, actividad viva excluye `DEPARTED` y `CANCELED`.
- Las validaciones deben distinguir entre historial y actividad pendiente.

---

## Reglas de errores

### RT-10 - Semantica HTTP

Los errores deben comunicar el tipo de problema sin cambiar contratos innecesariamente.

**Reglas**

- `400` indica datos invalidos o accion temporalmente invalida por parametros.
- `401` indica falta de autenticacion valida.
- `403` indica autenticacion valida sin permiso suficiente.
- `404` indica recurso inexistente o no visible para el usuario.
- `409` indica conflicto con el estado actual del dominio.

---

### RT-11 - Mensajes utiles para clientes

Los errores de negocio deben ser accionables.

**Reglas**

- El mensaje debe explicar por que no se puede ejecutar la accion.
- El mensaje no debe filtrar informacion sensible.
- Los clientes pueden mostrar el mensaje o mapearlo a una traduccion visual.
- No se debe devolver exito cuando la accion fue rechazada por regla de negocio.

---

## Reglas de auditoria

### RT-12 - Eventos auditables

Las acciones relevantes deben dejar rastro.

**Reglas**

- Cambios de estado operativo son auditables.
- Cambios de usuarios, roles, activacion o invitaciones son auditables.
- Flujos sensibles de autenticacion son auditables.
- Los logs deben incluir actor, entidad y contexto cuando aplique.

---

### RT-13 - Privacidad de logs

La trazabilidad no justifica exponer secretos.

**Reglas**

- No registrar contrasenas, tokens, codigos de recuperacion ni secretos completos.
- Reducir o enmascarar datos sensibles en metadatos.
- Registrar suficiente contexto para investigar sin comprometer seguridad.

---

## Reglas de compatibilidad

### RT-14 - Contratos publicos estables

Las rutas, parametros y shapes de respuesta deben mantenerse estables salvo decision explicita.

**Reglas**

- Si una regla nueva agrega un error, debe documentarse.
- Si una respuesta cambia de shape, se debe revisar impacto en front y mobile.
- Si un endpoint se vuelve mas restrictivo, se debe revisar el flujo del cliente que lo consume.

---

### RT-15 - Documentacion como parte del cambio

Cuando una regla visible cambia, la documentacion debe cambiar con ella.

**Reglas**

- Las historias de usuario deben reflejar el comportamiento real.
- Los documentos tecnicos existentes deben seguir siendo coherentes.
- No se debe documentar comportamiento aspiracional como si ya estuviera implementado.

---

## Criterios de aceptacion transversales

Una historia de usuario operativa esta completa cuando:

- Define actor, intencion y beneficio.
- Explica precondiciones relevantes.
- Describe criterios de aceptacion verificables.
- Enumera reglas de negocio que el backend debe proteger.
- Considera estados terminales y conflictos de horario si aplica.
- Considera impacto en dashboard o trazabilidad si aplica.
- No rompe diferencias entre web y mobile.
- Mantiene contratos publicos existentes salvo decision explicita.

---

## Matriz rapida por dominio

| Dominio | Fuente principal de reglas | Riesgo principal | Validacion esperada |
| --- | --- | --- | --- |
| Autenticacion | Sesion, token, cliente y rol | Acceso indebido | `401`, `403`, refresh seguro |
| Usuarios | Perfil, rol, estado activo | Privilegios incorrectos | Permisos por rol y estado |
| Invitaciones | Email, rol, expiracion y uso | Acceso no autorizado | Token valido, un solo uso |
| Catalogos | Paises y buques | Borrar datos usados | Bloqueo o inactivacion segura |
| Recaladas | Ventana y estado operativo | Operar sobre recalada cerrada | Gate por estado y fechas |
| Atenciones | Ventana dentro de recalada | Turnos fuera de rango | Validacion contra recalada y turnos |
| Turnos | Guia, horario y estado | Doble asignacion o metricas rotas | Solapamiento y estados terminales |
| Dashboard | Datos derivados por rol | Metrica inconsistente | Calculo centralizado en backend |
| Logs | Actor, evento y entidad | Trazabilidad incompleta | Eventos con contexto seguro |

---

## Decisiones que no deben asumirse

Estas decisiones requieren confirmacion de producto antes de implementarse como regla nueva:

- Reabrir una atencion cerrada.
- Reabrir una recalada cancelada o salida.
- Permitir reasignacion de turnos completados o no-show.
- Permitir que un guia haga check-out antes de iniciar formalmente el turno.
- Cambiar la semantica de disponibilidad de un guia.
- Introducir nuevos roles o permisos granulares no existentes.
- Usar logs como fuente primaria de estado operativo.
