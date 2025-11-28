# Sistema de Gestión de KPI

Aplicación web para la gestión de objetivos y KPIs de colaboradores, reemplazando el sistema basado en Excel.

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

## Instalación

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

## Próximos Pasos

1. Configurar base de datos MySQL
2. Implementar modelos de datos
3. Crear endpoints de API
4. Desarrollar componentes de UI
5. Implementar autenticación y autorización

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

## Configuración Inicial

1. **Backend**: Copiar `.env.example` a `.env` y configurar las credenciales de la base de datos
2. **Frontend**: El archivo `.env` se puede crear si necesitas variables de entorno personalizadas
3. **Base de datos**: Crear la base de datos MySQL según el nombre configurado en `.env`

## Estado del Proyecto

✅ Estructura de carpetas creada
✅ Configuración de TypeScript
✅ Dependencias instaladas
✅ Archivos base creados
⏳ Pendiente: Implementación de funcionalidades MVP

