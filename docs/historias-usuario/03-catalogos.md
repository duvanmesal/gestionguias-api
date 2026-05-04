# 03. Catalogos de Paises y Buques

## Proposito del dominio

Los catalogos soportan la operacion portuaria. Paises y buques son datos maestros usados para crear recaladas, filtrar agendas y mantener consistencia historica.

## Actores principales

- `SUPER_ADMIN`: administra creacion masiva, creacion directa y eliminaciones sensibles.
- `SUPERVISOR`: consulta y actualiza datos necesarios para operar.
- `GUIA`: no administra catalogos; consume informacion de buques/paises a traves de recaladas, atenciones y turnos.

## HU-CAT-01 - Consultar paises

Como supervisor, quiero consultar paises, para usarlos en busquedas, filtros y registro de recaladas.

Criterios de aceptacion:

- El usuario debe estar autenticado.
- `SUPERVISOR` y `SUPER_ADMIN` pueden listar y consultar paises.
- El listado soporta paginacion y filtros definidos por el modulo.
- El lookup devuelve informacion reducida para formularios.

## HU-CAT-02 - Crear pais

Como super administrador, quiero crear un pais, para mantener actualizado el catalogo base.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede crear paises.
- `codigo` y `nombre` deben cumplir validaciones de longitud.
- Si no se informa estado, el pais se crea `ACTIVO`.
- El codigo debe respetar unicidad segun reglas de base de datos.

## HU-CAT-03 - Actualizar pais

Como supervisor, quiero actualizar datos de un pais, para corregir errores o ajustar su estado.

Criterios de aceptacion:

- `SUPERVISOR` y `SUPER_ADMIN` pueden actualizar.
- El pais debe existir.
- Solo se actualizan campos enviados.
- El estado puede cambiarse entre valores administrativos permitidos.

## HU-CAT-04 - Eliminar pais

Como super administrador, quiero eliminar un pais sin dependencias, para limpiar datos que no se usan.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede eliminar.
- El pais debe existir.
- No se puede eliminar si tiene buques asociados.
- Si tiene dependencias, el sistema rechaza la accion para proteger historial y relaciones.

## HU-CAT-05 - Cargar paises masivamente

Como super administrador, quiero cargar paises en lote, para ahorrar tiempo al preparar el sistema.

Criterios de aceptacion:

- El lote puede recibirse como JSON o archivo compatible.
- Cada item se valida de forma independiente.
- El sistema reporta creados, actualizados, omitidos y fallidos.
- `dryRun` permite simular sin persistir.
- `CREATE_ONLY` solo crea nuevos y omite existentes.
- `UPSERT` crea nuevos y actualiza existentes si hay cambios.
- Los duplicados dentro del payload se reportan como errores por item.
- Un error en un item no debe tumbar todo el lote.

## HU-CAT-06 - Consultar buques

Como supervisor, quiero consultar buques, para crear recaladas y revisar la agenda por embarcacion.

Criterios de aceptacion:

- El usuario debe estar autenticado.
- `SUPERVISOR` y `SUPER_ADMIN` pueden listar, consultar y usar lookup.
- El listado soporta paginacion y filtros definidos por el modulo.
- El lookup devuelve datos minimos para formularios y seleccion rapida.

## HU-CAT-07 - Crear buque

Como super administrador, quiero registrar un buque, para poder programar recaladas asociadas.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede crear buques.
- El buque debe tener codigo y nombre validos.
- Puede tener pais, capacidad y naviera.
- Si se informa `paisId`, el pais debe existir.
- Si no se informa estado, se crea `ACTIVO`.

## HU-CAT-08 - Actualizar buque

Como supervisor, quiero actualizar datos de un buque, para corregir informacion operativa.

Criterios de aceptacion:

- `SUPERVISOR` y `SUPER_ADMIN` pueden actualizar.
- El buque debe existir.
- Si se informa `paisId`, debe existir.
- Solo se actualizan los campos enviados.

## HU-CAT-09 - Retirar buque del uso operativo

Como super administrador, quiero retirar un buque del catalogo operativo, para evitar que se siga usando sin perder historial.

Criterios de aceptacion:

- Solo `SUPER_ADMIN` puede ejecutar la accion.
- El buque debe existir.
- Si ya esta `INACTIVO`, la accion es idempotente y devuelve el registro actual.
- Si esta activo, se marca como `INACTIVO`.

Regla de negocio:

- A diferencia de paises, el buque se retira por inactivacion, no por borrado fisico directo, para proteger recaladas historicas.

## HU-CAT-10 - Cargar buques masivamente

Como super administrador, quiero cargar buques en lote, para poblar rapidamente el catalogo.

Criterios de aceptacion:

- El lote puede recibirse como JSON o archivo compatible.
- Cada item se valida individualmente.
- El sistema reporta creados, actualizados, omitidos y fallidos.
- `dryRun` permite simular sin persistir.
- `CREATE_ONLY` crea nuevos y omite existentes.
- `UPSERT` crea o actualiza segun corresponda.
- Los duplicados de codigo dentro del payload se reportan como errores.
- Si un `paisId` no existe, el item falla.
- Si un buque ya tiene recaladas, cambios sensibles como nombre o pais se bloquean salvo que se use `force=true`.
- Un error en un item no debe detener el procesamiento del resto.

## Reglas transversales de catalogos

- Los catalogos son soporte del dominio operativo, no entidades aisladas.
- No se deben eliminar o alterar datos de forma que rompan recaladas historicas.
- Los lookups existen para formularios y deben devolver informacion minima.
- Las cargas masivas deben ser explicitas sobre resultados parciales.
- Los estados administrativos permiten ocultar o retirar datos sin borrar historial.
