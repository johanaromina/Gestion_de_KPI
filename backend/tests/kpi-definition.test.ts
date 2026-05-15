import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseKpiName,
  parseKpiType,
  resolveKpiDirectionInput,
} from '../src/services/kpi-definition.service'

describe('kpi definition helpers', () => {
  test('parseKpiName trims and requires non-empty values', () => {
    assert.equal(parseKpiName('  Revenue  '), 'Revenue')
    assert.equal(parseKpiName('   '), null)
    assert.equal(parseKpiName(undefined), null)
  })

  test('parseKpiType only accepts the supported whitelist', () => {
    assert.equal(parseKpiType('value'), 'value')
    assert.equal(parseKpiType(' SLA '), 'sla')
    assert.equal(parseKpiType('percentage'), null)
    assert.equal(parseKpiType(null), null)
  })

  test('resolveKpiDirectionInput respects explicit valid directions', () => {
    assert.equal(resolveKpiDirectionInput('value', 'exact'), 'exact')
    assert.equal(resolveKpiDirectionInput('count', ' reduction '), 'reduction')
  })

  test('resolveKpiDirectionInput falls back by type when direction is missing or invalid', () => {
    assert.equal(resolveKpiDirectionInput('sla', undefined), 'reduction')
    assert.equal(resolveKpiDirectionInput('value', 'invalid'), 'growth')
  })
})
