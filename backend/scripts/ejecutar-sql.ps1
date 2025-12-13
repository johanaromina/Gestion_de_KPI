# Script PowerShell para ejecutar los scripts SQL directamente
# Uso: .\scripts\ejecutar-sql.ps1

Write-Host "📝 Ejecutando scripts SQL de creación de base de datos..." -ForegroundColor Cyan

# Solicitar contraseña si es necesario
$password = Read-Host "Ingresa la contraseña de MySQL (Enter si no tiene contraseña)" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

# Construir comando mysql
$mysqlCmd = "mysql -u root"
if ($plainPassword) {
    $mysqlCmd += " -p$plainPassword"
}

Write-Host "`n🔨 Creando base de datos y tablas..." -ForegroundColor Yellow
Get-Content scripts/create_database.sql | & cmd /c "$mysqlCmd 2>&1"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Base de datos creada exitosamente" -ForegroundColor Green
    Write-Host "`n🎉 ¡Base de datos configurada correctamente!" -ForegroundColor Green
    Write-Host "💡 Nota: Los datos deben ser insertados manualmente a través de la aplicación." -ForegroundColor Yellow
} else {
    Write-Host "❌ Error al crear la base de datos" -ForegroundColor Red
    Write-Host "💡 Verifica las credenciales de MySQL" -ForegroundColor Yellow
}

