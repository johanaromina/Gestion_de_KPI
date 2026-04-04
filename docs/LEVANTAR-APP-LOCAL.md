# Levantar La App Desde El Repo

Este instructivo esta pensado para alguien que recibe el repositorio y necesita levantar KPI Manager en local sin contexto previo.

## Opcion recomendada para primera prueba

Usar:

- `backend` local
- `frontend` local
- `MySQL` local

Es el camino mas corto para validar que la app corre.

## Requisitos

- `Git`
- `Node.js 20+`
- `npm`
- `MySQL 8+`
- `mysql` en terminal
- `PowerShell` en Windows

## 1. Clonar el repositorio

```powershell
git clone <URL_DEL_REPO>
cd Gestion_de_KPI
```

## 2. Instalar dependencias

```powershell
cd backend
npm install
cd ..
cd frontend
npm install
cd ..
```

## 3. Crear el archivo de entorno del backend

Crear el archivo `backend/.env` con este contenido base:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=TU_PASSWORD_MYSQL
DB_NAME=gestion_kpi

PORT=5000

JWT_SECRET=CAMBIAR_POR_UNA_CLAVE_LARGA
AUTH_ENCRYPTION_KEY=CAMBIAR_POR_OTRA_CLAVE_LARGA
APP_BASE_URL=http://localhost:5173
FRONTEND_BASE_URL=http://localhost:5173

MFA_TTL_MIN=10
RESET_TTL_MIN=60
SELF_REGISTER_ENABLED=false

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_REPLY_TO=
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_IPV4_ONLY=true
DEMO_REQUEST_TO=
```

Para generar una clave segura:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Usar un valor distinto para:

- `JWT_SECRET`
- `AUTH_ENCRYPTION_KEY`

## 4. Crear la base y el admin inicial

Desde la raiz del repo:

```powershell
.\project-ops.ps1 bootstrap-client `
  -DbHost localhost `
  -DbPort 3306 `
  -DbUser root `
  -DbPassword TU_PASSWORD_MYSQL `
  -DbName gestion_kpi `
  -AdminName "Admin Inicial" `
  -AdminEmail admin@cliente.com `
  -AdminPassword "SuperSecret123!"
```

Esto hace:

- crea la base
- aplica el schema base
- aplica la migracion canonica actual
- crea un usuario administrador inicial

## 5. Levantar backend

En una terminal:

```powershell
cd backend
npm run dev
```

Backend esperado:

- `http://localhost:5000`

## 6. Levantar frontend

En otra terminal:

```powershell
cd frontend
npm run dev
```

Frontend esperado:

- `http://localhost:5173`

## 7. Entrar a la app

Abrir:

- `http://localhost:5173`

Ingresar con:

- email: el que definiste en `-AdminEmail`
- password: el que definiste en `-AdminPassword`

## 8. Verificaciones utiles

Desde la raiz del repo:

```powershell
.\project-ops.ps1 db-health `
  -DbHost localhost `
  -DbPort 3306 `
  -DbUser root `
  -DbPassword TU_PASSWORD_MYSQL `
  -DbName gestion_kpi
```

Builds:

```powershell
cd backend
npm run build
cd ..
cd frontend
npm run build
```

## 9. Lo que no va a funcionar hasta configurarlo

- invitaciones por mail
- recuperacion de contraseña por mail
- MFA por correo

Todo eso depende de `SMTP_*` en `backend/.env`.

Si queres que el formulario comercial de la landing envie la solicitud al equipo correcto:

- definir `DEMO_REQUEST_TO` en `backend/.env`
- si no lo definis, el backend usa `SMTP_USER` como destinatario por defecto

Si SMTP no esta configurado:

- la app puede correr igual
- pero no va a enviar correos

## 10. Importante para esta instalacion

- el sistema esta pensado hoy como `single-tenant por cliente`
- `SELF_REGISTER_ENABLED` debe quedar en `false`
- no hay que crear varias empresas dentro de la misma base

## 11. Opcion alternativa: levantarlo con Docker

Si prefieren una prueba mas parecida a produccion:

```powershell
Copy-Item .env.single-tenant.example .env.single-tenant
```

Editar `.env.single-tenant` y despues correr:

```powershell
docker compose --env-file .env.single-tenant -f docker-compose.prod.yml up -d --build
```

Luego bootstrap:

```powershell
.\project-ops.ps1 bootstrap-client `
  -DbHost localhost `
  -DbPort 33060 `
  -DbUser root `
  -DbPassword CAMBIAR_ROOT_PASSWORD `
  -DbName gestion_kpi `
  -AdminName "Admin Cliente" `
  -AdminEmail admin@cliente.com `
  -AdminPassword "SuperSecret123!"
```

Y despues la misma migracion:

```powershell
Get-Content .\backend\scripts\add-check-ins.sql | mysql -h 127.0.0.1 -P 33060 -u root -pCAMBIAR_ROOT_PASSWORD gestion_kpi
```

## 13. Si algo falla

Revisar en este orden:

- que `MySQL` este levantado
- que `backend/.env` exista
- que `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` sean correctos
- que `npm install` haya corrido en `backend` y `frontend`
- que el puerto `5000` no este ocupado
- que el puerto `5173` no este ocupado

## 14. Archivos de referencia

- [README.md](/d:/proyectos laborales/Gestion_de_KPI/README.md)
- [DEPLOY-SINGLE-TENANT.md](/d:/proyectos laborales/Gestion_de_KPI/docs/DEPLOY-SINGLE-TENANT.md)
- [CONFIGURACION-ENV.md](/d:/proyectos laborales/Gestion_de_KPI/backend/CONFIGURACION-ENV.md)
