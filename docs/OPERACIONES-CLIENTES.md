# Operaciones multi-cliente

Modelo de despliegue: **una instancia por cliente**.

Cada cliente tiene:
- su propio subdominio: `slug.kpimanager.com.ar`
- su propio compose y archivo `.env`
- su propia base MySQL: `gestion_kpi_slug`
- su propio backup independiente

Esto garantiza:
- aislamiento total de datos
- un cliente no afecta a otro
- backups y restores por cliente sin riesgo cruzado
- baja o cancelación de un cliente sin tocar a los demás

## Convención de nombrado

| Concepto       | Formato                        | Ejemplo                      |
|----------------|--------------------------------|------------------------------|
| Slug           | minúsculas, sin espacios       | `acme`, `paloverde`, `demo`  |
| URL            | `slug.kpimanager.com.ar`       | `acme.kpimanager.com.ar`     |
| Base MySQL     | `gestion_kpi_slug`             | `gestion_kpi_acme`           |
| Archivo env    | `.env.slug`                    | `.env.acme`                  |
| Carpeta backup | `backups/slug/...`             | `backups/acme/...`           |

**Nunca reutilizar slugs.** Si un cliente se va, su slug queda reservado.

## Alta de un cliente nuevo

### 1. Crear archivo de entorno

```powershell
Copy-Item .env.single-tenant.example .env.acme
```

Editar `.env.acme` y completar:

```env
CLIENT_SLUG=acme

APP_BASE_URL=https://acme.kpimanager.com.ar
FRONTEND_BASE_URL=https://acme.kpimanager.com.ar
PUBLIC_API_BASE_URL=https://acme.kpimanager.com.ar/api
CORS_ALLOWED_ORIGINS=https://acme.kpimanager.com.ar

MYSQL_DATABASE=gestion_kpi_acme
MYSQL_USER=gestion_kpi_acme
MYSQL_ROOT_PASSWORD=CLAVE_UNICA_ROOT
MYSQL_PASSWORD=CLAVE_UNICA_APP
JWT_SECRET=CLAVE_UNICA_JWT
AUTH_ENCRYPTION_KEY=CLAVE_UNICA_ENC

SELF_REGISTER_ENABLED=false
VITE_SELF_REGISTER_ENABLED=false
```

Para generar claves seguras:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Usar un valor distinto para `JWT_SECRET`, `AUTH_ENCRYPTION_KEY`, `MYSQL_ROOT_PASSWORD` y `MYSQL_PASSWORD`.

### 2. Levantar la instancia

```powershell
docker compose --env-file .env.acme -f docker-compose.prod.yml up -d --build
```

Si hay varias instancias en el mismo VPS, cada una necesita puertos distintos en el host. Editar en `.env.acme`:

```env
FRONTEND_PORT=8081
BACKEND_PORT=5001
MYSQL_PORT=33061
```

### 3. Bootstrapear la base

```powershell
.\project-ops.ps1 bootstrap-client `
  -DbHost localhost `
  -DbPort 33061 `
  -DbUser root `
  -DbPassword CLAVE_UNICA_ROOT `
  -DbName gestion_kpi_acme `
  -AdminName "Admin Acme" `
  -AdminEmail admin@acme.com `
  -AdminPassword "SuperSecret123!"
```

Esto crea el schema, aplica todas las migraciones (incluyendo check_ins) y crea el usuario admin inicial.

### 4. Validar

```powershell
.\project-ops.ps1 db-health `
  -DbHost localhost -DbPort 33061 `
  -DbUser root -DbPassword CLAVE_UNICA_ROOT `
  -DbName gestion_kpi_acme
```

### 5. Apuntar DNS

Crear registro A en el proveedor de dominio:
```
acme.kpimanager.com.ar → IP del VPS
```

Con reverse proxy (nginx/caddy) configurado para escuchar ese subdominio y redirigir al `FRONTEND_PORT` del cliente.

### 6. Entregar acceso

Entregar al cliente:
- URL: `https://acme.kpimanager.com.ar`
- Email admin: el que definiste en `-AdminEmail`
- Password: el que definiste en `-AdminPassword`

