# Configuración de Contraseña de MySQL

## Problema Actual

El archivo `.env` tiene una contraseña que no es correcta para tu instalación de MySQL.

## Solución

### Opción 1: Actualizar el archivo .env manualmente

Edita el archivo `backend/.env` y cambia la línea:

```
DB_PASSWORD=12345
```

Por tu contraseña real de MySQL:

```
DB_PASSWORD=tu_contraseña_real_aqui
```

Luego ejecuta:
```bash
npm run setup:db
```

### Opción 2: Usar el script interactivo

Ejecuta el script interactivo que te pedirá la contraseña:

```bash
npx tsx scripts/setup-database-interactive.ts
```

Cuando te pida la contraseña, ingrésala y presiona Enter.

### Opción 3: Ejecutar los scripts SQL directamente

Si prefieres ejecutar los scripts SQL manualmente con MySQL CLI:

```bash
# Con contraseña
mysql -u root -p < scripts/create_database.sql

# O desde PowerShell
Get-Content scripts/create_database.sql | mysql -u root -p
```

**Nota:** Los datos deben ser insertados manualmente a través de la aplicación.

## Verificar la Contraseña

Para verificar cuál es tu contraseña de MySQL, intenta conectarte manualmente:

```bash
mysql -u root -p
```

Si te conectas exitosamente, esa es la contraseña que debes usar en el `.env`.

