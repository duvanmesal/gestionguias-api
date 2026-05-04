# 04. Operacion: Recaladas, Atenciones y Turnos

## Proposito del dominio operativo

La operacion se organiza en tres niveles:

1. `Recalada`: evento madre de llegada/salida de un buque.
2. `Atencion`: ventana operativa dentro de una recalada.
3. `Turno`: cupo materializado dentro de una atencion, asignable a un guia.

La regla central es que ningun nivel inferior puede operar si el nivel superior ya no lo permite.

## Ciclo general

1. Un supervisor registra una recalada programada.
2. El supervisor crea una o mas atenciones dentro de la ventana de la recalada.
3. Cada atencion materializa turnos numerados `1..N`.
4. Los turnos pueden ser asignados por supervisor o reclamados por guias.
5. El guia ejecuta el turno con check-in y check-out.
6. El supervisor cierra o cancela atenciones cuando la operacion termina.
7. La recalada se marca como arribada y luego zarpada.

## Estados principales

### Recalada

- `SCHEDULED`: puede editarse ampliamente, crear atenciones y registrar arribo.
- `ARRIVED`: solo permite ajustes limitados y luego zarpe.
- `DEPARTED`: bloquea cambios operativos.
- `CANCELED`: bloquea cambios operativos.

### Atencion

- `OPEN`: puede operar.
- `CLOSED`: ya no permite actividad operativa.
- `CANCELED`: conserva historial pero bloquea actividad.

### Turno

- `AVAILABLE`: libre para asignar o reclamar.
- `ASSIGNED`: asignado a un guia, pendiente de ejecucion.
- `IN_PROGRESS`: guia hizo check-in.
- `COMPLETED`: guia hizo check-out.
- `CANCELED`: cancelado manualmente.
- `NO_SHOW`: el guia no se presento.

---

# Recaladas

## HU-REC-01 - Crear recalada

Como supervisor, quiero crear una recalada, para registrar la llegada programada de un buque y abrir la posibilidad de planificar atenciones.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden crear recaladas.
- Debe existir el buque.
- Debe existir el pais de origen.
- Si se informa `fechaSalida`, debe ser mayor o igual a `fechaLlegada`.
- Si la fuente no es `IMPORT`, `fechaSalida` no puede estar en el pasado.
- `pasajerosEstimados`, si se informa, debe ser mayor o igual a 1.
- No puede existir otra recalada activa del mismo buque con ventana solapada.
- Si el actor no tiene fila de supervisor, el sistema la crea automaticamente.
- El codigo final se genera con formato operativo `RA-YYYY-000123`.
- La recalada nace con estado operativo `SCHEDULED`.
- La accion queda auditada y notificada a supervisores.

## HU-REC-02 - Listar recaladas

Como usuario autenticado, quiero consultar recaladas, para ver la agenda operativa segun mi rol.

Criterios de aceptacion:

- Cualquier usuario autenticado puede consultar.
- El listado soporta filtros por rango de fechas, estado operativo, buque, pais y busqueda libre.
- El filtro temporal usa solapamiento entre `fechaLlegada` y `fechaSalida`.
- Si `fechaSalida` es nula, la recalada se trata como evento abierto o puntual segun el filtro.
- El orden natural es por `fechaLlegada` ascendente.

## HU-REC-03 - Ver detalle de recalada

Como usuario autenticado, quiero ver el detalle de una recalada, para tomar decisiones informadas sobre la operacion.

Criterios de aceptacion:

- La recalada debe existir.
- El detalle incluye buque, pais, supervisor, fechas, estado administrativo y estado operativo.
- Consultar detalle no cambia estados.

## HU-REC-04 - Editar recalada programada

Como supervisor, quiero editar una recalada en estado `SCHEDULED`, para corregir la planificacion antes de la operacion real.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden editar.
- Si la recalada esta `DEPARTED` o `CANCELED`, no se puede editar.
- En `SCHEDULED`, se permiten cambios de buque, pais, fechas, terminal, muelle, estimados, observaciones y fuente.
- Si se cambia buque o fechas, se revalida solapamiento del buque.
- Si se cambia la ventana, ninguna atencion activa o cerrada puede quedar fuera del nuevo rango.
- Si cambia `buqueId`, el nuevo buque debe existir.
- Si cambia `paisOrigenId`, el nuevo pais debe existir.
- `fechaSalida` debe ser mayor o igual a `fechaLlegada`.
- La accion queda auditada y notificada.