El admin puede cambiar su password desde "Mi cuenta" en la primera sesión.

---

## Tipos de instancia recomendados

| Tipo          | Infraestructura              | Cuándo usarlo                              |
|---------------|------------------------------|--------------------------------------------|
| Demo          | VPS compartido, puerto 8080  | Ventas, demos, pruebas internas            |
| Cliente chico | VPS compartido, puerto libre | Equipos <50 personas, bajo tráfico         |
| Cliente clave | VPS dedicado                 | Empresas grandes, SLA, datos sensibles     |

Para clientes chicos podés tener varias instancias en un mismo VPS, cada una con su compose, sus puertos y su base. El límite práctico depende de la RAM del servidor: cada instancia usa ~200-400 MB.

---

## Backup por cliente

```powershell
.\project-ops.ps1 backup-db `
  -DbHost localhost -DbPort 33061 `
  -DbUser root -DbPassword CLAVE_UNICA_ROOT `
  -DbName gestion_kpi_acme `
  -BackupDir .\backups\acme
```

El archivo queda en `backups/acme/gestion_kpi_acme_YYYYMMDD_HHMMSS.sql`.

Programar con Task Scheduler (Windows) o cron (Linux) una vez por día.

---

## Restore por cliente

```powershell
.\project-ops.ps1 restore-db `
  -DbHost localhost -DbPort 33061 `
  -DbUser root -DbPassword CLAVE_UNICA_ROOT `
  -DbName gestion_kpi_acme `
  -BackupFile .\backups\acme\gestion_kpi_acme_20260404_020000.sql
```

---

## Baja de un cliente

```powershell
# 1. Hacer backup final
.\project-ops.ps1 backup-db -DbName gestion_kpi_acme -BackupDir .\backups\acme\final ...

# 2. Bajar los contenedores
docker compose --env-file .env.acme -f docker-compose.prod.yml down -v

# 3. Archivar el .env (no borrarlo aun)
Rename-Item .env.acme .env.acme.archived

# 4. Borrar la base si corresponde
# (solo despues de confirmar que el cliente no vuelve)
```

---

## Actualizar una instancia existente

Cuando haya una nueva versión del producto:

```powershell
# Rebuild con el código nuevo
docker compose --env-file .env.acme -f docker-compose.prod.yml up -d --build

# Si hay migraciones nuevas (agregar tablas, etc.)
.\project-ops.ps1 migrate-schema `
  -DbHost localhost -DbPort 33061 `
  -DbUser root -DbPassword CLAVE_UNICA_ROOT `
  -DbName gestion_kpi_acme
```

`migrate-schema` usa `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... IF NOT EXISTS`, por lo que es seguro correrlo sobre una base existente.

---

## Checklist antes de entregar una instancia

- [ ] `.env.slug` completo con claves únicas
- [ ] `SELF_REGISTER_ENABLED=false`
- [ ] Bootstrap ejecutado correctamente
- [ ] `db-health` pasa sin errores
- [ ] Login funciona con el admin inicial
- [ ] SMTP configurado y probado (si el cliente necesita invitaciones/recupero)
- [ ] SSL activo en el subdominio
- [ ] DNS apuntando al VPS correcto
- [ ] Backup diario programado
- [ ] Restore probado al menos una vez antes de entregar

---

## Archivos de referencia

- [DEPLOY-SINGLE-TENANT.md](./DEPLOY-SINGLE-TENANT.md)
- [LEVANTAR-APP-LOCAL.md](./LEVANTAR-APP-LOCAL.md)
- [.env.single-tenant.example](../.env.single-tenant.example)
- [project-ops.ps1](../project-ops.ps1)
