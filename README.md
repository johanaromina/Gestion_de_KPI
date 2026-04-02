# Sistema de Gestion de KPI

Aplicacion web para la gestion de objetivos y KPIs de colaboradores, reemplazando el sistema basado en Excel.

## Estructura del Proyecto

```
Gestion_de_KPI/
├── frontend/          # Aplicación React + TypeScript
├── backend/           # API REST Node.js + Express + TypeScript
└── shared/            # Tipos y utilidades compartidas
```

## Tecnologías

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- React Query
- Recharts (gráficos)
- React Hook Form + Zod (validación)

### Backend
- Node.js
- Express
- TypeScript
- MySQL2
- JWT (autenticación)
- bcryptjs (hash de contraseñas)

## Instalacion

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales de base de datos
npm run dev
```

## Desarrollo

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Despliegue recomendado hoy

Para comercializar la app en el estado actual, la estrategia recomendada es:

- `single-tenant por cliente`
- una app por empresa
- una base MySQL por empresa

Guia operativa:

- [docs/DEPLOY-SINGLE-TENANT.md](/d:/proyectos laborales/Gestion_de_KPI/docs/DEPLOY-SINGLE-TENANT.md)
- [docs/OPERACIONES-RAPIDAS.md](/d:/proyectos laborales/Gestion_de_KPI/docs/OPERACIONES-RAPIDAS.md)

## Estado actual (funcionalidades principales)

- KPIs macro + asignaciones por colaborador y periodo (con subperiodos)
- Tipos de KPI: manual / count / ratio / sla / value + direccion (growth/reduction/exact)
- Curaduria versionada (fuente/criterio) por asignacion
- Mediciones (manual/import/auto) con aprobacion
- Modulo Curaduria (bandeja) e Input de datos (historial)
- RBAC basico por permisos/roles
- Integraciones escalables: auth profiles, templates, targets, runs
- Org scopes jerarquicos para herencia de parametros (company > area > team > person)
- Notificaciones por correo con control de spam (cooldown)

## Base de datos (setup y migraciones utiles)

Desde `backend/`:

```bash
# 1) Crear estructura base (si estas empezando de cero)
npx tsx scripts/setup-database.ts

# 2) Curaduria + mediciones
npx tsx scripts/add-curation-measurements.ts

# 3) Integraciones Fase 2 (templates/targets/org_scopes)
npx tsx scripts/add-integrations-tables.ts
npx tsx scripts/migrate-templates-to-targets.ts
npx tsx scripts/seed-integrations-phase2.ts

# 4) Notificaciones
npx tsx scripts/add-notifications-table.ts

# 5) KPI types + direction
npx tsx scripts/add-kpi-type-direction.ts

# 6) Org scopes (si ya tenes colaboradores cargados)
npx tsx scripts/add-collaborators-orgscope.ts

# 7) Plan mensual con override de peso (opcional)
npx tsx scripts/add-collaborator-kpi-plan-override.ts
```

Notas:
- Si ya tenias datos, podes correr igual los scripts: son idempotentes o tolerantes a cambios ya aplicados.
- El manual operativo esta en `docs/manual-uso.md`.

## Notificaciones por correo (recomendado en desarrollo)

Para evitar spam durante pruebas, usa alguna de estas opciones en `backend/.env`:

```env
NOTIFY_ENABLED=false
```

o bien:

```env
NOTIFY_COOLDOWN_MIN=360
NOTIFY_INTERVAL_MIN=30
```

## Estructura de Carpetas Detallada

### Frontend (`frontend/`)
```
src/
├── components/     # Componentes reutilizables
├── pages/          # Páginas de la aplicación
├── services/       # Servicios de API
├── types/          # Definiciones de tipos TypeScript
├── utils/          # Utilidades y helpers
├── hooks/          # Custom React hooks
├── context/        # React Context providers
└── App.tsx         # Componente principal
```

### Backend (`backend/`)
```
src/
├── config/         # Configuración (DB, etc.)
├── controllers/    # Controladores de rutas
├── models/         # Modelos de datos
├── routes/         # Definición de rutas
├── middleware/     # Middlewares (auth, validation, etc.)
├── services/       # Lógica de negocio
├── types/          # Definiciones de tipos TypeScript
├── utils/          # Utilidades y helpers
└── index.ts        # Punto de entrada
```

## Scripts Disponibles

### Desde la raíz del proyecto:
- `npm run install:all` - Instala dependencias de frontend y backend
- `npm run dev:frontend` - Inicia el servidor de desarrollo del frontend
- `npm run dev:backend` - Inicia el servidor de desarrollo del backend
- `npm run build:frontend` - Construye el frontend para producción
- `npm run build:backend` - Construye el backend para producción

## Configuracion Inicial

1. **Backend**: Copiar `.env.example` a `.env` y configurar las credenciales de la base de datos
2. **Frontend**: El archivo `.env` se puede crear si necesitas variables de entorno personalizadas
3. **Base de datos**: Crear la base de datos MySQL según el nombre configurado en `.env`
4. **Org Scopes**: Vincular colaboradores a scopes con `add-collaborators-orgscope.ts`

## Estado del proyecto

El proyecto ya incluye modulos clave (curaduria, mediciones, RBAC e integraciones). El foco actual esta en pulir UX y consolidar flujos operativos.
