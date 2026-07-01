/**
 * seed-demo-local.ts
 * Genera un caso de uso completo de punta a punta:
 *   - 3 empresas × ~200 empleados c/u
 *   - 5 áreas × 2 equipos por empresa
 *   - KPIs individuales (collaborator_kpis)
 *   - KPIs grupales por área (scope_kpis) con links a los individuales
 *   - 3 OKRs por empresa con 3 KRs c/u (algunos kpi_linked a scope_kpis)
 *   - Check-ins históricos en KRs
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register backend/scripts/seed-demo-local.ts
 * Limpiar:
 *   npx ts-node -r tsconfig-paths/register backend/scripts/seed-demo-local.ts --clean
 */

import { pool } from '../src/config/database'
import bcrypt from 'bcryptjs'

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: este script no puede ejecutarse en producción.')
  process.exit(1)
}

const TAG             = 'DEMO-LOCAL'
const PASSWORD        = 'Admin2026!'
const TEAMS_PER_AREA  = 2
const COLLABS_PER_TEAM = 19   // + 1 líder → 20/equipo → 200/empresa
const KPIS_PER_COLLAB = 4
const SCOPE_KPIS_PER_AREA = 4 // KPIs grupales por área

// ─── RNG determinista ─────────────────────────────────────────────────────────
let _seed = 99887
function rng() { _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff; return _seed / 0x7fffffff }
function rand(max: number) { return Math.floor(rng() * max) }
function between(min: number, max: number) { return min + rng() * (max - min) }
function pick<T>(arr: T[]): T { return arr[rand(arr.length)] }
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1);[a[i], a[j]] = [a[j], a[i]] }
  return a
}

// ─── Nombres ─────────────────────────────────────────────────────────────────
const FIRST = ['Ana','Carlos','María','Luis','Sofía','Miguel','Laura','Diego','Valentina','Andrés',
  'Camila','Roberto','Paula','Fernando','Isabella','Alejandro','Gabriela','Nicolás','Luciana','Mateo',
  'Florencia','Juan','Martina','Pablo','Catalina','Eduardo','Renata','Sergio','Natalia','Ricardo',
  'Daniela','Javier','Valeria','Gustavo','Mariana','Héctor','Claudia','Óscar','Verónica','Alberto',
  'Pilar','Manuel','Elena','Ramón','Beatriz','Ignacio','Celeste','Tomás','Jimena','Santiago']
const LAST = ['García','Rodríguez','Martínez','López','González','Pérez','Sánchez','Ramírez',
  'Torres','Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Herrera','Jiménez','Ruiz',
  'Vargas','Castillo','Romero','Moreno','Navarro','Guerrero','Ortiz','Delgado','Silva','Fuentes']

