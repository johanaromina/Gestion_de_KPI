/**
 * seed-holding-demo.ts
 * Crea un holding con 5 empresas, ~3100 colaboradores, KPIs, scope KPIs y OKRs.
 *
 * Uso:  npx ts-node -r tsconfig-paths/register backend/scripts/seed-holding-demo.ts
 * Para limpiar los datos generados:
 *       npx ts-node -r tsconfig-paths/register backend/scripts/seed-holding-demo.ts --clean
 */

import { pool } from '../src/config/database'
import bcrypt from 'bcryptjs'

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: este script no puede ejecutarse en producción.')
  process.exit(1)
}

// ─── Config ──────────────────────────────────────────────────────────────────
const TAG = 'DEMO-HOLDING'
const PASSWORD = 'Demo2026!'
const COLLAB_PER_TEAM = 60
const KPIS_PER_COLLAB = 5

// ─── RNG determinista (resultados consistentes entre runs) ───────────────────
let _seed = 12345
function rng(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff
  return _seed / 0x7fffffff
}
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
  'Pilar','Manuel','Elena','Ramón','Beatriz','Ignacio','Celeste','Tomás','Jimena','Santiago',
  'Andrea','Pedro','Silvia','Raúl','Cecilia','Arturo','Lorena','Ernesto','Patricia','Marco']
const LAST = ['García','Rodríguez','Martínez','López','González','Pérez','Sánchez','Ramírez',
  'Torres','Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Herrera','Jiménez','Ruiz',
  'Vargas','Castillo','Romero','Moreno','Navarro','Guerrero','Ortiz','Delgado','Silva','Vázquez',
  'Medina','Aguilar','Muñoz','Ramos','Mendoza','Suárez','Álvarez','Castro','Ríos','Peña','Fuentes']

// ─── Estructura org ───────────────────────────────────────────────────────────
const COMPANIES = [
  { name: 'TechSolutions SA', abbr: 'TECH', areas: [
    { name: 'Desarrollo',      teams: ['Frontend','Backend','Mobile'] },
    { name: 'QA & Testing',    teams: ['Automatización','Testing Manual'] },
    { name: 'Infraestructura', teams: ['Cloud Ops','Seguridad','Redes'] },
    { name: 'Producto',        teams: ['UX/UI','Product Management'] },
  ]},
  { name: 'CommercePro Ltda', abbr: 'COMM', areas: [
    { name: 'Ventas',                teams: ['Corporativas','SMB','Inside Sales'] },
    { name: 'Marketing',             teams: ['Digital','Contenidos','Eventos'] },
    { name: 'Atención al Cliente',   teams: ['Soporte Tier 1','Soporte Tier 2','Fidelización'] },
    { name: 'Operaciones Comerciales', teams: ['Logística','Coordinación'] },
  ]},
  { name: 'FinanceCore SA', abbr: 'FIN', areas: [
    { name: 'Contabilidad',      teams: ['Cuentas por Pagar','Cuentas por Cobrar','Impuestos'] },
    { name: 'Tesorería',         teams: ['Cash Management','Inversiones'] },
    { name: 'Control de Gestión', teams: ['Presupuesto','Reporting'] },
    { name: 'Auditoría Interna', teams: ['Auditoría Ops','Auditoría TI'] },
  ]},
  { name: 'LogiSupply SRL', abbr: 'LOGI', areas: [
    { name: 'Operaciones',        teams: ['Turno Mañana','Turno Tarde','Turno Noche'] },
    { name: 'Depósito y Almacén', teams: ['Recepción','Despacho','Inventario'] },
    { name: 'Distribución',       teams: ['Zona Norte','Zona Sur','Zona Centro'] },
    { name: 'Planificación',      teams: ['Demand Planning','Supply Planning'] },
  ]},
  { name: 'ServiceDesk Corp', abbr: 'SERV', areas: [
    { name: 'Soporte IT N1',    teams: ['Mesa AM','Mesa PM','Autoservicio'] },
    { name: 'Soporte IT N2',    teams: ['Servidores','Aplicaciones','Networking'] },
    { name: 'Recursos Humanos', teams: ['Selección','Capacitación','Bienestar'] },
    { name: 'Administración',   teams: ['Compras','Legales'] },
  ]},
]

