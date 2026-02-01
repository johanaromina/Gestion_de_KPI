import { pool } from '../src/config/database'

type KPISeed = {
  name: string
  description: string
  type: 'manual' | 'count' | 'ratio' | 'sla' | 'value'
  direction: 'growth' | 'reduction' | 'exact'
  criteria: string
}

const periodName = 'Sidom 2025-2026'
const periodStart = '2025-01-01'
const periodEnd = '2026-12-31'

const kpis: KPISeed[] = [
  {
    name: 'Business Value',
    description: 'Impacto de entregas sobre objetivos de negocio.',
    type: 'value',
    direction: 'growth',
    criteria: 'Valor mensual consolidado por área.',
  },
  {
    name: 'US Entregadas Acumuladas',
    description: 'Historias de usuario entregadas acumuladas.',
    type: 'count',
    direction: 'growth',
    criteria: 'Cantidad de HU finalizadas por período.',
  },
  {
    name: 'Cubrimiento de habilidades',
    description: 'Porcentaje de habilidades cubiertas en el plan.',
    type: 'manual',
    direction: 'growth',
    criteria: 'Habilidades completadas sobre total esperado.',
  },
  {
    name: 'Calidad de Gestión',
    description: 'Evaluación de calidad de gestión.',
    type: 'manual',
    direction: 'growth',
    criteria: 'Evaluación cualitativa mensual.',
  },
  {
    name: 'Proyectos Implementados',
    description: 'Cantidad de proyectos implementados.',
    type: 'count',
    direction: 'growth',
    criteria: 'Proyectos cerrados con éxito.',
  },
  {
    name: 'CSAT',
    description: 'Satisfacción de clientes.',
    type: 'value',
    direction: 'growth',
    criteria: 'Promedio mensual de encuestas.',
  },
  {
    name: 'SLA 24hs',
    description: 'Cumplimiento de SLA en 24hs.',
    type: 'sla',
    direction: 'reduction',
    criteria: 'Tickets resueltos en menos de 24 horas.',
  },
]

const collaborators = [
  'Johana Manzanares',
  'Pedro Sirvent',
  'Mauro Toubes',
  'Agostina Lombardo',
  'Alexis Cantenys',
  'Alvaro Cotes',
]

const areaScopes = ['QA', 'Delivery', 'Producto', 'Customer Success', 'Reveneu']