// ─── Estructura organizacional ────────────────────────────────────────────────
const COMPANIES = [
  {
    name: 'TechNova SA', abbr: 'TECH', domain: 'technova.demo',
    areas: [
      { name: 'Desarrollo de Software', teams: ['Frontend', 'Backend'] },
      { name: 'QA & Calidad',           teams: ['Automatización', 'Testing Manual'] },
      { name: 'Infraestructura Cloud',  teams: ['DevOps', 'Seguridad'] },
      { name: 'Producto & UX',          teams: ['Diseño', 'Product Management'] },
      { name: 'Operaciones TI',         teams: ['Soporte N1', 'Soporte N2'] },
    ],
    okrs: [
      {
        title: 'Acelerar el time-to-market de productos',
        description: 'Reducir el ciclo de entrega de funcionalidades para ser más competitivos',
        krs: [
          { title: 'Reducir lead time de desarrollo de 4 a 2 semanas', unit: 'semanas', target: 2,  startValue: 4,  progress: 3.1, simple: true },
          { title: 'Alcanzar cobertura de tests automatizados ≥ 80%',  unit: '%',       target: 80, startValue: 35, progress: 61, simple: true },
          { title: 'Cumplimiento de SLA de entrega',                   kpiLinked: 0 },  // índice 0 del área Desarrollo
        ],
      },
      {
        title: 'Elevar la confiabilidad del sistema',
        description: 'Garantizar disponibilidad y performance para todos los clientes',
        krs: [
          { title: 'Alcanzar uptime ≥ 99.9% en producción', unit: '%',    target: 99.9, startValue: 98, progress: 99.4, simple: true },
          { title: 'Reducir incidentes críticos a < 5/mes',  unit: 'inc', target: 5,    startValue: 18, progress: 7,    simple: true },
          { title: 'Tiempo medio de respuesta de APIs',       kpiLinked: 4 }, // Infraestructura
        ],
      },
      {
        title: 'Fortalecer la cultura de calidad',
        description: 'Instalar prácticas de calidad en todos los equipos',
        krs: [
          { title: 'Capacitar al 100% del equipo en TDD',     unit: '%', target: 100, startValue: 0,  progress: 65, simple: true },
          { title: 'Reducir bugs en producción 40%',           unit: '%', target: 40,  startValue: 0,  progress: 28, simple: true },
          { title: 'Satisfacción interna de equipos ≥ 4.0',   unit: 'pts', target: 4, startValue: 3,  progress: 3.6, simple: true },
        ],
      },
    ],
  },
  {
    name: 'RetailPro Ltda', abbr: 'RET', domain: 'retailpro.demo',
    areas: [
      { name: 'Ventas',               teams: ['B2C', 'B2B'] },
      { name: 'Marketing Digital',    teams: ['Performance', 'Contenidos'] },
      { name: 'Atención al Cliente',  teams: ['Soporte Online', 'Postventa'] },
      { name: 'Logística',            teams: ['Recepción', 'Distribución'] },
      { name: 'Compras',              teams: ['Proveedores Locales', 'Importación'] },
    ],
    okrs: [
      {
        title: 'Crecer el revenue 30% en 2026',
        description: 'Aumentar ventas en todos los canales con foco en clientes recurrentes',
        krs: [
          { title: 'Alcanzar $2M en facturación mensual', unit: '$K',      target: 2000, startValue: 1400, progress: 1720, simple: true },
          { title: 'Aumentar tasa de conversión e-commerce a 4%', unit: '%', target: 4, startValue: 2.1, progress: 3.1, simple: true },
          { title: 'KPI Leads generados por Marketing',   kpiLinked: 1 }, // área Marketing
        ],
      },
      {
        title: 'Ser referente en experiencia de cliente',
        description: 'Lograr NPS líder del sector en retail',
        krs: [
          { title: 'Alcanzar NPS ≥ 70', unit: 'pts', target: 70, startValue: 42, progress: 58, simple: true },
          { title: 'Reducir tiempo de resolución a < 24h', unit: 'hs', target: 24, startValue: 72, progress: 31, simple: true },
          { title: 'Satisfacción post-compra del cliente',  kpiLinked: 2 }, // Atención
        ],
      },
      {
        title: 'Optimizar la cadena de abastecimiento',
        description: 'Reducir costos y mejorar disponibilidad de stock',
        krs: [
          { title: 'Reducir rotura de stock a < 2%',        unit: '%',   target: 2,  startValue: 8,   progress: 3.5, simple: true },
          { title: 'Reducir costo logístico por envío 15%', unit: '%',   target: 15, startValue: 0,   progress: 9,   simple: true },
          { title: 'Pedidos procesados por Logística',       kpiLinked: 3 }, // Logística
        ],
      },
    ],
  },
  {
    name: 'FinGroup SRL', abbr: 'FIN', domain: 'fingroup.demo',
    areas: [
      { name: 'Créditos',          teams: ['Evaluación', 'Cobranzas'] },
      { name: 'Tesorería',         teams: ['Cash Management', 'Inversiones'] },
      { name: 'Cumplimiento',      teams: ['Auditoría', 'Riesgos'] },
      { name: 'Operaciones',       teams: ['Back Office', 'Mesa de Ayuda'] },
      { name: 'Tecnología & Data', teams: ['Sistemas Core', 'Analytics'] },
    ],
    okrs: [
      {
        title: 'Reducir el riesgo de cartera en 25%',
        description: 'Mejorar la calidad crediticia y la tasa de recupero',
        krs: [
          { title: 'Reducir mora +90 días al 3%',     unit: '%',  target: 3,   startValue: 6.5, progress: 4.2, simple: true },
          { title: 'Alcanzar tasa de recupero ≥ 85%', unit: '%',  target: 85,  startValue: 71,  progress: 80,  simple: true },
          { title: 'Índice de cumplimiento regulatorio', kpiLinked: 2 }, // Cumplimiento
        ],
      },
      {
        title: 'Digitalizar el 80% de los procesos operativos',
        description: 'Eliminar pasos manuales y reducir errores operativos',
        krs: [
          { title: 'Migrar 10 procesos críticos a digital', unit: 'proc', target: 10,  startValue: 0, progress: 7,   simple: true },
          { title: 'Reducir errores operativos 50%',         unit: '%',   target: 50,  startValue: 0, progress: 33,  simple: true },
          { title: 'Tickets operativos resueltos en SLA',    kpiLinked: 3 }, // Operaciones
        ],
      },
      {
        title: 'Fortalecer el capital humano y la cultura',
        description: 'Retener y desarrollar talento crítico',
        krs: [
          { title: 'Reducir rotación voluntaria a < 8%',     unit: '%', target: 8,  startValue: 14, progress: 10, simple: true },
          { title: 'Alcanzar engagement ≥ 75% en survey',   unit: '%', target: 75, startValue: 58, progress: 68, simple: true },
          { title: 'Horas de capacitación por empleado',     unit: 'hs', target: 40, startValue: 0, progress: 27, simple: true },
        ],
      },
    ],
  },
]

