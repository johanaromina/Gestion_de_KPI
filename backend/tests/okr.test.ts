/**
 * Tests unitarios del motor OKR
 * Corre con: node --import tsx --test tests/okr.test.ts
 * No requiere DB ni dependencias externas.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { calcKrProgress } from '../src/services/okr.service'
import type { OKRKeyResult } from '../src/types'

// Replica la lógica de recalcObjectiveProgress sin DB
const calcObjectiveProgress = (krs: OKRKeyResult[]): number => {
  if (krs.length === 0) return 0
  let totalWeight = 0
  let weightedSum = 0
  for (const kr of krs) {
    const progress = calcKrProgress(kr)
    const w = Number(kr.weight) || 1
    weightedSum += progress * w
    totalWeight += w
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}

// ── Helper ────────────────────────────────────────────────────────────────────
const kr = (overrides: Partial<OKRKeyResult>): OKRKeyResult => ({
  id: 1,
  objectiveId: 1,
  title: 'Test KR',
  krType: 'simple',
  weight: 1,
  status: 'not_started',
  sortOrder: 0,
  startValue: 0,
  targetValue: 100,
  currentValue: 0,
  ...overrides,
})

// ── calcKrProgress: tipo simple ───────────────────────────────────────────────
describe('calcKrProgress — simple', () => {
  test('0% cuando current == start', () => {
    assert.equal(calcKrProgress(kr({ startValue: 0, targetValue: 100, currentValue: 0 })), 0)
  })

  test('50% cuando current es la mitad', () => {
    assert.equal(calcKrProgress(kr({ startValue: 0, targetValue: 100, currentValue: 50 })), 50)
  })

  test('100% cuando current == target', () => {
    assert.equal(calcKrProgress(kr({ startValue: 0, targetValue: 100, currentValue: 100 })), 100)
  })

  test('no supera 100% aunque current > target', () => {
    assert.equal(calcKrProgress(kr({ startValue: 0, targetValue: 100, currentValue: 150 })), 100)
  })

  test('no baja de 0% aunque current < start', () => {
    assert.equal(calcKrProgress(kr({ startValue: 10, targetValue: 100, currentValue: 5 })), 0)
  })

  test('progreso correcto con start != 0', () => {
    // start=20, target=120, current=70 → (70-20)/(120-20) = 50%
    assert.equal(calcKrProgress(kr({ startValue: 20, targetValue: 120, currentValue: 70 })), 50)
  })

  test('100% cuando target == start y current >= target', () => {
    assert.equal(calcKrProgress(kr({ startValue: 50, targetValue: 50, currentValue: 50 })), 100)
  })

  test('0% cuando target == start y current < target', () => {
    assert.equal(calcKrProgress(kr({ startValue: 50, targetValue: 50, currentValue: 30 })), 0)
  })

  test('usa startValue cuando currentValue es null', () => {
    assert.equal(calcKrProgress(kr({ startValue: 0, targetValue: 100, currentValue: null })), 0)
  })

  test('progreso decimal truncado correctamente', () => {
    // (33-0)/(100-0) = 33%
    assert.equal(calcKrProgress(kr({ startValue: 0, targetValue: 100, currentValue: 33 })), 33)
  })
})

// ── calcKrProgress: tipo kpi_linked ───────────────────────────────────────────
describe('calcKrProgress — kpi_linked', () => {
  test('0% cuando kpiActual=0 y kpiTarget=100', () => {
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: 0, kpiTarget: 100 })),
      0
    )
  })

  test('50% cuando kpiActual es la mitad', () => {
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: 50, kpiTarget: 100 })),
      50
    )
  })

  test('100% cuando kpiActual == kpiTarget', () => {
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: 100, kpiTarget: 100 })),
      100
    )
  })

  test('no supera 100% aunque kpiActual > kpiTarget', () => {
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: 150, kpiTarget: 100 })),
      100
    )
  })

  test('0% cuando kpiTarget es 0 (division por cero)', () => {
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: 50, kpiTarget: 0 })),
      0
    )
  })

  test('0% cuando kpiActual y kpiTarget son null', () => {
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: null, kpiTarget: null })),
      0
    )
  })

  test('progreso correcto con valores reales', () => {
    // actual=750, target=1000 → 75%
    assert.equal(
      calcKrProgress(kr({ krType: 'kpi_linked', kpiActual: 750, kpiTarget: 1000 })),
      75
    )
  })
})

// ── Casos borde ───────────────────────────────────────────────────────────────
describe('calcKrProgress — casos borde', () => {
  test('valores negativos: start=-50, target=50, current=0 → 50%', () => {
    // (0 - (-50)) / (50 - (-50)) = 50/100 = 50%
    assert.equal(
      calcKrProgress(kr({ startValue: -50, targetValue: 50, currentValue: 0 })),
      50
    )
  })

  test('valores de punto flotante', () => {
    // start=0, target=3, current=1 → 33.33% → Math.min/max no trunca, devuelve 33.33...
    const result = calcKrProgress(kr({ startValue: 0, targetValue: 3, currentValue: 1 }))
    assert.ok(result > 33 && result < 34, `Esperaba ~33.3%, obtuvo ${result}`)
  })
})

// ── calcObjectiveProgress: progreso ponderado del objetivo ────────────────────
describe('calcObjectiveProgress — promedio ponderado', () => {
  test('0% cuando no hay KRs', () => {
    assert.equal(calcObjectiveProgress([]), 0)
  })

  test('progreso simple con un solo KR al 50%', () => {
    const krs = [kr({ startValue: 0, targetValue: 100, currentValue: 50, weight: 1 })]
    assert.equal(calcObjectiveProgress(krs), 50)
  })

  test('promedio igual cuando todos los KRs tienen el mismo peso', () => {
    const krs = [
      kr({ startValue: 0, targetValue: 100, currentValue: 0,   weight: 1 }),
      kr({ startValue: 0, targetValue: 100, currentValue: 100, weight: 1 }),
    ]
    // (0 + 100) / 2 = 50%
    assert.equal(calcObjectiveProgress(krs), 50)
  })

  test('KR con mayor peso domina el resultado', () => {
    const krs = [
      kr({ startValue: 0, targetValue: 100, currentValue: 0,   weight: 1 }),  // 0%
      kr({ startValue: 0, targetValue: 100, currentValue: 100, weight: 3 }),  // 100%
    ]
    // (0*1 + 100*3) / (1+3) = 300/4 = 75%
    assert.equal(calcObjectiveProgress(krs), 75)
  })

  test('redondea al entero más cercano', () => {
    const krs = [
      kr({ startValue: 0, targetValue: 3, currentValue: 1, weight: 1 }), // 33.33%
    ]
    assert.equal(calcObjectiveProgress(krs), 33)
  })

  test('100% cuando todos los KRs están completados', () => {
    const krs = [
      kr({ startValue: 0, targetValue: 100, currentValue: 100, weight: 2 }),
      kr({ startValue: 0, targetValue: 100, currentValue: 100, weight: 1 }),
    ]
    assert.equal(calcObjectiveProgress(krs), 100)
  })

  test('mix de KR simple y kpi_linked', () => {
    const krs = [
      kr({ krType: 'simple',     startValue: 0, targetValue: 100, currentValue: 60, weight: 1 }), // 60%
      kr({ krType: 'kpi_linked', kpiActual: 40, kpiTarget: 100,                     weight: 1 }), // 40%
    ]
    // (60 + 40) / 2 = 50%
    assert.equal(calcObjectiveProgress(krs), 50)
  })
})
