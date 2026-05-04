# Dashboard y trazabilidad

Este documento describe las historias de usuario relacionadas con lectura ejecutiva de la operacion, actualizacion en tiempo real y trazabilidad tecnica/operativa.

El dashboard no reemplaza los flujos de gestion. Su objetivo es resumir el estado operativo segun el rol del usuario y permitir que front web y mobile muestren indicadores sin duplicar reglas de negocio.

---

## Principios funcionales

- El dashboard cambia segun el rol autenticado.
- El `SUPER_ADMIN` y el `SUPERVISOR` ven una lectura global de la operacion.
- El `GUIA` ve solo su operacion asignada, disponible o historica permitida.
- Los filtros de fecha y zona horaria deben interpretarse de forma consistente.
- Los widgets son datos derivados. No deben crear, editar ni cerrar entidades.
- La trazabilidad debe permitir reconstruir acciones relevantes del sistema sin exponer informacion sensible innecesaria.

---

## Historias de dashboard

### HU-DASH-01 - Consultar resumen operativo

**Como** usuario autenticado,  
**quiero** consultar un resumen operativo acorde a mi rol,  
**para** entender rapidamente que requiere atencion en la jornada.

**Criterios de aceptacion**

- El sistema identifica el rol desde la sesion autenticada.
- El usuario puede enviar una fecha de referencia.
- El usuario puede enviar `tzOffsetMinutes` para alinear la lectura diaria con la zona horaria del cliente.
- Si no se envia una fecha, el sistema usa la fecha actual.
- La respuesta mantiene una estructura estable para que web y mobile puedan renderizar widgets.

**Reglas de negocio**

- El backend calcula los indicadores; los clientes no deben reinterpretar estados para crear metricas propias incompatibles.
- La lectura diaria debe respetar el inicio y fin de dia segun la zona horaria recibida.
- Si un rol no tiene acceso a una metrica, el backend debe omitirla o devolverla en formato seguro, no delegar la restriccion al cliente.

---

### HU-DASH-02 - Ver panorama global de la operacion

**Como** supervisor o super administrador,  
**quiero** ver el estado global de recaladas, atenciones y turnos,  
**para** priorizar coordinacion y resolver bloqueos operativos.

**Criterios de aceptacion**

- El sistema muestra conteos de recaladas por estado.
- El sistema muestra conteos de atenciones por estado.
- El sistema muestra conteos de turnos por estado.
- El sistema informa actividad proxima o critica cuando existan hitos cercanos.
- El sistema presenta informacion de guias disponibles, asignados o con actividad, segun lo que soporte el calculo actual del backend.

**Reglas de negocio**

- Las metricas deben derivarse de los estados reales del dominio.
- Una recalada cancelada o salida no debe ser tratada como operacion activa.
- Una atencion cerrada o cancelada no debe contarse como pendiente operativa.
- Un turno cancelado, completado o marcado como inasistencia no debe contarse como actividad viva.

---

### HU-DASH-03 - Ver mi operacion como guia

**Como** guia,  
**quiero** ver mi turno activo, mi proximo turno y oportunidades disponibles,  
**para** organizar mi jornada desde mobile.

**Criterios de aceptacion**

- El sistema devuelve el turno activo del guia si existe.
- El sistema devuelve el proximo turno asignado si existe.
- El sistema puede devolver atenciones o turnos disponibles segun las reglas operativas vigentes.
- El sistema resume actividad reciente o semanal del guia cuando exista informacion suficiente.
- El guia no ve informacion operativa de otros guias salvo datos necesarios para el flujo permitido.

**Reglas de negocio**

- Un turno activo es aquel que se encuentra en progreso para el guia autenticado.
- El proximo turno debe estar asociado al guia y no estar en estado terminal.
- Las oportunidades disponibles deben respetar disponibilidad, ventana operativa y ausencia de conflictos de horario.
- El cliente mobile no debe inferir permisos de asignacion; debe consumir la respuesta ya filtrada por backend.

---

### HU-DASH-04 - Renderizar widgets sin duplicar reglas

**Como** frontend web o mobile,  
**quiero** recibir datos listos para representar widgets,  
**para** mostrar el dashboard sin reimplementar reglas de negocio.

**Criterios de aceptacion**

- La respuesta del dashboard contiene valores agregados y entidades resumidas.
- Los clientes pueden mostrar estados, cantidades y proximos hitos con datos del backend.
- Los clientes no necesitan consultar multiples endpoints para reconstruir el mismo resumen.

**Reglas de negocio**

- La semantica de estados vive en backend y documentacion funcional.
- Los clientes pueden ordenar, agrupar visualmente o formatear fechas, pero no cambiar el significado de un indicador.
- Si una regla cambia, se actualiza el backend y la documentacion antes de ajustar clientes.

---

### HU-DASH-05 - Actualizar vistas con eventos en tiempo real

**Como** usuario operativo,  
**quiero** que los cambios importantes se reflejen en tiempo real,  
**para** no tomar decisiones con informacion desactualizada.

