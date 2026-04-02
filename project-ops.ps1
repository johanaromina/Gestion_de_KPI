param(
  [Parameter(Position = 0)]
  [ValidateSet(
    'help',
    'setup-db',
    'migrate-schema',
    'seed-demo',
    'restore-demo-db',
    'bootstrap-client',
    'backup-db',
    'restore-db',
    'test-critical',
    'db-health',
    'build-backend',
    'build-frontend',
    'build-all',
    'dev-backend',
    'dev-frontend'
  )]
  [string]$Action = 'help',

  [string]$DbHost = $(if ($env:DB_HOST) { $env:DB_HOST } else { 'localhost' }),
  [int]$DbPort = $(if ($env:DB_PORT) { [int]$env:DB_PORT } else { 3306 }),
  [string]$DbUser = $(if ($env:DB_USER) { $env:DB_USER } else { 'root' }),
  [string]$DbPassword = $(if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { '1234' }),
  [string]$DbName = $(if ($env:DB_NAME) { $env:DB_NAME } else { 'gestion_kpi' }),
  [string]$AdminName = 'Admin Inicial',
  [string]$AdminEmail = 'admin@empresa.local',
  [string]$AdminPassword = '',
  [string]$AdminArea = 'Administracion',
  [string]$AdminPosition = 'Administrador General',
  [string]$BackupFile = '',
  [string]$BackupDir = '',
  [switch]$SeedDemoData
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPath = Join-Path $ProjectRoot 'backend'
$FrontendPath = Join-Path $ProjectRoot 'frontend'
$BackendTsxCli = Join-Path $BackendPath 'node_modules\tsx\dist\cli.mjs'

function Get-DatabaseEnvironment {
  return @{
    DB_HOST = $DbHost
    DB_PORT = $DbPort.ToString()
    DB_USER = $DbUser
    DB_PASSWORD = $DbPassword
    DB_NAME = $DbName
  }
}

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-NpmCommand {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Fallo npm $($Arguments -join ' ') en $WorkingDirectory"
    }
  }
  finally {
    Pop-Location
  }
}

function Invoke-BackendTsxScript {
  param(
    [string[]]$Arguments
  )

  if (-not (Test-Path $BackendTsxCli)) {
    throw "No se encontro tsx local en $BackendTsxCli. Ejecuta npm install en backend."
  }

  $databaseEnvironment = Get-DatabaseEnvironment
  $previousValues = @{}

  Push-Location $BackendPath
  try {
    foreach ($entry in $databaseEnvironment.GetEnumerator()) {
      $previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
    }

    & node $BackendTsxCli @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Fallo tsx $($Arguments -join ' ') en $BackendPath"
    }
  }
  finally {
    foreach ($entry in $databaseEnvironment.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $previousValues[$entry.Key], 'Process')
    }
    Pop-Location
  }
}

function Invoke-BackendTsxScriptWithEnv {
  param(
    [string[]]$Arguments,
    [hashtable]$Environment
  )

  if (-not (Test-Path $BackendTsxCli)) {
    throw "No se encontro tsx local en $BackendTsxCli. Ejecuta npm install en backend."
  }

  $databaseEnvironment = Get-DatabaseEnvironment
  $mergedEnvironment = @{}
  foreach ($entry in $databaseEnvironment.GetEnumerator()) {
    $mergedEnvironment[$entry.Key] = $entry.Value
  }
  foreach ($entry in $Environment.GetEnumerator()) {
    $mergedEnvironment[$entry.Key] = $entry.Value
  }

  $previousValues = @{}

  Push-Location $BackendPath
  try {
    foreach ($entry in $mergedEnvironment.GetEnumerator()) {
      $previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
    }

    & node $BackendTsxCli @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Fallo tsx $($Arguments -join ' ') en $BackendPath"
    }
  }
  finally {
    foreach ($entry in $mergedEnvironment.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $previousValues[$entry.Key], 'Process')
    }
    Pop-Location
  }
}

function Invoke-MySqlScript {
  param([string]$ScriptPath)

  if (-not (Test-Path $ScriptPath)) {
    throw "No existe el script SQL: $ScriptPath"
  }

  Get-Command mysql -ErrorAction Stop | Out-Null

  $mysqlArgs = @('-h', $DbHost, '-u', $DbUser, '-P', $DbPort.ToString(), $DbName)
  if ($DbPassword -ne '') {
    $mysqlArgs = @('-h', $DbHost, '-u', $DbUser, "-p$DbPassword", '-P', $DbPort.ToString(), $DbName)
  }

  Get-Content $ScriptPath -Raw | & mysql @mysqlArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo ejecutando $ScriptPath"
  }
}

