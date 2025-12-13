import { pool } from '../config/database';
export const getKPIs = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM kpis ORDER BY name ASC');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching KPIs:', error);
        res.status(500).json({ error: 'Error al obtener KPIs' });
    }
};
export const getKPIById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM kpis WHERE id = ?', [id]);
        if (Array.isArray(rows) && rows.length === 0) {
            return res.status(404).json({ error: 'KPI no encontrado' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching KPI:', error);
        res.status(500).json({ error: 'Error al obtener KPI' });
    }
};
export const createKPI = async (req, res) => {
    try {
        const { name, description, type, criteria, formula, macroKPIId } = req.body;
        if (!name || !type) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        // Validar fórmula si se proporciona
        if (formula) {
            const { validateFormula } = require('../utils/kpi-formulas');
            const validation = validateFormula(formula);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }
        }
        const [result] = await pool.query(`INSERT INTO kpis (name, description, type, criteria, formula, macroKPIId) 
       VALUES (?, ?, ?, ?, ?, ?)`, [
            name,
            description || null,
            type,
            criteria || null,
            formula || null,
            macroKPIId || null,
        ]);
        const insertResult = result;
        res.status(201).json({
            id: insertResult.insertId,
            name,
            description: description || null,
            type,
            criteria: criteria || null,
            formula: formula || null,
            macroKPIId: macroKPIId || null,
        });
    }
    catch (error) {
        console.error('Error creating KPI:', error);
        res.status(500).json({ error: 'Error al crear KPI' });
    }
};
export const updateKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, type, criteria, formula, macroKPIId } = req.body;
        // Validar fórmula si se proporciona
        if (formula !== undefined) {
            const { validateFormula } = require('../utils/kpi-formulas');
            if (formula && formula.trim()) {
                const validation = validateFormula(formula);
                if (!validation.valid) {
                    return res.status(400).json({ error: validation.error });
                }
            }
        }
        await pool.query(`UPDATE kpis 
       SET name = ?, description = ?, type = ?, criteria = ?, formula = ?, macroKPIId = ? 
       WHERE id = ?`, [
            name,
            description,
            type,
            criteria,
            formula || null,
            macroKPIId || null,
            id,
        ]);
        res.json({ message: 'KPI actualizado correctamente' });
    }
    catch (error) {
        console.error('Error updating KPI:', error);
        res.status(500).json({ error: 'Error al actualizar KPI' });
    }
};
export const deleteKPI = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM kpis WHERE id = ?', [id]);
        res.json({ message: 'KPI eliminado correctamente' });
    }
    catch (error) {
        console.error('Error deleting KPI:', error);
        res.status(500).json({ error: 'Error al eliminar KPI' });
    }
};
//# sourceMappingURL=kpis.controller.js.map