const run = async () => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Company scope
    const [companyRows] = await conn.query<any[]>(
      `SELECT id FROM org_scopes WHERE name = ? AND type = 'company' LIMIT 1`,
      ['SIDOM']
    )
    let companyScopeId = companyRows?.[0]?.id
    if (!companyScopeId) {
      const [result] = await conn.query<any>(
        `INSERT INTO org_scopes (name, type, parentId, metadata, active)
         VALUES (?, 'company', NULL, NULL, 1)`,
        ['SIDOM']
      )
      companyScopeId = result.insertId
    }

    for (const area of areaScopes) {
      const [areaRows] = await conn.query<any[]>(
        `SELECT id FROM org_scopes WHERE name = ? AND type = 'area' LIMIT 1`,
        [area]
      )
      if (!areaRows?.length) {
        await conn.query(
          `INSERT INTO org_scopes (name, type, parentId, metadata, active)
           VALUES (?, 'area', ?, NULL, 1)`,
          [area, companyScopeId]
        )
      }
    }

    // Period
    const [periodRows] = await conn.query<any[]>(
      `SELECT id FROM periods WHERE name = ? LIMIT 1`,
      [periodName]
    )
    let periodId = periodRows?.[0]?.id
    if (!periodId) {
      const [periodResult] = await conn.query<any>(
        `INSERT INTO periods (name, startDate, endDate, status)
         VALUES (?, ?, ?, 'open')`,
        [periodName, periodStart, periodEnd]
      )
      periodId = periodResult.insertId
    }

    // Subperiods (Jan-Dec 2026)
    const [subRows] = await conn.query<any[]>(
      `SELECT id FROM sub_periods WHERE periodId = ? LIMIT 1`,
      [periodId]
    )
    if (!subRows?.length) {
      const weight = Number((100 / 12).toFixed(2))
      const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ]
      for (let idx = 0; idx < months.length; idx += 1) {
        const month = String(idx + 1).padStart(2, '0')
        const startDate = `2026-${month}-01`
        const endDate = idx + 1 === 12 ? `2026-12-31` : `2026-${month}-28`
        await conn.query(
          `INSERT INTO sub_periods (periodId, name, startDate, endDate, weight)
           VALUES (?, ?, ?, ?, ?)`,
          [periodId, `${months[idx]} 2026`, startDate, endDate, weight]
        )
      }
    }

    // KPIs
    const kpiIds: Record<string, number> = {}
    for (const kpi of kpis) {
      const [existing] = await conn.query<any[]>(
        `SELECT id FROM kpis WHERE name = ? LIMIT 1`,
        [kpi.name]
      )
      if (existing?.length) {
        kpiIds[kpi.name] = existing[0].id
        continue
      }
      const [result] = await conn.query<any>(
        `INSERT INTO kpis (name, description, type, criteria, direction)
         VALUES (?, ?, ?, ?, ?)`,
        [kpi.name, kpi.description, kpi.type, kpi.criteria, kpi.direction]
      )
      kpiIds[kpi.name] = result.insertId
    }

    const [collabRows] = await conn.query<any[]>(
      `SELECT id, name FROM collaborators WHERE name IN (${collaborators.map(() => '?').join(',')})`,
      collaborators
    )
    const collabMap = new Map<string, number>()
    for (const row of collabRows || []) {
      collabMap.set(row.name, row.id)
    }

    const assignments = [
      { collaborator: 'Pedro Sirvent', kpi: 'Business Value', weight: 25, target: 100 },
      { collaborator: 'Pedro Sirvent', kpi: 'US Entregadas Acumuladas', weight: 25, target: 120 },
      { collaborator: 'Mauro Toubes', kpi: 'US Entregadas Acumuladas', weight: 30, target: 140 },
      { collaborator: 'Mauro Toubes', kpi: 'Calidad de Gestión', weight: 20, target: 90 },
      { collaborator: 'Johana Manzanares', kpi: 'Cubrimiento de habilidades', weight: 20, target: 95 },
      { collaborator: 'Agostina Lombardo', kpi: 'CSAT', weight: 30, target: 85 },
      { collaborator: 'Alexis Cantenys', kpi: 'Proyectos Implementados', weight: 35, target: 12 },
      { collaborator: 'Alvaro Cotes', kpi: 'Business Value', weight: 40, target: 200 },
    ]

    const [subperiods] = await conn.query<any[]>(
      `SELECT id, name FROM sub_periods WHERE periodId = ? ORDER BY startDate ASC`,
      [periodId]
    )

    const jan = subperiods?.[0]?.id
    const feb = subperiods?.[1]?.id
    const mar = subperiods?.[2]?.id

    for (const assignment of assignments) {
      const collabId = collabMap.get(assignment.collaborator)
      const kpiId = kpiIds[assignment.kpi]
      if (!collabId || !kpiId) continue

      const [existing] = await conn.query<any[]>(
        `SELECT id FROM collaborator_kpis WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId IS NULL`,
        [collabId, kpiId, periodId]
      )
      if (existing?.length) continue

      const [result] = await conn.query<any>(
        `INSERT INTO collaborator_kpis
         (collaboratorId, kpiId, periodId, subPeriodId, target, weight, status, curationStatus, dataSource, inputMode)
         VALUES (?, ?, ?, NULL, ?, ?, 'draft', 'pending', 'Manual', 'manual')`,
        [collabId, kpiId, periodId, assignment.target, assignment.weight]
      )
      const assignmentId = result.insertId

      await conn.query(
        `INSERT INTO kpi_criteria_versions
         (assignmentId, dataSource, sourceConfig, criteriaText, status, createdBy)
         VALUES (?, 'Manual', NULL, ?, 'pending', ?)`,
        [assignmentId, `Criterio inicial para ${assignment.kpi}`, collabId]
      )

      // Subperiod sample for Pedro/Mauro on Business Value
      if (assignment.collaborator === 'Pedro Sirvent' && assignment.kpi === 'Business Value') {
        const subTargets = [
          { subPeriodId: jan, target: 30, actual: 25 },
          { subPeriodId: feb, target: 30, actual: 32 },
          { subPeriodId: mar, target: 40, actual: 35 },
        ]

        for (const sub of subTargets) {
          if (!sub.subPeriodId) continue
          const [subResult] = await conn.query<any>(
            `INSERT INTO collaborator_kpis
             (collaboratorId, kpiId, periodId, subPeriodId, target, weight, actual, status, curationStatus, dataSource, inputMode)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', 'Manual', 'manual')`,
            [collabId, kpiId, periodId, sub.subPeriodId, sub.target, assignment.weight, sub.actual]
          )

          const measurementResult = await conn.query<any>(
            `INSERT INTO kpi_measurements
             (assignmentId, periodId, subPeriodId, value, mode, status, capturedBy)
             VALUES (?, ?, ?, ?, 'manual', 'proposed', ?)`,
            [subResult.insertId, periodId, sub.subPeriodId, sub.actual, collabId]
          )

          const measurementId = (measurementResult as any)[0]?.insertId
          if (measurementId) {
            await conn.query(
              `UPDATE collaborator_kpis SET lastMeasurementId = ? WHERE id = ?`,
              [measurementId, subResult.insertId]
            )
          }
        }
      }
    }

    await conn.commit()
    console.log('✅ Demo examples cargados')
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

run()
  .catch((error) => {
    console.error('❌ Error cargando ejemplos:', error)
  })
  .finally(() => process.exit(0))