function Get-MySqlArgs {
  param([switch]$WithoutDatabase)

  $mysqlArgs = @('-h', $DbHost, '-u', $DbUser, '-P', $DbPort.ToString())
  if ($DbPassword -ne '') {
    $mysqlArgs = @('-h', $DbHost, '-u', $DbUser, "-p$DbPassword", '-P', $DbPort.ToString())
  }
  if (-not $WithoutDatabase) {
    $mysqlArgs += $DbName
  }
  return $mysqlArgs
}

function Invoke-MySqlText {
  param([string]$SqlText)

  Get-Command mysql -ErrorAction Stop | Out-Null
  $mysqlArgs = Get-MySqlArgs -WithoutDatabase
  $SqlText | & mysql @mysqlArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'Fallo ejecutando SQL inline'
  }
}

function Backup-Database {
  $resolvedBackupDir =
    if ($BackupDir) {
      $BackupDir
    } else {
      Join-Path $ProjectRoot 'backups'
    }

  New-Item -ItemType Directory -Force -Path $resolvedBackupDir | Out-Null
  Get-Command mysqldump -ErrorAction Stop | Out-Null

  $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  $outputPath = Join-Path $resolvedBackupDir "${DbName}_${timestamp}.sql"
  $dumpArgs = @(
    '-h', $DbHost,
    '-u', $DbUser,
    '-P', $DbPort.ToString(),
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--default-character-set=utf8mb4',
    '--databases', $DbName
  )

  if ($DbPassword -ne '') {
    $dumpArgs = @(
      '-h', $DbHost,
      '-u', $DbUser,
      "-p$DbPassword",
      '-P', $DbPort.ToString(),
      '--single-transaction',
      '--routines',
      '--triggers',
      '--events',
      '--default-character-set=utf8mb4',
      '--databases', $DbName
    )
  }

  & mysqldump @dumpArgs | Out-File -FilePath $outputPath -Encoding utf8
  if ($LASTEXITCODE -ne 0) {
    throw 'Fallo generando backup'
  }

  Write-Host "Backup generado en: $outputPath" -ForegroundColor Green
}

function Restore-DatabaseBackup {
  if (-not $BackupFile) {
    throw 'Debes indicar -BackupFile con la ruta del dump SQL'
  }
  if (-not (Test-Path $BackupFile)) {
    throw "No existe el archivo de backup: $BackupFile"
  }

  Get-Command mysql -ErrorAction Stop | Out-Null
  $escapedDbName = $DbName.Replace('`', '``')
  $createSql = "DROP DATABASE IF EXISTS ``$escapedDbName``; CREATE DATABASE ``$escapedDbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  Invoke-MySqlText -SqlText $createSql

  $mysqlArgs = Get-MySqlArgs
  Get-Content $BackupFile -Raw | & mysql @mysqlArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo restaurando backup desde $BackupFile"
  }

  Write-Host "Backup restaurado en la base '$DbName' desde $BackupFile" -ForegroundColor Green
}

function Show-Help {
  Write-Host @"
KPI Manager - Operaciones rapidas

Uso:
  .\project-ops.ps1 <accion>

Acciones:
  help
    Muestra esta ayuda.

  setup-db
    Crea la base y el schema base desde create_database.sql.

  migrate-schema
    Aplica la migracion canonica actual: scope_kpis, data_source_mappings,
    scopeType=company y enums de conectores.

  seed-demo
    Limpia los datos de demo y vuelve a sembrar el dataset preservando a Johana.

  restore-demo-db
    Ejecuta setup-db + migrate-schema + seed-demo.
    Es la opcion recomendada para dejar una base lista de cero.

  bootstrap-client
    Ejecuta setup-db + migrate-schema y crea un admin inicial local.
    Usa -AdminEmail y -AdminPassword. Si agregas -SeedDemoData, siembra demo.

  backup-db
    Genera un dump SQL completo de la base actual.
    Opcional: -BackupDir para cambiar la carpeta de salida.

  restore-db
    Restaura un dump SQL completo sobre la base actual.
    Requiere -BackupFile.

  test-critical
    Ejecuta el smoke test end-to-end del backend.
    Destructivo: resiembra el dataset demo. No usar sobre una base de cliente real.

  db-health
    Verifica conexion a MySQL usando el script backend actual.

  build-backend
    Compila el backend.

  build-frontend
    Compila el frontend.

  build-all
    Compila backend y frontend.

  dev-backend
    Levanta el backend en modo desarrollo.

  dev-frontend
    Levanta el frontend en modo desarrollo.

Parametros opcionales:
  -DbHost, -DbPort, -DbUser, -DbPassword, -DbName

Ejemplos:
  .\project-ops.ps1 restore-demo-db
  .\project-ops.ps1 bootstrap-client -DbHost localhost -DbPort 33060 -DbUser root -DbPassword root123 -DbName gestion_kpi -AdminEmail admin@cliente.com -AdminPassword SuperSecret123!
  .\project-ops.ps1 backup-db -DbHost localhost -DbPort 33060 -DbUser root -DbPassword root123 -DbName gestion_kpi
  .\project-ops.ps1 restore-db -DbHost localhost -DbPort 33060 -DbUser root -DbPassword root123 -DbName gestion_kpi -BackupFile .\backups\gestion_kpi_20260318_120000.sql
  .\project-ops.ps1 test-critical
  .\project-ops.ps1 migrate-schema -DbPassword 1234

Nota:
  Si validas con Docker Compose, usa el puerto publicado por MySQL.
  El compose productivo usa 33060 por defecto, pero puedes cambiarlo si ya esta ocupado.
"@
}