## HU-REC-05 - Editar recalada ya arribada

Como supervisor, quiero hacer ajustes limitados a una recalada `ARRIVED`, para mantener actualizada informacion operativa aun despues del arribo.

Criterios de aceptacion:

- Solo se permiten campos que todavia tienen sentido operativo: salida programada, terminal, muelle, estimados y observaciones.
- No se permite cambiar buque, pais ni llegada programada.
- `fechaSalida`, si cambia, debe ser coherente con `fechaLlegada`.
- Ninguna atencion existente puede quedar fuera de la nueva ventana.

## HU-REC-06 - Marcar arribo

Como supervisor, quiero marcar que una recalada arribo, para iniciar formalmente la operacion real del buque.

Criterios de aceptacion:

- La recalada debe existir.
- Solo se puede marcar `ARRIVED` desde `SCHEDULED`.
- No se puede marcar si ya esta `ARRIVED`, `DEPARTED` o `CANCELED`.
- Si no se envia `arrivedAt`, el sistema usa `now()`.
- Si se envia `arrivedAt`, no puede ser futuro.
- `arrivedAt` no puede ser mas de 24 horas antes de la llegada programada.
- Al arribar, se limpia cualquier rastro defensivo de cancelacion.
- La accion queda auditada y notificada.

## HU-REC-07 - Marcar zarpe

Como supervisor, quiero marcar que una recalada zarpo, para cerrar la operacion del buque.

Criterios de aceptacion:

- La recalada debe existir.
- Solo se puede marcar `DEPARTED` desde `ARRIVED`.
- No se puede zarpar una recalada `SCHEDULED`, `CANCELED` o ya `DEPARTED`.
- Si se envia `departedAt`, no puede ser futuro.
- Si existe `arrivedAt`, `departedAt` debe ser posterior al arribo.
- `departedAt` no puede ser mas de 24 horas antes de la salida programada.
- No se puede marcar zarpe si existen atenciones `OPEN`.
- La accion queda auditada y notificada.

## HU-REC-08 - Cancelar recalada

Como supervisor, quiero cancelar una recalada sin actividad dependiente, para reflejar cambios operativos sin dejar inconsistencias.

Criterios de aceptacion:

- La recalada debe existir.
- No se puede cancelar si esta `DEPARTED`.
- No se puede cancelar si ya esta `CANCELED`.
- Si esta `ARRIVED`, solo `SUPER_ADMIN` puede cancelarla.
- No se puede cancelar si tiene atenciones o turnos activos.
- Al cancelar, se registra `canceledAt` y `cancelReason`.
- La accion queda auditada y notificada.

## HU-REC-09 - Eliminar recalada sin uso

Como supervisor, quiero eliminar fisicamente una recalada sin dependencias, para corregir errores de carga.

Criterios de aceptacion:

- La recalada debe existir.
- Solo se permite si esta `SCHEDULED`.
- No debe tener atenciones.
- No debe tener turnos.
- La respuesta confirma `{ deleted: true, id }`.
- La accion queda auditada.

## HU-REC-10 - Consultar atenciones de recalada

Como usuario autenticado, quiero ver las atenciones de una recalada, para entender como se organizo la operacion del buque.

Criterios de aceptacion:

- La recalada debe existir.
- Las atenciones se ordenan por `fechaInicio` ascendente.
- La respuesta conserva informacion suficiente para tabs de detalle y turnero.

---

# Atenciones

## HU-ATE-01 - Crear atencion

