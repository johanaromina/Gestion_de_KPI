# Configuración de Base de Datos

## Pasos para configurar la base de datos

### 1. Crear archivo .env

Crea un archivo `.env` en la carpeta `backend/` con las siguientes variables:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contraseña_mysql
DB_NAME=gestion_kpi

PORT=5000
JWT_SECRET=your-secret-key-change-in-production
```

**Nota:** Reemplaza `tu_contraseña_mysql` con la contraseña real de tu usuario de MySQL.

### 2. Ejecutar scripts de base de datos

Una vez configurado el archivo `.env`, ejecuta el script de creación:

```bash
npm run setup:db
```

Este script:
- ✅ Crea la base de datos `gestion_kpi` si no existe
- ✅ Crea todas las tablas necesarias
- ✅ Inserta datos de ejemplo

### 3. Verificar la conexión

Para verificar que la base de datos está configurada correctamente:

```bash
npm run test:db
```

### 4. Iniciar el servidor

Una vez configurada la base de datos, inicia el servidor:

```bash
npm run dev
```

El servidor verificará automáticamente la conexión a la base de datos al iniciar.

## Estructura de la Base de Datos

Las siguientes tablas se crean automáticamente:

- **collaborators** - Colaboradores del sistema
- **periods** - Períodos de evaluación
- **sub_periods** - Subperíodos dentro de un período
- **kpis** - Definiciones de KPIs
- **collaborator_kpis** - Relación entre colaboradores, KPIs y períodos
- **objective_trees** - Árbol de objetivos jerárquico

## Solución de Problemas

### Error: Access denied

Si recibes un error de acceso denegado:

1. Verifica que las credenciales en `.env` sean correctas
2. Asegúrate de que MySQL esté ejecutándose
3. Verifica que el usuario tenga permisos para crear bases de datos

### Error: Database already exists

Si la base de datos ya existe, el script la reutilizará. Si quieres recrearla desde cero, elimínala primero:

```sql
DROP DATABASE IF EXISTS gestion_kpi;
```

Luego ejecuta nuevamente `npm run setup:db`.

