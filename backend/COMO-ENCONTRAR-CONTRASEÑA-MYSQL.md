# Cómo Encontrar tu Contraseña de MySQL

## Método 1: Intentar Conectarte Manualmente (Más Fácil)

Abre PowerShell o CMD y ejecuta:

```bash
mysql -u root -p
```

- Si te pide contraseña: ingrésala (no se mostrará mientras escribes)
- Si no te pide contraseña o presionas Enter y funciona: **NO tienes contraseña** (déjala vacía en el .env)

## Método 2: Verificar Archivos de Configuración

### Si instalaste MySQL con MySQL Installer:

1. Busca el archivo de configuración:
   - `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`
   - O en: `C:\Program Files\MySQL\MySQL Server 8.0\my.ini`

2. Busca la sección `[client]` o `[mysql]` que pueda tener la contraseña

### Si usas XAMPP:

- Por defecto **NO tiene contraseña** (vacío)
- O la contraseña es: `root`

### Si usas WAMP:

- Por defecto **NO tiene contraseña** (vacío)

## Método 3: Revisar MySQL Workbench

Si tienes MySQL Workbench instalado:

1. Abre MySQL Workbench
2. Revisa las conexiones guardadas
3. Ahí puedes ver la contraseña guardada (si la guardaste)

## Método 4: Restablecer la Contraseña

Si no recuerdas la contraseña, puedes restablecerla:

### Opción A: Usando MySQL Installer (Windows)

1. Abre MySQL Installer
2. Selecciona "Reconfigure" en tu instalación de MySQL
3. Sigue el asistente y establece una nueva contraseña

### Opción B: Modo Seguro (Avanzado)

1. Detener el servicio MySQL:
   ```powershell
   net stop MySQL80
   ```

2. Iniciar MySQL en modo seguro (sin verificación de contraseña):
   ```bash
   mysqld --skip-grant-tables
   ```

3. En otra ventana de CMD, conectarte:
   ```bash
   mysql -u root
   ```

4. Cambiar la contraseña:
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'tu_nueva_contraseña';
   FLUSH PRIVILEGES;
   EXIT;
   ```

5. Reiniciar MySQL normalmente

## Método 5: Usar el Script de Verificación

Ejecuta el script que creamos:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verificar-mysql.ps1
```

## Una Vez que Tengas la Contraseña

1. Edita el archivo `backend/.env`
2. Actualiza la línea:
   ```
   DB_PASSWORD=tu_contraseña_aqui
   ```
   (Si no tienes contraseña, déjala vacía: `DB_PASSWORD=`)

3. Ejecuta:
   ```bash
   npm run setup:db
   ```

## Prueba Rápida

Ejecuta este comando para probar si funciona sin contraseña:

```bash
mysql -u root -e "SELECT 'Funciona sin contraseña' AS resultado;"
```

Si funciona, no necesitas contraseña. Si no funciona, necesitas la contraseña correcta.

