# Configuración de Variables de Entorno

Para que el backend funcione correctamente, necesitas crear un archivo `.env` en la carpeta `backend` con las siguientes variables:

## Archivo `.env`

Crea un archivo llamado `.env` en la carpeta `backend` con el siguiente contenido:

```env
# Configuración de Base de Datos
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contraseña_mysql
DB_NAME=gestion_kpi

# Configuración del Servidor
PORT=5000

# JWT Secret (IMPORTANTE: Cambiar en producción)
# Genera una clave segura con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=tu-clave-secreta-jwt-muy-segura-aqui

# URL base de la app (para links de recuperacion)
APP_BASE_URL=http://localhost:5173

# SMTP (envio de emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_usuario@empresa.com
SMTP_PASS=tu_app_password
SMTP_FROM=KPI Manager <no-reply@tuempresa.com>

# MFA y reset (minutos)
MFA_TTL_MIN=10
RESET_TTL_MIN=60

# Notificaciones
NOTIFY_ENABLED=true
NOTIFY_INTERVAL_MIN=10
NOTIFY_RUN_ON_START=false
NOTIFY_WINDOW_DAYS=7
```

## Generar JWT_SECRET Seguro

Para generar una clave secreta segura para JWT, ejecuta:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

O desde PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copia el resultado y úsalo como valor de `JWT_SECRET`.

## Nota de Desarrollo

Si no configuras `JWT_SECRET`, el sistema usará una clave por defecto solo para desarrollo. **NUNCA uses esto en producción.**

## Pasos Rápidos

1. Copia el contenido de arriba
2. Crea el archivo `backend/.env`
3. Reemplaza los valores con tus credenciales reales
4. Genera un `JWT_SECRET` seguro
5. Guarda el archivo
6. Reinicia el servidor backend

