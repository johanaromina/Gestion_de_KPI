/**
 * Smoke test de release — frontend + API, solo lectura.
 *
 * Verifica:
 * - shell HTML del frontend y rutas SPA representativas
 * - assets de locales es/en para common, marketplace e import
 * - health y ready del backend
 * - login, auth/me y códigos de error básicos
 * - endpoints clave del release: periods, kpis, objective-trees, scope-kpis
 * - tablero ejecutivo y tendencias
 * - configuración/integraciones (si el usuario tiene permisos)
 * - exports OKR por objetivo y por período
 *
 * Uso:
 *   tsx scripts/smoke-release.ts https://app.example.com admin@empresa.demo secret
 *
 * Variables de entorno:
 *   APP_URL, API_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD
 */

type Json = Record<string, any>

const HELP_FLAG = process.argv.includes('--help') || process.argv.includes('-h')

if (HELP_FLAG) {
  console.log(`
Uso:
  tsx scripts/smoke-release.ts <app-url> <email> <password>

Variables de entorno:
  APP_URL         URL pública del frontend. Ej: https://kpimanager.com.ar
  API_BASE_URL    URL base del backend. Default: <APP_URL>/api
  SMOKE_EMAIL     Usuario para login
  SMOKE_PASSWORD  Password del usuario

Ejemplos:
  APP_URL=https://kpimanager.com.ar tsx scripts/smoke-release.ts
  tsx scripts/smoke-release.ts https://kpimanager.com.ar admin@empresa.demo Admin1234!
`.trim())
  process.exit(0)
}

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '')
const APP_URL = stripTrailingSlash(process.argv[2] || process.env.APP_URL || process.env.BASE_URL || 'http://localhost:5000')
const API_BASE_URL = stripTrailingSlash(process.env.API_BASE_URL || `${APP_URL}/api`)
const EMAIL = process.argv[3] || process.env.SMOKE_EMAIL || 'admin@empresa.demo'
const PASSWORD = process.argv[4] || process.env.SMOKE_PASSWORD || 'Johana1409'

let passed = 0
let failed = 0
const errors: string[] = []

const ok = (label: string) => {
  passed += 1
  console.log(`  OK  ${label}`)
}

const fail = (label: string, reason: string) => {
  failed += 1
  errors.push(`${label}: ${reason}`)
  console.log(`  FAIL ${label} -> ${reason}`)
}

const joinUrl = (base: string, path: string) =>
  `${stripTrailingSlash(base)}${path.startsWith('/') ? path : `/${path}`}`

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const fetchJson = async <T = any>(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; data: T | null; headers: Headers }> => {
  const response = await fetch(url, options)
  const text = await response.text()
  let data: T | null = null

  if (text) {
    try {
      data = JSON.parse(text) as T
    } catch {
      data = null
    }
  }

  return { status: response.status, data, headers: response.headers }
}

const api = async <T = any>(
  path: string,
  options: RequestInit = {},
  token?: string
) =>
  fetchJson<T>(joinUrl(API_BASE_URL, path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string> | undefined) || {}),
    },
  })

const fetchText = async (url: string) => {
  const response = await fetch(url)
  const text = await response.text()
  return { status: response.status, text, headers: response.headers }
}

const check = async (label: string, fn: () => Promise<void>) => {
  try {
    await fn()
    ok(label)
  } catch (error) {
    fail(label, toErrorMessage(error))
  }
}

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message)
}

const checkFrontendRoute = async (path: string) => {
  const { status, text, headers } = await fetchText(joinUrl(APP_URL, path))
  assert(status === 200, `status=${status}`)
  assert((headers.get('content-type') || '').includes('text/html'), `content-type=${headers.get('content-type')}`)
  assert(
    text.includes('<div id="root">') || text.includes('<div id="root"></div>') || text.includes('type="module"'),
    'HTML shell inválido'
  )
}

const getNested = (obj: Json | null, path: string) =>
  path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj)

const checkLocaleAsset = async (path: string, checks: Array<{ key: string; expected?: string }>) => {
  const { status, data, headers } = await fetchJson<Json>(joinUrl(APP_URL, path))
  assert(status === 200, `status=${status}`)
  assert((headers.get('content-type') || '').includes('application/json'), `content-type=${headers.get('content-type')}`)
  assert(data && typeof data === 'object', 'JSON inválido')

  checks.forEach(({ key, expected }) => {
    const value = getNested(data, key)
    assert(value !== undefined && value !== null && value !== '', `falta key=${key}`)
    if (expected !== undefined) {
      assert(value === expected, `key=${key} expected=${expected} actual=${String(value)}`)
    }
  })
}

