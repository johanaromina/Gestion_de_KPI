import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSheetsValue, formatPeriodValue } from '../../src/integrations/sheets'

test('formatPeriodValue supports YYYYMM for monthly header sheets', () => {
  assert.equal(formatPeriodValue('2026-03-01', 'YYYYMM'), '202603')
})

test('computeSheetsValue resolves monthly column from period and filters by collaborator', () => {
  const result = computeSheetsValue(
    'value',
    {
      from: '2026-03-01',
      periodFormat: 'YYYYMM',
      areaColumn: 'Area',
      areaValue: 'Agilidad',
      collaboratorColumn: 'Colaborador',
      collaboratorValue: 'Carolina Coppola',
      kpiColumn: 'KPI',
      kpiValue: 'Business Value',
      valueColumnFromPeriod: true,
      valueColumnPeriodFormat: 'YYYYMM',
    },
    {
      headers: ['KPI', 'Area', 'Colaborador', '202603', '202604'],
      rows: [
        ['Business Value', 'Agilidad', 'Carolina Coppola', 80, 85],
        ['Business Value', 'Agilidad', 'Otra Persona', 10, 20],
      ],
    }
  )

  assert.equal(result.valueColumn, '202603')
  assert.equal(result.matchedRows, 1)
  assert.equal(result.computed, 80)
  assert.deepEqual(result.values, [80])
})

test('computeSheetsValue aggregates multiple matched rows when metricTypeUi is value_agg', () => {
  const result = computeSheetsValue(
    'value_agg',
    {
      from: '2026-03-01',
      kpiColumn: 'KPI',
      kpiValue: 'Facturación VUCE',
      collaboratorColumn: 'Colaborador',
      collaboratorValue: 'Fernanda Larrain',
      valueColumnFromPeriod: true,
      valueColumnPeriodFormat: 'YYYYMM',
      aggregation: 'SUM',
    },
    {
      headers: ['KPI', 'Colaborador', '202603'],
      rows: [
        ['Facturación VUCE', 'Fernanda Larrain', 15],
        ['Facturación VUCE', 'Fernanda Larrain', 10],
        ['Facturación VUCE', 'Hernan Di Meglio', 99],
      ],
    }
  )

  assert.equal(result.computed, 25)
  assert.equal(result.matchedRows, 2)
  assert.deepEqual(result.values, [15, 10])
})