// ─── Catálogo de KPIs ─────────────────────────────────────────────────────────
const KPI_CATALOG = [
  // Tech
  { name: 'Cumplimiento de SLA',            type: 'ratio',  direction: 'growth',    targetBase: 95,  spread: 8  },
  { name: 'Cobertura de Tests (%)',          type: 'ratio',  direction: 'growth',    targetBase: 75,  spread: 20 },
  { name: 'Tiempo de Respuesta API (ms)',    type: 'value',  direction: 'reduction', targetBase: 300, spread: 150 },
  { name: 'Bugs Críticos en Producción',    type: 'count',  direction: 'reduction', targetBase: 5,   spread: 4  },
  { name: 'Uptime del Sistema (%)',          type: 'ratio',  direction: 'growth',    targetBase: 99,  spread: 1  },
  { name: 'Deploys por Semana',              type: 'count',  direction: 'growth',    targetBase: 8,   spread: 4  },
  // Comercial / Retail
  { name: 'Facturación Mensual ($K)',        type: 'value',  direction: 'growth',    targetBase: 500, spread: 200 },
  { name: 'Leads Generados',                type: 'count',  direction: 'growth',    targetBase: 150, spread: 80 },
  { name: 'NPS del Cliente',                type: 'manual', direction: 'growth',    targetBase: 60,  spread: 15 },
  { name: 'Tasa de Conversión (%)',          type: 'ratio',  direction: 'growth',    targetBase: 3.5, spread: 2  },
  { name: 'Churn Rate (%)',                  type: 'ratio',  direction: 'reduction', targetBase: 5,   spread: 3  },
  { name: 'Tickets Resueltos',              type: 'count',  direction: 'growth',    targetBase: 200, spread: 100 },
  // Finanzas / Operaciones
  { name: 'Pedidos Procesados',             type: 'count',  direction: 'growth',    targetBase: 1200, spread: 400 },
  { name: 'Costo por Unidad ($)',            type: 'value',  direction: 'reduction', targetBase: 25,  spread: 10 },
  { name: 'Tasa de Error Operativo (%)',     type: 'ratio',  direction: 'reduction', targetBase: 2,   spread: 1.5 },
  { name: 'Índice de Rotación Personal (%)', type: 'ratio',  direction: 'reduction', targetBase: 8,   spread: 5  },
  { name: 'Horas de Capacitación',          type: 'count',  direction: 'growth',    targetBase: 20,  spread: 10 },
  { name: 'Cumplimiento Regulatorio (%)',    type: 'ratio',  direction: 'growth',    targetBase: 98,  spread: 4  },
  { name: 'Mora +90 días (%)',               type: 'ratio',  direction: 'reduction', targetBase: 4,   spread: 3  },
  { name: 'Satisfacción Interna (pts)',       type: 'manual', direction: 'growth',    targetBase: 4,   spread: 1  },
]