switch ($Action) {
  'help' {
    Show-Help
  }

  'setup-db' {
    Write-Step 'Creando base y schema base'
    Invoke-BackendTsxScript -Arguments @('scripts/setup-database.ts')
  }

  'migrate-schema' {
    Write-Step 'Aplicando migracion canonica del schema actual'
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add_areas_table.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-kpi-support-tables.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-scope-kpis.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-integration-runs-archive.sql')
  }

  'seed-demo' {
    Write-Step 'Sembrando dataset demo preservando a Johana'
    Invoke-BackendTsxScript -Arguments @('scripts/seed-demo-examples.ts')
  }

  'restore-demo-db' {
    Write-Step 'Creando schema base'
    Invoke-BackendTsxScript -Arguments @('scripts/setup-database.ts')

    Write-Step 'Aplicando migracion canonica'
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add_areas_table.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-kpi-support-tables.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-scope-kpis.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-integration-runs-archive.sql')

    Write-Step 'Sembrando dataset demo'
    Invoke-BackendTsxScript -Arguments @('scripts/seed-demo-examples.ts')
  }

  'bootstrap-client' {
    Write-Step 'Creando schema base'
    Invoke-BackendTsxScript -Arguments @('scripts/setup-database.ts')

    Write-Step 'Aplicando migracion canonica'
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add_areas_table.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-kpi-support-tables.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-scope-kpis.sql')
    Invoke-MySqlScript -ScriptPath (Join-Path $BackendPath 'scripts\add-integration-runs-archive.sql')

    if ($SeedDemoData) {
      Write-Step 'Sembrando dataset demo'
      Invoke-BackendTsxScript -Arguments @('scripts/seed-demo-examples.ts')
    } else {
      if (-not $AdminPassword) {
        throw 'Debes indicar -AdminPassword para bootstrap-client o usar -SeedDemoData'
      }

      Write-Step 'Creando admin inicial'
      Invoke-BackendTsxScriptWithEnv -Arguments @('scripts/bootstrap-client-admin.ts') -Environment @{
        BOOTSTRAP_ADMIN_NAME = $AdminName
        BOOTSTRAP_ADMIN_EMAIL = $AdminEmail
        BOOTSTRAP_ADMIN_PASSWORD = $AdminPassword
        BOOTSTRAP_ADMIN_AREA = $AdminArea
        BOOTSTRAP_ADMIN_POSITION = $AdminPosition
      }
    }
  }

  'backup-db' {
    Write-Step 'Generando backup SQL de la base'
    Backup-Database
  }

  'restore-db' {
    Write-Step 'Restaurando backup SQL'
    Restore-DatabaseBackup
  }

  'test-critical' {
    Write-Warning 'test-critical resiembra el dataset demo y no debe ejecutarse sobre una base de cliente real.'
    Write-Step 'Ejecutando smoke test critico'
    Invoke-BackendTsxScript -Arguments @('scripts/smoke-critical-flow.ts')
  }

  'db-health' {
    Write-Step 'Probando conexion a base de datos'
    Invoke-BackendTsxScript -Arguments @('scripts/test-connection.ts')
  }

  'build-backend' {
    Write-Step 'Compilando backend'
    Invoke-NpmCommand -WorkingDirectory $BackendPath -Arguments @('run', 'build')
  }

  'build-frontend' {
    Write-Step 'Compilando frontend'
    Invoke-NpmCommand -WorkingDirectory $FrontendPath -Arguments @('run', 'build')
  }

  'build-all' {
    Write-Step 'Compilando backend'
    Invoke-NpmCommand -WorkingDirectory $BackendPath -Arguments @('run', 'build')

    Write-Step 'Compilando frontend'
    Invoke-NpmCommand -WorkingDirectory $FrontendPath -Arguments @('run', 'build')
  }

  'dev-backend' {
    Write-Step 'Levantando backend'
    Invoke-NpmCommand -WorkingDirectory $BackendPath -Arguments @('run', 'dev')
  }

  'dev-frontend' {
    Write-Step 'Levantando frontend'
    Invoke-NpmCommand -WorkingDirectory $FrontendPath -Arguments @('run', 'dev')
  }
}
