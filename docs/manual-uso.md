# Manual de uso: Configuracion de areas

## 1. Objetivo

La configuracion de areas permite definir la estructura organizacional de la empresa para:

- organizar colaboradores por sector;
- heredar calendarios de medicion;
- asignar KPIs por area o equipo;
- preparar integraciones externas cuando sea necesario.

En la aplicacion, las areas se crean dentro del modulo **Configuracion**, en la seccion **Estructura Organizacional**.

## 2. Donde se configura

Ruta de uso:

1. Ingresar a **Configuracion**.
2. Ir a la tarjeta **Estructura Organizacional**.
3. Hacer clic en **Nueva unidad**.
4. En el campo **Tipo**, seleccionar **Area**.

## 3. Cuando conviene crear un area

Conviene crear un area cuando necesitas representar un sector estable de la organizacion, por ejemplo:

- Administracion
- Comercial
- Operaciones
- Tecnologia
- Recursos Humanos

No conviene usar un area para cualquier subdivision temporal o informal. Si la unidad depende de otra area y es mas especifica, normalmente corresponde crear un **Equipo**.

## 4. Campos del formulario

### 4.1 Nombre

Que cargar:

- el nombre con el que la unidad sera conocida dentro del sistema.

Ejemplos:

- Comercial
- Operaciones
- Tecnologia

Recomendacion:

- usar nombres cortos, claros y unicos;
- evitar duplicados con pequenas variaciones como `Ventas`, `VENTAS` y `Area Ventas`.

### 4.2 Tipo

Para crear un area, este campo debe quedar en:

- **Area**

La pantalla permite otros tipos como `Empresa`, `Equipo`, `Persona` o `Producto`, pero para este caso el tipo correcto es **Area**.

### 4.3 Depende de (unidad superior)

Este campo define la jerarquia.

Opciones habituales:

- **Es una unidad raiz (sin superior)**: usar cuando el area no depende de otra unidad cargada en el sistema.
- seleccionar una unidad superior: usar cuando el area pertenece a una estructura ya creada.

Ejemplos:

- `Comercial` como unidad raiz.
- `Ventas Mayoristas` dependiendo de `Comercial`.
- `Mantenimiento` dependiendo de `Operaciones`.

Recomendacion:

- si ya existe una unidad `Empresa`, conviene que las areas dependan de ella;
- si todavia no esta cargada, el area puede crearse como raiz sin problema.

### 4.4 Calendario de medicion

Define con que frecuencia se mediran los KPIs de esa unidad.

Opciones:

- **Sin calendario especifico (hereda del superior)**: la unidad toma el calendario de su padre.
- seleccionar un calendario existente: la unidad usa ese calendario de forma explicita.

Ejemplos de uso:

- `Comercial` usa calendario mensual.
- `Finanzas` usa calendario trimestral.
- `Soporte` hereda el calendario de `Operaciones`.

Importante:

- este campo es opcional;
- si cambias el calendario de un area que ya tiene asignaciones activas, el sistema conserva las asignaciones actuales y aplica el nuevo calendario solo a nuevas asignaciones.

## 5. Opciones avanzadas

Las opciones avanzadas se muestran al hacer clic en **Mostrar opciones avanzadas**.

En el uso normal de la app, estas opciones suelen quedar vacias. Solo deben completarse si la empresa usa integraciones externas.

### 5.1 Parametros de integracion (JSON)

Este campo guarda informacion tecnica adicional para conectores como Jira, Google Sheets, Looker o APIs.

Uso esperado:

- definir parametros heredables por esa unidad;
- asociar la unidad con proyectos, equipos o perfiles de autenticacion externos.

Ejemplos:

```json
{"projects":["GT_MISIM"]}
```

```json
{"authProfileId":1}
```

```json
{"sheetKey":"1AbCdEfGh","tab":"Ventas","areaValue":"Comercial"}
```

Cuando dejarlo vacio:

- si la unidad solo se usa para organizar personas y KPIs;
- si no hay integraciones externas activas;
- si el usuario no sabe que JSON debe cargar.

Importante:

- no escribir texto libre;
- debe ser un JSON valido;
- si el contenido no es JSON valido, el guardado falla.

### 5.2 Conector externo

Permite elegir a que conector corresponden los alias de la unidad.

Ejemplos:

- Global
- Google Sheets
- Jira
- Xray
- Generic API
- Looker

Se usa para decirle al sistema como aparece esa misma area en una fuente externa.

### 5.3 Alias en el conector

Permite guardar el nombre o codigo con el que el area aparece en el sistema externo.

Ejemplos:

- `commercial`
- `ventas`
- `customer success`
- `ops`

Tambien puede cargarse mas de un alias separado por coma cuando una misma area aparece de varias formas:

