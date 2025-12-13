import { pool } from '../config/database';
import { calculateVariation, calculateWeightedResult, } from '../utils/kpi-formulas';
export const getCollaboratorKPIs = async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT ck.*, 
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria,
              c.name as collaboratorName,
              p.name as periodName,
              p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       JOIN periods p ON ck.periodId = p.id
       ORDER BY ck.createdAt DESC`);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching collaborator KPIs:', error);
        res.status(500).json({ error: 'Error al obtener asignaciones' });
    }
};
export const getCollaboratorKPIById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`SELECT ck.*, 
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(rows) && rows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching collaborator KPI:', error);
        res.status(500).json({ error: 'Error al obtener asignación' });
    }
};
export const getCollaboratorKPIsByCollaborator = async (req, res) => {
    try {
        const { collaboratorId } = req.params;
        const { periodId } = req.query;
        let query = `SELECT ck.*, 
                        k.type as kpiType,
                        k.name as kpiName,
                        k.description as kpiDescription,
                        k.criteria as kpiCriteria,
                        p.name as periodName,
                        p.status as periodStatus
                 FROM collaborator_kpis ck
                 JOIN kpis k ON ck.kpiId = k.id
                 JOIN periods p ON ck.periodId = p.id
                 WHERE ck.collaboratorId = ?`;
        const params = [collaboratorId];
        if (periodId) {
            query += ' AND ck.periodId = ?';
            params.push(periodId);
        }
        query += ' ORDER BY p.startDate DESC, ck.createdAt DESC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching collaborator KPIs:', error);
        res.status(500).json({ error: 'Error al obtener asignaciones' });
    }
};
export const getCollaboratorKPIsByPeriod = async (req, res) => {
    try {
        const { periodId } = req.params;
        const [rows] = await pool.query(`SELECT ck.*, 
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria,
              c.name as collaboratorName
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       WHERE ck.periodId = ?
       ORDER BY c.name ASC`, [periodId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching collaborator KPIs:', error);
        res.status(500).json({ error: 'Error al obtener asignaciones' });
    }
};
export const createCollaboratorKPI = async (req, res) => {
    try {
        const { collaboratorId, kpiId, periodId, subPeriodId, target, weight, status, } = req.body;
        if (!collaboratorId || !kpiId || !periodId || !target || !weight) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        // Verificar si el período está cerrado
        const [periodRows] = await pool.query('SELECT status FROM periods WHERE id = ?', [periodId]);
        if (Array.isArray(periodRows) &&
            periodRows.length > 0 &&
            periodRows[0].status === 'closed') {
            return res.status(403).json({
                error: 'No se pueden crear asignaciones en períodos cerrados',
            });
        }
        // Validar suma de ponderaciones
        const [existingWeights] = await pool.query(`SELECT SUM(weight) as totalWeight 
       FROM collaborator_kpis 
       WHERE collaboratorId = ? AND periodId = ?`, [collaboratorId, periodId]);
        if (Array.isArray(existingWeights) && existingWeights.length > 0) {
            const currentTotal = parseFloat(existingWeights[0].totalWeight || 0);
            const newTotal = currentTotal + weight;
            if (newTotal > 100.01) {
                return res.status(400).json({
                    error: `La suma de ponderaciones sería ${newTotal.toFixed(2)}%. Debe ser máximo 100%`,
                });
            }
        }
        // Obtener tipo de KPI para cálculos
        const [kpiRows] = await pool.query('SELECT type FROM kpis WHERE id = ?', [kpiId]);
        if (Array.isArray(kpiRows) && kpiRows.length === 0) {
            return res.status(404).json({ error: 'KPI no encontrado' });
        }
        const kpiType = kpiRows[0].type;
        const [result] = await pool.query(`INSERT INTO collaborator_kpis 
       (collaboratorId, kpiId, periodId, subPeriodId, target, weight, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            collaboratorId,
            kpiId,
            periodId,
            subPeriodId || null,
            target,
            weight,
            status || 'draft',
        ]);
        const insertResult = result;
        res.status(201).json({
            id: insertResult.insertId,
            collaboratorId,
            kpiId,
            periodId,
            subPeriodId: subPeriodId || null,
            target,
            weight,
            status: status || 'draft',
        });
    }
    catch (error) {
        console.error('Error creating collaborator KPI:', error);
        res.status(500).json({ error: 'Error al crear asignación' });
    }
};
export const updateCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { target, actual, weight, status, comments, subPeriodId, } = req.body;
        // Verificar si la asignación está cerrada o el período está cerrado
        const [ckRows] = await pool.query(`SELECT ck.status as assignmentStatus, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        const { assignmentStatus, periodStatus } = ckRows[0];
        // Bloquear edición si está cerrada o el período está cerrado
        if (assignmentStatus === 'closed' || periodStatus === 'closed') {
            // Solo permitir cambiar a 'closed' si no está cerrada, o reabrir si tiene permisos
            const userRole = req.user?.role;
            const canReopen = ['admin', 'director'].includes(userRole);
            if (status !== 'closed' && !canReopen) {
                return res.status(403).json({
                    error: 'No se puede editar una asignación cerrada. Solo administradores y directores pueden reabrir.',
                });
            }
            // Si está cerrada y no es admin/director, bloquear cualquier cambio excepto cerrar
            if (assignmentStatus === 'closed' && !canReopen) {
                return res.status(403).json({
                    error: 'Esta asignación está cerrada y no puede ser editada. Solo administradores y directores pueden reabrir.',
                });
            }
        }
        // Validar suma de ponderaciones si se actualiza el peso
        if (weight !== undefined) {
            const [existingWeights] = await pool.query(`SELECT SUM(weight) as totalWeight 
         FROM collaborator_kpis 
         WHERE collaboratorId = (SELECT collaboratorId FROM collaborator_kpis WHERE id = ?)
         AND periodId = (SELECT periodId FROM collaborator_kpis WHERE id = ?)
         AND id != ?`, [id, id, id]);
            if (Array.isArray(existingWeights) && existingWeights.length > 0) {
                const currentTotal = parseFloat(existingWeights[0].totalWeight || 0);
                const newTotal = currentTotal + weight;
                if (newTotal > 100.01) {
                    return res.status(400).json({
                        error: `La suma de ponderaciones sería ${newTotal.toFixed(2)}%. Debe ser máximo 100%`,
                    });
                }
            }
        }
        // Si se actualiza actual, recalcular variación y alcance ponderado
        let updateQuery = `UPDATE collaborator_kpis 
                       SET target = ?, weight = ?, status = ?, comments = ?, subPeriodId = ?`;
        const params = [target, weight, status, comments, subPeriodId || null];
        if (actual !== undefined) {
            // Obtener tipo de KPI y target actual
            const [ckDataRows] = await pool.query(`SELECT ck.target, k.type 
         FROM collaborator_kpis ck
         JOIN kpis k ON ck.kpiId = k.id
         WHERE ck.id = ?`, [id]);
            if (Array.isArray(ckDataRows) && ckDataRows.length > 0) {
                const kpiType = ckDataRows[0].type;
                const currentTarget = target || ckDataRows[0].target;
                // Obtener fórmula personalizada del KPI si existe
                const [kpiRows] = await pool.query(`SELECT formula FROM kpis WHERE id = (SELECT kpiId FROM collaborator_kpis WHERE id = ?)`, [id]);
                const customFormula = kpiRows?.[0]?.formula || undefined;
                const variation = calculateVariation(kpiType, currentTarget, actual, customFormula);
                const weightedResult = calculateWeightedResult(variation, weight);
                updateQuery += `, actual = ?, variation = ?, weightedResult = ?`;
                params.push(actual, variation, weightedResult);
            }
            else {
                updateQuery += `, actual = ?`;
                params.push(actual);
            }
        }
        updateQuery += ' WHERE id = ?';
        params.push(id);
        await pool.query(updateQuery, params);
        res.json({ message: 'Asignación actualizada correctamente' });
    }
    catch (error) {
        console.error('Error updating collaborator KPI:', error);
        res.status(500).json({ error: 'Error al actualizar asignación' });
    }
};
export const updateActualValue = async (req, res) => {
    try {
        const { id } = req.params;
        const { actual } = req.body;
        if (actual === undefined) {
            return res.status(400).json({ error: 'El valor actual es requerido' });
        }
        // Verificar si está cerrada
        const [ckRows] = await pool.query(`SELECT ck.status, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        if (ckRows[0].status === 'closed' || ckRows[0].periodStatus === 'closed') {
            return res.status(403).json({
                error: 'No se puede actualizar el valor de una asignación cerrada',
            });
        }
        // Obtener datos necesarios para cálculo
        const [ckDataRows] = await pool.query(`SELECT ck.target, ck.weight, k.type 
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       WHERE ck.id = ?`, [id]);
        const { target, weight, type } = ckDataRows[0];
        // Obtener fórmula personalizada del KPI si existe
        const [kpiRows] = await pool.query(`SELECT formula FROM kpis WHERE id = (SELECT kpiId FROM collaborator_kpis WHERE id = ?)`, [id]);
        const customFormula = kpiRows?.[0]?.formula || undefined;
        const variation = calculateVariation(type, target, actual, customFormula);
        const weightedResult = calculateWeightedResult(variation, weight);
        await pool.query(`UPDATE collaborator_kpis 
       SET actual = ?, variation = ?, weightedResult = ? 
       WHERE id = ?`, [actual, variation, weightedResult, id]);
        res.json({
            message: 'Valor actualizado correctamente',
            actual,
            variation,
            weightedResult,
        });
    }
    catch (error) {
        console.error('Error updating actual value:', error);
        res.status(500).json({ error: 'Error al actualizar valor' });
    }
};
export const closeCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        // Verificar si ya está cerrada
        const [ckRows] = await pool.query('SELECT status FROM collaborator_kpis WHERE id = ?', [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        if (ckRows[0].status === 'closed') {
            return res.status(400).json({ error: 'La asignación ya está cerrada' });
        }
        await pool.query('UPDATE collaborator_kpis SET status = ? WHERE id = ?', ['closed', id]);
        res.json({ message: 'Asignación cerrada correctamente' });
    }
    catch (error) {
        console.error('Error closing collaborator KPI:', error);
        res.status(500).json({ error: 'Error al cerrar asignación' });
    }
};
export const reopenCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const userRole = req.user?.role;
        // Verificar permisos (solo admin y director)
        if (!['admin', 'director'].includes(userRole)) {
            return res.status(403).json({
                error: 'Solo administradores y directores pueden reabrir asignaciones cerradas',
            });
        }
        // Verificar si está cerrada
        const [ckRows] = await pool.query('SELECT status FROM collaborator_kpis WHERE id = ?', [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        if (ckRows[0].status !== 'closed') {
            return res.status(400).json({ error: 'La asignación no está cerrada' });
        }
        await pool.query('UPDATE collaborator_kpis SET status = ? WHERE id = ?', ['approved', id]);
        res.json({ message: 'Asignación reabierta correctamente' });
    }
    catch (error) {
        console.error('Error reopening collaborator KPI:', error);
        res.status(500).json({ error: 'Error al reabrir asignación' });
    }
};
export const proposeCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { actual, comments } = req.body;
        // Verificar si la asignación existe y no está cerrada
        const [ckRows] = await pool.query(`SELECT ck.*, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        const assignment = ckRows[0];
        if (assignment.status === 'closed' || assignment.periodStatus === 'closed') {
            return res.status(403).json({
                error: 'No se puede proponer valores en asignaciones o períodos cerrados',
            });
        }
        // Si se proporciona actual, actualizar y recalcular
        let updateData = {
            status: 'proposed',
            comments: comments || assignment.comments || null,
        };
        if (actual !== undefined) {
            // Obtener tipo de KPI y fórmula para cálculo
            const [kpiRows] = await pool.query('SELECT type, formula FROM kpis WHERE id = ?', [assignment.kpiId]);
            if (Array.isArray(kpiRows) && kpiRows.length > 0) {
                const kpiType = kpiRows[0].type;
                const customFormula = kpiRows[0].formula || undefined;
                const variation = calculateVariation(kpiType, assignment.target, actual, customFormula);
                const weightedResult = calculateWeightedResult(variation, assignment.weight);
                updateData.actual = actual;
                updateData.variation = variation;
                updateData.weightedResult = weightedResult;
            }
            else {
                updateData.actual = actual;
            }
        }
        // Actualizar asignación
        const updateFields = Object.keys(updateData)
            .map((key) => `${key} = ?`)
            .join(', ');
        const updateValues = Object.values(updateData);
        updateValues.push(id);
        await pool.query(`UPDATE collaborator_kpis SET ${updateFields} WHERE id = ?`, updateValues);
        res.json({ message: 'Valores propuestos correctamente' });
    }
    catch (error) {
        console.error('Error proposing collaborator KPI:', error);
        res.status(500).json({ error: 'Error al proponer valores' });
    }
};
export const approveCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { comments } = req.body;
        const userRole = req.user?.role;
        // Verificar permisos (solo jefes, managers, directors, admins)
        const allowedRoles = ['admin', 'director', 'manager', 'leader'];
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: 'No tienes permisos para aprobar asignaciones',
            });
        }
        // Verificar si la asignación existe y está propuesta
        const [ckRows] = await pool.query(`SELECT ck.*, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        const assignment = ckRows[0];
        if (assignment.status !== 'proposed') {
            return res.status(400).json({
                error: 'Solo se pueden aprobar asignaciones en estado "propuesto"',
            });
        }
        if (assignment.periodStatus === 'closed') {
            return res.status(403).json({
                error: 'No se puede aprobar asignaciones en períodos cerrados',
            });
        }
        // Actualizar a aprobado
        await pool.query(`UPDATE collaborator_kpis 
       SET status = ?, comments = ? 
       WHERE id = ?`, ['approved', comments || assignment.comments || null, id]);
        res.json({ message: 'Asignación aprobada correctamente' });
    }
    catch (error) {
        console.error('Error approving collaborator KPI:', error);
        res.status(500).json({ error: 'Error al aprobar asignación' });
    }
};
export const rejectCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { comments } = req.body;
        const userRole = req.user?.role;
        // Verificar permisos (solo jefes, managers, directors, admins)
        const allowedRoles = ['admin', 'director', 'manager', 'leader'];
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: 'No tienes permisos para rechazar asignaciones',
            });
        }
        // Verificar si la asignación existe y está propuesta
        const [ckRows] = await pool.query(`SELECT ck.*, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        const assignment = ckRows[0];
        if (assignment.status !== 'proposed') {
            return res.status(400).json({
                error: 'Solo se pueden rechazar asignaciones en estado "propuesto"',
            });
        }
        if (assignment.periodStatus === 'closed') {
            return res.status(403).json({
                error: 'No se puede rechazar asignaciones en períodos cerrados',
            });
        }
        // Actualizar a borrador (rechazado)
        await pool.query(`UPDATE collaborator_kpis 
       SET status = ?, comments = ? 
       WHERE id = ?`, ['draft', comments || assignment.comments || null, id]);
        res.json({ message: 'Asignación rechazada correctamente' });
    }
    catch (error) {
        console.error('Error rejecting collaborator KPI:', error);
        res.status(500).json({ error: 'Error al rechazar asignación' });
    }
};
export const closePeriodAssignments = async (req, res) => {
    try {
        const { periodId, collaboratorId } = req.body;
        if (!periodId) {
            return res.status(400).json({ error: 'El período es requerido' });
        }
        let query = 'UPDATE collaborator_kpis SET status = ? WHERE periodId = ?';
        const params = ['closed', periodId];
        if (collaboratorId) {
            query += ' AND collaboratorId = ?';
            params.push(collaboratorId);
        }
        // Solo cerrar asignaciones que no estén ya cerradas
        query += ' AND status != ?';
        params.push('closed');
        const [result] = await pool.query(query, params);
        const updateResult = result;
        res.json({
            message: 'Parrilla(s) cerrada(s) correctamente',
            affectedRows: updateResult.affectedRows,
        });
    }
    catch (error) {
        console.error('Error closing period assignments:', error);
        res.status(500).json({ error: 'Error al cerrar parrillas' });
    }
};
export const deleteCollaboratorKPI = async (req, res) => {
    try {
        const { id } = req.params;
        // Verificar si está cerrada
        const [ckRows] = await pool.query(`SELECT ck.status, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`, [id]);
        if (Array.isArray(ckRows) && ckRows.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }
        const userRole = req.user?.role;
        const canDelete = ckRows[0].status !== 'closed' &&
            ckRows[0].periodStatus !== 'closed' &&
            ['admin', 'director'].includes(userRole);
        if (ckRows[0].status === 'closed' || ckRows[0].periodStatus === 'closed') {
            if (!['admin', 'director'].includes(userRole)) {
                return res.status(403).json({
                    error: 'No se puede eliminar una asignación cerrada. Solo administradores y directores pueden hacerlo.',
                });
            }
        }
        await pool.query('DELETE FROM collaborator_kpis WHERE id = ?', [id]);
        res.json({ message: 'Asignación eliminada correctamente' });
    }
    catch (error) {
        console.error('Error deleting collaborator KPI:', error);
        res.status(500).json({ error: 'Error al eliminar asignación' });
    }
};
export const generateBaseGrids = async (req, res) => {
    try {
        const { area, periodId, kpiIds, defaultTarget, defaultWeight } = req.body;
        if (!area || !periodId) {
            return res.status(400).json({
                error: 'El área y el período son requeridos',
            });
        }
        // Verificar si el período está cerrado
        const [periodRows] = await pool.query('SELECT status FROM periods WHERE id = ?', [periodId]);
        if (Array.isArray(periodRows) &&
            periodRows.length > 0 &&
            periodRows[0].status === 'closed') {
            return res.status(403).json({
                error: 'No se pueden generar parrillas en períodos cerrados',
            });
        }
        // Obtener colaboradores del área
        const [collaborators] = await pool.query('SELECT id FROM collaborators WHERE area = ?', [area]);
        if (!Array.isArray(collaborators) || collaborators.length === 0) {
            return res.status(404).json({
                error: `No se encontraron colaboradores en el área "${area}"`,
            });
        }
        // Obtener KPIs (si se especificaron, usar esos; si no, usar todos)
        let kpis = [];
        if (kpiIds && Array.isArray(kpiIds) && kpiIds.length > 0) {
            const placeholders = kpiIds.map(() => '?').join(',');
            const [kpiRows] = await pool.query(`SELECT id FROM kpis WHERE id IN (${placeholders})`, kpiIds);
            kpis = kpiRows || [];
        }
        else {
            const [kpiRows] = await pool.query('SELECT id FROM kpis ORDER BY name ASC');
            kpis = kpiRows || [];
        }
        if (kpis.length === 0) {
            return res.status(404).json({
                error: 'No se encontraron KPIs para asignar',
            });
        }
        const target = defaultTarget || 0;
        const weight = defaultWeight || 0;
        // Calcular peso por KPI si no se especificó
        const weightPerKpi = weight > 0 ? weight : kpis.length > 0 ? 100 / kpis.length : 0;
        const createdAssignments = [];
        const errors = [];
        // Crear asignaciones para cada colaborador y cada KPI
        for (const collaborator of collaborators) {
            for (const kpi of kpis) {
                try {
                    // Verificar si ya existe la asignación
                    const [existing] = await pool.query(`SELECT id FROM collaborator_kpis 
             WHERE collaboratorId = ? AND kpiId = ? AND periodId = ?`, [collaborator.id, kpi.id, periodId]);
                    if (Array.isArray(existing) && existing.length > 0) {
                        // Ya existe, saltar
                        continue;
                    }
                    // Crear nueva asignación
                    const [result] = await pool.query(`INSERT INTO collaborator_kpis 
             (collaboratorId, kpiId, periodId, target, weight, status) 
             VALUES (?, ?, ?, ?, ?, ?)`, [collaborator.id, kpi.id, periodId, target, weightPerKpi, 'draft']);
                    const insertResult = result;
                    createdAssignments.push({
                        id: insertResult.insertId,
                        collaboratorId: collaborator.id,
                        kpiId: kpi.id,
                        periodId,
                        target,
                        weight: weightPerKpi,
                    });
                }
                catch (error) {
                    errors.push({
                        collaboratorId: collaborator.id,
                        kpiId: kpi.id,
                        error: error.message,
                    });
                }
            }
        }
        res.json({
            message: 'Parrillas base generadas correctamente',
            created: createdAssignments.length,
            errors: errors.length,
            details: {
                area,
                periodId,
                collaboratorsCount: collaborators.length,
                kpisCount: kpis.length,
                assignments: createdAssignments,
                errors: errors.length > 0 ? errors : undefined,
            },
        });
    }
    catch (error) {
        console.error('Error generating base grids:', error);
        res.status(500).json({ error: 'Error al generar parrillas base' });
    }
};
export const getConsolidatedByCollaborator = async (req, res) => {
    try {
        const { collaboratorId } = req.params;
        const { periodId } = req.query;
        if (!periodId) {
            return res.status(400).json({ error: 'El periodo es requerido' });
        }
        const [rows] = await pool.query(`SELECT ck.*,
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria,
              k.formula as kpiFormula,
              c.name as collaboratorName,
              p.name as periodName,
              p.startDate as periodStartDate,
              p.endDate as periodEndDate,
              sp.name as subPeriodName,
              sp.weight as subPeriodWeight
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       JOIN periods p ON ck.periodId = p.id
       LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
       WHERE ck.collaboratorId = ? AND ck.periodId = ?
       ORDER BY sp.startDate ASC, ck.createdAt DESC`, [collaboratorId, periodId]);
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({
                error: 'No hay asignaciones para el colaborador y periodo seleccionados',
            });
        }
        const assignments = rows.map((row) => {
            // Obtener fórmula personalizada si existe
            const customFormula = row.kpiFormula || undefined;
            const variation = row.variation ??
                (row.actual !== null && row.actual !== undefined
                    ? calculateVariation(row.kpiType, row.target, row.actual, customFormula)
                    : 0);
            const weightedResult = row.weightedResult ??
                calculateWeightedResult(variation, row.weight || 0);
            return { ...row, variation, weightedResult };
        });
        const subPeriodMap = new Map();
        assignments.forEach((assignment) => {
            const key = String(assignment.subPeriodId ?? 'no-subperiod');
            const existing = subPeriodMap.get(key);
            const summary = existing ?? {
                id: assignment.subPeriodId || null,
                name: assignment.subPeriodName || 'Sin subperiodo',
                weight: assignment.subPeriodWeight ?? null,
                totalWeight: 0,
                totalWeightedResult: 0,
                kpiCount: 0,
                result: 0,
                kpis: [],
            };
            summary.totalWeight += assignment.weight || 0;
            summary.totalWeightedResult += assignment.weightedResult || 0;
            summary.kpiCount += 1;
            summary.kpis.push(assignment);
            subPeriodMap.set(key, summary);
        });
        const subPeriods = Array.from(subPeriodMap.values()).map((sp) => ({
            ...sp,
            result: sp.totalWeight > 0 ? (sp.totalWeightedResult / sp.totalWeight) * 100 : 0,
        }));
        const totalWeightAll = assignments.reduce((sum, a) => sum + (a.weight || 0), 0);
        const totalWeightedResultAll = assignments.reduce((sum, a) => sum + (a.weightedResult || 0), 0);
        const resultByKpiWeight = totalWeightAll > 0 ? (totalWeightedResultAll / totalWeightAll) * 100 : 0;
        const baseWeights = subPeriods.map((sp) => sp.weight ?? sp.totalWeight ?? 0);
        const totalBaseWeight = baseWeights.reduce((sum, val) => sum + val, 0);
        const resultBySubPeriodWeight = subPeriods.length === 0
            ? 0
            : totalBaseWeight > 0
                ? subPeriods.reduce((acc, sp, idx) => acc + sp.result * (baseWeights[idx] / totalBaseWeight), 0)
                : subPeriods.reduce((acc, sp) => acc + sp.result, 0) /
                    subPeriods.length;
        res.json({
            collaborator: {
                id: assignments[0].collaboratorId,
                name: assignments[0].collaboratorName,
            },
            period: {
                id: assignments[0].periodId,
                name: assignments[0].periodName,
                startDate: assignments[0].periodStartDate,
                endDate: assignments[0].periodEndDate,
            },
            overall: {
                totalWeight: totalWeightAll,
                totalWeightedResult: totalWeightedResultAll,
                resultByKpiWeight,
                resultBySubPeriodWeight,
            },
            subPeriods,
        });
    }
    catch (error) {
        console.error('Error fetching consolidated data:', error);
        res.status(500).json({ error: 'Error al obtener consolidado' });
    }
};
//# sourceMappingURL=collaborator-kpis.controller.js.map