// ─── KPIs maestros ────────────────────────────────────────────────────────────
const KPI_DEFS = [
  { name: 'Cumplimiento de SLA',          type: 'ratio',  direction: 'growth',    targetBase: 95,  spread: 10 },
  { name: 'Tickets Resueltos',            type: 'count',  direction: 'growth',    targetBase: 200, spread: 100 },
  { name: 'NPS del Cliente',              type: 'manual', direction: 'growth',    targetBase: 60,  spread: 20 },
  { name: 'Errores en Producción',        type: 'count',  direction: 'reduction', targetBase: 20,  spread: 10 },
  { name: 'Tiempo de Respuesta (hs)',     type: 'value',  direction: 'reduction', targetBase: 4,   spread: 2  },
  { name: 'Facturación Mensual ($K)',     type: 'value',  direction: 'growth',    targetBase: 500, spread: 200 },
  { name: 'Tasa de Conversión (%)',       type: 'ratio',  direction: 'growth',    targetBase: 12,  spread: 5  },
  { name: 'Uptime del Sistema (%)',       type: 'ratio',  direction: 'growth',    targetBase: 99,  spread: 1  },
  { name: 'Churn Rate (%)',               type: 'ratio',  direction: 'reduction', targetBase: 5,   spread: 3  },
  { name: 'Leads Generados',             type: 'count',  direction: 'growth',    targetBase: 150, spread: 80 },
  { name: 'Costo por Entrega ($)',        type: 'value',  direction: 'reduction', targetBase: 30,  spread: 15 },
  { name: 'Pedidos Procesados',          type: 'count',  direction: 'growth',    targetBase: 1000,spread: 400},
  { name: 'Tasa de Devoluciones (%)',    type: 'ratio',  direction: 'reduction', targetBase: 3,   spread: 2  },
  { name: 'Horas de Capacitación',       type: 'count',  direction: 'growth',    targetBase: 20,  spread: 10 },
  { name: 'Índice de Rotación (%)',      type: 'ratio',  direction: 'reduction', targetBase: 8,   spread: 4  },
]

// ─── Helpers cálculo ─────────────────────────────────────────────────────────
function calcVariation(direction: string, target: number, actual: number): number {
  if (target === 0) return 0
  let v: number
  if (direction === 'growth')    v = (actual / target) * 100
  else if (direction === 'reduction') v = actual === 0 ? 200 : (target / actual) * 100
  else { const d = Math.abs(actual - target); v = Math.max(0, 100 - (d / target) * 100) }
  return parseFloat(v.toFixed(2))
}
function calcWeighted(variation: number, weight: number): number {
  return parseFloat(((variation * weight) / 100).toFixed(2))
}
function randomActual(kpi: typeof KPI_DEFS[0], target: number): number {
  // distribución realista: ~40% bueno, 30% muy bueno, 20% regular, 10% malo
  const roll = rng()
  let factor: number
  if (roll < 0.10)      factor = between(0.40, 0.70) // malo
  else if (roll < 0.30) factor = between(0.70, 0.90) // regular
  else if (roll < 0.70) factor = between(0.90, 1.05) // bueno
  else                   factor = between(1.05, 1.30) // muy bueno
  return parseFloat((target * factor).toFixed(2))
}

