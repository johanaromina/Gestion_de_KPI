# Scripts de Base de Datos

## Scripts Disponibles

### 1. `create_database.sql`
Script SQL que crea:
- La base de datos `gestion_kpi`
- Todas las tablas necesarias (collaborators, periods, sub_periods, kpis, collaborator_kpis, objective_trees)

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

**Nota:** Los datos deben ser insertados manualmente a través de la aplicación. No se incluyen scripts de seed con datos de ejemplo.

