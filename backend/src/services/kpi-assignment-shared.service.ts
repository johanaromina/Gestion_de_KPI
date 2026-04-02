import { pool } from '../config/database'

export const ensurePeriodOpen = async (periodId: number, errorMessage = 'No se permiten cambios en períodos cerrados') => {
  const [rows] = await pool.query<any[]>(`SELECT status FROM periods WHERE id = ? LIMIT 1`, [periodId])
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Periodo no encontrado')
  }
  if (rows[0].status === 'closed') {
    throw new Error(errorMessage)
  }
}

export const ensureAssignmentEditable = (params: {
  status?: string | null
  periodStatus?: string | null
  closedMessage?: string
}) => {
  if (params.status === 'closed' || params.periodStatus === 'closed') {
    throw new Error(params.closedMessage || 'No se puede editar un KPI cerrado')
  }
}

export const closeKpiRecord = async (tableName: 'collaborator_kpis' | 'scope_kpis', id: number) => {
  await pool.query(`UPDATE ${tableName} SET status = 'closed' WHERE id = ?`, [id])
}

export const reopenKpiRecord = async (
  tableName: 'collaborator_kpis' | 'scope_kpis',
  id: number,
  reopenedStatus: 'draft' | 'approved' = 'draft'
) => {
  await pool.query(`UPDATE ${tableName} SET status = ? WHERE id = ?`, [reopenedStatus, id])
}
