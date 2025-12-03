# Scripts de Base de Datos

## Scripts Disponibles

### 1. `create_database.sql`
Script SQL que crea:
- La base de datos `gestion_kpi`
- Todas las tablas necesarias (collaborators, periods, sub_periods, kpis, collaborator_kpis, objective_trees)

### 2. `seed_data.sql`
Script SQL que inserta datos de ejemplo para pruebas.

### 3. `setup-database.ts`
Script TypeScript que ejecuta automáticamente los scripts SQL anteriores.
Requiere que el archivo `.env` esté configurado con las credenciales de MySQL.

**Uso:**
```bash
npm run setup:db
```

### 4. `test-connection.ts`
Script para verificar la conexión a la base de datos.

**Uso:**
```bash
npm run test:db
```

## Ejecución Manual de Scripts SQL

Si prefieres ejecutar los scripts SQL manualmente:

```bash
# Con MySQL CLI
mysql -u root -p < scripts/create_database.sql
mysql -u root -p < scripts/seed_data.sql
```

O desde PowerShell:
```powershell
Get-Content scripts/create_database.sql | mysql -u root -p
Get-Content scripts/seed_data.sql | mysql -u root -p
```