**Criterios de aceptacion**

- El sistema emite eventos cuando cambian entidades operativas relevantes.
- Los clientes pueden refrescar vistas de recaladas, atenciones, turnos o dashboard al recibir eventos.
- Los eventos no sustituyen la lectura final desde API cuando se necesita consistencia completa.

**Reglas de negocio**

- Los eventos deben representar cambios ya persistidos.
- Un evento debe incluir suficiente contexto para que el cliente sepa que vista invalidar o refrescar.
- Los clientes deben tolerar eventos duplicados o recibidos fuera de orden mediante reconsulta cuando sea necesario.

---

## Historias de trazabilidad y logs

### HU-LOG-01 - Registrar eventos tecnicos y operativos

**Como** sistema,  
**quiero** registrar eventos tecnicos y operativos,  
**para** permitir auditoria, diagnostico y seguimiento de incidentes.

**Criterios de aceptacion**

- El sistema puede enviar eventos al servicio de logs.
- Cada evento identifica el servicio origen.
- Cada evento puede incluir nivel, tipo de evento, mensaje, usuario actor, entidad afectada y metadatos.
- Los eventos sensibles deben evitar exponer secretos, tokens o datos personales innecesarios.

**Reglas de negocio**

- La trazabilidad forma parte del producto y no debe eliminarse por simplificacion tecnica.
- Las acciones relevantes del dominio deben poder investigarse posteriormente.
- La ausencia temporal del servicio de logs no debe romper innecesariamente la operacion principal si el flujo esta diseñado para ser tolerante.

---

### HU-LOG-02 - Consultar logs con filtros

**Como** super administrador o responsable tecnico autorizado,  
**quiero** consultar logs filtrados,  
**para** investigar errores, acciones de usuario o eventos de una entidad.

**Criterios de aceptacion**

- El sistema permite filtrar por rango de fechas.
- El sistema permite filtrar por nivel, evento, servicio, usuario actor, request, entidad o texto.
- El sistema devuelve resultados paginados o limitados segun el contrato disponible.
- El sistema permite consultar el detalle de un log especifico cuando existe.

**Reglas de negocio**

- La consulta de logs es una capacidad administrativa, no una funcion publica.
- Los filtros deben facilitar investigacion sin exponer informacion fuera del alcance del usuario autorizado.
- Los metadatos deben ser utiles para auditoria sin romper privacidad ni seguridad.

---

### HU-LOG-03 - Consultar estadisticas de logs

**Como** responsable tecnico u operativo autorizado,  
**quiero** ver estadisticas de logs,  
**para** identificar patrones de error o eventos frecuentes.

**Criterios de aceptacion**

- El sistema puede agrupar logs por nivel.
- El sistema puede identificar eventos frecuentes.
- El sistema puede mostrar tendencias por fecha cuando existan datos.
- El sistema puede ayudar a detectar servicios o flujos con fallos recurrentes.

**Reglas de negocio**

- Las estadisticas son una lectura de soporte; no reemplazan la investigacion del detalle.
- Los conteos deben respetar los filtros recibidos.
- El sistema debe evitar que datos tecnicos internos se conviertan en informacion visible para roles no autorizados.

---

### HU-LOG-04 - Reconstruir una accion operativa

**Como** supervisor o super administrador,  
**quiero** reconstruir quien hizo una accion relevante y sobre que entidad,  
**para** resolver dudas operativas o auditorias internas.

**Criterios de aceptacion**

- Los eventos relevantes incluyen usuario actor cuando esta disponible.
- Los eventos incluyen entidad y `entityId` cuando aplican.
- Los eventos pueden correlacionarse mediante `requestId` cuando la solicitud lo tiene.
- Los metadatos ayudan a entender el antes, despues o motivo de una accion cuando el flujo lo soporta.

**Reglas de negocio**

- Acciones como asignar, cancelar, cerrar, marcar llegada, marcar salida, check-in, check-out o no-show son candidatas naturales a trazabilidad.
- La trazabilidad debe registrar hechos, no reemplazar las validaciones del dominio.
- Los logs no deben ser usados como fuente primaria para calcular el estado actual de la operacion.

---

## Eventos operativos que deben ser trazables

Estas acciones son especialmente relevantes para auditoria funcional:

- Creacion, actualizacion, cancelacion, llegada y salida de recaladas.
- Creacion, actualizacion, cierre y cancelacion de atenciones.
- Asignacion, toma, liberacion, cancelacion, check-in, check-out y no-show de turnos.
- Activacion, desactivacion o cambio de rol de usuarios.
- Creacion, reenvio y uso de invitaciones.
- Errores de autenticacion, refresh, cierre de sesiones y recuperacion de contrasena.

---

## Errores esperados

- `401` si la consulta no tiene autenticacion valida.
- `403` si el rol autenticado no tiene permiso.
- `404` si se consulta un recurso inexistente.
- `400` si los filtros o fechas son invalidos.
- `500` solo ante fallos inesperados del sistema.
