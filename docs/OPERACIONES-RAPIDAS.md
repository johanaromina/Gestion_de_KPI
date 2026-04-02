# Operaciones Rapidas

Script principal:

- [project-ops.ps1](d:/proyectos laborales/Gestion_de_KPI/project-ops.ps1)

## Comandos mas usados

Desde la raiz del proyecto:

Nota operativa:

- si corres con `docker compose`, usa el puerto publicado por MySQL
- el compose productivo usa `33060` por default
- si `33060` ya esta ocupado en tu maquina, cambia `MYSQL_PORT` en `.env.single-tenant` y usa ese puerto, por ejemplo `33061`

```powershell
.\project-ops.ps1 restore-demo-db
```

Deja la base lista desde cero:

- crea schema base
- aplica migracion canonica
- siembra dataset demo preservando a Johana

```powershell
.\project-ops.ps1 seed-demo
```

Resiembra el dataset demo sobre una base ya existente.
Es destructivo respecto de los datos demo actuales.

```powershell
.\project-ops.ps1 bootstrap-client -DbHost localhost -DbPort <MYSQL_PORT> -DbUser root -DbPassword root123 -DbName gestion_kpi -AdminEmail admin@cliente.com -AdminPassword SuperSecret123!
```

Bootstrap de una instancia real por cliente:

- crea schema base
- aplica migracion canonica
- crea un admin inicial usable

```powershell
.\project-ops.ps1 backup-db -DbHost localhost -DbPort <MYSQL_PORT> -DbUser root -DbPassword root123 -DbName gestion_kpi
```

Genera un dump SQL completo en `.\backups`.

```powershell
.\project-ops.ps1 restore-db -DbHost localhost -DbPort <MYSQL_PORT> -DbUser root -DbPassword root123 -DbName gestion_kpi -BackupFile .\backups\gestion_kpi_20260318_120000.sql
```

Restaura un dump completo sobre la base actual.

```powershell
.\project-ops.ps1 test-critical
```

Ejecuta el smoke test critico del backend:

- seed demo
- login
- collaborator_kpis
- scope_kpis
- recalculate
- target run
- data_source_mappings

Importante:

- `test-critical` resiembra dataset demo antes de validar
- no debe ejecutarse sobre una base de cliente real o una instancia de produccion
- usalo solo contra una base local o demo aislada

```powershell
.\project-ops.ps1 migrate-schema
```

Aplica la migracion canonica actual del schema.

```powershell
.\project-ops.ps1 db-health
```

Valida la conexion a MySQL.

```powershell
.\project-ops.ps1 dev-backend
.\project-ops.ps1 dev-frontend
```

Levanta backend o frontend en modo desarrollo.

## Parametros de base de datos

Si queres override manual:

```powershell
.\project-ops.ps1 restore-demo-db -DbUser root -DbPassword 1234 -DbName gestion_kpi
```

Defaults:

- `DbHost=localhost`
- `DbPort=3306`
- `DbUser=root`
- `DbPassword=1234`
- `DbName=gestion_kpi`

Si usas Docker Compose de este repo:

- `frontend` publica `8080` por default
- `backend` publica `5000` en `127.0.0.1`
- `mysql` publica `33060` en `127.0.0.1` por default

Parametros extra utiles:

- `AdminName`
- `AdminEmail`
- `AdminPassword`
- `AdminArea`
- `AdminPosition`
- `BackupFile`
- `BackupDir`
- `SeedDemoData`

Si existen variables de entorno `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, el script las toma primero.
