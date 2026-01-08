import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { basename, resolve } from 'path'

dotenv.config()

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_kpi',
}

const EXCEL_PATH = process.env.EVOLUTION_EXCEL || '2025 - Parrilla individual de objetivos - Act112025 - Valores.xlsx'
const SHEET_NAME = 'Evolutivo Objetivos'

type RowValue = string | number | null

const excelDateToJS = (n: RowValue) => {
  const num = typeof n === 'number' ? n : parseFloat(String(n))
  if (!num || Number.isNaN(num)) return null
  return new Date(Math.round((num - 25569) * 86400 * 1000))
}

async function main() {
  const filePath = resolve(EXCEL_PATH)
  console.log(`📄 Leyendo archivo: ${basename(filePath)} (${filePath})`)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.getWorksheet(SHEET_NAME)
  if (!sheet) {
    throw new Error(`No se encontró la hoja "${SHEET_NAME}"`)
  }

  const connection = await mysql.createConnection({ ...dbConfig, multipleStatements: true })
  console.log('✅ Conectado a MySQL')

  const [collaboratorRows] = await connection.query<any[]>('SELECT id, name FROM collaborators')
  const [kpiRows] = await connection.query<any[]>('SELECT id, name, type FROM kpis')
  const [periodRows] = await connection.query<any[]>('SELECT id, startDate, endDate FROM periods')

  const collaboratorsByName = new Map<string, number>()
  const kpisByName = new Map<string, { id: number; type: string }>()
  periodRows.forEach((p: any) => {
    p.startDate = new Date(p.startDate)
    p.endDate = new Date(p.endDate)
  })
  collaboratorRows.forEach((c: any) => collaboratorsByName.set(c.name.toLowerCase().trim(), c.id))
  kpiRows.forEach((k: any) => kpisByName.set(k.name.toLowerCase().trim(), { id: k.id, type: k.type }))

  const headerRow = sheet.getRow(3) // fila 3 en el Excel
  const planCols: Array<{ col: number; date: Date | null }> = []
  const actualCols: Array<{ col: number; date: Date | null }> = []

  const headerValues = headerRow.values as Array<RowValue>
  // Columnas conocidas según layout: plan en 12-23, real en 26-37
  for (let col = 12; col <= 23; col++) {
    planCols.push({ col, date: excelDateToJS(headerValues[col] as RowValue) })
  }
  for (let col = 26; col <= 37; col++) {
    actualCols.push({ col, date: excelDateToJS(headerValues[col] as RowValue) })
  }

  let inserted = 0
  let skipped = 0
  let updated = 0

  const baseKey = (text: string) => text.toLowerCase().trim()

  for (let rowIndex = 4; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex)
    const kpiName = String(row.getCell(1).value || '').trim()
    if (!kpiName) continue

    const colaborador = String(row.getCell(8).value || '').trim()
    const area = String(row.getCell(9).value || '').trim()
    const fuente = String(row.getCell(10).value || '').trim()
    const modalidad = String(row.getCell(39).value || '').trim()
    const tipoRaw = String(row.getCell(40).value || '').trim().toLowerCase()
    const kpiType = tipoRaw === 'negativo' ? 'reduction' : 'growth'

    let collaboratorId = collaboratorsByName.get(baseKey(colaborador))
    if (!collaboratorId && colaborador) {
      const [result] = await connection.query<any>(
        'INSERT INTO collaborators (name, position, area) VALUES (?, ?, ?)',
        [colaborador, 'Sin posición', area || 'Sin área']
      )
      collaboratorId = result.insertId
      collaboratorsByName.set(baseKey(colaborador), collaboratorId)
      console.log(`➕ Creado colaborador ${colaborador} (ID ${collaboratorId})`)
    }

    let kpiInfo = kpisByName.get(baseKey(kpiName))
    if (!kpiInfo) {
      const longName = kpiName
      const MAX_NAME = 190
      const needsTruncate = longName.length > MAX_NAME
      const safeName = needsTruncate ? `${longName.slice(0, MAX_NAME - 3)}...` : longName
      const extraDesc = needsTruncate ? longName : ''
      const [result] = await connection.query<any>(
        'INSERT INTO kpis (name, description, type, criteria) VALUES (?, ?, ?, ?)',
        [
          safeName,
          extraDesc || '',
          kpiType,
          `Importado desde hoja evolutiva (${fuente || 'sin fuente'})`,
        ]
      )
      kpiInfo = { id: result.insertId, type: kpiType }
      kpisByName.set(baseKey(kpiName), kpiInfo)
      console.log(`➕ Creado KPI ${safeName} (ID ${kpiInfo.id})`)
    }

    if (!collaboratorId || !kpiInfo) {
      skipped++
      continue
    }

    for (let i = 0; i < planCols.length; i++) {
      const planInfo = planCols[i]
      const actualInfo = actualCols[i]
      const planVal = Number(row.getCell(planInfo.col).value ?? 0)
      const actualValRaw = row.getCell(actualInfo.col).value
      const actualVal = actualValRaw !== null && actualValRaw !== undefined && actualValRaw !== ''
        ? Number(actualValRaw)
        : null

      const monthDate = planInfo.date || actualInfo.date
      if (!monthDate) continue

      const period = periodRows.find(
        (p: any) => monthDate >= p.startDate && monthDate <= p.endDate
      )
      const periodId = period ? period.id : null

      let variation: number | null = null
      if (planVal && actualVal !== null) {
        variation =
          kpiInfo.type === 'reduction'
            ? Number(((planVal / actualVal) * 100).toFixed(2))
            : Number(((actualVal / planVal) * 100).toFixed(2))
      }

      const [result] = await connection.query<any>(
        `INSERT INTO kpi_evolutions (
            collaboratorId, kpiId, periodId, monthDate, planValue, actualValue, variation, source, modality, typeHint
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            planValue = VALUES(planValue),
            actualValue = VALUES(actualValue),
            variation = VALUES(variation),
            source = VALUES(source),
            modality = VALUES(modality),
            typeHint = VALUES(typeHint),
            updatedAt = CURRENT_TIMESTAMP`,
        [
          collaboratorId,
          kpiInfo.id,
          periodId,
          monthDate,
          planVal || null,
          actualVal,
          variation,
          fuente || null,
          modalidad || null,
          kpiType,
        ]
      )

      if (result.affectedRows === 1 && result.insertId) inserted++
      else updated++
    }
  }

  console.log(`\nResultado importación:`)
  console.log(`- Insertados: ${inserted}`)
  console.log(`- Actualizados: ${updated}`)
  console.log(`- Saltados (sin datos válidos): ${skipped}`)

  await connection.end()
  console.log('✅ Importación completa')
}

main().catch((err) => {
  console.error('❌ Error en importación:', err)
  process.exit(1)
})