// ─── Helpers KPI ─────────────────────────────────────────────────────────────
function calcVariation(direction: string, target: number, actual: number): number {
  if (target === 0) return 0
  let v: number
  if (direction === 'growth')         v = (actual / target) * 100
  else if (direction === 'reduction') v = actual === 0 ? 200 : (target / actual) * 100
  else { const d = Math.abs(actual - target); v = Math.max(0, 100 - (d / target) * 100) }
  return parseFloat(v.toFixed(2))
}
function calcWeighted(variation: number, weight: number): number {
  return parseFloat(((variation * weight) / 100).toFixed(2))
}
function randomActual(kpi: typeof KPI_CATALOG[0], target: number): number {
  const roll = rng()
  let factor: number
  if (roll < 0.10)      factor = between(0.40, 0.70)
  else if (roll < 0.30) factor = between(0.70, 0.90)
  else if (roll < 0.70) factor = between(0.90, 1.08)
  else                   factor = between(1.08, 1.25)
  return parseFloat((target * factor).toFixed(2))
}

// ─── Batch insert ─────────────────────────────────────────────────────────────
async function batchInsert(conn: any, table: string, cols: string[], rows: any[][], chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const sl = rows.slice(i, i + chunk)
    const ph = sl.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
    await conn.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph}`, sl.flat())
  }
}

// ─── Clean ────────────────────────────────────────────────────────────────────
async function clean(conn: any) {
  console.log(`Limpiando datos [${TAG}]...`)
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')
  await conn.query(`DELETE FROM okr_check_ins WHERE keyResultId IN (SELECT id FROM okr_key_results WHERE objectiveId IN (SELECT id FROM okr_objectives WHERE title LIKE ?))`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM okr_key_results WHERE objectiveId IN (SELECT id FROM okr_objectives WHERE title LIKE ?)`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM okr_objectives WHERE title LIKE ?`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM kpis WHERE name LIKE ?`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM collaborators WHERE email LIKE ?`, [`%@${TAG.toLowerCase()}.seed`])
  const [scopes] = await conn.query(`SELECT id FROM org_scopes WHERE name LIKE ?`, [`%[${TAG}]%`])
  const ids = (scopes as any[]).map((r: any) => r.id)
  if (ids.length) await conn.query(`DELETE FROM org_scopes WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  const [periods] = await conn.query(`SELECT id FROM periods WHERE name LIKE ?`, [`%[${TAG}]%`])
  if ((periods as any[]).length) await conn.query(`DELETE FROM periods WHERE id = ?`, [(periods as any[])[0].id])
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')
  console.log('Limpieza completada.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  const conn: any = await pool.getConnection()
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')

    console.log('Generando hash de contraseña...')
    const passwordHash = await bcrypt.hash(PASSWORD, 10)

    // ── 1. Período anual 2026 + subperíodos mensuales ─────────────────────────
    console.log('Creando período y subperíodos...')
    const [periodRes] = await conn.query(
      `INSERT INTO periods (name, startDate, endDate, status) VALUES (?,?,?,?)`,
      [`[${TAG}] Año 2026`, '2026-01-01', '2026-12-31', 'open']
    )
    const periodId: number = periodRes.insertId

    const [calProfile] = await conn.query(`SELECT id FROM calendar_profiles WHERE name = 'Default' LIMIT 1`)
    const calProfileId: number = ((calProfile as any[])[0]?.id) || 1

    const MONTHS = [
      { name: 'Enero 2026',     start: '2026-01-01', end: '2026-01-31' },
      { name: 'Febrero 2026',   start: '2026-02-01', end: '2026-02-28' },
      { name: 'Marzo 2026',     start: '2026-03-01', end: '2026-03-31' },
      { name: 'Abril 2026',     start: '2026-04-01', end: '2026-04-30' },
      { name: 'Mayo 2026',      start: '2026-05-01', end: '2026-05-31' },
      { name: 'Junio 2026',     start: '2026-06-01', end: '2026-06-30' },
      { name: 'Julio 2026',     start: '2026-07-01', end: '2026-07-31' },
    ]
    const subPeriodIds: number[] = []
    for (const m of MONTHS) {
      const [sp] = await conn.query(
        `INSERT INTO calendar_subperiods (periodId, calendarProfileId, name, startDate, endDate, status, weight) VALUES (?,?,?,?,?,?,?)`,
        [periodId, calProfileId, m.name, m.start, m.end, 'open', parseFloat((100 / MONTHS.length).toFixed(2))]
      )
      subPeriodIds.push(sp.insertId)
    }

    // ── 2. KPIs maestros ─────────────────────────────────────────────────────
    console.log('Creando catálogo de KPIs...')
    const kpiIds: number[] = []
    for (const k of KPI_CATALOG) {
      const [r] = await conn.query(
        `INSERT INTO kpis (name, type, direction, defaultDataSource) VALUES (?,?,?,?)`,
        [`[${TAG}] ${k.name}`, k.type, k.direction, 'manual']
      )
      kpiIds.push(r.insertId)
    }
    const kpiMeta = KPI_CATALOG.map((k, i) => ({ ...k, id: kpiIds[i] }))

    // ── 3. Estructura org: empresas → áreas → equipos ────────────────────────
    console.log('Creando estructura organizacional...')

    type TeamInfo = {
      teamId: number; areaId: number; companyId: number
      teamName: string; areaName: string; companyName: string; companyIdx: number; areaIdx: number
    }
    type AreaInfo  = { areaId: number; companyId: number; areaName: string; companyIdx: number; areaIdx: number }
    type CompanyInfo = { companyId: number; companyIdx: number; directorId?: number }

    const teams: TeamInfo[]    = []
    const areas: AreaInfo[]    = []
    const companyInfos: CompanyInfo[] = []

    // Corporación holding raíz
    const [corpRes] = await conn.query(
      `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
      [`[${TAG}] Corporación Demo SA`, 'company', null]
    )
    const corpId: number = corpRes.insertId

    for (let ci = 0; ci < COMPANIES.length; ci++) {
      const company = COMPANIES[ci]
      const [cRes] = await conn.query(
        `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
        [`[${TAG}] ${company.name}`, 'company', corpId]
      )
      const companyId: number = cRes.insertId
      companyInfos.push({ companyId, companyIdx: ci })

      for (let ai = 0; ai < company.areas.length; ai++) {
        const area = company.areas[ai]
        const [aRes] = await conn.query(
          `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
          [`[${TAG}] ${area.name}`, 'area', companyId]
        )
        const areaId: number = aRes.insertId
        areas.push({ areaId, companyId, areaName: area.name, companyIdx: ci, areaIdx: ai })

        for (const teamName of area.teams) {
          const [tRes] = await conn.query(
            `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
            [`[${TAG}] ${teamName}`, 'team', areaId]
          )
          teams.push({ teamId: tRes.insertId, areaId, companyId, teamName, areaName: area.name, companyName: company.name, companyIdx: ci, areaIdx: ai })
        }
      }
    }

    // ── 4. Colaboradores ─────────────────────────────────────────────────────
    console.log('Creando colaboradores (~200/empresa)...')
    const POSITIONS = ['Analista Sr','Coordinador','Especialista','Técnico','Consultor','Asistente','Operador','Analista Jr']

    // Admin y director por empresa
    const directorIds: Map<number, number> = new Map()
    for (const ci of companyInfos) {
      const co = COMPANIES[ci.companyIdx]
      const [dRes] = await conn.query(
        `INSERT INTO collaborators (name, email, role, position, area, orgScopeId, passwordHash, status, authSource, hasSuperpowers)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [`Director ${co.abbr}`, `director@${TAG.toLowerCase()}-${co.abbr.toLowerCase()}.seed`,
         'director', 'Director General', co.name, ci.companyId, passwordHash, 'active', 'local', 0]
      )
      directorIds.set(ci.companyId, dRes.insertId)
    }

    // Batch: líderes y colaboradores por equipo
    const collabRows: any[][] = []
    let emailSeq = 0
    for (const t of teams) {
      // Líder del equipo
      const leaderEmail = `u${++emailSeq}@${TAG.toLowerCase()}-${COMPANIES[t.companyIdx].abbr.toLowerCase()}.seed`
      collabRows.push([
        `Líder ${t.teamName}`, leaderEmail, 'leader',
        `Líder de ${t.teamName}`, t.teamName, t.teamId,
        passwordHash, 'active', 'local'
      ])
      // Colaboradores del equipo
      for (let i = 0; i < COLLABS_PER_TEAM; i++) {
        const email = `u${++emailSeq}@${TAG.toLowerCase()}-${COMPANIES[t.companyIdx].abbr.toLowerCase()}.seed`
        collabRows.push([
          `${pick(FIRST)} ${pick(LAST)}`, email, 'collaborator',
          pick(POSITIONS), t.teamName, t.teamId,
          passwordHash, 'active', 'local'
        ])
      }
    }
    await batchInsert(conn,
      'collaborators',
      ['name','email','role','position','area','orgScopeId','passwordHash','status','authSource'],
      collabRows
    )

    // Recuperar IDs de colaboradores
    console.log('Recuperando IDs de colaboradores...')
    const domainPatterns = COMPANIES.map(c => `u%@${TAG.toLowerCase()}-${c.abbr.toLowerCase()}.seed`)
    const allCollabs: any[] = []
    for (const pat of domainPatterns) {
      const [rows] = await conn.query(
        `SELECT c.id, c.orgScopeId, c.role FROM collaborators c WHERE c.email LIKE ?`, [pat]
      )
      allCollabs.push(...(rows as any[]))
    }

    // Mapa teamId → collaboratorId[]
    const teamCollabMap = new Map<number, number[]>()
    for (const c of allCollabs) {
      const arr = teamCollabMap.get(c.orgScopeId) || []
      arr.push(c.id)
      teamCollabMap.set(c.orgScopeId, arr)
    }

    // ── 5. collaborator_kpis ─────────────────────────────────────────────────
    console.log('Asignando KPIs individuales a colaboradores...')
    const ckRows: any[][] = []
    // Mapa areaId → collabId → kpiAssignmentRows (para vincular a scope_kpis)
    // key: `${areaId}:${kpiId}` → collaboratorKpiIds[]
    const areaKpiAssignments = new Map<string, number[]>()

    for (const t of teams) {
      const collabs = teamCollabMap.get(t.teamId) || []
      const kpiPool = shuffle(kpiMeta).slice(0, KPIS_PER_COLLAB)
      const wEach = parseFloat((100 / KPIS_PER_COLLAB).toFixed(2))

      for (const collabId of collabs) {
        for (const kpi of kpiPool) {
          const target = parseFloat(between(kpi.targetBase * 0.8, kpi.targetBase * 1.2).toFixed(2))
          const actual = randomActual(kpi, target)
          const variation = calcVariation(kpi.direction, target, actual)
          const weighted = calcWeighted(variation, wEach)
          ckRows.push([collabId, kpi.id, periodId, null, target, actual, wEach, variation, weighted, 'approved', 'approved', 'manual'])
        }
      }
    }

    console.log(`  Insertando ${ckRows.length} filas en collaborator_kpis...`)
    await batchInsert(conn,
      'collaborator_kpis',
      ['collaboratorId','kpiId','periodId','subPeriodId','target','actual','weight','variation','weightedResult','status','curationStatus','inputMode'],
      ckRows
    )

    // ── 6. scope_kpis por área (KPIs grupales) ────────────────────────────────
    console.log('Creando scope_kpis por área y empresa...')
    const scopeKpiRows: any[][] = []

    // Mapa areaId → scopeKpiId[] para los OKRs
    const areaScopeKpiIds = new Map<number, number[]>()
    const companyScopeKpiIds = new Map<number, number[]>()

    for (const area of areas) {
      const areaKpis = shuffle(kpiMeta).slice(0, SCOPE_KPIS_PER_AREA)
      const wEach = parseFloat((100 / SCOPE_KPIS_PER_AREA).toFixed(2))
      const areaSkIds: number[] = []

      for (const kpi of areaKpis) {
        const target = parseFloat(between(kpi.targetBase * 0.85, kpi.targetBase * 1.15).toFixed(2))
        const actual = randomActual(kpi, target)
        const variation = calcVariation(kpi.direction, target, actual)
        const weighted = calcWeighted(variation, wEach)
        const [skRes] = await conn.query(
          `INSERT INTO scope_kpis (name, kpiId, orgScopeId, periodId, subPeriodId, ownerLevel, sourceMode, target, actual, weight, variation, weightedResult, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [`[${TAG}] ${kpi.name} - ${area.areaName}`, kpi.id, area.areaId, periodId, null,
           'area', 'aggregated', target, actual, wEach, variation, weighted, 'approved']
        )
        areaSkIds.push(skRes.insertId)
      }
      areaScopeKpiIds.set(area.areaId, areaSkIds)

      // scope_kpis a nivel empresa (2 por empresa)
      const compSkIds = companyScopeKpiIds.get(area.companyId) || []
      companyScopeKpiIds.set(area.companyId, compSkIds)
    }

    // Scope KPIs a nivel empresa (2 KPIs por empresa)
    for (const ci of companyInfos) {
      const compKpis = shuffle(kpiMeta).slice(0, 2)
      const compSkIds: number[] = []
      for (const kpi of compKpis) {
        const target = parseFloat(between(kpi.targetBase * 0.9, kpi.targetBase * 1.1).toFixed(2))
        const actual = randomActual(kpi, target)
        const variation = calcVariation(kpi.direction, target, actual)
        const [skRes] = await conn.query(
          `INSERT INTO scope_kpis (name, kpiId, orgScopeId, periodId, subPeriodId, ownerLevel, sourceMode, target, actual, weight, variation, weightedResult, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [`[${TAG}] ${kpi.name} - ${COMPANIES[ci.companyIdx].name}`, kpi.id, ci.companyId, periodId, null,
           'company', 'aggregated', target, actual, 50, variation, calcWeighted(variation, 50), 'approved']
        )
        compSkIds.push(skRes.insertId)
      }
      companyScopeKpiIds.set(ci.companyId, compSkIds)
    }

    // ── 7. scope_kpi_links: KPI individual → KPI grupal ─────────────────────
    console.log('Creando links KPI individual → KPI grupal...')
    const linkRows: any[][] = []

    // Para cada área, obtener sus scope_kpis y los collaborator_kpis del área
    for (const area of areas) {
      const skIds = areaScopeKpiIds.get(area.areaId) || []
      if (!skIds.length) continue

      // Obtener todos los collaborator_kpis de los equipos de esta área
      const areateams = teams.filter(t => t.areaId === area.areaId)
      for (const t of areateams) {
        const collabsInTeam = teamCollabMap.get(t.teamId) || []
        if (!collabsInTeam.length) continue

        // Obtener collaborator_kpis de esos colaboradores
        if (collabsInTeam.length > 0) {
          const placeholders = collabsInTeam.map(() => '?').join(',')
          const [ckResult] = await conn.query(
            `SELECT id FROM collaborator_kpis WHERE collaboratorId IN (${placeholders}) AND periodId = ?`,
            [...collabsInTeam, periodId]
          )
          const ckIds = (ckResult as any[]).map((r: any) => r.id)

          // Vincular cada scope_kpi con un subconjunto de collaborator_kpis
          for (const skId of skIds) {
            // Tomar hasta 15 assignments por scope_kpi para no sobrecargar
            const subset = shuffle(ckIds).slice(0, 15)
            const wContrib = parseFloat((100 / Math.max(subset.length, 1)).toFixed(2))
            for (const ckId of subset) {
              linkRows.push([skId, 'collaborator', ckId, null, wContrib, 'weighted_avg', null, 0])
            }
          }
        }
      }
    }

    if (linkRows.length) {
      console.log(`  Insertando ${linkRows.length} scope_kpi_links...`)
      await batchInsert(conn,
        'scope_kpi_links',
        ['scopeKpiId','childType','collaboratorAssignmentId','childScopeKpiId','contributionWeight','aggregationMethod','formulaConfig','sortOrder'],
        linkRows
      )
    }

    // ── 8. OKRs por empresa con KRs (algunos kpi_linked a scope_kpis) ────────
    console.log('Creando OKRs por empresa...')

    for (const ci of companyInfos) {
      const co = COMPANIES[ci.companyIdx]
      const directorId = directorIds.get(ci.companyId)!
      const companyAreas = areas.filter(a => a.companyId === ci.companyId)

      for (const okrDef of co.okrs) {
        const [objRes] = await conn.query(
          `INSERT INTO okr_objectives (title, description, orgScopeId, periodId, ownerId, status, progress)
           VALUES (?,?,?,?,?,?,?)`,
          [
            `[${TAG}] ${okrDef.title}`,
            okrDef.description,
            ci.companyId, periodId, directorId,
            'active',
            parseFloat(between(40, 80).toFixed(1))
          ]
        )
        const objId: number = objRes.insertId

        let sortOrder = 1
        for (const krDef of okrDef.krs) {
          if ((krDef as any).simple) {
            // KR simple con valores numéricos
            const kr = krDef as any
            const status = kr.progress >= kr.target ? 'completed'
              : kr.progress >= kr.target * 0.8 ? 'on_track'
              : kr.progress >= kr.target * 0.5 ? 'at_risk' : 'behind'
            const [krRes] = await conn.query(
              `INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [objId, kr.title, 'simple', kr.startValue ?? 0, kr.target, kr.progress, kr.unit, parseFloat((100/3).toFixed(2)), directorId, status, sortOrder++]
            )
            // Check-ins históricos
            const steps = 4 + rand(4)
            for (let ci2 = 1; ci2 <= steps; ci2++) {
              const val = parseFloat((kr.progress * (ci2 / steps) * (0.85 + rng() * 0.3)).toFixed(2))
              await conn.query(
                `INSERT INTO okr_check_ins (keyResultId, value, note, authorId) VALUES (?,?,?,?)`,
                [krRes.insertId, val, `Actualización mes ${ci2}`, directorId]
              )
            }
          } else {
            // KR kpi_linked: vinculado a un scope_kpi del área indicada
            const kr = krDef as any
            const areaIdx: number = kr.kpiLinked ?? 0
            const linkedArea = companyAreas[areaIdx % companyAreas.length]
            const linkedSkIds = areaScopeKpiIds.get(linkedArea?.areaId) || []
            const linkedSkId = linkedSkIds[0] ?? null

            const [skData] = linkedSkId
              ? await conn.query(`SELECT target, actual, variation FROM scope_kpis WHERE id = ?`, [linkedSkId])
              : [null]
            const skRow = (skData as any[])?.[0]
            const currentVal = skRow?.actual ?? 0
            const targetVal  = skRow?.target ?? 100
            const status = currentVal >= targetVal ? 'completed'
              : currentVal >= targetVal * 0.8 ? 'on_track'
              : currentVal >= targetVal * 0.5 ? 'at_risk' : 'behind'

            const [krRes] = await conn.query(
              `INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, scopeKpiId, weight, ownerId, status, sortOrder)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [objId, `[${TAG}] KPI: ${linkedArea?.areaName ?? 'Área'} — Indicador clave`, 'kpi_linked', 0, targetVal, currentVal, linkedSkId, parseFloat((100/3).toFixed(2)), directorId, status, sortOrder++]
            )
            // Check-in inicial
            await conn.query(
              `INSERT INTO okr_check_ins (keyResultId, value, note, authorId) VALUES (?,?,?,?)`,
              [krRes.insertId, currentVal * 0.7, 'Valor inicial registrado', directorId]
            )
          }
        }
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1')

    // ── Resumen ───────────────────────────────────────────────────────────────
    const totalCollabs = collabRows.length + COMPANIES.length /* directores */
    const totalScopeKpis = [...areaScopeKpiIds.values()].reduce((s, a) => s + a.length, 0)
                         + [...companyScopeKpiIds.values()].reduce((s, a) => s + a.length, 0)

    console.log('\n✅ Seed completado exitosamente')
    console.log('─────────────────────────────────────────')
    console.log(`  Período:            [${TAG}] Año 2026`)
    console.log(`  Subperíodos:        ${MONTHS.length} meses`)
    console.log(`  Corporación:        [${TAG}] Corporación Demo SA`)
    console.log(`  Empresas:           ${COMPANIES.length} (hijas de la corporación)`)
    console.log(`  Áreas totales:      ${areas.length}`)
    console.log(`  Equipos totales:    ${teams.length}`)
    console.log(`  Colaboradores:      ${totalCollabs}`)
    console.log(`  KPIs maestros:      ${KPI_CATALOG.length}`)
    console.log(`  collaborator_kpis:  ${ckRows.length}`)
    console.log(`  scope_kpis:         ${totalScopeKpis}`)
    console.log(`  scope_kpi_links:    ${linkRows.length}`)
    console.log(`  OKRs:               ${COMPANIES.reduce((s, c) => s + c.okrs.length, 0)} objetivos`)
    console.log('─────────────────────────────────────────')
    console.log(`  Contraseña para todos: ${PASSWORD}`)
    for (const co of COMPANIES) {
      console.log(`  ${co.name}: director@${TAG.toLowerCase()}-${co.abbr.toLowerCase()}.seed`)
    }
    console.log(`  Tu admin:              admin@empresa.demo / Admin2026!`)

  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {})
    console.error('Error en seed:', err)
    throw err
  } finally {
    conn.release()
    await pool.end()
  }
}

const args = process.argv.slice(2)
if (args.includes('--clean')) {
  pool.getConnection().then(async (conn: any) => {
    await clean(conn)
    conn.release()
    await pool.end()
  }).catch(console.error)
} else {
  seed().catch(console.error)
}