Como supervisor, quiero crear una atencion dentro de una recalada, para abrir una ventana concreta de servicio con cupos.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden crear.
- La recalada debe existir.
- La recalada debe estar activa y no cancelada ni zarpada.
- La fecha de salida de la recalada no puede estar vencida.
- `fechaFin` debe ser mayor o igual a `fechaInicio`.
- La ventana de atencion debe estar dentro de la ventana de la recalada.
- La ventana no puede estar en el pasado.
- No puede solaparse con otra atencion activa de la misma recalada.
- `turnosTotal` debe ser entero mayor o igual a 1.
- Si el actor no tiene fila de supervisor, el sistema la crea automaticamente.
- Al crear la atencion, el sistema crea turnos numerados `1..N`.
- Cada turno hereda `fechaInicio` y `fechaFin` de la atencion.
- La accion queda auditada y notificada.

## HU-ATE-02 - Listar atenciones

Como usuario autenticado, quiero listar atenciones, para revisar ventanas de servicio y su disponibilidad.

Criterios de aceptacion:

- Cualquier usuario autenticado puede listar.
- Se soportan filtros por recalada, supervisor, estado administrativo, estado operativo y rango temporal.
- El filtro temporal usa solapamiento de ventanas.
- El orden es por `fechaInicio` ascendente.
- La paginacion limita el volumen de resultados.

## HU-ATE-03 - Ver detalle de atencion

Como usuario autenticado, quiero ver el detalle de una atencion, para consultar recalada, supervisor y turnos relacionados.

Criterios de aceptacion:

- La atencion debe existir.
- La respuesta incluye recalada, supervisor y turnos ordenados.
- Consultar detalle no modifica estados.

## HU-ATE-04 - Editar atencion

Como supervisor, quiero editar una atencion, para ajustar planificacion sin romper turnos existentes.

Criterios de aceptacion:

- La atencion debe existir.
- No se puede editar si esta `CANCELED` o `CLOSED`.
- Si cambia la ventana, se revalidan fechas, operabilidad de recalada, rango dentro de recalada, no pasado y no solapamiento.
- Si cambia la ventana, no deben existir turnos `ASSIGNED` o `IN_PROGRESS`.
- Si cambia la ventana, solo se actualizan turnos sin guia.
- Si aumenta `turnosTotal`, se crean turnos nuevos con numeros consecutivos.
- Si reduce `turnosTotal`, no pueden existir turnos asignados en numeros mayores al nuevo total.
- La accion queda auditada y notificada.

## HU-ATE-05 - Cancelar atencion

Como supervisor, quiero cancelar una atencion, para cerrar una ventana operativa que ya no se realizara.

Criterios de aceptacion:

- La atencion debe existir.
- Si ya esta `CANCELED`, el sistema responde con la atencion sin cambiarla.
- No se puede cancelar si esta `CLOSED`.
- No se puede cancelar si la recalada esta `CANCELED` o `DEPARTED`.
- No se puede cancelar si existen turnos `IN_PROGRESS`.
- Al cancelar, la atencion pasa a `CANCELED`.
- Los turnos `AVAILABLE` y `ASSIGNED` pasan a `CANCELED`.
- Se registra motivo, fecha y usuario que cancela.
- La accion queda auditada y notificada.

## HU-ATE-06 - Cerrar atencion

Como supervisor, quiero cerrar una atencion, para declarar terminada una ventana de servicio.

Criterios de aceptacion:

- La atencion debe existir.
- Si ya esta `CLOSED`, el sistema responde sin cambios.
- No se puede cerrar si esta `CANCELED`.
- No se puede cerrar si la recalada esta `CANCELED` o `DEPARTED`.
- No se puede cerrar si hay turnos `AVAILABLE`, `ASSIGNED` o `IN_PROGRESS`.
- Al cerrar, `operationalStatus` pasa a `CLOSED`.
- La accion queda auditada y notificada.

## HU-ATE-07 - Ver turnos de una atencion

Como usuario autenticado, quiero ver los turnos de una atencion, para revisar disponibilidad, asignaciones y avance operativo.

Criterios de aceptacion:

- La atencion debe existir.
- Los turnos se ordenan por `numero` ascendente.
- La respuesta conserva un formato compatible con la interfaz: id, numero, estado, guia, check-in, check-out y cancelacion.

