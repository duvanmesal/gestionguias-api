# Catálogos: países, buques, puertos y muelles

Última revisión contra código: 2026-06-04.

Fuente principal: `src/routes/pais.routes.ts`, `src/routes/buque.routes.ts`, `src/routes/puerto.routes.ts`, `src/routes/muelle.routes.ts`, `src/modules/paises/*`, `src/modules/buques/*`, `src/modules/puertos/*`, `src/modules/muelles/*`.

## Propósito

Los catálogos soportan la operación de recaladas. `Pais` representa países de origen o relación con buques. `Buque` representa embarcaciones usadas por recaladas. `Puerto` y `Muelle` representan referencias logísticas independientes; un muelle pertenece a un puerto y ambos pueden asociarse gradualmente a recaladas sin eliminar los campos de texto legados `terminal` y `muelle`.

Ambos usan `StatusType`:

- `ACTIVO`
- `INACTIVO`
- `SUSPENDIDO`

## Reglas de acceso

Todas las rutas requieren autenticación.

| Acción | Roles |
| --- | --- |
| Lookup | `SUPERVISOR`, `SUPER_ADMIN` |
| Listar y detalle | `SUPERVISOR`, `SUPER_ADMIN` |
| Crear | `SUPER_ADMIN` |
| Carga masiva | `SUPER_ADMIN` |
| Editar | `SUPERVISOR`, `SUPER_ADMIN` |
| Eliminar/inactivar | `SUPER_ADMIN` |

## Países

### Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/paises/lookup` | Lista reducida para selects operativos. |
| `GET` | `/paises` | Lista paginada con filtros. |
| `GET` | `/paises/:id` | Detalle por id. |
| `POST` | `/paises` | Crea país. |
| `POST` | `/paises/bulk` | Carga masiva JSON. |
| `POST` | `/paises/bulk/file` | Carga CSV/XLSX como body raw. |
| `PATCH` | `/paises/:id` | Edita país. |
| `DELETE` | `/paises/:id` | Elimina físicamente si es seguro. |

### Listado

`GET /paises`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `q` | string | - |
| `codigo` | string | - |
| `status` | `StatusType` | - |
| `page` | number | `1` |
| `pageSize` | number | `10`, máximo `100` |

### Crear país

`POST /paises`

```json
{
  "codigo": "CO",
  "nombre": "Colombia",
  "status": "ACTIVO"
}
```

Reglas:

- `codigo`: 2 a 10 caracteres.
- `nombre`: mínimo 2 caracteres.
- `status` es opcional.
- `codigo` y `nombre` son únicos por modelo Prisma.

### Editar país

`PATCH /paises/:id`

```json
{
  "nombre": "Colombia",
  "status": "ACTIVO"
}
```

Campos permitidos:

- `codigo`
- `nombre`
- `status`

### Eliminar país

`DELETE /paises/:id`

Reglas:

- Si no existe, `404`.
- Si tiene buques asociados, `409 CONFLICT`.
- Si no tiene buques, se elimina físicamente.

## Buques

### Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/buques/lookup` | Lista reducida para selects operativos. |
| `GET` | `/buques` | Lista paginada con filtros. |
| `GET` | `/buques/:id` | Detalle por id. |
| `POST` | `/buques` | Crea buque. |
| `POST` | `/buques/bulk` | Carga masiva JSON. |
| `POST` | `/buques/bulk/file` | Carga CSV/XLSX como body raw. |
| `PATCH` | `/buques/:id` | Edita buque. |
| `DELETE` | `/buques/:id` | Inactiva buque. |

### Listado

`GET /buques`

Query:

| Campo | Tipo | Default |
| --- | --- | --- |
| `q` | string | - |
| `paisId` | number | - |
| `status` | `StatusType` | - |
| `page` | number | `1` |
| `pageSize` | number | `10`, máximo `100` |

### Crear buque

`POST /buques`

```json
{
  "codigo": "SHIP-001",
  "nombre": "Caribbean Star",
  "paisId": 1,
  "capacidad": 2500,
  "naviera": "Naviera Demo",
  "status": "ACTIVO"
}
```

Reglas:

- `codigo`: 2 a 20 caracteres.
- `nombre`: mínimo 2 caracteres.
- `paisId` es opcional, pero si se envía debe existir.
- `capacidad` debe ser positiva y máximo `200000`.
- `naviera` debe tener 2 a 80 caracteres si se envía.
- `codigo` y `nombre` son únicos por modelo Prisma.

### Editar buque

`PATCH /buques/:id`

Campos permitidos:

- `codigo`
- `nombre`
- `paisId`
- `capacidad`
- `naviera`
- `status`

### Eliminar buque

`DELETE /buques/:id`

Reglas:

- Si no existe, `404`.
- Si ya está `INACTIVO`, devuelve el registro sin cambiarlo.
- Si está activo u otro estado, lo marca como `INACTIVO`.
- No hace eliminación física.

## Carga masiva JSON

### Países

`POST /paises/bulk`

```json
{
  "mode": "UPSERT",
  "dryRun": false,
  "items": [
    {
      "codigo": "CO",
      "nombre": "Colombia",
      "status": "ACTIVO"
    }
  ]
}
```

