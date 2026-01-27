# KPI Manager - Manual de uso

Fecha de edicion: 2026-01-27

## 1) Que es la app
KPI Manager es una plataforma para gestionar objetivos y desempeno con gobernanza de datos. Permite definir KPIs, asignarlos por persona y periodo, cargar mediciones manuales o automaticas, y aprobar tanto los criterios como los datos antes de impactar en los resultados visibles.

## 2) Conceptos clave (antes de empezar)
- KPI macro: plantilla del KPI (nombre, descripcion, formula base). No guarda curaduria.
- Asignacion: el KPI aplicado a una persona y periodo (peso, target, fuente/criterio activo).
- Curaduria: proceso de aprobacion. Sin curaduria aprobada, el KPI visible no se actualiza.
- Mediciones: valores capturados (manual/import/auto). El actual se toma del ultimo measurement aprobado.

### Area vs Org Scopes (importante)
- Area: es el campo organizativo clasico del colaborador (ej: QA, Soporte, Comercial).
- Org Scopes: es la jerarquia usada para integraciones y herencia de parametros (company -> area -> team -> person -> product). Puede mapearse a Area, pero es independiente y sirve para automatizacion.

## 3) Estados recomendados
Usar los mismos estados para criterio y medicion, con responsabilidades distintas:

- Draft -> In review -> Approved -> Rejected -> Closed

## 4) Curaduria separada (criterio vs dato)
- Curaduria de criterio/fuente: aprueba el como se calcula.
- Curaduria de dato (medicion): aprueba el valor reportado.

Regla clave: el KPI visible solo usa criterio aprobado + datos aprobados.

## 5) Roles y permisos (resumen)
- Admin: acceso total.
- Data Curator: aprueba criterios/fuentes y datos.
- Producer: carga o ingesta datos.
- Leader/Manager: aprueba valores propuestos.
- Viewer: solo lectura.

## 6) Flujo basico (paso a paso)

### 6.1 Configuracion inicial (Admin)
1. Crear Areas.
2. Cargar Colaboradores y asignar rol.
3. Definir Periodos (mensual, trimestral, etc.).
4. Crear KPIs macro.

### 6.2 Asignaciones
1. Ir a Asignaciones.
2. Crear asignacion por colaborador y periodo.
3. Definir peso y target.
4. Guardar.

Regla de consistencia:
- El peso debe sumar 100% por colaborador y periodo.

### 6.3 Fuente y Criterio (Curaduria)
1. En la asignacion, completar:
   - Fuente de datos
   - Criterio de calculo
   - Configuracion (query / endpoint)
2. Enviar a curaduria.
3. Curator/Admin aprueba o rechaza.

Buenas practicas:
- No editar criterios aprobados en caliente: crear nueva version.

### 6.4 Input de datos (Mediciones)
1. Ir a Input de datos.
2. Filtrar por Area -> KPI -> Asignacion.
3. Cargar medicion manual, importar CSV o ejecutar fetch automatico.
4. Si el flujo requiere, Leader/Curator aprueba la medicion.

Nota operativa:
- En Input de datos, la lista de asignaciones se colapsa por Colaborador + KPI + Periodo para evitar duplicados por subperiodos.

### 6.5 Curaduria (Bandeja)
- Filtrar por periodo, KPI, colaborador o area.
- Aprobar / Rechazar / Pedir cambios.
- Solo se calculan KPIs con criterio y datos aprobados.

## 7) Integraciones (automatizacion escalable)

### 7.1 Modelo en 3 capas
1) Connector: sabe hablar con el sistema (Jira, ADO, Github, etc.).
2) Template (plantilla): define que se calcula y con placeholders.
3) Target: define para quien se ejecuta y con que parametros.

### 7.2 Auth Profiles
Definen como autenticarse con cada sistema (Jira, Xray, etc.).
Se reutilizan en todas las plantillas/targets.

### 7.3 Plantillas (genericas)
Una plantilla debe ser reutilizable. No debe tener datos duros.

Campos recomendados:
- Nombre
- Connector
- Tipo de metrica: COUNT o RATIO
- Query template(s)
- Formula
- Frecuencia (cron)
- Estado

Ejemplo generico (Jira - Tests):

```sql
project IN ({projects})
AND issuetype = {issueTypeTest}
AND {testerField} IN ({users})
AND updated >= {from}
AND updated < {to}
```

Ejemplo generico (Jira - Historias Done):

```sql
project IN ({projects})
AND issuetype IN ({issueTypeStory})
AND statusCategory = Done
AND statusCategoryChangedDate >= {from}
AND statusCategoryChangedDate < {to}
AND {testerField} IN ({users})
```

### 7.4 Targets (donde van los params reales)
Los params viven en el target, no en la plantilla.

Ejemplo de params por target:

```json
{
  "projects": ["GT_MISIM"],
  "users": ["712020:xxxxx"],
  "testerField": "\"Tester[User Picker (single user)]\"",
  "issueTypeTest": "Test",
  "issueTypeStory": ["Historia"],
  "period": "previous_month"
}
```

### 7.5 Probar y ejecutar (en el target)
- Probar target: no guarda nada, solo valida.
- Ejecutar target: corre la integracion y guarda una medicion (proposed/auto).

El preview muestra:
- Query renderizada
- Totales por query
- Formula y valor final
- Rango de fechas
- Warnings

## 8) Buenas practicas
- Separar curaduria de criterio y de dato.
- Mantener trazabilidad (quien, cuando, que se cambio).
- Evitar hardcodear usuarios, proyectos y campos en plantillas.
- Usar scopes para defaults y herencia.
- Revisar consistencia: pesos 100%, KPIs sin fuente, criterios pendientes.

## 9) FAQ rapida

### Por que no veo mi KPI actualizado?
Porque falta criterio aprobado o medicion aprobada.

### Puedo cargar datos sin curaduria?
Si, pero quedan como propuesta y no impactan al KPI visible.

### Por que aparecen muchos subperiodos?
Porque tecnicamente cada subperiodo puede tener una asignacion distinta. Para simplificar, la UI colapsa por Colaborador + KPI + Periodo cuando corresponde.

---
