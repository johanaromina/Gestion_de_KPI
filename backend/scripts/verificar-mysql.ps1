# Script para verificar la configuracion de MySQL
Write-Host "`nVerificando configuracion de MySQL...`n" -ForegroundColor Cyan

# Verificar si MySQL esta instalado
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if ($mysqlPath) {
    Write-Host "MySQL encontrado en: $($mysqlPath.Source)" -ForegroundColor Green
    & mysql --version
} else {
    Write-Host "MySQL no se encuentra en el PATH" -ForegroundColor Red
    exit
}

Write-Host "`nIntentando conectar a MySQL...`n" -ForegroundColor Cyan

# Intentar sin contraseña
Write-Host "1. Intentando conexion SIN contrasena..." -ForegroundColor Yellow
$test1 = cmd /c "mysql -u root -e `"SELECT 1;`" 2>&1"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   MySQL NO requiere contrasena!" -ForegroundColor Green
    Write-Host "   Deja DB_PASSWORD vacio en el archivo .env" -ForegroundColor Green
    exit 0
} else {
    Write-Host "   No se pudo conectar sin contrasena" -ForegroundColor Red
}

# Probar contrasenas comunes
Write-Host "`n2. Probando contrasenas comunes..." -ForegroundColor Yellow
$passwords = @("root", "123456", "password", "admin", "12345")

foreach ($pwd in $passwords) {
    $test = cmd /c "mysql -u root -p$pwd -e `"SELECT 1;`" 2>&1"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Contrasena encontrada: $pwd" -ForegroundColor Green
        Write-Host "`nActualiza el archivo .env con: DB_PASSWORD=$pwd" -ForegroundColor Cyan
        exit 0
    }
}

Write-Host "   No se encontro ninguna contrasena comun" -ForegroundColor Red

Write-Host "`nOPCIONES:" -ForegroundColor Cyan
Write-Host "`n1. Intentar conectarte manualmente:" -ForegroundColor Yellow
Write-Host "   mysql -u root -p" -ForegroundColor White
Write-Host "   (Presiona Enter si no tienes contrasena)" -ForegroundColor White

Write-Host "`n2. Si usas XAMPP/WAMP:" -ForegroundColor Yellow
Write-Host "   - Por defecto NO tiene contrasena (vacio)" -ForegroundColor White
Write-Host "   - O la contrasena es: root" -ForegroundColor White

Write-Host "`n3. Si instalaste MySQL Server:" -ForegroundColor Yellow
Write-Host "   - Revisa el archivo de configuracion" -ForegroundColor White
Write-Host "   - O restablece la contrasena" -ForegroundColor White
