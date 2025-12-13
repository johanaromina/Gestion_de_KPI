import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import ExcelJS from 'exceljs'

dotenv.config()

type KPIType = 'growth' | 'reduction' | 'exact'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FILE_PATH =
  process.env.OKR_FILE || path.join(__dirname, 'okr_kpi_total_v0.xlsx')

const PERIOD_NAME = 'FY25 mar-25 a feb-26'
const PERIOD_START = '2025-03-01'
const PERIOD_END = '2026-02-28'

const MONTHS: { label: string; start: string; end: string }[] = [
  { label: 'mar-25', start: '2025-03-01', end: '2025-03-31' },
  { label: 'abr-25', start: '2025-04-01', end: '2025-04-30' },
  { label: 'may-25', start: '2025-05-01', end: '2025-05-31' },
  { label: 'jun-25', start: '2025-06-01', end: '2025-06-30' },
  { label: 'jul-25', start: '2025-07-01', end: '2025-07-31' },
  { label: 'ago-25', start: '2025-08-01', end: '2025-08-31' },
  { label: 'sept-25', start: '2025-09-01', end: '2025-09-30' },
  { label: 'oct-25', start: '2025-10-01', end: '2025-10-31' },
  { label: 'nov-25', start: '2025-11-01', end: '2025-11-30' },
  { label: 'dic-25', start: '2025-12-01', end: '2025-12-31' },
  { label: 'ene-26', start: '2026-01-01', end: '2026-01-31' },
  { label: 'feb-26', start: '2026-02-01', end: '2026-02-28' },
]

const TARGET_COL_START = 14 // N en Excel (1-based)
const ACTUAL_COL_START = 28 // AB en Excel (1-based)
const HEADER_ROW = 1

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_kpi',
}

