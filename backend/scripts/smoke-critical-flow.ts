import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../src/config/database'

const require = createRequire(import.meta.url)
const TSX_PKG = require.resolve('tsx/package.json')
const TSX_CLI = join(dirname(TSX_PKG), 'dist', 'cli.mjs')
const PORT = process.env.SMOKE_PORT || '5051'
const BASE_URL = `http://localhost:${PORT}`
const SMOKE_JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-jwt-secret'
const SMOKE_AUTH_ENCRYPTION_KEY =
  process.env.AUTH_ENCRYPTION_KEY || process.env.JWT_SECRET || 'smoke-test-auth-encryption-key'
const SMOKE_APP_BASE_URL = process.env.APP_BASE_URL || BASE_URL
const SMOKE_FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || SMOKE_APP_BASE_URL
const SMOKE_PUBLIC_API_BASE_URL = process.env.PUBLIC_API_BASE_URL || `${BASE_URL}/api`
const SMOKE_CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || SMOKE_FRONTEND_BASE_URL

type JsonRecord = Record<string, any>

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message)
  }
}

const log = (message: string) => {
  console.log(`[smoke] ${message}`)
}

const runCommand = (label: string, args: string[], extraEnv: Record<string, string> = {}) =>
  new Promise<void>((resolve, reject) => {
    log(`Ejecutando ${label}: ${args.join(' ')}`)
    const child = spawn(process.execPath, [TSX_CLI, ...args.slice(1)], {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${label} termino con codigo ${code ?? 'null'}`))
      }
    })
    child.on('error', reject)
  })

const startServer = async () => {
  log(`Levantando API temporal en puerto ${PORT}`)
  const child = spawn(process.execPath, [TSX_CLI, 'src/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT,
      JWT_SECRET: SMOKE_JWT_SECRET,
      AUTH_ENCRYPTION_KEY: SMOKE_AUTH_ENCRYPTION_KEY,
      APP_BASE_URL: SMOKE_APP_BASE_URL,
      FRONTEND_BASE_URL: SMOKE_FRONTEND_BASE_URL,
      PUBLIC_API_BASE_URL: SMOKE_PUBLIC_API_BASE_URL,
      CORS_ALLOWED_ORIGINS: SMOKE_CORS_ALLOWED_ORIGINS,
      NOTIFY_ENABLED: 'false',
      NOTIFY_RUN_ON_START: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  pipeLogs(child, 'server')
  await waitForHealth()
  return child
}

const pipeLogs = (child: ChildProcessWithoutNullStreams, label: string) => {
  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`)
  })
}

const stopServer = async (child: ChildProcessWithoutNullStreams | null) => {
  if (!child || child.killed) return
  log('Deteniendo API temporal')
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    delay(5000).then(() => {
      if (!child.killed) child.kill('SIGKILL')
    }),
  ])
}

const waitForHealth = async () => {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`)
      if (response.ok) {
        log('Health check OK')
        return
      }
    } catch {
      // retry
    }
    await delay(500)
  }
  throw new Error('La API temporal no respondio al health check')
}

const requestJson = async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, options)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${path}: ${JSON.stringify(data)}`)
  }
  return data as T
}

