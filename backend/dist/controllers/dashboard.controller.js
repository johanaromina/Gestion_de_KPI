import { pool } from '../config/database';
// Estadísticas generales para Admin/HR
export const getDashboardStats = async (req, res) => {
    try {
        const user = req.user;
        // Contar colaboradores
        const [collaboratorsResult] = await pool.query('SELECT COUNT(*) as total FROM collaborators');
        const totalCollaborators = Array.isArray(collaboratorsResult) && collaboratorsResult.length > 0
            ? collaboratorsResult[0].total
            : 0;
        // Contar períodos activos
        const [periodsResult] = await pool.query("SELECT COUNT(*) as total FROM periods WHERE status IN ('open', 'in_review')");
        const activePeriods = Array.isArray(periodsResult) && periodsResult.length > 0
            ? periodsResult[0].total
            : 0;
        // Contar KPIs
        const [kpisResult] = await pool.query('SELECT COUNT(*) as total FROM kpis');
        const totalKPIs = Array.isArray(kpisResult) && kpisResult.length > 0
            ? kpisResult[0].total
            : 0;
        // Contar asignaciones
        const [assignmentsResult] = await pool.query('SELECT COUNT(*) as total FROM collaborator_kpis');
        const totalAssignments = Array.isArray(assignmentsResult) && assignmentsResult.length > 0
            ? assignmentsResult[0].total
            : 0;
        // Contar asignaciones completadas (con actual)
        const [completedResult] = await pool.query('SELECT COUNT(*) as total FROM collaborator_kpis WHERE actual IS NOT NULL');
        const completedAssignments = Array.isArray(completedResult) && completedResult.length > 0
            ? completedResult[0].total
            : 0;
        const pendingAssignments = totalAssignments - completedAssignments;
        // Calcular cumplimiento promedio
        const [complianceResult] = await pool.query(`SELECT AVG(
        CASE 
          WHEN actual IS NOT NULL AND target > 0 THEN (actual / target) * 100
          ELSE NULL
        END
      ) as avg FROM collaborator_kpis`);
        const averageCompliance = Array.isArray(complianceResult) && complianceResult.length > 0
            ? complianceResult[0].avg || 0
            : 0;
        res.json({
            totalCollaborators,
            activePeriods,
            totalKPIs,
            totalAssignments,
            completedAssignments,
            pendingAssignments,
            averageCompliance: Number(averageCompliance),
        });
    }
    catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas del dashboard' });
    }
};
// Estadísticas por área para Admin/HR
export const getAreaStats = async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT 
        c.area,
        COUNT(DISTINCT c.id) as collaborators,
        AVG(
          CASE 
            WHEN ck.actual IS NOT NULL AND ck.target > 0 THEN (ck.actual / ck.target) * 100
            ELSE NULL
          END
        ) as averageCompliance,
        COUNT(DISTINCT CASE WHEN ck.actual IS NOT NULL THEN ck.id END) as completedKPIs
      FROM collaborators c
      LEFT JOIN collaborator_kpis ck ON c.id = ck.collaboratorId
      WHERE c.area IS NOT NULL AND c.area != ''
      GROUP BY c.area
      ORDER BY c.area`);
        const stats = Array.isArray(rows)
            ? rows.map((row) => ({
                area: row.area,
                collaborators: Number(row.collaborators),
                averageCompliance: Number(row.averageCompliance || 0),
                completedKPIs: Number(row.completedKPIs || 0),
            }))
            : [];
        res.json(stats);
    }
    catch (error) {
        console.error('Error getting area stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas por área' });
    }
};
// Estadísticas del equipo para Líderes
export const getTeamStats = async (req, res) => {
    try {
        const leaderId = parseInt(req.params.leaderId);
        const user = req.user;
        // Verificar que el usuario tenga permisos
        if (user.collaboratorId !== leaderId && user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos para ver estas estadísticas' });
        }
        // Obtener miembros del equipo (colaboradores que reportan a este líder)
        const [teamMembers] = await pool.query('SELECT id FROM collaborators WHERE managerId = ?', [leaderId]);
        const teamMemberIds = Array.isArray(teamMembers)
            ? teamMembers.map((m) => m.id)
            : [];
        if (teamMemberIds.length === 0) {
            return res.json({
                teamMembers: 0,
                teamAverageCompliance: 0,
                teamCompletedKPIs: 0,
                teamPendingKPIs: 0,
            });
        }
        // Calcular estadísticas del equipo
        const placeholders = teamMemberIds.map(() => '?').join(',');
        const [stats] = await pool.query(`SELECT 
        COUNT(DISTINCT collaboratorId) as teamMembers,
        AVG(
          CASE 
            WHEN actual IS NOT NULL AND target > 0 THEN (actual / target) * 100
            ELSE NULL
          END
        ) as teamAverageCompliance,
        COUNT(CASE WHEN actual IS NOT NULL THEN 1 END) as teamCompletedKPIs,
        COUNT(CASE WHEN actual IS NULL THEN 1 END) as teamPendingKPIs
      FROM collaborator_kpis
      WHERE collaboratorId IN (${placeholders})`, teamMemberIds);
        const result = Array.isArray(stats) && stats.length > 0 ? stats[0] : {};
        res.json({
            teamMembers: teamMemberIds.length,
            teamAverageCompliance: Number(result.teamAverageCompliance || 0),
            teamCompletedKPIs: Number(result.teamCompletedKPIs || 0),
            teamPendingKPIs: Number(result.teamPendingKPIs || 0),
        });
    }
    catch (error) {
        console.error('Error getting team stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas del equipo' });
    }
};
// KPIs del colaborador
export const getMyKPIs = async (req, res) => {
    try {
        const collaboratorId = parseInt(req.params.collaboratorId);
        const user = req.user;
        // Verificar que el usuario tenga permisos
        if (user.collaboratorId !== collaboratorId && user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos para ver estos KPIs' });
        }
        const [rows] = await pool.query(`SELECT 
        k.name as kpiName,
        ck.target,
        ck.actual,
        CASE 
          WHEN ck.actual IS NOT NULL AND ck.target > 0 THEN (ck.actual / ck.target) * 100
          ELSE 0
        END as compliance
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      WHERE ck.collaboratorId = ?
      ORDER BY ck.id DESC
      LIMIT 10`, [collaboratorId]);
        const kpis = Array.isArray(rows)
            ? rows.map((row) => ({
                kpiName: row.kpiName,
                target: Number(row.target),
                actual: row.actual ? Number(row.actual) : null,
                compliance: Number(row.compliance),
            }))
            : [];
        res.json(kpis);
    }
    catch (error) {
        console.error('Error getting my KPIs:', error);
        res.status(500).json({ error: 'Error al obtener tus KPIs' });
    }
};
// KPIs del equipo del colaborador
export const getTeamKPIs = async (req, res) => {
    try {
        const collaboratorId = parseInt(req.params.collaboratorId);
        const user = req.user;
        // Verificar que el usuario tenga permisos
        if (user.collaboratorId !== collaboratorId && user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos para ver estos KPIs' });
        }
        // Obtener el manager del colaborador
        const [collaborator] = await pool.query('SELECT managerId FROM collaborators WHERE id = ?', [collaboratorId]);
        const managerId = Array.isArray(collaborator) && collaborator.length > 0
            ? collaborator[0].managerId
            : null;
        if (!managerId) {
            return res.json([]);
        }
        // Obtener miembros del equipo (mismo manager)
        const [teamMembers] = await pool.query('SELECT id FROM collaborators WHERE managerId = ?', [managerId]);
        const teamMemberIds = Array.isArray(teamMembers)
            ? teamMembers.map((m) => m.id)
            : [];
        if (teamMemberIds.length === 0) {
            return res.json([]);
        }
        // Obtener KPIs del equipo
        const placeholders = teamMemberIds.map(() => '?').join(',');
        const [rows] = await pool.query(`SELECT 
        k.name as kpiName,
        AVG(ck.target) as target,
        AVG(ck.actual) as actual
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      WHERE ck.collaboratorId IN (${placeholders})
      GROUP BY k.id, k.name
      ORDER BY k.name
      LIMIT 10`, teamMemberIds);
        const kpis = Array.isArray(rows)
            ? rows.map((row) => ({
                kpiName: row.kpiName,
                target: Number(row.target),
                actual: row.actual ? Number(row.actual) : null,
            }))
            : [];
        res.json(kpis);
    }
    catch (error) {
        console.error('Error getting team KPIs:', error);
        res.status(500).json({ error: 'Error al obtener KPIs del equipo' });
    }
};
// Cumplimiento por período
export const getComplianceByPeriod = async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT 
        p.name as period,
        AVG(
          CASE 
            WHEN ck.actual IS NOT NULL AND ck.target > 0 THEN (ck.actual / ck.target) * 100
            ELSE NULL
          END
        ) as compliance
      FROM periods p
      LEFT JOIN collaborator_kpis ck ON p.id = ck.periodId
      WHERE p.status != 'open' OR ck.id IS NOT NULL
      GROUP BY p.id, p.name
      ORDER BY p.startDate DESC
      LIMIT 6`);
        const data = Array.isArray(rows)
            ? rows.map((row) => ({
                period: row.period,
                compliance: Number(row.compliance || 0),
            }))
            : [];
        res.json(data);
    }
    catch (error) {
        console.error('Error getting compliance by period:', error);
        res.status(500).json({ error: 'Error al obtener cumplimiento por período' });
    }
};
//# sourceMappingURL=dashboard.controller.js.map