## HU-ATE-08 - Ver resumen de cupos

Como supervisor, quiero ver contadores por estado de turno, para entender rapidamente la cobertura de una atencion.

Criterios de aceptacion:

- La atencion debe existir.
- El resumen devuelve total, disponibles, asignados, en progreso, completados, cancelados y no-show.
- Los conteos se calculan desde los turnos materializados.

## HU-ATE-09 - Autoclaim del primer turno disponible

Como guia, quiero tomar automaticamente el primer cupo disponible de una atencion, para participar en la operacion sin que el supervisor me asigne manualmente.

Criterios de aceptacion:

- El usuario debe estar asociado a un guia activo.
- La atencion debe existir.
- La atencion y la recalada deben permitir operacion.
- El guia no puede tener un turno en curso.
- El guia no puede tener ya un turno en esa atencion.
- El sistema toma el primer turno `AVAILABLE` por numero ascendente.
- Si el turno tiene ventana horaria, el guia no puede tener otro turno asignado o en curso que se solape.
- La asignacion es atomica y protegida contra concurrencia.
- Si no hay cupos disponibles, se informa conflicto.

---

# Turnos

## HU-TUR-01 - Listar turnos para supervision

Como supervisor, quiero listar turnos con filtros, para monitorear cobertura y resolver incidencias.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden listar todos los turnos.
- Se puede filtrar por atencion, recalada, estado, guia, asignacion y rango de fechas.
- Si no se especifica rango, el sistema usa el rango por defecto definido para la operacion.
- Los resultados se ordenan por fecha, atencion y numero.

## HU-TUR-02 - Listar mis turnos

Como guia, quiero listar mis turnos, para saber mis compromisos operativos.

Criterios de aceptacion:

- Solo `GUIA` puede usar el listado personal.
- El sistema resuelve el `guiaId` desde el usuario autenticado.
- El guia solo ve sus turnos.
- Se respetan filtros y paginacion disponibles para el flujo personal.

## HU-TUR-03 - Consultar mi proximo turno

Como guia, quiero ver mi proximo turno, para prepararme para la siguiente atencion.

Criterios de aceptacion:

- El guia debe existir y estar asociado al usuario.
- Se busca entre turnos `ASSIGNED` e `IN_PROGRESS`.
- Se ordena por `fechaInicio`, atencion y numero.
- Si no hay turno, se devuelve `null`.

## HU-TUR-04 - Consultar mi turno activo

Como guia, quiero ver mi turno en curso, para continuar la atencion sin perder contexto.

Criterios de aceptacion:

- El guia debe existir y estar asociado al usuario.
- Se busca un turno `IN_PROGRESS`.
- Si no hay turno activo, se devuelve `null`.

## HU-TUR-05 - Ver detalle de turno

Como usuario autorizado, quiero ver el detalle de un turno, para conocer su estado y contexto operativo.

Criterios de aceptacion:

- Supervisores y super administradores pueden ver cualquier turno.
- Un guia solo puede ver turnos asignados a el.
- Si un guia intenta ver turno ajeno, se rechaza.

## HU-TUR-06 - Reclamar turno especifico

Como guia, quiero tomar un turno especifico disponible, para elegir un cupo concreto.

Criterios de aceptacion:

- El usuario debe estar asociado a un guia activo.
- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- El guia no puede tener turno en curso.
- El turno debe estar `AVAILABLE` y sin guia.
- El guia no puede tener otro turno en la misma atencion.
- Si hay ventana, no puede existir solapamiento con otro turno asignado o en curso del guia.
- La actualizacion es atomica.

## HU-TUR-07 - Asignar turno manualmente

Como supervisor, quiero asignar un turno a un guia, para coordinar manualmente la cobertura.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden asignar manualmente.
- El guia debe existir y estar activo.
- El guia no puede tener turno en curso.
- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- El turno debe estar `AVAILABLE` y sin guia.
- El guia no puede tener otro turno en la misma atencion.
- No puede existir solapamiento de horario con otro turno asignado o en curso.
- La asignacion es atomica.
- La accion queda auditada y notificada.

## HU-TUR-08 - Liberar turno asignado