const main = async () => {
  let server: ChildProcessWithoutNullStreams | null = null
  try {
    await runCommand('seed-demo-examples', ['tsx', 'scripts/seed-demo-examples.ts'])

    server = await startServer()

    const login = await requestJson<{ token: string; user: JsonRecord }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@empresa.demo',
        password: 'Johana1409',
      }),
    })

    assert(login.token, 'El login no devolvio token')
    assert(login.user?.name === 'Johana Manzanares', 'El login no devolvio a Johana')
    log('Login OK')

    const authHeaders = {
      Authorization: `Bearer ${login.token}`,
      'Content-Type': 'application/json',
    }

    const me = await requestJson<JsonRecord>('/api/auth/me', {
      headers: authHeaders,
    })
    assert(me.email === 'admin@empresa.demo', 'El endpoint /auth/me devolvio un usuario inesperado')
    log('Auth/me OK')

    const collaboratorAssignments = await requestJson<any[]>('/api/collaborator-kpis?periodId=1', {
      headers: authHeaders,
    })
    assert(collaboratorAssignments.length >= 10, 'No se encontraron suficientes collaborator_kpis demo')
    log(`Collaborator KPIs OK (${collaboratorAssignments.length})`)

    const scopeKpis = await requestJson<any[]>('/api/scope-kpis?periodId=1', {
      headers: authHeaders,
    })
    assert(scopeKpis.length >= 5, 'No se encontraron suficientes scope_kpis demo')
    const qaScope = scopeKpis.find((row) => row.name === 'QA Performance Score')
    const companyScope = scopeKpis.find((row) => row.name === 'Company Performance Score')
    const mixedScope = scopeKpis.find((row) => row.name === 'Executive Company Mix')
    assert(qaScope, 'No existe QA Performance Score')
    assert(companyScope, 'No existe Company Performance Score')
    assert(mixedScope, 'No existe Executive Company Mix')
    assert(mixedScope.sourceMode === 'mixed', 'Executive Company Mix no quedo en modo mixed')
    assert(mixedScope.directActual != null, 'Executive Company Mix no tiene directActual')
    assert(mixedScope.aggregatedActual != null, 'Executive Company Mix no tiene aggregatedActual')
    log('Scope KPIs OK')

    const qaLinks = await requestJson<any[]>(`/api/scope-kpis/${qaScope.id}/links`, {
      headers: authHeaders,
    })
    assert(qaLinks.some((row) => row.childType === 'collaborator'), 'QA scope no tiene links collaborator -> scope')
    const companyLinks = await requestJson<any[]>(`/api/scope-kpis/${companyScope.id}/links`, {
      headers: authHeaders,
    })
    assert(companyLinks.some((row) => row.childType === 'scope'), 'Company scope no tiene links scope -> scope')
    log('Links OK')

    const objectives = await requestJson<any[]>('/api/objective-trees', {
      headers: authHeaders,
    })
    assert(objectives.length >= 3, 'No se encontraron objetivos demo')
    assert(
      objectives.some((objective) => Array.isArray(objective.scopeKpis) && objective.scopeKpis.length > 0),
      'No se encontraron objetivos vinculados a scope_kpis'
    )
    const companyScopeObjectives = await requestJson<any[]>(`/api/scope-kpis/${companyScope.id}/objectives`, {
      headers: authHeaders,
    })
    assert(companyScopeObjectives.length > 0, 'Company scope no tiene objetivos vinculados')
    const growthObjective = objectives.find((objective) => objective.name === 'Crecimiento rentable')
    assert(growthObjective, 'No existe objetivo demo Crecimiento rentable')
    const growthDrilldown = await requestJson<any>(`/api/objective-trees/${growthObjective.id}/drilldown`, {
      headers: authHeaders,
    })
    assert(Array.isArray(growthDrilldown.scopeKpis) && growthDrilldown.scopeKpis.length > 0, 'El drill-down no devolvio scope_kpis')
    assert(
      growthDrilldown.scopeKpis.some((scopeKpi: any) => Array.isArray(scopeKpi.links) && scopeKpi.links.length > 0),
      'El drill-down no devolvio links hijos para los scope_kpis'
    )
    log('Objective links OK')

    const executiveTree = await requestJson<any>('/api/dashboard/executive-tree', {
      headers: authHeaders,
    })
    assert(Array.isArray(executiveTree.companies) && executiveTree.companies.length > 0, 'El tablero ejecutivo no devolvio companies')
    assert(
      executiveTree.companies.some((company: any) => Array.isArray(company.children)),
      'El tablero ejecutivo no devolvio jerarquia de areas/equipos'
    )
    log('Executive tree OK')

    const executiveTrends = await requestJson<any>(
      `/api/dashboard/executive-trends?scopeId=${companyScope.orgScopeId}&periodId=1&objectiveName=${encodeURIComponent('Crecimiento rentable')}`,
      {
        headers: authHeaders,
      }
    )
    assert(Array.isArray(executiveTrends.periodSeries), 'El tablero ejecutivo no devolvio tendencia por periodos')
    assert(Array.isArray(executiveTrends.subPeriodSeries), 'El tablero ejecutivo no devolvio tendencia por subperiodos')
    assert(executiveTrends.scope?.id === companyScope.orgScopeId, 'La tendencia ejecutiva devolvio un scope inesperado')
    log('Executive trends OK')

    const beforeRuns = await pool.query<any[]>(
      'SELECT COUNT(*) AS total FROM scope_kpi_aggregation_runs WHERE scopeKpiId = ?',
      [qaScope.id]
    )
    const beforeRunCount = Number((beforeRuns[0] as any[])[0]?.total || 0)

    const recalc = await requestJson<{ resultValue: number; inputs: number }>(`/api/scope-kpis/${qaScope.id}/recalculate`, {
      method: 'POST',
      headers: authHeaders,
    })
    assert(recalc.inputs >= 2, 'El recalc de QA scope no tomo los hijos esperados')
    assert(Number.isFinite(Number(recalc.resultValue)), 'El recalc de QA scope no devolvio resultValue')

    const afterRuns = await pool.query<any[]>(
      'SELECT COUNT(*) AS total FROM scope_kpi_aggregation_runs WHERE scopeKpiId = ?',
      [qaScope.id]
    )
    const afterRunCount = Number((afterRuns[0] as any[])[0]?.total || 0)
    assert(afterRunCount === beforeRunCount + 1, 'El recalc no genero un aggregation run nuevo')
    log('Recalculate scope OK')

    const targets = await requestJson<any[]>('/api/integrations/targets', {
      headers: authHeaders,
    })
    assert(targets.length >= 2, 'No hay targets demo de integracion')
    const scopeTarget = targets.find((row) => Number(row.scopeKpiId) > 0)
    assert(scopeTarget, 'No existe target demo apuntando a scopeKpiId')

    await requestJson(`/api/integrations/targets/${scopeTarget.id}/run`, {
      method: 'POST',
      headers: authHeaders,
    })

    const [runRows] = await pool.query<any[]>(
      `SELECT status, outputs
       FROM integration_template_runs
       WHERE targetId = ?
       ORDER BY id DESC
       LIMIT 1`,
      [scopeTarget.id]
    )
    assert(Array.isArray(runRows) && runRows.length === 1, 'No se encontro run para el target demo')
    const latestRun = runRows[0]
    const outputs = latestRun.outputs ? JSON.parse(latestRun.outputs) : {}
    assert(latestRun.status === 'success', 'La ejecucion del target demo no quedo en success')
    assert(outputs.scopeKpiId || outputs.skipped === true, 'El run demo no resolvio scopeKpiId ni skip esperado')
    log('Run target OK')

    const [mappingRows] = await pool.query<any[]>(
      'SELECT COUNT(*) AS total FROM data_source_mappings WHERE sourceType IN (\'global\', \'looker\', \'jira\', \'generic_api\', \'sheets\')'
    )
    const mappingsCount = Number(mappingRows?.[0]?.total || 0)
    assert(mappingsCount >= 10, 'No se generaron suficientes data_source_mappings demo')
    log('Data source mappings OK')

    console.log('\n✅ Smoke critical flow OK')
    console.log(
      JSON.stringify(
        {
          login: 'ok',
          collaboratorAssignments: collaboratorAssignments.length,
          scopeKpis: scopeKpis.length,
          qaScopeId: qaScope.id,
          companyScopeId: companyScope.id,
          objectives: objectives.length,
          integrationTargetId: scopeTarget.id,
          mappingsCount,
        },
        null,
        2
      )
    )
  } finally {
    await stopServer(server)
    await pool.end()
  }
}

main().catch((error) => {
  console.error('\n❌ Smoke critical flow failed:', error)
  process.exit(1)
})
