# Despliegue Single-Tenant por Cliente

Modelo recomendado hoy para KPI Manager:

- una aplicacion por cliente
- una base MySQL por cliente
- sin mezclar datos entre empresas
- con auto-registro deshabilitado por defecto

Esto reduce riesgo tecnico y operativo, y encaja con el estado actual del producto.

## Artefactos incluidos

- [docker-compose.prod.yml](/d:/proyectos laborales/Gestion_de_KPI/docker-compose.prod.yml)
- [backend/Dockerfile](/d:/proyectos laborales/Gestion_de_KPI/backend/Dockerfile)
- [frontend/Dockerfile](/d:/proyectos laborales/Gestion_de_KPI/frontend/Dockerfile)
- [frontend/nginx.conf](/d:/proyectos laborales/Gestion_de_KPI/frontend/nginx.conf)
- [.env.single-tenant.example](/d:/proyectos laborales/Gestion_de_KPI/.env.single-tenant.example)
- [backend/.env.production.example](/d:/proyectos laborales/Gestion_de_KPI/backend/.env.production.example)
- [project-ops.ps1](/d:/proyectos laborales/Gestion_de_KPI/project-ops.ps1)

## Arquitectura sugerida

- `frontend` expuesto al usuario final
- `backend` expuesto solo al host o reverse proxy
- `mysql` expuesto solo a `127.0.0.1`

Con el `docker compose` incluido:

- frontend: puerto publico configurable, default `8080`
- backend: `127.0.0.1:5000`
- mysql: `127.0.0.1:33060`

## 1. Validacion local sin dominio

Antes de publicar una instancia real, conviene validar todo en `localhost`.

Copiar:

```powershell
Copy-Item .env.single-tenant.example .env.single-tenant
```

Usar valores locales:

```env
APP_BASE_URL=http://localhost:8080
FRONTEND_BASE_URL=http://localhost:8080
PUBLIC_API_BASE_URL=http://localhost:8080/api
CORS_ALLOWED_ORIGINS=http://localhost:8080
TRUST_PROXY=true
```

Si `33060` ya esta ocupado en tu maquina:

- cambia `MYSQL_PORT` a `33061` o similar
- usa ese mismo puerto despues en `bootstrap-client`, `db-health` y `backup/restore`

Levantar:

```powershell
docker compose --env-file .env.single-tenant -f docker-compose.prod.yml up -d --build
```

Bootstrap local:

```powershell
.\project-ops.ps1 bootstrap-client `
  -DbHost localhost `
  -DbPort <MYSQL_PORT> `
  -DbUser root `
  -DbPassword CAMBIAR_ROOT_PASSWORD `
  -DbName gestion_kpi `
  -AdminName "Admin Cliente" `
  -AdminEmail admin@cliente.com `
  -AdminPassword "SuperSecret123!"
```

Validar:

```powershell
.\project-ops.ps1 db-health -DbHost localhost -DbPort <MYSQL_PORT> -DbUser root -DbPassword CAMBIAR_ROOT_PASSWORD -DbName gestion_kpi
.\project-ops.ps1 test-critical
```

Importante:

- `test-critical` resiembra dataset demo antes de probar
- usalo solo sobre una base local o demo aislada
- no lo ejecutes sobre una base de cliente real

## 2. Preparar variables de produccion

Copiar:

```powershell
Copy-Item .env.single-tenant.example .env.single-tenant
```

Completar al menos:

- `APP_BASE_URL`
- `FRONTEND_BASE_URL`
- `PUBLIC_API_BASE_URL`
- `SELF_REGISTER_ENABLED=false`
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `JWT_SECRET`
- `AUTH_ENCRYPTION_KEY`
- `SMTP_*`

Para una instancia real por cliente:

- reemplaza `localhost` por el dominio o subdominio del cliente
- usa secretos fuertes y unicos para `JWT_SECRET` y `AUTH_ENCRYPTION_KEY`
- configura `SMTP_*` real antes de habilitar recovery, MFA o notificaciones
- no reutilices passwords de desarrollo
- para demo podes usar tu correo personal
- para venta real conviene un remitente propio del producto, por ejemplo `no-reply@tu-dominio.com`

Ejemplo:

```env
APP_BASE_URL=https://cliente-demo.tu-dominio.com
FRONTEND_BASE_URL=https://cliente-demo.tu-dominio.com
PUBLIC_API_BASE_URL=https://cliente-demo.tu-dominio.com/api
CORS_ALLOWED_ORIGINS=https://cliente-demo.tu-dominio.com
TRUST_PROXY=true
```

## 3. Levantar la instancia

Desde la raiz:

```powershell
docker compose --env-file .env.single-tenant -f docker-compose.prod.yml up -d --build
```

## 4. Bootstrapear la base del cliente

Usando el MySQL publicado localmente por `compose`:

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

Eso hace:

- `setup-db`
- `migrate-schema`
- crea el admin inicial local
- deja la instancia lista para un solo cliente; no crea nuevas empresas dentro de la misma base

## 5. Validaciones recomendadas

```powershell
.\project-ops.ps1 db-health -DbHost localhost -DbPort 33060 -DbUser root -DbPassword CAMBIAR_ROOT_PASSWORD -DbName gestion_kpi
```

Para produccion real:

- usa `db-health`
- valida login y flujos desde la UI
- no ejecutes `test-critical` sobre la base real del cliente

Si no queres dataset demo en produccion, usa solo `bootstrap-client`.

Mantene estas flags en `false` para single-tenant:

- `SELF_REGISTER_ENABLED=false`
- `VITE_SELF_REGISTER_ENABLED=false`

Para validar SMTP antes de salir a mercado:

```powershell
cd backend
npm run test:smtp -- --to=tu-mail@dominio.com
```

Si queres una instancia demo para ventas:

```powershell
.\project-ops.ps1 bootstrap-client `
  -DbHost localhost `
  -DbPort 33060 `
  -DbUser root `
  -DbPassword CAMBIAR_ROOT_PASSWORD `
  -DbName gestion_kpi `
  -SeedDemoData
```

## 6. Backup y restore

Backup:

```powershell
.\project-ops.ps1 backup-db `
  -DbHost localhost `
  -DbPort 33060 `
  -DbUser root `
  -DbPassword CAMBIAR_ROOT_PASSWORD `
  -DbName gestion_kpi
```

Restore:

```powershell
.\project-ops.ps1 restore-db `
  -DbHost localhost `
  -DbPort 33060 `
  -DbUser root `
  -DbPassword CAMBIAR_ROOT_PASSWORD `
  -DbName gestion_kpi `
  -BackupFile .\backups\gestion_kpi_YYYYMMDD_HHMMSS.sql
```

## 7. Publicacion real

Antes de abrir una instancia a internet:

- tener un VPS o servidor con IP publica
- registrar un dominio o subdominio por cliente
- apuntar DNS al servidor
- poner un reverse proxy delante del frontend y backend
- emitir SSL para el dominio final

Checklist recomendado:

- `frontend` expuesto por dominio final del cliente
- `backend` solo accesible desde el host o reverse proxy
- `mysql` solo en `127.0.0.1`
- SSL activo
- backup diario probado
- restore probado
- SMTP real configurado
- secretos fuera del repo

## Recomendaciones operativas

- usar un dominio o subdominio por cliente
- poner SSL delante del frontend
- no exponer MySQL a internet
- mantener `JWT_SECRET` y `AUTH_ENCRYPTION_KEY` fuera del repo
- programar backup diario y prueba de restore
- configurar SMTP real antes de usar MFA o reset
- si vas con enterprise, agregar luego SSO por instancia
