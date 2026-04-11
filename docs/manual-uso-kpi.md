# Manual de uso: KPI

## 1. Objetivo

El modulo **KPIs** permite definir los indicadores que la organizacion va a medir.

Un KPI en esta aplicacion funciona como una ficha maestra que luego se usa en:

- asignaciones a colaboradores;
- KPIs grupales;
- mediciones manuales o automaticas;
- seguimiento por periodo;
- trazabilidad hacia OKRs.

En terminos operativos, primero se define el KPI y despues se lo asigna a personas, areas o estructuras.

## 2. Donde se configura

Ruta de uso:

1. Ingresar al modulo **KPIs**.
2. Hacer clic en **+ Crear KPI**.
3. Completar el formulario.
4. Guardar.

## 3. Quien puede usar esta pantalla

Uso esperado por rol:

- **Administrador / roles de gestion**: pueden crear, editar, eliminar y cerrar KPIs por periodo.
- **Colaborador**: tiene acceso de solo lectura.

## 4. Para que sirve crear un KPI

Conviene crear un KPI cuando necesitas definir:

- que se va a medir;
- como se interpreta el resultado;
- en que periodos aplica;
- si su cumplimiento mejora cuando el valor sube, baja o debe coincidir;
- si forma parte de un KPI agrupador.

Ejemplos tipicos:

- Ventas mensuales
- Tiempo promedio de respuesta
- Ticket promedio
- Cumplimiento SLA
- NPS
- Cantidad de incidentes resueltos

## 5. Campos del formulario

### 5.1 Nombre del KPI

Campo obligatorio.

Que cargar:

- el nombre con el que el indicador sera usado en toda la app.

Ejemplos:

- Ventas mensuales
- Tiempo de respuesta promedio
- Cumplimiento de entregas

Recomendacion:

- usar nombres claros y estables;
- evitar siglas internas si no son entendibles para todos;
- no crear duplicados con pequenas diferencias.

### 5.2 Descripcion

Campo opcional.

Sirve para explicar:

- que mide el KPI;
- de donde sale el dato;
- quien lo reporta;
- con que criterio se interpreta.

Ejemplo:

- "Mide el promedio de horas desde la apertura del ticket hasta la primera respuesta del equipo."

Buena practica:

- completar siempre la descripcion cuando el KPI no sea obvio.

### 5.3 Tipo de KPI

Campo obligatorio.

Opciones disponibles:

- **Manual**
- **Count**
- **Ratio**
- **SLA**
- **Value**

Que significa cada tipo:

- **Manual**: se usa cuando el dato se carga manualmente o cuando todavia no esta automatizado.
- **Count**: representa un conteo, por ejemplo cantidad de tickets o cantidad de ventas.
- **Ratio**: representa una relacion entre dos valores, por ejemplo aprobados / totales.
- **SLA**: representa cumplimiento contra un limite o tiempo esperado.
- **Value**: representa un valor numerico directo, por ejemplo revenue, costo, NPS o ticket promedio.

Regla practica:

- si estas arrancando y no tenes una integracion estable, usa **Manual**;
- si el KPI ya tiene una logica cuantitativa clara, elegi el tipo mas representativo.

### 5.4 Direccion de calculo

Este campo define como interpreta el sistema el cumplimiento.

Opciones:

- **Crecimiento (mayor es mejor)**
- **Reduccion (menor es mejor)**
- **Exacto (debe coincidir)**

Como usarlo:

- **Crecimiento**: para ventas, productividad, conversion, cobertura.
- **Reduccion**: para tiempos, errores, incidentes, costo, retrabajo.
- **Exacto**: cuando el valor esperado debe acercarse a una meta precisa.

Ejemplos:

- Ventas: crecimiento
- Tiempo de respuesta: reduccion
- Presupuesto ejecutado exacto: exacto

Importante:

- la direccion impacta directamente en el calculo de variacion y cumplimiento;
- si el KPI es de tipo `sla`, el formulario ya propone `reduccion` por defecto.

### 5.5 KPI agrupador

Campo opcional.

Permite indicar que este KPI forma parte de un KPI padre.

Ejemplo:

- KPI hijo: `Ventas sucursal norte`
- KPI hijo: `Ventas sucursal sur`
- KPI agrupador: `Ventas regionales`

Uso esperado:

- agrupar varios KPIs operativos bajo un indicador mas amplio;
- consolidar resultados de diferentes areas o scopes.

Importante:

- no es obligatorio;
- se usa solo cuando el KPI realmente forma parte de una estructura mayor;
- el agrupador toma el resultado de sus KPIs hijos como promedio ponderado.

### 5.6 Periodos

Campo opcional pero muy recomendable.

Permite indicar en que periodos el KPI estara vigente.

Ejemplos:

- Periodo Anual 2026
- Q2 2026
- Primer semestre 2026

Para que sirve:

- ordenar la vigencia del KPI;
- filtrarlo por periodo en la pantalla;
- facilitar asignaciones y cierres posteriores.

Buena practica:

- seleccionar siempre los periodos donde el KPI va a operar;
- si no se define, despues puede aparecer "sin asignaciones" o depender del uso real.

### 5.7 Ponderacion por area

Campo opcional.

Permite definir un peso inicial del KPI segun el area.

Que hace realmente:

- no asigna el KPI al area;
- no restringe quien puede usarlo;
- deja un peso de referencia que luego se precarga en **Asignaciones** y puede ajustarse por persona.

Ejemplo:

- Comercial: 40
- Operaciones: 30
- Administracion: 10

Cuando usarlo:

- cuando el mismo KPI tiene distinta importancia segun el area;
- cuando queres precargar pesos y evitar cargarlos manualmente uno por uno en asignaciones.

Cuando dejarlo vacio:

- si el KPI no necesita ponderacion;
- si el peso se definira caso por caso en asignaciones.

### 5.8 Criterio de calculo

Campo opcional.

Sirve para describir en palabras como se obtiene el KPI.

Ejemplos:

- "Cantidad de tickets cerrados en el mes."
- "Ingresos netos del periodo segun sistema comercial."
- "(actual - target) / target * 100 para crecimiento."

Uso recomendado:

- escribir la definicion funcional del KPI;
- aclarar fuente, formula y alcance si hace falta.

### 5.9 Formula personalizada

Campo opcional.

Permite sobrescribir la formula por defecto con una expresion propia.

Variables disponibles:

- `target`
- `actual`

Operadores permitidos:

- `+`
- `-`
- `*`
- `/`
- parentesis

Ejemplos validos:

```text
(actual / target) * 100
```

```text
(target / actual) * 100
```

```text
100 - (Math.abs(actual - target) / target) * 100
```

Importante:

- si se deja vacia, el sistema usa la formula por defecto segun la direccion;
- si la formula es invalida, el guardado falla;
- solo debe completarse si realmente necesitas un calculo distinto al estandar.

## 6. Como crear un KPI paso a paso

### Caso simple

1. Ir a **KPIs**.
2. Hacer clic en **+ Crear KPI**.
3. Completar **Nombre del KPI**.
4. Opcionalmente completar **Descripcion**.
5. Elegir **Tipo de KPI**.
6. Definir **Direccion de calculo**.
7. Si corresponde, seleccionar un **KPI agrupador**.
8. Marcar los **Periodos** donde aplica.
9. Cargar **Ponderacion por area** solo si se necesita.
10. Completar **Criterio de calculo** si queres documentar como se mide.
11. Dejar vacia la **Formula personalizada** salvo necesidad concreta.
12. Hacer clic en **Crear**.

Resultado esperado:

- el KPI aparece en la grilla del modulo KPIs;
- ya puede usarse en asignaciones y procesos posteriores.

### Caso recomendado para equipos que recien empiezan

Configuracion sugerida:

1. Tipo: `Manual`
2. Direccion: segun corresponda
3. Periodos: seleccionar los vigentes
4. Criterio: escribirlo claramente
5. Formula personalizada: dejar vacia

Este enfoque baja el riesgo de errores al inicio.

## 7. Como editar un KPI

1. Ir al modulo **KPIs**.
2. Buscar el KPI en la lista.
3. Hacer clic en **Editar**.
4. Ajustar los campos necesarios.
5. Guardar.

Importante:

- si cambias tipo, direccion o formula, el sistema recalcula la variacion y el resultado ponderado de las asignaciones existentes de ese KPI;
- por eso no conviene modificar un KPI en uso sin revisar el impacto.

Casos comunes de edicion:

- mejorar nombre o descripcion;
- cambiar direccion de calculo;
- agregar periodos;
- definir un KPI agrupador;
- actualizar pesos por area;
- ajustar una formula personalizada.

## 8. Como eliminar un KPI

1. Ir al modulo **KPIs**.
2. Buscar el KPI.
3. Hacer clic en **Eliminar**.
4. Confirmar la accion.

Recomendacion operativa:

- no eliminar KPIs que ya fueron usados en asignaciones o historicos;
- si el KPI ya forma parte del trabajo operativo, es mejor dejar de asignarlo a futuro en vez de borrarlo.

Riesgo funcional:

- la interfaz ya advierte que eliminar un KPI puede afectar asignaciones asociadas;
- por eso, antes de borrarlo, conviene verificar si esta en uso.

## 9. Como cerrar un KPI en un periodo

La pantalla permite cerrar un KPI en el periodo filtrado.

Flujo:

1. Ir a **KPIs**.
2. En el filtro **Periodo**, seleccionar un periodo.
3. Buscar el KPI.
4. Hacer clic en **Cerrar KPI (periodo)**.
5. Confirmar.

Que hace esta accion:

- cierra las asignaciones de ese KPI dentro del periodo seleccionado.

Cuando usarla:

- al finalizar un ciclo de medicion;
- cuando el KPI ya no debe seguir recibiendo datos en ese periodo.

## 10. Filtros y lectura de la pantalla

La pantalla KPIs permite:

- buscar por nombre o descripcion;
- filtrar por tipo;
- filtrar por periodo.

Cada tarjeta muestra:

- nombre del KPI;
- tipo;
- direccion;
- descripcion;
- criterio;
- formula por defecto o personalizada;
- KPI agrupador, si aplica;
- cantidad de asignaciones;
- cantidad de periodos donde se usa;
- periodos vinculados.

Esto permite revisar rapidamente si el KPI ya esta siendo utilizado antes de editarlo o eliminarlo.

## 11. Buenas practicas

- crear primero KPIs simples y estables;
- usar nombres entendibles para negocio y operacion;
- documentar el criterio aunque el KPI parezca obvio;
- usar `Manual` si todavia no esta clara la automatizacion;
- no abusar de formulas personalizadas;
- usar KPI agrupador solo cuando exista una relacion padre-hijo real;
- revisar el impacto antes de editar un KPI ya asignado;
- no borrar KPIs en uso si necesitas conservar trazabilidad.

## 12. Ejemplos recomendados

### Ejemplo 1: KPI de ventas

- Nombre: `Ventas mensuales`
- Tipo: `Value`
- Direccion: `Crecimiento`
- Periodos: `2026`
- Criterio: `Monto total vendido en el mes`
- Formula personalizada: vacia

### Ejemplo 2: KPI de tiempo

- Nombre: `Tiempo promedio de respuesta`
- Tipo: `SLA`
- Direccion: `Reduccion`
- Periodos: `Q2 2026`
- Criterio: `Promedio en horas desde apertura hasta primera respuesta`
- Formula personalizada: vacia

### Ejemplo 3: KPI exacto

- Nombre: `Desvio presupuestario`
- Tipo: `Value`
- Direccion: `Exacto`
- Periodos: `2026`
- Criterio: `Comparacion entre presupuesto planificado y ejecutado`
- Formula personalizada:

```text
100 - (Math.abs(actual - target) / target) * 100
```

### Ejemplo 4: KPI agrupado

- KPI hijo: `Ventas sucursal norte`
- KPI hijo: `Ventas sucursal sur`
- KPI agrupador: `Ventas regionales`

## 13. Resumen operativo

Para un administrador, el uso normal del modulo KPI se resume asi:

1. crear el KPI con nombre, tipo y direccion;
2. definir periodos de vigencia;
3. documentar criterio de calculo;
4. usar formula personalizada solo si es indispensable;
5. asignarlo despues a colaboradores o estructuras;
6. revisar impacto antes de editar o eliminar.