// ─── Helpers DB ──────────────────────────────────────────────────────────────
async function batchInsert(conn: any, table: string, cols: string[], rows: any[][], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
    await conn.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders}`, chunk.flat())
  }
}

// ─── Clean ───────────────────────────────────────────────────────────────────
async function clean(conn: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log('Limpiando datos de seed...')
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')

  // Borrar por TAG en nombre
  const [scopes] = await conn.query(`SELECT id FROM org_scopes WHERE name LIKE ?`, [`%[${TAG}]%`])
  const scopeIds = (scopes as any[]).map((r: any) => r.id)

  if (scopeIds.length) {
    // cascade: scope_kpis, collaborators, okr_objectives se borran por FK
    await conn.query(`DELETE FROM org_scopes WHERE id IN (${scopeIds.map(() => '?').join(',')})`, scopeIds)
  }

  const [period] = await conn.query(`SELECT id FROM periods WHERE name LIKE ?`, [`%[${TAG}]%`])
  if ((period as any[]).length) {
    const pid = (period as any[])[0].id
    await conn.query('DELETE FROM periods WHERE id = ?', [pid])
  }

  await conn.query(`DELETE FROM kpis WHERE name LIKE ?`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM objective_trees WHERE name LIKE ?`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM okr_objectives WHERE title LIKE ?`, [`%[${TAG}]%`])
  await conn.query(`DELETE FROM collaborators WHERE email LIKE ?`, [`%@demo-holding.com`])

  await conn.query('SET FOREIGN_KEY_CHECKS = 1')
  console.log('Limpieza completada.')
}

// ─── Main seed ────────────────────────────────────────────────────────────────
async function seed() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn: any = await pool.getConnection()
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    console.log('Generando hash de contraseña...')
    const passwordHash = await bcrypt.hash(PASSWORD, 10)

    // ── 1. Período y subperíodos ──────────────────────────────────────────────
    console.log('Creando período...')
    const [periodRes] = await conn.query(
      `INSERT INTO periods (name, startDate, endDate, status) VALUES (?,?,?,?)`,
      [`[${TAG}] Demo Anual 2026`, '2026-01-01', '2026-12-31', 'open']
    )
    const periodId: number = periodRes.insertId

    const [calProfile] = await conn.query(`SELECT id FROM calendar_profiles WHERE name = 'Default' LIMIT 1`)
    const calProfileId: number = (calProfile as any[])[0]?.id || 1

    const MONTHS = [
      { name: 'Enero 2026',    start: '2026-01-01', end: '2026-01-31' },
      { name: 'Febrero 2026',  start: '2026-02-01', end: '2026-02-28' },
      { name: 'Marzo 2026',    start: '2026-03-01', end: '2026-03-31' },
      { name: 'Abril 2026',    start: '2026-04-01', end: '2026-04-30' },
      { name: 'Mayo 2026',     start: '2026-05-01', end: '2026-05-31' },
      { name: 'Junio 2026',    start: '2026-06-01', end: '2026-06-30' },
      { name: 'Julio 2026',    start: '2026-07-01', end: '2026-07-31' },
      { name: 'Agosto 2026',   start: '2026-08-01', end: '2026-08-31' },
    ]
    const subPeriodIds: number[] = []
    for (const m of MONTHS) {
      const [res] = await conn.query(
        `INSERT INTO calendar_subperiods (periodId, calendarProfileId, name, startDate, endDate, status, weight) VALUES (?,?,?,?,?,?,?)`,
        [periodId, calProfileId, m.name, m.start, m.end, 'open', 12.5]
      )
      subPeriodIds.push(res.insertId)
    }

    // ── 2. KPIs maestros ─────────────────────────────────────────────────────
    console.log('Creando KPIs...')
    const kpiIds: number[] = []
    for (const k of KPI_DEFS) {
      const [res] = await conn.query(
        `INSERT INTO kpis (name, type, direction, defaultDataSource) VALUES (?,?,?,?)`,
        [`[${TAG}] ${k.name}`, k.type, k.direction, 'manual']
      )
      kpiIds.push(res.insertId)
    }
    const kpiMeta = KPI_DEFS.map((k, i) => ({ ...k, id: kpiIds[i] }))

    // ── 3. Estructura org ─────────────────────────────────────────────────────
    console.log('Creando org_scopes...')
    const [holdingRes] = await conn.query(
      `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
      [`[${TAG}] Grupo Corporativo Demo`, 'company', null]
    )
    const holdingId: number = holdingRes.insertId

    // Mapa: { teamScopeId → { areaName, teamName, companyAbbr, areaScopeId, companyScopeId } }
    type ScopeInfo = { teamId: number; areaId: number; companyId: number; areaName: string; teamName: string; abbr: string }
    const teamScopes: ScopeInfo[] = []
    // Mapa areaId → areaScopeId para scope_kpis
    const areaScopeIds: { areaId: number; name: string; companyId: number }[] = []
    const companyScopeIds: { id: number; name: string }[] = []

    for (const company of COMPANIES) {
      const [cRes] = await conn.query(
        `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
        [`[${TAG}] ${company.name}`, 'company', holdingId]
      )
      const companyId: number = cRes.insertId
      companyScopeIds.push({ id: companyId, name: company.name })

      for (const area of company.areas) {
        const [aRes] = await conn.query(
          `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
          [`[${TAG}] ${area.name} - ${company.abbr}`, 'area', companyId]
        )
        const areaId: number = aRes.insertId
        areaScopeIds.push({ areaId, name: `${area.name} - ${company.abbr}`, companyId })

        for (const teamName of area.teams) {
          const [tRes] = await conn.query(
            `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?,?,?,1)`,
            [`[${TAG}] ${teamName} - ${company.abbr}`, 'team', areaId]
          )
          teamScopes.push({ teamId: tRes.insertId, areaId, companyId, areaName: area.name, teamName, abbr: company.abbr })
        }
      }
    }

    // ── 4. Colaboradores ──────────────────────────────────────────────────────
    console.log(`Creando colaboradores (~${teamScopes.length * COLLAB_PER_TEAM})...`)

    // Admin global del holding
    await conn.query(
      `INSERT INTO collaborators (name, email, role, position, area, orgScopeId, passwordHash, status, authSource)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [`[${TAG}] Admin Holding`, `admin@demo-holding.com`, 'admin',
       'Administrador', 'Holding', holdingId, passwordHash, 'active', 'local']
    )

    // Directores por empresa
    for (const cs of companyScopeIds) {
      await conn.query(
        `INSERT INTO collaborators (name, email, role, position, area, orgScopeId, passwordHash, status, authSource)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [`[${TAG}] Director ${cs.name}`,
         `director.${cs.name.replace(/\s+/g,'.').toLowerCase().replace(/[^a-z.]/g,'')}@demo-holding.com`,
         'director', 'Director', cs.name, cs.id, passwordHash, 'active', 'local']
      )
    }

    // Colaboradores por equipo (batch)
    const POSITIONS = ['Analista','Coordinador','Especialista','Técnico','Consultor','Asistente','Operador','Supervisor']
    const collabRows: any[][] = []
    let emailCounter = 0
    for (const ts of teamScopes) {
      for (let i = 0; i < COLLAB_PER_TEAM; i++) {
        const first = pick(FIRST)
        const last  = pick(LAST)
        const email = `u${++emailCounter}@demo-holding.com`
        const role = i === 0 ? 'leader' : 'collaborator'
        const position = i === 0 ? `Líder de ${ts.teamName}` : pick(POSITIONS)
        collabRows.push([`${first} ${last}`, email, role, position, ts.teamName, ts.teamId, passwordHash, 'active', 'local'])
      }
    }

    await batchInsert(conn,
      'collaborators',
      ['name','email','role','position','area','orgScopeId','passwordHash','status','authSource'],
      collabRows
    )

    // Obtener IDs de colaboradores insertados
    console.log('Recuperando IDs de colaboradores...')
    const [collabRows2] = await conn.query(
      `SELECT c.id, c.orgScopeId, c.role FROM collaborators c
       JOIN org_scopes os ON os.id = c.orgScopeId
       WHERE c.email LIKE ? OR c.role = 'admin'`,
      ['%@demo-holding.com']
    )
    const allCollabs = (collabRows2 as any[])
    const regularCollabs = allCollabs.filter((c: any) => c.role === 'collaborator' || c.role === 'leader')

    // Mapa teamScopeId → collaboratorId[]
    const teamCollabMap = new Map<number, number[]>()
    for (const c of regularCollabs) {
      const arr = teamCollabMap.get(c.orgScopeId) || []
      arr.push(c.id)
      teamCollabMap.set(c.orgScopeId, arr)
    }

    // ── 5. collaborator_kpis ──────────────────────────────────────────────────
    console.log('Asignando KPIs a colaboradores...')
    const ckRows: any[][] = []

    for (const ts of teamScopes) {
      const collabs = teamCollabMap.get(ts.teamId) || []
      const shuffledKpis = shuffle(kpiMeta).slice(0, KPIS_PER_COLLAB)
      const weightEach = parseFloat((100 / KPIS_PER_COLLAB).toFixed(2))

      for (const collabId of collabs) {
        for (const kpi of shuffledKpis) {
          const target = parseFloat(between(kpi.targetBase * 0.8, kpi.targetBase * 1.2).toFixed(2))
          const actual = randomActual(kpi, target)
          const variation = calcVariation(kpi.direction, target, actual)
          const weighted  = calcWeighted(variation, weightEach)
          ckRows.push([
            collabId, kpi.id, periodId, null,
            target, actual, weightEach, variation, weighted,
            'approved', 'approved', 'manual',
          ])
        }
      }
    }

    console.log(`  Insertando ${ckRows.length} filas en collaborator_kpis...`)
    await batchInsert(conn,
      'collaborator_kpis',
      ['collaboratorId','kpiId','periodId','subPeriodId',
       'target','actual','weight','variation','weightedResult',
       'status','curationStatus','inputMode'],
      ckRows
    )

    // ── 6. scope_kpis (área y empresa) ───────────────────────────────────────
    console.log('Creando scope_kpis por área y empresa...')
    const scopeKpiRows: any[][] = []

    // Por área: KPIs agregados (3 KPIs por área)
    for (const area of areaScopeIds) {
      const areaKpis = shuffle(kpiMeta).slice(0, 3)
      for (const kpi of areaKpis) {
        const target = parseFloat(between(kpi.targetBase * 0.9, kpi.targetBase * 1.1).toFixed(2))
        const actual = randomActual(kpi, target)
        const variation = calcVariation(kpi.direction, target, actual)
        const weight = parseFloat((100 / 3).toFixed(2))
        const weighted  = calcWeighted(variation, weight)
        scopeKpiRows.push([
          `[${TAG}] ${kpi.name} - ${area.name}`,
          kpi.id, area.areaId, periodId, null,
          'area', 'direct',
          target, actual, weight, variation, weighted,
          'approved',
        ])
      }
    }

    // Por empresa: KPIs de alto nivel (2 KPIs por empresa)
    for (const company of companyScopeIds) {
      const compKpis = shuffle(kpiMeta).slice(0, 2)
      for (const kpi of compKpis) {
        const target = parseFloat(between(kpi.targetBase * 0.9, kpi.targetBase * 1.1).toFixed(2))
        const actual = randomActual(kpi, target)
        const variation = calcVariation(kpi.direction, target, actual)
        const weight = 50
        const weighted  = calcWeighted(variation, weight)
        scopeKpiRows.push([
          `[${TAG}] ${kpi.name} - ${company.name}`,
          kpi.id, company.id, periodId, null,
          'company', 'direct',
          target, actual, weight, variation, weighted,
          'approved',
        ])
      }
    }

    // Holding level: 3 KPIs
    const holdingKpis = kpiMeta.slice(0, 3)
    for (const kpi of holdingKpis) {
      const target = parseFloat(between(kpi.targetBase * 0.9, kpi.targetBase * 1.1).toFixed(2))
      const actual = randomActual(kpi, target)
      const variation = calcVariation(kpi.direction, target, actual)
      const weight = parseFloat((100 / 3).toFixed(2))
      const weighted = calcWeighted(variation, weight)
      scopeKpiRows.push([
        `[${TAG}] ${kpi.name} - Holding`,
        kpi.id, holdingId, periodId, null,
        'company', 'direct',
        target, actual, weight, variation, weighted,
        'approved',
      ])
    }

    await batchInsert(conn,
      'scope_kpis',
      ['name','kpiId','orgScopeId','periodId','subPeriodId',
       'ownerLevel','sourceMode',
       'target','actual','weight','variation','weightedResult',
       'status'],
      scopeKpiRows
    )

    // ── 7. objective_trees ────────────────────────────────────────────────────
    console.log('Creando objective_trees...')
    const OBJ_TREES = [
      { name: `[${TAG}] Excelencia Operativa`,      level: 'company' },
      { name: `[${TAG}] Crecimiento Comercial`,     level: 'direction' },
      { name: `[${TAG}] Calidad y Satisfacción`,    level: 'management' },
      { name: `[${TAG}] Eficiencia de Costos`,      level: 'direction' },
      { name: `[${TAG}] Desarrollo de Personas`,    level: 'leadership' },
    ]
    const objTreeIds: number[] = []
    for (const ot of OBJ_TREES) {
      const [res] = await conn.query(
        `INSERT INTO objective_trees (name, level) VALUES (?,?)`, [ot.name, ot.level]
      )
      objTreeIds.push(res.insertId)
    }

    // Vincular scope_kpis con objective_trees
    const [skRows] = await conn.query(
      `SELECT id FROM scope_kpis WHERE name LIKE ?`, [`%[${TAG}]%`]
    )
    const skIds = (skRows as any[]).map((r: any) => r.id)
    const otLinks: any[][] = []
    for (const skId of skIds) {
      const treeId = objTreeIds[rand(objTreeIds.length)]
      otLinks.push([treeId, skId])
    }
    if (otLinks.length) {
      await batchInsert(conn, 'objective_trees_scope_kpis', ['objectiveTreeId','scopeKpiId'], otLinks)
    }

    // ── 8. OKRs ──────────────────────────────────────────────────────────────
    console.log('Creando OKRs...')
    const adminCollab = allCollabs.find((c: any) => c.role === 'admin')
    const adminId: number = adminCollab?.id || allCollabs[0]?.id

    const OKR_OBJECTIVES = [
      { title: `[${TAG}] Consolidar el crecimiento del Grupo`,      description: 'Objetivo estratégico del holding para 2026' },
      { title: `[${TAG}] Mejorar la experiencia del cliente`,       description: 'Elevar NPS y reducir tiempos de respuesta' },
      { title: `[${TAG}] Optimizar operaciones y costos`,           description: 'Reducir costos sin comprometer calidad' },
      { title: `[${TAG}] Fortalecer el talento organizacional`,     description: 'Desarrollar capacidades internas del grupo' },
      { title: `[${TAG}] Expansión y nuevos mercados`,              description: 'Incrementar presencia en mercados clave' },
    ]

    for (const obj of OKR_OBJECTIVES) {
      const [objRes] = await conn.query(
        `INSERT INTO okr_objectives (title, description, orgScopeId, periodId, ownerId, status, progress)
         VALUES (?,?,?,?,?,?,?)`,
        [obj.title, obj.description, holdingId, periodId, adminId, 'active', parseFloat(between(45, 85).toFixed(1))]
      )
      const objId: number = objRes.insertId

      // 3 KRs por objetivo
      const KR_TEMPLATES = [
        { title: 'Incrementar facturación del grupo 20%',     krType: 'simple', unit: '%',       target: 20,  current: parseFloat(between(8, 18).toFixed(1)) },
        { title: 'Reducir churn rate a menos del 5%',         krType: 'simple', unit: '%',       target: 5,   current: parseFloat(between(3, 7).toFixed(1)) },
        { title: 'Alcanzar NPS > 60 en todas las empresas',   krType: 'simple', unit: 'puntos',  target: 60,  current: parseFloat(between(40, 65).toFixed(1)) },
        { title: 'Capacitar al 80% de los colaboradores',     krType: 'simple', unit: '%',       target: 80,  current: parseFloat(between(30, 75).toFixed(1)) },
        { title: 'Reducir tiempo de respuesta a < 2 horas',   krType: 'simple', unit: 'horas',   target: 2,   current: parseFloat(between(1.5, 4).toFixed(1)) },
        { title: 'Cerrar 500 nuevas cuentas corporativas',    krType: 'simple', unit: 'cuentas', target: 500, current: parseFloat(between(100, 450).toFixed(1)) },
      ]
      const krSubset = shuffle(KR_TEMPLATES).slice(0, 3)
      let sortOrder = 1
      for (const kr of krSubset) {
        const status = kr.current >= kr.target ? 'completed'
          : kr.current >= kr.target * 0.8 ? 'on_track'
          : kr.current >= kr.target * 0.5 ? 'at_risk' : 'behind'
        const [krRes] = await conn.query(
          `INSERT INTO okr_key_results (objectiveId, title, krType, startValue, targetValue, currentValue, unit, weight, ownerId, status, sortOrder)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [objId, kr.title, 'simple', 0, kr.target, kr.current, kr.unit, parseFloat((100/3).toFixed(2)), adminId, status, sortOrder++]
        )
        // Check-ins históricos para el KR
        const checkInCount = rand(5) + 2
        const step = kr.current / checkInCount
        for (let ci = 1; ci <= checkInCount; ci++) {
          const val = parseFloat((step * ci * (0.9 + rng() * 0.2)).toFixed(2))
          await conn.query(
            `INSERT INTO okr_check_ins (keyResultId, value, note, authorId) VALUES (?,?,?,?)`,
            [krRes.insertId, val, `Actualización mes ${ci}`, adminId]
          )
        }
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('\n✓ Seed completado.')
    console.log(`  Período: [${TAG}] Demo Anual 2026 (id=${periodId})`)
    console.log(`  Org scopes: ${1 + COMPANIES.length + areaScopeIds.length + teamScopes.length} creados`)
    console.log(`  Colaboradores: ~${collabRows.length + COMPANIES.length + 1}`)
    console.log(`  collaborator_kpis: ${ckRows.length}`)
    console.log(`  scope_kpis: ${scopeKpiRows.length}`)
    console.log(`  OKRs: ${OKR_OBJECTIVES.length} objetivos con KRs y check-ins`)
    console.log(`\n  Usuario admin:  admin@demo-holding.com`)
    console.log(`  Contraseña:     ${PASSWORD}`)

  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {})
    console.error('Error en seed:', err)
    throw err
  } finally {
    conn.release()
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
;(async () => {
  if (args.includes('--clean')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn: any = await pool.getConnection()
    try { await clean(conn) } finally { conn.release() }
  } else {
    await seed()
  }
  process.exit(0)
})().catch((err) => { console.error(err); process.exit(1) })
