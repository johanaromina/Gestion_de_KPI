/**
 * Tests unitarios de autenticación y autorización
 * Corre con: node --import tsx --test tests/auth.test.ts
 * No requiere DB ni servidor levantado.
 *
 * NOTA: los imports son elevados por el compilador TS antes que cualquier
 * process.env.JWT_SECRET = '...' que pongamos en el código.
 * Por eso usamos el valor default de appEnv: 'dev-secret-key-change-in-production'
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { authenticate, authorize, requirePermission } from '../src/middleware/auth.middleware'
import type { Request, Response, NextFunction } from 'express'

// El default de appEnv cuando JWT_SECRET no está en el entorno
const SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (payload: Record<string, any>, expiresIn = '1h') =>
  jwt.sign(payload, SECRET, { expiresIn } as any)

const makeExpiredToken = (payload: Record<string, any>) =>
  jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET)

const mockReq = (token?: string): Request =>
  ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as unknown as Request

const mockRes = () => {
  const res = {
    _status: 0,
    _body: null as any,
    status(code: number) { this._status = code; return this },
    json(body: any)   { this._body = body;   return this },
  }
  return res as unknown as Response & { _status: number; _body: any }
}

const noop: NextFunction = () => {}

// ── JWT básico ────────────────────────────────────────────────────────────────
describe('JWT — generación y verificación', () => {
  test('crea y verifica un token válido', () => {
    const token = makeToken({ id: 1, role: 'admin', name: 'Test' })
    const decoded = jwt.verify(token, SECRET) as any
    assert.equal(decoded.id, 1)
    assert.equal(decoded.role, 'admin')
    assert.equal(decoded.name, 'Test')
  })

  test('un token firmado con otro secret es inválido', () => {
    const token = jwt.sign({ id: 1 }, 'otro-secret')
    assert.throws(() => jwt.verify(token, SECRET), /invalid signature/)
  })

  test('un token expirado lanza TokenExpiredError', () => {
    const token = makeExpiredToken({ id: 1 })
    assert.throws(
      () => jwt.verify(token, SECRET),
      (err: any) => err.name === 'TokenExpiredError'
    )
  })

  test('un token manipulado lanza JsonWebTokenError', () => {
    const token = makeToken({ id: 1, role: 'admin' })
    const tampered = token.slice(0, -5) + 'XXXXX'
    assert.throws(
      () => jwt.verify(tampered, SECRET),
      (err: any) => err.name === 'JsonWebTokenError'
    )
  })
})

// ── authenticate middleware ───────────────────────────────────────────────────
describe('authenticate middleware', () => {
  test('llama a next() con token válido y popula req.user', () => {
    const token = makeToken({ id: 42, name: 'Johana', role: 'admin' })
    const req = mockReq(token)
    const res = mockRes()
    let called = false

    authenticate(req, res, () => { called = true })

    assert.ok(called, 'next() no fue llamado')
    assert.equal((req as any).user?.id, 42)
    assert.equal((req as any).user?.role, 'admin')
  })

  test('devuelve 401 si no hay Authorization header', () => {
    const req = mockReq()
    const res = mockRes()

    authenticate(req, res, noop)

    assert.equal(res._status, 401)
    assert.equal(res._body?.error, 'Token no proporcionado')
  })

  test('devuelve 401 si el header no empieza con Bearer', () => {
    const req = { headers: { authorization: 'Basic abc123' } } as unknown as Request
    const res = mockRes()

    authenticate(req, res, noop)

    assert.equal(res._status, 401)
  })

  test('devuelve 401 con "Token inválido" si el token es basura', () => {
    const req = mockReq('esto-no-es-un-jwt')
    const res = mockRes()

    authenticate(req, res, noop)

    assert.equal(res._status, 401)
    assert.equal(res._body?.error, 'Token inválido')
  })

  test('devuelve 401 con "Token expirado" si el token expiró', () => {
    const token = makeExpiredToken({ id: 1, role: 'viewer' })
    const req = mockReq(token)
    const res = mockRes()

    authenticate(req, res, noop)

    assert.equal(res._status, 401)
    assert.equal(res._body?.error, 'Token expirado')
  })

  test('popula hasSuperpowers=false por defecto', () => {
    const token = makeToken({ id: 1, name: 'Normal', role: 'viewer' })
    const req = mockReq(token)

    authenticate(req, mockRes(), () => {})

    assert.equal((req as any).user?.hasSuperpowers, false)
  })

  test('preserva hasSuperpowers=true del payload', () => {
    const token = makeToken({ id: 1, name: 'Super', role: 'admin', hasSuperpowers: true })
    const req = mockReq(token)

    authenticate(req, mockRes(), () => {})

    assert.equal((req as any).user?.hasSuperpowers, true)
  })

  test('permissions queda como [] si no viene en el payload', () => {
    const token = makeToken({ id: 1, role: 'viewer' })
    const req = mockReq(token)

    authenticate(req, mockRes(), () => {})

    assert.deepEqual((req as any).user?.permissions, [])
  })
})

// ── authorize middleware ──────────────────────────────────────────────────────
describe('authorize middleware', () => {
  const makeAuthReq = (role: string) => {
    const req = mockReq(makeToken({ id: 1, role }))
    authenticate(req, mockRes(), () => {})
    return req
  }

  test('permite al rol correcto', () => {
    const req = makeAuthReq('admin')
    const res = mockRes()
    let passed = false
    authorize('admin', 'manager')(req, res, () => { passed = true })
    assert.ok(passed)
  })

  test('bloquea con 403 a un rol no permitido', () => {
    const req = makeAuthReq('viewer')
    const res = mockRes()
    authorize('admin')(req, res, noop)
    assert.equal(res._status, 403)
    assert.equal(res._body?.error, 'No autorizado')
  })

  test('devuelve 401 si req.user no está definido', () => {
    const req = {} as Request
    const res = mockRes()
    authorize('admin')(req, res, noop)
    assert.equal(res._status, 401)
  })
})

// ── requirePermission middleware ──────────────────────────────────────────────
describe('requirePermission middleware', () => {
  const makeAuthReq = (payload: Record<string, any>) => {
    const req = mockReq(makeToken(payload))
    authenticate(req, mockRes(), () => {})
    return req
  }

  test('permite si el usuario tiene el permiso exacto', () => {
    const req = makeAuthReq({ id: 1, role: 'manager', permissions: ['export:okr'] })
    const res = mockRes()
    let passed = false
    requirePermission('export:okr')(req, res, () => { passed = true })
    assert.ok(passed)
  })

  test('bloquea si el usuario no tiene el permiso', () => {
    const req = makeAuthReq({ id: 1, role: 'viewer', permissions: [] })
    const res = mockRes()
    requirePermission('export:okr')(req, res, noop)
    assert.equal(res._status, 403)
  })

  test('hasSuperpowers bypasea cualquier permiso', () => {
    const req = makeAuthReq({ id: 1, role: 'admin', hasSuperpowers: true, permissions: [] })
    const res = mockRes()
    let passed = false
    requirePermission('export:okr', 'manage:users')(req, res, () => { passed = true })
    assert.ok(passed)
  })

  test('devuelve 401 si no hay user en el request', () => {
    const req = {} as Request
    const res = mockRes()
    requirePermission('export:okr')(req, res, noop)
    assert.equal(res._status, 401)
  })
})
