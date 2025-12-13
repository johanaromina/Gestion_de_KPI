import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  ADVERTENCIA: JWT_SECRET no está configurado. Usando clave por defecto (solo para desarrollo).');
    console.warn('⚠️  En producción, configura JWT_SECRET en el archivo .env');
}
// Para MVP, usaremos la tabla de collaborators como usuarios
// En producción, deberías tener una tabla de usuarios separada
export const login = async (req, res) => {
    try {
        // MVP: login por ID de colaborador (email/contraseña no requeridos)
        const { collaboratorId } = req.body;
        if (!collaboratorId) {
            return res.status(400).json({ error: 'ID de colaborador requerido' });
        }
        const [rows] = await pool.query('SELECT * FROM collaborators WHERE id = ?', [collaboratorId]);
        if (Array.isArray(rows) && rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const collaborator = rows[0];
        // Para MVP, generamos token directamente
        // En producción, validarías la contraseña aquí
        const token = jwt.sign({
            id: collaborator.id,
            name: collaborator.name,
            role: collaborator.role,
            collaboratorId: collaborator.id,
        }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: collaborator.id,
                name: collaborator.name,
                role: collaborator.role,
                collaboratorId: collaborator.id,
            },
        });
    }
    catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
};
export const register = async (req, res) => {
    try {
        // Para MVP, el registro se hace creando un colaborador
        // En producción, crearías un usuario y luego un colaborador
        res.status(501).json({ error: 'Registro no implementado en MVP' });
    }
    catch (error) {
        console.error('Error in register:', error);
        res.status(500).json({ error: 'Error al registrar' });
    }
};
export const getCurrentUser = async (req, res) => {
    try {
        // El usuario viene del middleware de autenticación
        const user = req.user;
        // Obtener datos actualizados del colaborador
        const [rows] = await pool.query('SELECT * FROM collaborators WHERE id = ?', [user.collaboratorId || user.id]);
        if (Array.isArray(rows) && rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const collaborator = rows[0];
        res.json({
            id: user.id,
            name: collaborator.name,
            role: collaborator.role,
            collaboratorId: collaborator.id,
        });
    }
    catch (error) {
        console.error('Error getting current user:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
};
//# sourceMappingURL=auth.controller.js.map