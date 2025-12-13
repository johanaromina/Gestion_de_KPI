import { pool } from '../config/database';
import { logAudit } from '../utils/audit';
export const getCollaborators = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM collaborators ORDER BY name ASC');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching collaborators:', error);
        res.status(500).json({ error: 'Error al obtener colaboradores' });
    }
};
export const getCollaboratorById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM collaborators WHERE id = ?', [id]);
        if (Array.isArray(rows) && rows.length === 0) {
            return res.status(404).json({ error: 'Colaborador no encontrado' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching collaborator:', error);
        res.status(500).json({ error: 'Error al obtener colaborador' });
    }
};
export const createCollaborator = async (req, res) => {
    try {
        const { name, position, area, managerId, role } = req.body;
        if (!name || !position || !area || !role) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        const [result] = await pool.query(`INSERT INTO collaborators (name, position, area, managerId, role) 
       VALUES (?, ?, ?, ?, ?)`, [name, position, area, managerId || null, role]);
        const insertResult = result;
        const newId = insertResult.insertId;
        // Registrar auditoría
        await logAudit('collaborators', newId, 'CREATE', undefined, { name, position, area, managerId: managerId || null, role }, {
            userId: req.user?.id,
            userName: req.user?.name,
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
        });
        res.status(201).json({
            id: newId,
            name,
            position,
            area,
            managerId: managerId || null,
            role,
        });
    }
    catch (error) {
        console.error('Error creating collaborator:', error);
        res.status(500).json({ error: 'Error al crear colaborador' });
    }
};
export const updateCollaborator = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, position, area, managerId, role } = req.body;
        // Obtener valores anteriores
        const [oldRows] = await pool.query('SELECT * FROM collaborators WHERE id = ?', [id]);
        const oldValues = Array.isArray(oldRows) && oldRows.length > 0 ? oldRows[0] : null;
        await pool.query(`UPDATE collaborators 
       SET name = ?, position = ?, area = ?, managerId = ?, role = ? 
       WHERE id = ?`, [name, position, area, managerId || null, role, id]);
        // Registrar auditoría
        await logAudit('collaborators', parseInt(id), 'UPDATE', oldValues, { name, position, area, managerId: managerId || null, role }, {
            userId: req.user?.id,
            userName: req.user?.name,
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
        });
        res.json({ message: 'Colaborador actualizado correctamente' });
    }
    catch (error) {
        console.error('Error updating collaborator:', error);
        res.status(500).json({ error: 'Error al actualizar colaborador' });
    }
};
export const deleteCollaborator = async (req, res) => {
    try {
        const { id } = req.params;
        // Obtener valores antes de eliminar
        const [oldRows] = await pool.query('SELECT * FROM collaborators WHERE id = ?', [id]);
        const oldValues = Array.isArray(oldRows) && oldRows.length > 0 ? oldRows[0] : null;
        await pool.query('DELETE FROM collaborators WHERE id = ?', [id]);
        // Registrar auditoría
        if (oldValues) {
            await logAudit('collaborators', parseInt(id), 'DELETE', oldValues, undefined, {
                userId: req.user?.id,
                userName: req.user?.name,
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.get('user-agent'),
            });
        }
        res.json({ message: 'Colaborador eliminado correctamente' });
    }
    catch (error) {
        console.error('Error deleting collaborator:', error);
        res.status(500).json({ error: 'Error al eliminar colaborador' });
    }
};
//# sourceMappingURL=collaborators.controller.js.map