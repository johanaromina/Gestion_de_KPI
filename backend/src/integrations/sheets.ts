export type SheetData = {
  headers: unknown[]
  rows: unknown[][]
}

export type SheetComputationParams = Record<string, unknown>

export type SheetComputationResult = {
  computed: number
  matchedRows: number
  values: number[]
  valueColumn: unknown
  periodValue: string
}

const pickParam = (params: SheetComputationParams, keys: string[]) => {
  for (const key of keys) {
    const value = params[key]
    if (value !== null && value !== undefined && value !== '') {
      return value
    }
  }
  return null
}

export const formatPeriodValue = (from: string, format: string) => {
  if (!from) return ''
  if (format === 'YYYY-MM-DD') return from
  if (format === 'YYYYMM') return from.slice(0, 7).replace('-', '')
  if (format === 'YYYY-MM') return from.slice(0, 7)
  return from
}

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const findColumnIndex = (header: readonly unknown[], column: unknown) => {
  if (column === null || column === undefined || column === '') return null
  if (typeof column === 'number') return column
  const normalizedColumn = String(column).trim().toLowerCase()
  const headerIndex = header.findIndex((cell) => String(cell).trim().toLowerCase() === normalizedColumn)
  if (headerIndex >= 0) return headerIndex
  const numeric = Number(column)
  if (Number.isFinite(numeric) && String(column).trim() !== '') {
    return numeric
  }
  return null
}

const matchValue = (value: unknown, expected: unknown) => {
  if (expected === null || expected === undefined || expected === '') return true
  return String(value).trim().toLowerCase() === String(expected).trim().toLowerCase()
}

const matchOptionalColumn = (row: readonly unknown[], columnIndex: number | null, expected: unknown) => {
  if (columnIndex === null) return true
  return matchValue(row[columnIndex], expected)
}

const isTruthyParam = (value: unknown) => {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si'
}

export const resolveSheetsValueColumn = (params: SheetComputationParams, periodValue: string) => {
  const explicitValueColumn = pickParam(params, ['valueColumn', 'value'])
  if (explicitValueColumn !== null && explicitValueColumn !== undefined && String(explicitValueColumn).trim() !== '') {
    return explicitValueColumn
  }

  const usePeriodHeader =
    isTruthyParam(params.valueColumnFromPeriod) ||
    isTruthyParam(params.periodAsValueColumn) ||
    isTruthyParam(params.monthColumnFromPeriod)

  if (!usePeriodHeader) return explicitValueColumn

  const customHeader = pickParam(params, ['valueColumnPeriodValue', 'periodHeaderValue', 'monthColumnValue'])
  if (customHeader !== null && customHeader !== undefined && String(customHeader).trim() !== '') {
    return customHeader
  }

  const headerFormat =
    String(pickParam(params, ['valueColumnPeriodFormat', 'periodHeaderFormat', 'monthColumnFormat', 'periodFormat']) || 'YYYY-MM')

  if (typeof params.from === 'string' && params.from) {
    return formatPeriodValue(params.from, headerFormat)
  }

  return periodValue
}

export const computeSheetsValue = (
  metricTypeUi: string | null | undefined,
  params: SheetComputationParams,
  sheetData: SheetData
): SheetComputationResult => {
  const headers = sheetData.headers || []
  const rows = sheetData.rows || []
  const periodFormat = String(params.periodFormat || 'YYYY-MM')
  const periodValue = String(
    pickParam(params, ['periodValue', 'periodLabel', 'periodName']) ||
      formatPeriodValue(String(params.from || ''), periodFormat)
  )
  const areaValue = pickParam(params, ['areaValue', 'area'])
  const kpiValue = pickParam(params, ['kpiValue', 'kpi'])
  const collaboratorValue = pickParam(params, ['collaboratorValue', 'collaborator', 'user', 'owner', 'person'])
  const periodColumn = params.periodColumn
  const areaColumn = params.areaColumn
  const collaboratorColumn = pickParam(params, ['collaboratorColumn', 'userColumn', 'ownerColumn', 'personColumn'])
  const kpiColumn = params.kpiColumn
  const valueColumn = resolveSheetsValueColumn(params, periodValue)

  const periodIdx = findColumnIndex(headers, periodColumn)
  const areaIdx = findColumnIndex(headers, areaColumn)
  const collaboratorIdx = findColumnIndex(headers, collaboratorColumn)
  const kpiIdx = findColumnIndex(headers, kpiColumn)
  const valueIdx = findColumnIndex(headers, valueColumn)

  if (valueIdx === null || valueIdx === undefined) {
    throw new Error('No se pudo resolver valueColumn en Sheets')
  }

  const matched = rows.filter((row) => {
    const rowCells = Array.isArray(row) ? row : []
    return (
      matchOptionalColumn(rowCells, periodIdx, periodValue) &&
      matchOptionalColumn(rowCells, areaIdx, areaValue) &&
      matchOptionalColumn(rowCells, collaboratorIdx, collaboratorValue) &&
      matchOptionalColumn(rowCells, kpiIdx, kpiValue)
    )
  })

  const values = matched.map((row) => toNumber(Array.isArray(row) ? row[valueIdx] : null)).filter((val) => val !== null) as number[]
  if (metricTypeUi === 'value_agg') {
    const aggregation = String(params.aggregation || 'SUM').trim().toUpperCase()
    if (values.length === 0) {
      return { computed: 0, matchedRows: matched.length, values, valueColumn, periodValue }
    }
    if (aggregation === 'AVG') {
      const sum = values.reduce((acc, val) => acc + val, 0)
      return { computed: sum / values.length, matchedRows: matched.length, values, valueColumn, periodValue }
    }
    if (aggregation === 'MAX') {
      return { computed: Math.max(...values), matchedRows: matched.length, values, valueColumn, periodValue }
    }
    if (aggregation === 'MIN') {
      return { computed: Math.min(...values), matchedRows: matched.length, values, valueColumn, periodValue }
    }
    const sum = values.reduce((acc, val) => acc + val, 0)
    return { computed: sum, matchedRows: matched.length, values, valueColumn, periodValue }
  }

  return {
    computed: values.length > 0 ? values[0] : 0,
    matchedRows: matched.length,
    values,
    valueColumn,
    periodValue,
  }
}
