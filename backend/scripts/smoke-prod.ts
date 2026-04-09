/**
 * Smoke test de producción — solo HTTP, sin DB ni servidor local.
 * Verifica que todas las funcionalidades críticas respondan en una instancia viva.
 *
 * Uso:
 *   tsx scripts/smoke-prod.ts https://kpimanager.com.ar admin@empresa.demo Johana1409
 *   BASE_URL=https://prueba.kpimanager.com.ar tsx scripts/smoke-prod.ts
 *
 * Variables de entorno (alternativa a argumentos):
 *   BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD
 */

const BASE_URL  = process.argv[2] || process.env.BASE_URL  || 'http://localhost:5000'
const EMAIL     = process.argv[3] || process.env.SMOKE_EMAIL    || 'admin@empresa.demo'
const PASSWORD  = process.argv[4] || process.env.SMOKE_PASSWORD || 'Johana1409'

// ── util ──────────────────────────────────────────────────────────────────────

type Json = Record<string, any>

let passed = 0
let failed = 0
const errors: string[] = []

const ok  = (label: string) => { passed++; console.log(`  ✅ ${label}`) }
const fail = (label: string, reason: string) => {
  failed++
  errors.push(`${label}: ${reason}`)
  console.log(`  ❌ ${label} — ${reason}`)
}

const api = async <T = any>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; data: T }> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers })
  let data: any
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

// ── checks ────────────────────────────────────────────────────────────────────

const checkHealth = async () => {
  try {
    const { status, data } = await api('/health')
    if (status === 200 && (data?.status === 'ok' || data?.db === 'ok' || data?.ok === true || status === 200)) {
      ok('GET /health')
    } else {
      fail('GET /health', `status=${status} body=${JSON.stringify(data)}`)
    }
  } catch (e: any) {
    fail('GET /health', e.message)
  }
}

const checkLogin = async (): Promise<string | null> => {
  try {
    const { status, data } = await api<{ token: string; user: Json }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    if (status === 200 && data?.token) {
      ok(`POST /auth/login (${data.user?.name ?? EMAIL})`)
      return data.token
    }
    fail('POST /auth/login', `status=${status} body=${JSON.stringify(data)}`)
    return null
  } catch (e: any) {
    fail('POST /auth/login', e.message)
    return null
  }
}

const checkAuthMe = async (token: string) => {
  try {
    const { status, data } = await api<Json>('/auth/me', {}, token)
    if (status === 200 && data?.email) {
      ok(`GET /auth/me (email=${data.email})`)
    } else {
      fail('GET /auth/me', `status=${status}`)
    }
  } catch (e: any) {
    fail('GET /auth/me', e.message)
  }
}

const checkProtectedWithoutToken = async () => {
  try {
    const { status } = await api('/auth/me')
    if (status === 401) {
      ok('GET /auth/me sin token → 401')
    } else {
      fail('GET /auth/me sin token', `esperaba 401, obtuvo ${status}`)
    }
  } catch (e: any) {
    fail('GET /auth/me sin token', e.message)
  }
}

const checkPeriods = async (token: string) => {
  try {
    const { status, data } = await api<any[]>('/periods', {}, token)
    if (status === 200 && Array.isArray(data)) {
      ok(`GET /periods (${data.length} registros)`)
      return data[0]?.id as number | undefined
    }
    fail('GET /periods', `status=${status}`)
    return undefined
  } catch (e: any) {
    fail('GET /periods', e.message)
    return undefined
  }
}

const checkOkrList = async (token: string) => {
  try {
    const { status, data } = await api<any[]>('/okr', {}, token)
    if (status === 200 && Array.isArray(data)) {
      ok(`GET /okr (${data.length} objetivos)`)
      return data[0]?.id as number | undefined
    }
    fail('GET /okr', `status=${status} body=${JSON.stringify(data)?.slice(0, 100)}`)
    return undefined
  } catch (e: any) {
    fail('GET /okr', e.message)
    return undefined
  }
}

const checkOkrDetail = async (token: string, id: number) => {
  try {
    const { status, data } = await api<Json>(`/okr/${id}`, {}, token)
    if (status === 200 && data?.id === id) {
      ok(`GET /okr/${id} (title="${data.title ?? '—'}", KRs=${data.keyResults?.length ?? 0})`)
    } else {
      fail(`GET /okr/${id}`, `status=${status}`)
    }
  } catch (e: any) {
    fail(`GET /okr/${id}`, e.message)
  }
}