const checkExport = async (label: string, path: string, token: string, expectedContentType: string) => {
  const response = await fetch(joinUrl(API_BASE_URL, path), {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert(response.status === 200, `status=${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  assert(contentType.includes(expectedContentType), `content-type=${contentType}`)
}

const main = async () => {
  console.log(`\nSmoke release`)
  console.log(`  APP_URL: ${APP_URL}`)
  console.log(`  API_BASE_URL: ${API_BASE_URL}`)
  console.log(`  USER: ${EMAIL}\n`)

  await check('Frontend shell /', () => checkFrontendRoute('/'))
  await check('Frontend shell /login', () => checkFrontendRoute('/login'))
  await check('Frontend shell /marketplace-kpi', () => checkFrontendRoute('/marketplace-kpi'))
  await check('Frontend shell /tablero-ejecutivo', () => checkFrontendRoute('/tablero-ejecutivo'))

  await check('Locales en/common.json', () =>
    checkLocaleAsset('/locales/en/common.json', [
      { key: 'save', expected: 'Save' },
      { key: 'dialog.alert_title' },
      { key: 'not_found.title' },
    ]))
  await check('Locales es/common.json', () =>
    checkLocaleAsset('/locales/es/common.json', [
      { key: 'save' },
      { key: 'dialog.alert_title' },
      { key: 'not_found.title' },
    ]))
  await check('Locales en/marketplace.json', () =>
    checkLocaleAsset('/locales/en/marketplace.json', [
      { key: 'title', expected: 'KPI Template Marketplace' },
      { key: 'catalog.sales.templates.ingresos_mensuales.name' },
      { key: 'units.clientes' },
    ]))
  await check('Locales es/marketplace.json', () =>
    checkLocaleAsset('/locales/es/marketplace.json', [
      { key: 'title' },
      { key: 'catalog.sales.templates.ingresos_mensuales.name' },
      { key: 'units.clientes' },
    ]))
  await check('Locales en/import.json', () =>
    checkLocaleAsset('/locales/en/import.json', [
      { key: 'title', expected: 'Import data' },
      { key: 'areas.template_filename', expected: 'areas_template.csv' },
      { key: 'collaborators.template_filename', expected: 'collaborators_template.csv' },
    ]))

  await check('GET /health', async () => {
    const { status, data } = await api<Json>('/health')
    assert(status === 200, `status=${status}`)
    assert(data?.status === 'ok', `body=${JSON.stringify(data)}`)
  })

  await check('GET /health/ready', async () => {
    const { status, data } = await api<Json>('/health/ready')
    assert(status === 200, `status=${status}`)
    assert(data?.status === 'ok', `body=${JSON.stringify(data)}`)
  })

  await check('POST /auth/login missing credentials returns code', async () => {
    const { status, data } = await api<Json>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: '', password: '' }),
    })
    assert(status === 400, `status=${status}`)
    assert(typeof data?.code === 'string', `body=${JSON.stringify(data)}`)
    assert(data?.code === 'AUTH_CREDENTIALS_REQUIRED', `code=${data?.code}`)
  })

  let token: string | null = null
  let user: Json | null = null
  let firstPeriodId: number | undefined
  let firstObjectiveId: number | undefined
  let companyScopeId: number | undefined
  let executivePeriodId: number | undefined
  let objectiveName: string | undefined

  await check('POST /auth/login', async () => {
    const { status, data } = await api<{ token: string; user: Json }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    assert(status === 200, `status=${status}`)
    assert(data?.token, 'sin token')
    assert(data?.user?.email, 'sin user.email')
    token = data.token
    user = data.user
  })

  if (!token) {
    console.log('\nNo se pudo autenticar. Se corta el smoke autenticado.')
  } else {
    await check('GET /auth/me', async () => {
      const { status, data } = await api<Json>('/auth/me', {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(data?.email === EMAIL, `email=${data?.email}`)
    })

    await check('GET /periods', async () => {
      const { status, data } = await api<any[]>('/periods', {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(Array.isArray(data), 'respuesta no es array')
      assert(data.length > 0, 'sin períodos')
      firstPeriodId = Number(data[0]?.id)
    })

    await check('GET /kpis', async () => {
      const { status, data } = await api<any[]>('/kpis', {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(Array.isArray(data), 'respuesta no es array')
      assert(data.length > 0, 'sin KPIs')
    })

    await check('GET /objective-trees', async () => {
      const { status, data } = await api<any[]>('/objective-trees', {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(Array.isArray(data), 'respuesta no es array')
      assert(data.length > 0, 'sin objetivos')
      firstObjectiveId = Number(data[0]?.id)
    })

    await check('GET /scope-kpis', async () => {
      const { status, data } = await api<any[]>('/scope-kpis', {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(Array.isArray(data), 'respuesta no es array')
    })

    await check('GET /collaborator-kpis', async () => {
      const qs = firstPeriodId ? `?periodId=${firstPeriodId}` : ''
      const { status, data } = await api<any[]>(`/collaborator-kpis${qs}`, {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(Array.isArray(data), 'respuesta no es array')
    })

    await check('GET /dashboard/executive-tree', async () => {
      const { status, data } = await api<Json>('/dashboard/executive-tree', {}, token || undefined)
      assert(status === 200, `status=${status}`)
      assert(Array.isArray(data?.companies), 'sin companies')
      assert(data.companies.length > 0, 'sin companies')
      executivePeriodId = Number(data.periodId)
      companyScopeId = Number(data.companies[0]?.scope?.id)
      objectiveName = data.companies[0]?.objectives?.[0]
    })

    if (companyScopeId && executivePeriodId) {
      await check('GET /dashboard/executive-trends', async () => {
        const params = new URLSearchParams({
          scopeId: String(companyScopeId),
          periodId: String(executivePeriodId),
        })
        if (objectiveName) params.set('objectiveName', objectiveName)
        const { status, data } = await api<Json>(`/dashboard/executive-trends?${params.toString()}`, {}, token || undefined)
        assert(status === 200, `status=${status}`)
        assert(Array.isArray(data?.periodSeries), 'sin periodSeries')
        assert(Array.isArray(data?.subPeriodSeries), 'sin subPeriodSeries')
      })
    }

    const canViewConfig =
      user?.hasSuperpowers ||
      user?.role === 'admin' ||
      (Array.isArray(user?.permissions) &&
        (user.permissions.includes('config.view') || user.permissions.includes('config.manage')))

    if (canViewConfig) {
      await check('GET /config/roles', async () => {
        const { status, data } = await api<any[]>('/config/roles', {}, token || undefined)
        assert(status === 200, `status=${status}`)
        assert(Array.isArray(data), 'respuesta no es array')
      })

      await check('GET /integrations/templates', async () => {
        const { status, data } = await api<any[]>('/integrations/templates', {}, token || undefined)
        assert(status === 200, `status=${status}`)
        assert(Array.isArray(data), 'respuesta no es array')
      })

      await check('GET /data-source-mappings', async () => {
        const { status, data } = await api<any[]>('/data-source-mappings', {}, token || undefined)
        assert(status === 200, `status=${status}`)
        assert(Array.isArray(data), 'respuesta no es array')
      })
    } else {
      console.log('  SKIP config/integrations smoke: usuario sin permisos altos')
    }

    if (firstObjectiveId) {
      await check('GET /export/okr/:objectiveId/pdf', async () => {
        await checkExport('okr objective pdf', `/export/okr/${firstObjectiveId}/pdf`, token || '', 'application/pdf')
      })
      await check('GET /export/okr/:objectiveId/excel', async () => {
        await checkExport(
          'okr objective excel',
          `/export/okr/${firstObjectiveId}/excel`,
          token || '',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      })
    }

    if (firstPeriodId) {
      await check('GET /export/okr/period/:periodId/pdf', async () => {
        await checkExport('okr period pdf', `/export/okr/period/${firstPeriodId}/pdf`, token || '', 'application/pdf')
      })
      await check('GET /export/okr/period/:periodId/excel', async () => {
        await checkExport(
          'okr period excel',
          `/export/okr/period/${firstPeriodId}/excel`,
          token || '',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      })
    }
  }

  console.log(`\nResumen`)
  console.log(`  Pasaron: ${passed}`)
  console.log(`  Fallaron: ${failed}`)
  if (errors.length > 0) {
    console.log('\nDetalle:')
    errors.forEach((entry) => console.log(`  - ${entry}`))
  }

  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('\nSmoke release failed:', error)
  process.exit(1)
})