- `comercial, ventas, sales`

Cuando sirve:

- para hacer matching entre la unidad interna y una fuente externa;
- para que integraciones y mappings reconozcan correctamente el area.

Cuando dejarlo vacio:

- si no hay integraciones;
- si no hace falta mapear nombres externos.

### 5.4 Activo

Define si la unidad queda operativa en el sistema.

Opciones:

- **Activo**: la unidad puede usarse normalmente.
- **Inactivo**: la unidad queda fuera de uso para nuevas operaciones.

Recomendacion:

- no eliminar una unidad por cambios temporales; si necesitas dejar de usarla, es mejor inactivarla.

## 6. Como crear un area paso a paso

### Caso simple: crear un area sin integraciones

1. Ir a **Configuracion**.
2. En **Estructura Organizacional**, hacer clic en **Nueva unidad**.
3. Completar **Nombre**.
4. Seleccionar **Tipo = Area**.
5. Definir si depende o no de una unidad superior.
6. Elegir calendario solo si necesitas uno especifico.
7. Dejar vacias las opciones avanzadas.
8. Confirmar **Activo**.
9. Hacer clic en **Guardar unidad**.

Resultado esperado:

- el area aparece en la tabla de estructura organizacional;
- luego podra seleccionarse en colaboradores, KPIs grupales, asignaciones e integraciones.

### Caso con integracion externa

1. Crear el area como en el caso simple.
2. Abrir **Mostrar opciones avanzadas**.
3. Elegir el **Conector externo** correspondiente.
4. Cargar uno o varios alias en **Alias en el conector**.
5. Si hace falta, completar **Parametros de integracion (JSON)**.
6. Guardar.

Resultado esperado:

- el area queda asociada a claves externas que luego pueden usarse en mappings e integraciones.

## 7. Como editar un area

1. Ir a **Configuracion**.
2. Buscar la unidad en la tabla **Estructura Organizacional**.
3. Hacer clic en **Editar**.
4. Ajustar nombre, superior, calendario, estado o datos avanzados.
5. Guardar.

Casos comunes de edicion:

- corregir nombre;
- mover un equipo de una unidad a otra;
- cambiar el calendario de medicion;
- agregar alias para integraciones.

## 8. Como desactivar un area

Si el area ya no debe usarse pero se quiere conservar el historial:

1. Editar la unidad.
2. En el campo **Activo**, seleccionar **Inactivo**.
3. Guardar.

Esto es preferible a eliminarla cuando ya fue utilizada en la operacion.

## 9. Como eliminar un area

La eliminacion no siempre esta permitida.

El sistema bloquea la eliminacion si:

- la unidad tiene hijos;
- hay colaboradores asignados a esa unidad;
- existen asignaciones KPI vinculadas a colaboradores de esa unidad;
- existen integraciones o targets asociados a la unidad.

En esos casos, primero hay que:

- mover o eliminar las unidades hijas;
- reasignar colaboradores;
- cerrar o mover asignaciones;
- quitar integraciones relacionadas.

## 10. Buenas practicas

- crear primero la estructura general y despues los detalles;
- usar nombres consistentes en toda la organizacion;
- no cargar JSON si no hay una necesidad tecnica concreta;
- documentar los alias externos usados para integraciones;
- definir un calendario explicito solo cuando el area realmente necesite una frecuencia distinta;
- preferir inactivar antes que eliminar.

## 11. Ejemplos recomendados

### Ejemplo 1: area raiz

- Nombre: `Tecnologia`
- Tipo: `Area`
- Depende de: `Es una unidad raiz`
- Calendario: `Sin calendario especifico`
- Opciones avanzadas: vacias
- Estado: `Activo`

### Ejemplo 2: area hija

- Nombre: `Ventas Mayoristas`
- Tipo: `Area`
- Depende de: `Comercial`
- Calendario: `Mensual`
- Opciones avanzadas: vacias
- Estado: `Activo`

### Ejemplo 3: area con integracion

- Nombre: `Customer Success`
- Tipo: `Area`
- Depende de: `Operaciones`
- Calendario: `Mensual`
- Conector externo: `Google Sheets`
- Alias en el conector: `customer success, cs`
- Parametros JSON: `{"areaValue":"Customer Success"}`
- Estado: `Activo`

## 12. Resumen operativo

Para un usuario administrador, la configuracion normal de un area se resume asi:

1. crear la unidad en **Configuracion > Estructura Organizacional**;
2. completar nombre, tipo y jerarquia;
3. definir calendario solo si aplica;
4. dejar vacias las opciones avanzadas salvo que exista una integracion;
5. guardar la unidad activa.

Si el usuario no esta configurando conectores externos, no necesita completar ni **Parametros de integracion (JSON)** ni **Alias en el conector**.