const checkOkrExportPdf = async (token: string, id: number) => {
  try {
    const res = await fetch(`${BASE_URL}/api/export/okr/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 200 && res.headers.get('content-type')?.includes('pdf')) {
      ok(`GET /export/okr/${id}/pdf → PDF`)
    } else {
      fail(`GET /export/okr/${id}/pdf`, `status=${res.status} content-type=${res.headers.get('content-type')}`)
    }
  } catch (e: any) {
    fail(`GET /export/okr/${id}/pdf`, e.message)
  }
}

const checkOkrExportExcel = async (token: string, id: number) => {
  try {
    const res = await fetch(`${BASE_URL}/api/export/okr/${id}/excel`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 200 && res.headers.get('content-type')?.includes('spreadsheet')) {
      ok(`GET /export/okr/${id}/excel → Excel`)
    } else {
      fail(`GET /export/okr/${id}/excel`, `status=${res.status} content-type=${res.headers.get('content-type')}`)
    }
  } catch (e: any) {
    fail(`GET /export/okr/${id}/excel`, e.message)
  }
}

const checkOkrPeriodExports = async (token: string, periodId: number) => {
  for (const fmt of ['pdf', 'excel'] as const) {
    try {
      const res = await fetch(`${BASE_URL}/api/export/okr/period/${periodId}/${fmt}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 200) {
        ok(`GET /export/okr/period/${periodId}/${fmt}`)
      } else {
        fail(`GET /export/okr/period/${periodId}/${fmt}`, `status=${res.status}`)
      }
    } catch (e: any) {
      fail(`GET /export/okr/period/${periodId}/${fmt}`, e.message)
    }
  }
}

const checkCollaboratorKpis = async (token: string, periodId?: number) => {
  const qs = periodId ? `?periodId=${periodId}` : ''
  try {
    const { status, data } = await api<any[]>(`/collaborator-kpis${qs}`, {}, token)
    if (status === 200 && Array.isArray(data)) {
      ok(`GET /collaborator-kpis (${data.length} registros)`)
    } else {
      fail('GET /collaborator-kpis', `status=${status}`)
    }
  } catch (e: any) {
    fail('GET /collaborator-kpis', e.message)
  }
}

const checkScopeKpis = async (token: string) => {
  try {
    const { status, data } = await api<any[]>('/scope-kpis', {}, token)
    if (status === 200 && Array.isArray(data)) {
      ok(`GET /scope-kpis (${data.length} registros)`)
    } else {
      fail('GET /scope-kpis', `status=${status}`)
    }
  } catch (e: any) {
    fail('GET /scope-kpis', e.message)
  }
}

const checkDashboard = async (token: string) => {
  try {
    const { status, data } = await api<Json>('/dashboard/executive-tree', {}, token)
    if (status === 200) {
      ok('GET /dashboard/executive-tree')
    } else {
      fail('GET /dashboard/executive-tree', `status=${status} body=${JSON.stringify(data)?.slice(0, 80)}`)
    }
  } catch (e: any) {
    fail('GET /dashboard/executive-tree', e.message)
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log(`\n🔍 Smoke test → ${BASE_URL}`)
  console.log(`   Usuario: ${EMAIL}\n`)

  await checkHealth()
  await checkProtectedWithoutToken()

  const token = await checkLogin()
  if (!token) {
    console.log('\n❌ Login falló — no se puede continuar con checks autenticados.')
    process.exit(1)
  }

  await checkAuthMe(token)
  const firstPeriodId = await checkPeriods(token)
  const firstOkrId    = await checkOkrList(token)

  if (firstOkrId) {
    await checkOkrDetail(token, firstOkrId)
    await checkOkrExportPdf(token, firstOkrId)
    await checkOkrExportExcel(token, firstOkrId)
  } else {
    console.log('  ⚠️  No hay objetivos OKR — saltando checks de detalle y exports por objetivo')
  }

  if (firstPeriodId) {
    await checkOkrPeriodExports(token, firstPeriodId)
  } else {
    console.log('  ⚠️  No hay períodos — saltando exports por período')
  }

  await checkCollaboratorKpis(token, firstPeriodId)
  await checkScopeKpis(token)
  await checkDashboard(token)

  console.log(`\n────────────────────────────────`)
  console.log(`  ✅ Pasaron: ${passed}`)
  console.log(`  ❌ Fallaron: ${failed}`)
  if (errors.length > 0) {
    console.log('\n  Detalle de fallas:')
    errors.forEach((e) => console.log(`    • ${e}`))
  }
  console.log(`────────────────────────────────\n`)

  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('❌ Error inesperado:', e)
  process.exit(1)
})