Como guia o supervisor, quiero liberar un turno asignado, para devolver el cupo a disponibilidad cuando aun no inicio.

Criterios de aceptacion:

- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- Si el actor es `GUIA`, solo puede liberar sus propios turnos.
- No se puede liberar un turno `IN_PROGRESS` o `COMPLETED`.
- Solo se puede liberar un turno `ASSIGNED`.
- Al liberar, `guiaId` pasa a `null` y el estado vuelve a `AVAILABLE`.
- La accion queda auditada y notificada.

## HU-TUR-09 - Cancelar turno

Como supervisor, quiero cancelar un turno, para reflejar que ese cupo ya no estara disponible sin borrar historial.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden cancelar.
- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- Solo se puede cancelar si esta `AVAILABLE` o `ASSIGNED`.
- No se puede cancelar `IN_PROGRESS`, `COMPLETED`, `CANCELED` ni `NO_SHOW`.
- Se registra motivo opcional, fecha y usuario que cancela.
- La accion queda auditada y notificada.

## HU-TUR-10 - Hacer check-in

Como guia, quiero iniciar mi turno, para registrar que estoy atendiendo la operacion.

Criterios de aceptacion:

- Solo `GUIA` puede hacer check-in.
- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- El turno debe estar `ASSIGNED`.
- El turno debe tener guia asignado.
- El guia autenticado debe ser el guia asignado.
- No se puede hacer check-in mas de 30 minutos antes de `fechaInicio`.
- No se puede hacer check-in despues de `fechaFin`.
- Si la regla FIFO se habilita, no puede haber turnos anteriores pendientes.
- La transicion a `IN_PROGRESS` es atomica.
- La accion queda auditada y notificada.

## HU-TUR-11 - Hacer check-out

Como guia, quiero finalizar mi turno, para registrar que complete la atencion.

Criterios de aceptacion:

- Solo `GUIA` puede hacer check-out.
- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- El turno debe estar `IN_PROGRESS`.
- El turno debe tener guia asignado.
- El guia autenticado debe ser el guia asignado.
- No se puede hacer check-out antes de `fechaInicio`.
- La transicion a `COMPLETED` es atomica.
- La accion queda auditada y notificada.

## HU-TUR-12 - Marcar no-show

Como supervisor, quiero marcar que un guia no se presento, para conservar la metrica de inasistencia.

Criterios de aceptacion:

- Solo `SUPERVISOR` y `SUPER_ADMIN` pueden marcar no-show.
- El turno debe existir.
- La atencion y la recalada deben permitir operacion.
- Solo se puede marcar `NO_SHOW` desde `ASSIGNED`.
- No se puede marcar no-show antes de `fechaInicio`.
- La razon se agrega a observaciones sin perder observaciones previas.
- La transicion es atomica.
- La accion queda auditada y notificada.

## Reglas de consistencia entre niveles

- Un turno no puede operar si su atencion no esta `OPEN`.
- Un turno no puede operar si su recalada esta `CANCELED` o `DEPARTED`.
- Una atencion no puede cambiar ventana si deja turnos asignados con horarios antiguos.
- Una recalada no puede reducir su ventana si deja atenciones por fuera.
- El cierre de atencion exige que no queden turnos vivos.
- El zarpe de recalada exige que no queden atenciones abiertas.

## Reglas de concurrencia

- Claim y asignacion usan actualizaciones condicionales para evitar dobles asignaciones.
- Las restricciones unicas de base de datos actuan como ultima barrera.
- Ante conflicto concurrente, el sistema responde con conflicto controlado y no deja estado parcial.

## Eventos operativos esperados

- `recalada:created`, `recalada:updated`, `recalada:arrived`, `recalada:departed`, `recalada:canceled`
- `atencion:updated`, `atencion:canceled`
- `turno:assigned`, `turno:claimed`, `turno:unassigned`, `turno:canceled`, `turno:checkedIn`, `turno:checkedOut`, `turno:noShow`

Estos eventos permiten que front web y mobile refresquen dashboard, turnero y detalles sin depender solo de recargas manuales.
