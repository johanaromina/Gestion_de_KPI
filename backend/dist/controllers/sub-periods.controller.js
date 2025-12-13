import { pool } from '../config/database';
export const getSubPeriods = async (req, res) => {
    try {
        const { periodId } = req.query;
        let query = 'SELECT * FROM sub_periods';
        const params = [];
        if (periodId) {
            query += ' WHERE periodId = ?';
            params.push(periodId);
        }
        query += ' ORDER BY startDate ASC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching sub-periods:', error);
        res.status(500).json({ error: 'Error al obtener subperíodos' });
    }
};
export const getSubPeriodById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM sub_periods WHERE id = ?', [id]);
        if (Array.isArray(rows) && rows.length === 0) {
            return res.status(404).json({ error: 'Subperíodo no encontrado' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching sub-period:', error);
        res.status(500).json({ error: 'Error al obtener subperíodo' });
    }
};
export const createSubPeriod = async (req, res) => {
    try {
        const { periodId, name, startDate, endDate, weight } = req.body;
        if (!periodId || !name || !startDate || !endDate) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        const [result] = await pool.query(`INSERT INTO sub_periods (periodId, name, startDate, endDate, weight) 
       VALUES (?, ?, ?, ?, ?)`, [periodId, name, startDate, endDate, weight || null]);
        const insertResult = result;
        res.status(201).json({
            id: insertResult.insertId,
            periodId,
            name,
            startDate,
            endDate,
            weight: weight || null,
        });
    }
    catch (error) {
        console.error('Error creating sub-period:', error);
        res.status(500).json({ error: 'Error al crear subperíodo' });
    }
};
export const updateSubPeriod = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, startDate, endDate, weight } = req.body;
        await pool.query(`UPDATE sub_periods 
       SET name = ?, startDate = ?, endDate = ?, weight = ? 
       WHERE id = ?`, [name, startDate, endDate, weight || null, id]);
        res.json({ message: 'Subperíodo actualizado correctamente' });
    }
    catch (error) {
        console.error('Error updating sub-period:', error);
        res.status(500).json({ error: 'Error al actualizar subperíodo' });
    }
};
export const deleteSubPeriod = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM sub_periods WHERE id = ?', [id]);
        res.json({ message: 'Subperíodo eliminado correctamente' });
    }
    catch (error) {
        console.error('Error deleting sub-period:', error);
        res.status(500).json({ error: 'Error al eliminar subperíodo' });
    }
};
//# sourceMappingURL=sub-periods.controller.js.map