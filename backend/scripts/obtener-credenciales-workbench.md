# Cómo Obtener las Credenciales de MySQL Workbench

## Pasos para Ver la Contraseña en MySQL Workbench:

1. **Abre MySQL Workbench**

2. **Ve a "Server" → "Data Export" o simplemente haz clic derecho en cualquier base de datos**

3. **O mejor aún, ve a las conexiones guardadas:**
   - En la pantalla principal de MySQL Workbench, verás una lista de conexiones
   - Haz clic derecho en la conexión que estás usando (probablemente "Local instance MySQL80" o similar)
   - Selecciona "Edit Connection"
   - Ahí verás:
     - **Username**: (probablemente "root")
     - **Password**: (puede estar oculta, pero puedes verla o cambiarla)

4. **O desde el menú:**
   - Ve a "Database" → "Manage Connections..."
   - Selecciona tu conexión
   - Haz clic en "Edit"
   - Verás el usuario y podrás ver/cambiar la contraseña

## Una vez que tengas la información:

- **Usuario**: (probablemente "root")
- **Contraseña**: (la que veas o uses en Workbench)

Actualiza el archivo `.env` con esos valores.

