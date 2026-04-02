# Scripts de Base de Datos

## Scripts Disponibles

### 1. `create_database.sql`
Script SQL que crea:
- La base de datos `gestion_kpi`
- Todas las tablas necesarias del schema actual
- Incluye `calendar_profiles`, `calendar_subperiods`, `scope_kpis`, `scope_kpi_links`, `scope_kpi_aggregation_runs`, `data_source_mappings` e integraciones modernas

### Ruta recomendada hoy

Para una instalacion nueva:

1. Ejecutar `create_database.sql`
2. Ejecutar `seed-demo-examples.ts` si queres datos de ejemplo

Para una base existente que necesita alinearse al dominio actual:

1. Ejecutar `add-scope-kpis.sql`

### Scripts legacy / de compatibilidad

- `add-macro-kpis.sql`
  - Deprecated.
  - `macro_kpis` fue reemplazado por `scope_kpis`.
- `add-company-scope-to-integration-targets.sql`
  - Cambio puntual ya absorbido por `add-scope-kpis.sql`.
- `add-data-source-mappings.sql`
  - Cambio puntual ya absorbido por `add-scope-kpis.sql`.

### 2. `setup-database.ts`
Script TypeScript que ejecuta automáticamente los scripts SQL anteriores.
Requiere que el archivo `.env` esté configurado con las credenciales de MySQL.

**Uso:**
```bash
npm run setup:db
```

### 3. `test-connection.ts`
Script para verificar la conexión a la base de datos.

**Uso:**
```bash
npm run test:db
```

### 4. `add-audit-table.ts`
Script TypeScript que ejecuta `add_audit_table.sql` para crear la tabla de auditoría.

**Uso:**
```bash
npm run add:audit
```

### 5. `add_audit_table.sql`
Script SQL que crea la tabla `audit_logs` para el sistema de auditoría (RF-19).

**Uso:**
```bash
npm run add:audit
```

O manualmente:
```bash
mysql -u root -p gestion_kpi < scripts/add_audit_table.sql
```

### 6. `add_objective_trees_kpis_table.sql`
Script SQL que crea la tabla `objective_trees_kpis` para relacionar objetivos con KPIs.

**Uso:**
```bash
npm run add:objective-kpis
```

O manualmente:

**Desde bash/Linux:**
```bash
mysql -u root -p gestion_kpi < scripts/add_objective_trees_kpis_table.sql
```

**Desde PowerShell (Windows):**
```powershell
Get-Content scripts/add_objective_trees_kpis_table.sql | mysql -u root -p gestion_kpi
```

O si tienes la contraseña:
```powershell
$password = Read-Host "Ingresa la contraseña de MySQL" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
Get-Content scripts/add_objective_trees_kpis_table.sql | mysql -u root -p$plainPassword gestion_kpi
```

### 7. `add_collaborator_kpi_plan_table.sql`
Script SQL que crea la tabla `collaborator_kpi_plan` para almacenar el plan mensual de KPIs por colaborador.

**Uso:**
```bash
npm run add:collaborator-kpi-plan
```

### 8. `import-kpi-plan.ts`
Script TypeScript que importa el plan de KPIs desde un archivo Excel a la tabla `collaborator_kpi_plan`.

**Requisitos:**
- El archivo Excel debe tener columnas de fechas en la cabecera (formato serial de Excel)
- Los subperíodos en la base de datos deben tener `startDate` que coincida con las fechas del Excel (formato YYYY-MM-DD, ej: 2025-03-01, 2025-04-01)
- Los nombres de colaboradores y KPIs en la DB deben coincidir exactamente con los del Excel
- El peso del KPI se toma de la columna 7 del Excel y se guarda en cada fila del plan

**Uso:**
```bash
cd backend
npm run import:plan "OKR KPI Total v0.xlsx" <periodId> "KPI Equipo Producto "
```

O directamente con tsx:
```bash
cd backend
npx tsx scripts/import-kpi-plan.ts "OKR KPI Total v0.xlsx" <periodId> "KPI Equipo Producto "
```

**Parámetros:**
- `<archivo.xlsx>`: Ruta al archivo Excel (puede estar en la raíz del proyecto o ruta relativa/absoluta)
- `<periodId>`: ID del período en la base de datos
- `[sheetName]`: Nombre de la hoja del Excel (opcional, por defecto: "KPI Equipo Producto ")

**Notas:**
- Los pesos se guardan tal cual vienen del Excel (si vienen como 0.35 se convierten a 35%)
- Los targets se toman de las columnas de fechas
- Si un colaborador o KPI no hace match, se omite esa fila
- Si un subperíodo no se encuentra para una fecha, se muestra una advertencia y se omite

### 9. Generar Parrillas Base (API)
Una vez importado el plan, puedes generar las parrillas base usando la API:

**Endpoint:**
```
POST /api/collaborator-kpis/generate-base-grids
```

**Body:**
```json
{
  "area": "Producto",
  "periodId": 1,
  "kpiIds": [1, 2, 3]  // Opcional: si no se especifica, usa todos los KPIs
}
```

**Comportamiento:**
- Si existe plan en `collaborator_kpi_plan` para los colaboradores/KPIs del período:
  - Crea asignaciones mensuales (una por subperíodo) con target y peso del plan
  - **Los pesos se distribuyen entre los subperíodos** para no inflar el total (>100%)
    - Ejemplo: Si un KPI tiene peso 35% y hay 12 subperíodos, cada uno recibe 35% / 12 = 2.92%
- Si no existe plan:
  - Usa el comportamiento anterior (asignación única sin subperíodo)
  - Distribuye el peso equitativamente entre todos los KPIs si no se especifica `defaultWeight`

## 📖 Guía Completa: Importar Plan y Generar Parrillas Base

Para una guía detallada paso a paso sobre cómo importar el plan y generar las parrillas base, consulta:
**[GUIA-IMPORTAR-PLAN.md](./GUIA-IMPORTAR-PLAN.md)**

## Ejecución Manual de Scripts SQL

Si prefieres ejecutar los scripts SQL manualmente:

```bash
# Con MySQL CLI
mysql -u root -p < scripts/create_database.sql
```

O desde PowerShell:
```powershell
Get-Content scripts/create_database.sql | mysql -u root -p
```

**Nota:** Tambien existe `seed-demo-examples.ts` para regenerar un dataset demo end-to-end preservando el usuario admin que elijas dejar en la base.

