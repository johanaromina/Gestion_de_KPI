# Deploy single-tenant

Este proyecto se despliega con una instancia por cliente.

Hoy hay dos proyectos Docker Compose:

- `demo`
- `prueba`

Cada proyecto tiene:

- su propio contenedor `mysql`
- su propio `backend`
- su propio `frontend`

## Objetivo operativo

Reducir el tiempo de deploy sin arriesgar produccion:

- el `backend` se builda una sola vez y se comparte entre clientes
- el `frontend` se comparte solo si las variables `VITE_*` relevantes son iguales
- si difieren, cada cliente mantiene su propio build de frontend

## Flujo recomendado

En el servidor, desde `/opt/kpimanager`:

```bash
./deploy.sh
```

El script hace esto:

1. `git pull`
2. ejecuta migraciones listadas en `deploy.sh`
3. builda una sola vez la imagen del `backend`
4. despliega `backend` en `prueba` y `demo` sin rebuild adicional
5. compara la firma de build del `frontend`
6. si coincide, builda una sola vez el `frontend` y lo reutiliza
7. si no coincide, builda el `frontend` por cliente

## Variables que afectan el frontend

Actualmente el build del frontend depende de:

- `VITE_SELF_REGISTER_ENABLED`

`VITE_API_URL` queda fijo en `/api` desde `docker-compose.prod.yml`.

Si en el futuro agregas mas `VITE_*` al build de Compose/Docker, actualiza tambien la funcion `frontend_build_signature()` en `deploy.sh`.

## Variables que afectan el backend

El `backend` no depende de variables de build por cliente.
Las diferencias entre clientes se resuelven en runtime con `--env-file`.

Por eso la imagen Docker del backend puede compartirse de forma segura.

## Comandos manuales utiles

Rebuild solo backend compartido:

```bash
BACKEND_IMAGE=kpimanager/backend:shared docker compose --env-file .env.demo -f docker-compose.prod.yml -p demo build backend
BACKEND_IMAGE=kpimanager/backend:shared docker compose --env-file .env.prueba -f docker-compose.prod.yml -p prueba up -d --no-build backend
BACKEND_IMAGE=kpimanager/backend:shared docker compose --env-file .env.demo -f docker-compose.prod.yml -p demo up -d --no-build backend
```

Rebuild solo frontend de un cliente:

```bash
docker compose --env-file .env.prueba -f docker-compose.prod.yml -p prueba up -d --build frontend
```

## Nota sobre performance

El `Dockerfile` del backend usa `tsconfig.build.json` para el build de contenedor.
Ese archivo evita generar:

- `declaration`
- `declarationMap`
- `sourceMap`

Eso acelera el build Docker sin cambiar el comportamiento runtime del backend.
