import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getActualValueValidationError,
  supportsNegativeActual,
} from '../src/services/kpi-actual-validation.service'

describe('kpi actual validation', () => {
  test('permite actual negativo en KPIs growth', () => {
    assert.equal(
      supportsNegativeActual({ direction: 'growth', type: 'value', formula: null }),
      true
    )
    assert.equal(
      getActualValueValidationError({
        actual: -10,
        direction: 'growth',
        type: 'value',
        formula: null,
      }),
      null
    )
  })

  test('permite actual negativo en KPIs exact', () => {
    assert.equal(
      getActualValueValidationError({
        actual: -3,
        direction: 'exact',
        type: 'value',
        formula: null,
      }),
      null
    )
  })

  test('rechaza actual negativo en KPIs reduction sin formula personalizada', () => {
    assert.equal(
      supportsNegativeActual({ direction: 'reduction', type: 'sla', formula: null }),
      false
    )
    assert.equal(
      getActualValueValidationError({
        actual: -1,
        direction: 'reduction',
        type: 'sla',
        formula: null,
      }),
      'Este KPI no admite valores negativos en el alcance'
    )
  })

  test('permite actual negativo en KPIs reduction con formula personalizada', () => {
    assert.equal(
      supportsNegativeActual({
        direction: 'reduction',
        type: 'sla',
        formula: 'Math.max(0, target - actual)',
      }),
      true
    )
    assert.equal(
      getActualValueValidationError({
        actual: -5,
        direction: 'reduction',
        type: 'sla',
        formula: 'Math.max(0, target - actual)',
      }),
      null
    )
  })
})