function parseNumber(raw: any): number | null {
  if (raw === null || raw === undefined) return null
  const str = String(raw).trim().replace(/\s+/g, '')
  if (!str || str.toUpperCase() === 'N/A' || str.toUpperCase() === 'S/D') return null
  const normalized = str.replace('%', '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

function isValidOccupant(raw: string): boolean {
  const name = raw.trim()
  if (!name) return false
  // Descarta códigos como "1OKR", "2OKR", etc.
  if (/^\d+\s*okr$/i.test(name)) return false
  if (/^okr\d*$/i.test(name)) return false
  // Descarta filas sin nombre real (muy cortos y sin espacio)
  if (name.length <= 2 && !name.includes(' ')) return false
  return true
}

function mapRole(position: string): 'admin' | 'director' | 'manager' | 'leader' | 'collaborator' {
  const p = position.toLowerCase()
  if (p.includes('director') || p.includes('cio') || p.includes('cpo')) {
    return 'director'
  }
  if (p.includes('manager')) {
    return 'manager'
  }
  if (p.includes('lead') || p.includes('leader')) {
    return 'leader'
  }
  return 'collaborator'
}

function calculateVariation(type: KPIType, target: number, actual: number): number {
  if (!actual) return 0
  switch (type) {
    case 'growth':
      return (actual / target) * 100
    case 'reduction':
      return (target / actual) * 100
    case 'exact': {
      const diff = Math.abs(actual - target)
      return Math.max(0, 100 - (diff / target) * 100)
    }
    default:
      return 0
  }
}

function detectKpiType(criteria: string, targets: (number | null)[]): KPIType {
  const text = criteria.toLowerCase()
  if (text.includes('reduccion') || text.includes('reducción')) {
    return 'reduction'
  }
  const numericTargets = targets.filter((t): t is number => t !== null)
  if (numericTargets.length >= 2 && numericTargets[numericTargets.length - 1] < numericTargets[0]) {
    return 'reduction'
  }
  return 'growth'
}

async function ensurePeriod(conn: mysql.Connection) {
  const [rows] = await conn.query<any[]>(
    'SELECT id FROM periods WHERE name = ?',
    [PERIOD_NAME]
  )
  if (rows.length) return rows[0].id

  const [result] = await conn.query(
    'INSERT INTO periods (name, startDate, endDate, status) VALUES (?, ?, ?, ?)',
    [PERIOD_NAME, PERIOD_START, PERIOD_END, 'open']
  )
  // @ts-expect-error mysql2 typing
  return result.insertId as number
}

async function ensureSubPeriods(conn: mysql.Connection, periodId: number) {
  const [existing] = await conn.query<any[]>(
    'SELECT id, name FROM sub_periods WHERE periodId = ? ORDER BY startDate',
    [periodId]
  )
  if (existing.length === MONTHS.length) return existing

  const weight = Number((100 / MONTHS.length).toFixed(2))
  for (const m of MONTHS) {
    const [rows] = await conn.query<any[]>(
      'SELECT id FROM sub_periods WHERE periodId = ? AND name = ?',
      [periodId, m.label]
    )
    if (rows.length) continue
    await conn.query(
      'INSERT INTO sub_periods (periodId, name, startDate, endDate, weight) VALUES (?, ?, ?, ?, ?)',
      [periodId, m.label, m.start, m.end, weight]
    )
  }
  const [rows] = await conn.query<any[]>(
    'SELECT id, name FROM sub_periods WHERE periodId = ? ORDER BY startDate',
    [periodId]
  )
  return rows
}

async function ensureCollaborator(
  conn: mysql.Connection,
  name: string,
  position: string,
  area: string,
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
) {
  const [rows] = await conn.query<any[]>(
    'SELECT id, role FROM collaborators WHERE name = ?',
    [name]
  )
  if (rows.length) {
    const current = rows[0]
    if (current.role === 'collaborator' && role !== current.role) {
      await conn.query('UPDATE collaborators SET role = ? WHERE id = ?', [
        role,
        current.id,
      ])
    }
    return current.id
  }

  const [result] = await conn.query(
    'INSERT INTO collaborators (name, position, area, role) VALUES (?, ?, ?, ?)',
    [name, position || 'Colaborador', area || 'General', role]
  )
  // @ts-expect-error mysql2 typing
  return result.insertId as number
}

async function ensureKpi(
  conn: mysql.Connection,
  name: string,
  type: KPIType,
  criteria: string
) {
  const [rows] = await conn.query<any[]>(
    'SELECT id FROM kpis WHERE name = ?',
    [name]
  )
  if (rows.length) return rows[0].id

  const [result] = await conn.query(
    'INSERT INTO kpis (name, description, type, criteria) VALUES (?, ?, ?, ?)',
    [name, name, type, criteria || '']
  )
  // @ts-expect-error mysql2 typing
  return result.insertId as number
}

async function upsertAssignment(
  conn: mysql.Connection,
  data: {
    collaboratorId: number
    kpiId: number
    periodId: number
    subPeriodId: number
    target: number | null
    actual: number | null
    weight: number
    variation: number | null
    weightedResult: number | null
  }
) {
  const [rows] = await conn.query<any[]>(
    'SELECT id FROM collaborator_kpis WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId = ?',
    [data.collaboratorId, data.kpiId, data.periodId, data.subPeriodId]
  )
  if (rows.length) {
    await conn.query(
      `UPDATE collaborator_kpis 
       SET target = ?, actual = ?, weight = ?, variation = ?, weightedResult = ?, status = 'approved'
       WHERE id = ?`,
      [
        data.target ?? 0,
        data.actual,
        data.weight,
        data.variation,
        data.weightedResult,
        rows[0].id,
      ]
    )
    return
  }

  await conn.query(
    `INSERT INTO collaborator_kpis 
     (collaboratorId, kpiId, periodId, subPeriodId, target, actual, weight, variation, weightedResult, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
    [
      data.collaboratorId,
      data.kpiId,
      data.periodId,
      data.subPeriodId,
      data.target ?? 0,
      data.actual,
      data.weight,
      data.variation,
      data.weightedResult,
    ]
  )
}

async function main() {
  const connection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: false,
  })

  console.log(`Conectado a DB ${dbConfig.database} en ${dbConfig.host}:${dbConfig.port}`)
  const periodId = await ensurePeriod(connection)
  const subPeriods = await ensureSubPeriods(connection, periodId)
  const subPeriodMap = new Map<string, number>()
  subPeriods.forEach((sp: any, idx: number) => subPeriodMap.set(MONTHS[idx].label, sp.id))

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(FILE_PATH)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('No se encontró la primera hoja en el Excel')

  console.log(`Procesando hoja "${sheet.name}" con ${sheet.rowCount - 1} filas de datos`)
  let inserted = 0
  let skipped = 0

  for (let i = HEADER_ROW + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    const kpiName = String(row.getCell(3).value || '').trim()
    const position = String(row.getCell(9).value || '').trim()
    const occupant = String(row.getCell(10).value || '').trim()
    const area = String(row.getCell(11).value || '').trim()
    const criteria = String(row.getCell(13).value || '').trim()
    const weight = parseNumber(row.getCell(7).value) || 0

    if (!kpiName || !occupant || !isValidOccupant(occupant)) {
      skipped++
      continue
    }

    const targets = MONTHS.map((_, idx) =>
      parseNumber(row.getCell(TARGET_COL_START + idx).value)
    )
    const actuals = MONTHS.map((_, idx) =>
      parseNumber(row.getCell(ACTUAL_COL_START + idx).value)
    )

    const type = detectKpiType(criteria, targets)
    const role = mapRole(position)
    const collaboratorId = await ensureCollaborator(
      connection,
      occupant,
      position,
      area,
      role
    )
    const kpiId = await ensureKpi(connection, kpiName, type, criteria)

    for (let m = 0; m < MONTHS.length; m++) {
      const target = targets[m]
      const actual = actuals[m]
      if (target === null && actual === null) continue

      const variation =
        target !== null &&
        actual !== null &&
        target !== 0 &&
        actual !== 0
          ? Number(calculateVariation(type, target, actual).toFixed(2))
          : null
      const weightedResult =
        variation !== null ? Number(((variation * weight) / 100).toFixed(2)) : null

      await upsertAssignment(connection, {
        collaboratorId,
        kpiId,
        periodId,
        subPeriodId: subPeriods[m].id,
        target: target ?? 0,
        actual,
        weight,
        variation,
        weightedResult,
      })
    }

    inserted++
  }

  console.log(`Filas procesadas: ${inserted}; filas omitidas (sin KPI u ocupante): ${skipped}`)
  await connection.end()
}

main().catch((err) => {
  console.error('Error en importación:', err)
  process.exit(1)
})
