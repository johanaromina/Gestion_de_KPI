import ExcelJS from 'exceljs'
import { pool } from '../src/config/database.js'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type PlanRow = {
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId: number
  target: number
  source?: string | null
}

const EXCEL_DATE_BASE = new Date(Date.UTC(1899, 11, 30))

const excelSerialToDate = (serial: number): string => {
  const days = Math.floor(serial)
  const ms = days * 24 * 60 * 60 * 1000
  const date = new Date(EXCEL_DATE_BASE.getTime() + ms)
  return date.toISOString().slice(0, 10)
}

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function main() {
  let filePath = process.argv[2] || 'OKR KPI Total v0.xlsx'
  const periodId = Number(process.argv[3])
  const sheetName = process.argv[4] || 'KPI Equipo Producto '

  if (!periodId) {
    console.error('Uso: tsx scripts/import-kpi-plan.ts <archivo.xlsx> <periodId> [sheetName]')
    process.exit(1)
  }

  // Si la ruta no es absoluta y el archivo no existe, buscar en la raíz del proyecto
  if (!filePath.includes('/') && !filePath.includes('\\') && !existsSync(filePath)) {
    const projectRoot = join(__dirname, '..', '..')
    const rootPath = join(projectRoot, filePath)
    if (existsSync(rootPath)) {
      filePath = rootPath
    }
  }

  if (!existsSync(filePath)) {
    console.error(`❌ No se encontró el archivo: ${filePath}`)
    console.error('💡 Asegúrate de que el archivo existe en la ruta especificada o en la raíz del proyecto')
    process.exit(1)
  }

  console.log(`📝 Importando plan desde ${filePath} para período ${periodId}...`)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.getWorksheet(sheetName)

  if (!sheet) {
    throw new Error(`No se encontró la hoja "${sheetName}" en el archivo`)
  }

  const headerRow = sheet.getRow(1)
  const dateCols: { col: number; date: string }[] = []

  headerRow.eachCell((cell, colNumber) => {
    const val = cell.value
    
    // Intentar detectar fecha en diferentes formatos
    if (typeof val === 'number') {
      // Formato serial de Excel
      dateCols.push({ col: colNumber, date: excelSerialToDate(val) })
    } else if (val instanceof Date) {
      // Objeto Date
      dateCols.push({ col: colNumber, date: val.toISOString().slice(0, 10) })
    } else if (typeof val === 'string') {
      // String con formato de fecha
      const dateMatch = val.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})|(\d{2}-\d{2}-\d{4})/)
      if (dateMatch) {
        let dateStr = val.trim()
        // Intentar parsear diferentes formatos
        const parsedDate = new Date(dateStr)
        if (!isNaN(parsedDate.getTime())) {
          dateCols.push({ col: colNumber, date: parsedDate.toISOString().slice(0, 10) })
        }
      }
    } else if (val && typeof val === 'object' && 'text' in val) {
      // Valor con formato rico de Excel
      const textVal = (val as any).text || String(val)
      const parsedDate = new Date(textVal)
      if (!isNaN(parsedDate.getTime())) {
        dateCols.push({ col: colNumber, date: parsedDate.toISOString().slice(0, 10) })
      }
    }
  })

  if (dateCols.length === 0) {
    console.error('❌ No se detectaron columnas de fechas en la cabecera')
    console.error('💡 Las fechas deben estar en formato serial de Excel, Date, o string con formato de fecha')
    console.error('\n📋 Primeras 10 celdas de la cabecera:')
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber <= 20) {
        console.error(`   Columna ${colNumber}: ${JSON.stringify(cell.value)} (tipo: ${typeof cell.value})`)
      }
    })
    throw new Error('No se detectaron columnas de fechas en la cabecera')
  }
  
  console.log(`✅ Detectadas ${dateCols.length} columnas de fechas`)

  const [collaboratorsRows] = await pool.query<any[]>('SELECT id, name FROM collaborators')
  const [kpiRows] = await pool.query<any[]>('SELECT id, name FROM kpis')
  const [subPeriodRows] = await pool.query<any[]>('SELECT id, startDate FROM sub_periods WHERE periodId = ?', [periodId])

  const collaboratorMap = new Map<string, number>(collaboratorsRows.map((c) => [c.name.trim(), c.id]))
  const kpiMap = new Map<string, number>(kpiRows.map((k) => [k.name.trim(), k.id]))
  const subPeriodMap = new Map<string, number>(
    subPeriodRows.map((sp) => [new Date(sp.startDate).toISOString().slice(0, 10), sp.id])
  )

  const planRows: PlanRow[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const collaboratorName = String(row.getCell(10).value || '').trim()
    const kpiName = String(row.getCell(3).value || '').trim()
    if (!collaboratorName || !kpiName) return

    const collaboratorId = collaboratorMap.get(collaboratorName)
    const kpiId = kpiMap.get(kpiName)

    if (!collaboratorId || !kpiId) return

    for (const { col, date } of dateCols) {
      const targetCell = row.getCell(col).value
      const target = normalizeNumber(targetCell)
      if (target === null || (typeof targetCell === 'string' && targetCell.trim().toUpperCase() === 'N/A')) {
        continue
      }

      const subPeriodId = subPeriodMap.get(date)
      if (!subPeriodId) {
        console.warn(`No se encontró subperiodo con startDate ${date} para row ${rowNumber}`)
        continue
      }

      planRows.push({
        collaboratorId,
        kpiId,
        periodId,
        subPeriodId,
        target,
        source: filePath,
      })
    }
  })

  if (planRows.length === 0) {
    console.log('No hay filas de plan válidas para importar')
    process.exit(0)
  }

  const values = planRows.map(
    (r) => `(${pool.escape(r.collaboratorId)}, ${pool.escape(r.kpiId)}, ${pool.escape(r.periodId)}, ${pool.escape(r.subPeriodId)}, ${pool.escape(r.target)}, ${pool.escape(r.source || null)})`
  )

  const sql = `
    INSERT INTO collaborator_kpi_plan
      (collaboratorId, kpiId, periodId, subPeriodId, target, source)
    VALUES
      ${values.join(',')}
    ON DUPLICATE KEY UPDATE
      target = VALUES(target),
      source = VALUES(source),
      updatedAt = CURRENT_TIMESTAMP()
  `

  await pool.query(sql)

  console.log(`Importadas ${planRows.length} filas de plan en collaborator_kpi_plan`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Error importando plan:', err)
  process.exit(1)
})
