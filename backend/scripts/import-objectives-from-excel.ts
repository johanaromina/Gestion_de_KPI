import dotenv from 'dotenv'
import path from 'path'
import { pool } from '../src/config/database.js'
import Excel from 'exceljs'

dotenv.config()

type ParsedKPI = {
  name: string
  target: number | null
  actual: number | null
  weight: number | null
  criteria: string
}

const excelDateToJSDate = (excelSerial: number): Date => {
  // Excel serial date to JS Date (base 1900)
  const jsTimestamp = (excelSerial - 25569) * 86400 * 1000
  return new Date(jsTimestamp)
}

const asText = (value: any): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'object' && Array.isArray((value as any).richText)) {
    return (value as any).richText.map((r: any) => r.text).join('')
  }
  if (typeof value === 'object' && (value as any).text) return (value as any).text
  return `${value}`
}

const asNumber = (value: any): number | null => {
  if (value == null) return null
  const num = parseFloat(asText(value).replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

const determineType = (name: string): 'growth' | 'reduction' | 'exact' => {
  const n = name.toLowerCase()
  if (n.includes('stock') || n.includes('reduc') || n.includes('menos')) return 'reduction'
  return 'growth'
}

async function getOrCreateCollaborator(name: string, position: string, area: string) {
  const [rows] = await pool.query('SELECT id FROM collaborators WHERE name = ?', [name])
  const existing = (rows as any[])[0]
  if (existing) return existing.id
  const [result] = await pool.query(
    'INSERT INTO collaborators (name, position, area, role) VALUES (?, ?, ?, ?)',
    [name, position || 'Sin puesto', area || 'Sin área', 'collaborator']
  )
  return (result as any).insertId
}

async function getOrCreatePeriod(name: string, startDate: Date, endDate: Date) {
  const [rows] = await pool.query(
    'SELECT id FROM periods WHERE startDate = ? AND endDate = ?',
    [startDate, endDate]
  )
  const existing = (rows as any[])[0]
  if (existing) return existing.id
  const [result] = await pool.query(
    'INSERT INTO periods (name, startDate, endDate, status) VALUES (?, ?, ?, ?)',
    [name, startDate, endDate, 'open']
  )
  return (result as any).insertId
}

async function getOrCreateKpi(name: string, type: 'growth' | 'reduction' | 'exact', criteria: string) {
  let finalName = name
  let finalCriteria = criteria
  const MAX_NAME = 255
  if (finalName.length > MAX_NAME) {
    finalCriteria = `${finalName}\n${criteria}`.trim()
    finalName = `${finalName.slice(0, 240)}...`
  }

  const [rows] = await pool.query('SELECT id FROM kpis WHERE name = ?', [finalName])
  const existing = (rows as any[])[0]
  if (existing) {
    return existing.id
  }
  const [result] = await pool.query(
    'INSERT INTO kpis (name, type, criteria) VALUES (?, ?, ?)',
    [finalName, type, finalCriteria]
  )
  return (result as any).insertId
}

async function upsertAssignment(
  collaboratorId: number,
  kpiId: number,
  periodId: number,
  target: number | null,
  weight: number | null,
  actual: number | null,
  criteria: string
) {
  const weightValue = weight == null ? 0 : weight <= 1 ? weight * 100 : weight
  const targetValue = target ?? 0
  const actualValue = actual

  await pool.query(
    `INSERT INTO collaborator_kpis (collaboratorId, kpiId, periodId, target, weight, actual, status, comments)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)
     ON DUPLICATE KEY UPDATE target = VALUES(target), weight = VALUES(weight), actual = VALUES(actual), comments = VALUES(comments)`,
    [collaboratorId, kpiId, periodId, targetValue, weightValue, actualValue, criteria]
  )
}

function parseSheet(sheet: Excel.Worksheet): {
  collaboratorName: string
  position: string
  area: string
  periodStart?: Date
  periodEnd?: Date
  kpis: ParsedKPI[]
} {
  let collaboratorName = ''
  let position = ''
  let area = ''
  let periodStart: Date | undefined
  let periodEnd: Date | undefined

  const rows: { rowNumber: number; cells: string[]; values: any[] }[] = []

  sheet.eachRow((row, rowNumber) => {
    const cells: string[] = []
    const values: any[] = []
    for (let i = 1; i <= row.cellCount; i++) {
      const cell = row.getCell(i)
      cells.push((cell.text ?? '').toString())
      values.push(cell.value)
    }
    rows.push({ rowNumber, cells, values })
  })

  for (const r of rows) {
    const first = (r.cells[0] ?? '').trim()
    if (first === 'Apellido y Nombre') collaboratorName = (r.cells[1] ?? '').trim()
    if (first === 'Puesto') position = (r.cells[1] ?? '').trim()
    if (first === 'Area') area = (r.cells[1] ?? '').trim()
    if (first === 'Inicio') {
      const num = asNumber(r.values[1])
      if (num) periodStart = excelDateToJSDate(num)
    }
    if (first === 'Fin') {
      const num = asNumber(r.values[1])
      if (num) periodEnd = excelDateToJSDate(num)
    }
  }

  const headerRow = rows.find((r) => (r.cells[0] ?? '').trim().toLowerCase() === 'kpi')
  const parsed: ParsedKPI[] = []
  let lastIdx = -1

  if (headerRow) {
    const startIndex = rows.findIndex((r) => r.rowNumber === headerRow.rowNumber)
    for (let i = startIndex + 1; i < rows.length; i++) {
      const r = rows[i]
      const kpiName = (r.cells[0] ?? '').trim()
      if (!kpiName) continue
      const lowered = kpiName.toLowerCase()
      if (lowered.startsWith('total') || lowered.startsWith('control') || lowered.includes('umbral')) {
        break
      }

      const target = asNumber(r.values[1])
      const actual = asNumber(r.values[2])
      const weight = asNumber(r.values[4]) ?? asNumber(r.values[5]) ?? null
      const criteria = (r.cells[6] ?? '').trim()

      const isDataRow = target !== null || weight !== null || criteria
      if (isDataRow) {
        parsed.push({
          name: kpiName,
          target,
          actual,
          weight,
          criteria,
        })
        lastIdx = parsed.length - 1
      } else if (lastIdx >= 0) {
        const extra = [parsed[lastIdx].criteria, kpiName].filter(Boolean).join('\n')
        parsed[lastIdx].criteria = extra
      }
    }
  }

  return { collaboratorName, position, area, periodStart, periodEnd, kpis: parsed }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Uso: tsx scripts/import-objectives-from-excel.ts <ruta.xlsx>')
    process.exit(1)
  }

  const workbook = new Excel.Workbook()
  await workbook.xlsx.readFile(path.resolve(filePath))
  console.log(`Leyendo archivo ${filePath}`)

  for (const sheet of workbook.worksheets) {
    if (!sheet.name || sheet.name.startsWith('TEMPLATE') || sheet.name.startsWith('Evolutivo')) continue

    const { collaboratorName, position, area, periodStart, periodEnd, kpis } = parseSheet(sheet)
    if (!collaboratorName) {
      console.warn(`Saltando hoja ${sheet.name} (sin colaborador)`)
      continue
    }

    const collabId = await getOrCreateCollaborator(collaboratorName, position, area)
    const start = periodStart ?? new Date()
    const end = periodEnd ?? start
    const periodName = `${sheet.name} ${start.toISOString().slice(0, 10)} - ${end.toISOString().slice(0, 10)}`
    const periodId = await getOrCreatePeriod(periodName, start, end)

    console.log(`Hoja ${sheet.name}: ${collaboratorName} (${position}, ${area}) -> ${kpis.length} KPIs`)

    for (const k of kpis) {
      const kpiId = await getOrCreateKpi(k.name, determineType(k.name), k.criteria)
      await upsertAssignment(collabId, kpiId, periodId, k.target, k.weight, k.actual, k.criteria)
    }
  }

  console.log('Importación finalizada')
  await pool.end()
}

main().catch((err) => {
  console.error('Error en importación', err)
  pool.end()
  process.exit(1)
})