### Buques

`POST /buques/bulk`

```json
{
  "mode": "UPSERT",
  "dryRun": false,
  "force": false,
  "items": [
    {
      "codigo": "SHIP-001",
      "nombre": "Caribbean Star",
      "paisId": 1,
      "capacidad": 2500,
      "naviera": "Naviera Demo",
      "status": "ACTIVO"
    }
  ]
}
```

Campos comunes:

| Campo | Descripción |
| --- | --- |
| `mode` | `UPSERT` o `CREATE_ONLY`. Default: `UPSERT`. |
| `dryRun` | Si es `true`, valida y cuenta sin persistir. Default: `false`. |
| `items` | Entre 1 y 500 elementos. |

Campo exclusivo de buques:

| Campo | Descripción |
| --- | --- |
| `force` | Permite cambios sensibles sobre buques con recaladas cuando aplica. Default: `false`. |

Respuesta de carga:

```json
{
  "data": {
    "mode": "UPSERT",
    "dryRun": false,
    "requested": 1,
    "created": 1,
    "updated": 0,
    "skipped": 0,
    "failed": 0,
    "errors": []
  },
  "meta": null,
  "error": null
}
```

Para buques la respuesta incluye además `force`.

## Carga masiva por archivo

`POST /paises/bulk/file?mode=UPSERT&dryRun=false`

`POST /buques/bulk/file?mode=UPSERT&dryRun=false&force=false`

El body debe ser raw y el content-type puede ser:

- `text/csv`
- `text/plain`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `application/octet-stream`

Columnas soportadas:

| Catálogo | Columnas |
| --- | --- |
| Países | `codigo`, `nombre`, `status` |
| Buques | `codigo`, `nombre`, `paisId`, `capacidad`, `naviera`, `status` |

Las cabeceras se normalizan sin tildes, mayúsculas ni espacios.

## Reglas especiales de carga

Países:

- `codigo` es obligatorio por fila.
- En `CREATE_ONLY`, si el código ya existe se salta.
- En `UPSERT`, si no existe requiere `nombre`.
- Duplicados por `codigo` dentro del payload generan error por fila.

Buques:

- `codigo` es obligatorio por fila.
- `paisId`, si viene, debe existir.
- En `UPSERT`, si un buque existente tiene recaladas y `force=false`, se bloquea cambiar `nombre` o `paisId`.

## Puertos

### Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/puertos/lookup` | Lista reducida para selects operativos. |
| `GET` | `/puertos` | Lista paginada con filtros. |
| `GET` | `/puertos/:id` | Detalle por id. |
| `POST` | `/puertos` | Crea puerto. |
| `PATCH` | `/puertos/:id` | Edita puerto. |
| `DELETE` | `/puertos/:id` | Inactiva puerto si no tiene dependencias. |

### Campos principales

```json
{
  "codigo": "CTG",
  "nombre": "Puerto de Cartagena",
  "ciudad": "Cartagena",
  "paisId": 1,
  "status": "ACTIVO"
}
```

Filtros de listado: `q`, `paisId`, `status`, `page`, `pageSize`.

Reglas:

- `codigo` y `nombre` son únicos.
- `paisId` debe existir.
- No se elimina físicamente si tiene muelles o recaladas asociadas; se inactiva.
- Emite eventos realtime `catalog:puerto:created`, `catalog:puerto:updated` y `catalog:puerto:removed`.

## Muelles

### Rutas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/muelles/lookup` | Lista reducida para selects operativos; acepta `puertoId`. |
| `GET` | `/muelles` | Lista paginada con filtros. |
| `GET` | `/muelles/:id` | Detalle por id. |
| `POST` | `/muelles` | Crea muelle. |
| `PATCH` | `/muelles/:id` | Edita muelle. |
| `DELETE` | `/muelles/:id` | Inactiva muelle si no tiene dependencias. |

### Campos principales

```json
{
  "codigo": "M-1",
  "nombre": "Muelle principal",
  "puertoId": 1,
  "capacidadCruceros": 2,
  "status": "ACTIVO"
}
```

Filtros de listado: `q`, `puertoId`, `status`, `page`, `pageSize`.

Reglas:

- `codigo` es único por puerto.
- `puertoId` debe existir.
- No se elimina físicamente si tiene recaladas asociadas; se inactiva.
- Emite eventos realtime `catalog:muelle:created`, `catalog:muelle:updated` y `catalog:muelle:removed`.
- Duplicados por `codigo` dentro del payload generan error por fila.

## Auditoría

Eventos HTTP observados:

- `paises.list.http_ok`
- `paises.get.http_ok`
- `paises.create.http_ok`
- `paises.bulk.http_ok`
- `paises.bulk_file.http_ok`
- `paises.update.http_ok`
- `paises.remove.http_ok`
- `paises.lookup.http_ok`
- `buques.list.http_ok`
- `buques.get.http_ok`
- `buques.create.http_ok`
- `buques.bulk.http_ok`
- `buques.bulk_file.http_ok`
- `buques.update.http_ok`
- `buques.remove.http_ok`
- `buques.lookup.http_ok`
