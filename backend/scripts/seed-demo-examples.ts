import { pool } from '../src/config/database'
import { calculateVariation, calculateWeightedResult, getDefaultFormula } from '../src/utils/kpi-formulas'
import { computeScopeKpiActual, parseScopeKpiMixedConfig } from '../src/services/scope-kpi-mixed.service'
import bcrypt from 'bcryptjs'

const DEMO_JOHANA_EMAIL = 'admin@empresa.demo'
const DEMO_JOHANA_PASSWORD = 'Admin1234!'

type CollaboratorSeed = {
  key: string
  name: string
  position: string
  area: string
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
  email: string
  managerKey?: string | null
  orgScopeKey: string
  status?: 'active' | 'inactive'
  inactiveReason?: string | null
  hasSuperpowers?: boolean
}

type KPISeed = {
  key: string
  name: string
  description: string
  type: 'manual' | 'count' | 'ratio' | 'sla' | 'value'
  direction: 'growth' | 'reduction' | 'exact'
  defaultDataSource?: string | null
  areas: string[]
  treeKeys: string[]
}

type AssignmentSeed = {
  collaboratorKey: string
  kpiKey: string
  target: number
  actual?: number | null
  weight: number
  subPeriodKey: string
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  curationStatus: 'pending' | 'in_review' | 'approved' | 'rejected'
  inputMode?: 'manual' | 'import' | 'auto'
  comments?: string | null
  dataSource?: string | null
  sourceConfig?: Record<string, any> | null
  criteriaStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  criteriaText?: string | null
  evidenceUrl?: string | null
  measurementStatus?: 'draft' | 'proposed' | 'approved' | 'rejected' | null
  measurementMode?: 'manual' | 'import' | 'auto'
  reason?: string | null
}

type ScopeKpiSeed = {
  key: string
  name: string
  description: string
  kpiKey: string
  orgScopeKey: string
  ownerLevel: 'team' | 'area' | 'business_unit' | 'company' | 'executive'
  sourceMode: 'direct' | 'aggregated' | 'mixed'
  target: number
  weight: number
  actual?: number | null
  inputMode?: 'manual' | 'import' | 'auto'
  status?: 'draft' | 'proposed' | 'approved' | 'closed'
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  subPeriodKey: string
  mixedConfig?: {
    directWeight: number
    aggregatedWeight: number
    directLabel?: string | null
    aggregatedLabel?: string | null
  } | null
}

type DataSourceMappingSeed = {
  sourceType: string
  entityType: 'collaborator' | 'org_scope'
  entityKey: string
  externalKey: string
  externalLabel?: string | null
  metadata?: Record<string, any> | null
}

type ObjectiveSeed = {
  key: string
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentKey?: string | null
}

type ObjectiveScopeLinkSeed = {
  objectiveKey: string
  scopeKpiKey: string
}

const DEMO_PERIOD_NAME = 'Demo 2026-2027'
const DEMO_PERIOD_START = '2026-01-01'
const DEMO_PERIOD_END = '2027-03-31'
const DEMO_CALENDAR_NAME = 'Mensual demo'
const DEMO_QUARTERLY_CALENDAR_NAME = 'Trimestral demo'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const normalizeExternalKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const asJson = (value: unknown) => (value == null ? null : JSON.stringify(value))

const areaSeeds = [
  { key: 'qa', name: 'QA', parentKey: null as string | null },
  { key: 'revenue', name: 'Revenue', parentKey: null as string | null },
  { key: 'customer_success', name: 'Customer Success', parentKey: null as string | null },
  { key: 'rrhh', name: 'Recursos Humanos', parentKey: null as string | null },
  { key: 'tecnologia', name: 'Tecnologia', parentKey: null as string | null },
  { key: 'delivery', name: 'Delivery', parentKey: null as string | null },
  { key: 'agilidad', name: 'Agilidad', parentKey: null as string | null },
]

const orgScopeSeeds = [
  {
    key: 'company',
    name: 'Company',
    type: 'company' as const,
    parentKey: null as string | null,
    metadata: { code: 'COMPANY', aliases: ['company', 'corporate'] },
  },
  {
    key: 'qa',
    name: 'QA',
    type: 'area' as const,
    parentKey: 'company',
    metadata: { code: 'QA', aliases: ['quality assurance', 'testing'] },
  },
  {
    key: 'revenue',
    name: 'Revenue',
    type: 'area' as const,
    parentKey: 'company',
    metadata: { code: 'REV', aliases: ['sales', 'commercial'] },
  },
  {
    key: 'customer_success',
    name: 'Customer Success',
    type: 'area' as const,
    parentKey: 'company',
    metadata: { code: 'CS', aliases: ['customer success', 'cx'] },
  },
  {
    key: 'rrhh',
    name: 'Recursos Humanos',
    type: 'area' as const,
    parentKey: 'company',
    metadata: { code: 'HR', aliases: ['people', 'human resources'] },
  },
  {
    key: 'delivery',
    name: 'Delivery',
    type: 'area' as const,
    parentKey: 'company',
    metadata: { code: 'DEL', aliases: ['delivery', 'operations'] },
  },
  {
    key: 'tecnologia',
    name: 'Tecnologia',
    type: 'area' as const,
    parentKey: 'company',
    metadata: { code: 'TECH', aliases: ['tecnologia', 'engineering'] },
  },
  {
    key: 'qa_automation',
    name: 'QA Automation',
    type: 'team' as const,
    parentKey: 'qa',
    metadata: { code: 'QA-AUTO', aliases: ['qa automation', 'test automation'] },
  },
  {
    key: 'revenue_ops',
    name: 'Revenue Ops',
    type: 'team' as const,
    parentKey: 'revenue',
    metadata: { code: 'REV-OPS', aliases: ['revenue ops', 'revops'] },
  },
]

const collaboratorSeeds: CollaboratorSeed[] = [
  {
    key: 'pedro',
    name: 'Pedro Sirvent',
    position: 'QA Lead',
    area: 'QA',
    role: 'leader',
    email: 'psirvent@empresa.demo',
    managerKey: 'johana',
    orgScopeKey: 'qa_automation',
  },
  {
    key: 'mauro',
    name: 'Mauro Toubes',
    position: 'QA Analyst',
    area: 'QA',
    role: 'collaborator',
    email: 'mtoubes@empresa.demo',
    managerKey: 'pedro',
    orgScopeKey: 'qa_automation',
  },
  {
    key: 'alexis',
    name: 'Alexis Cantenys',
    position: 'Revenue Director',
    area: 'Revenue',
    role: 'director',
    email: 'acantenys@empresa.demo',
    managerKey: null,
    orgScopeKey: 'revenue',
  },
  {
    key: 'ale',
    name: 'Ale de Haro',
    position: 'Revenue Analyst',
    area: 'Revenue',
    role: 'collaborator',
    email: 'adeharo@empresa.demo',
    managerKey: 'alexis',
    orgScopeKey: 'revenue_ops',
  },
  {
    key: 'andrea',
    name: 'Andrea Acciardi',
    position: 'Customer Success Lead',
    area: 'Customer Success',
    role: 'leader',
    email: 'aacciardi@empresa.demo',
    managerKey: null,
    orgScopeKey: 'customer_success',
  },
  {
    key: 'agustina',
    name: 'Agustina Salas Alarcon',
    position: 'Lead HR',
    area: 'Recursos Humanos',
    role: 'director',
    email: 'asalas@empresa.demo',
    managerKey: null,
    orgScopeKey: 'rrhh',
  },
  {
    key: 'abel',
    name: 'Abel Decaroli',
    position: 'CyberSec Specialist',
    area: 'Tecnologia',
    role: 'collaborator',
    email: 'adecaroli@empresa.demo',
    managerKey: null,
    orgScopeKey: 'tecnologia',
  },
  {
    key: 'carolina',
    name: 'Carolina Coppola',
    position: 'Agile Coach',
    area: 'Agilidad',
    role: 'collaborator',
    email: 'ccoppola@empresa.demo',
    managerKey: null,
    orgScopeKey: 'delivery',
    status: 'inactive',
    inactiveReason: 'Demo de filtro de inactivos',
  },
]

const objectiveSeeds: ObjectiveSeed[] = [
  { key: 'growth', level: 'company', name: 'Crecimiento rentable' },
  { key: 'ops', level: 'direction', name: 'Excelencia operativa', parentKey: 'growth' },
  { key: 'customer', level: 'direction', name: 'Experiencia del cliente', parentKey: 'growth' },
  { key: 'talent', level: 'management', name: 'Talento escalable', parentKey: 'ops' },
]

const objectiveScopeLinkSeeds: ObjectiveScopeLinkSeed[] = [
  { objectiveKey: 'ops', scopeKpiKey: 'qa_performance' },
  { objectiveKey: 'customer', scopeKpiKey: 'cs_performance' },
  { objectiveKey: 'talent', scopeKpiKey: 'time_to_hire_scope' },
  { objectiveKey: 'growth', scopeKpiKey: 'revenue_performance' },
  { objectiveKey: 'growth', scopeKpiKey: 'company_revenue' },
  { objectiveKey: 'growth', scopeKpiKey: 'company_performance' },
  { objectiveKey: 'growth', scopeKpiKey: 'executive_company_mix' },
]

const kpiSeeds: KPISeed[] = [
  {
    key: 'quality_management',
    name: 'Calidad de Gestion',
    description: 'Nivel de calidad de gestion del colaborador o area.',
    type: 'value',
    direction: 'growth',
    defaultDataSource: 'manual',
    areas: ['QA', 'Agilidad'],
    treeKeys: ['ops'],
  },
  {
    key: 'skill_coverage',
    name: 'Cubrimiento de habilidades',
    description: 'Porcentaje de cobertura del skill matrix esperado.',
    type: 'ratio',
    direction: 'growth',
    defaultDataSource: 'manual',
    areas: ['QA', 'Recursos Humanos'],
    treeKeys: ['talent'],
  },
  {
    key: 'stories_delivered',
    name: 'US Entregadas Acumuladas',
    description: 'Historias de usuario entregadas dentro del periodo.',
    type: 'count',
    direction: 'growth',
    defaultDataSource: 'jira',
    areas: ['QA', 'Delivery'],
    treeKeys: ['ops'],
  },
  {
    key: 'defect_leakage',
    name: 'Defect Leakage',
    description: 'Defectos que llegan a produccion.',
    type: 'ratio',
    direction: 'reduction',
    defaultDataSource: 'jira',
    areas: ['QA'],
    treeKeys: ['ops'],
  },
  {
    key: 'revenue',
    name: 'Revenue Mensual',
    description: 'Revenue mensual del area o compania.',
    type: 'value',
    direction: 'growth',
    defaultDataSource: 'looker',
    areas: ['Revenue'],
    treeKeys: ['growth'],
  },
  {
    key: 'opportunities',
    name: 'Nuevas Oportunidades',
    description: 'Cantidad de nuevas oportunidades calificadas.',
    type: 'count',
    direction: 'growth',
    defaultDataSource: 'generic_api',
    areas: ['Revenue'],
    treeKeys: ['growth'],
  },
  {
    key: 'csat',
    name: 'CSAT',
    description: 'Satisfaccion del cliente.',
    type: 'value',
    direction: 'growth',
    defaultDataSource: 'sheets',
    areas: ['Customer Success'],
    treeKeys: ['customer'],
  },
  {
    key: 'time_to_hire',
    name: 'Time to Hire',
    description: 'Dias promedio para cubrir una vacante.',
    type: 'sla',
    direction: 'reduction',
    defaultDataSource: 'generic_api',
    areas: ['Recursos Humanos'],
    treeKeys: ['talent'],
  },
  {
    key: 'performance_score',
    name: 'Performance Score',
    description: 'Puntaje de performance consolidado.',
    type: 'value',
    direction: 'growth',
    defaultDataSource: 'manual',
    areas: ['QA', 'Revenue', 'Customer Success', 'Company'],
    treeKeys: ['ops', 'growth', 'customer'],
  },
  {
    key: 'executive_mix_score',
    name: 'Executive Mix Score',
    description: 'KPI ejecutivo mixto con componente directo y agregado.',
    type: 'value',
    direction: 'growth',
    defaultDataSource: 'manual',
    areas: ['Company'],
    treeKeys: ['growth'],
  },
]

const assignmentSeeds: AssignmentSeed[] = [
  {
    collaboratorKey: 'johana',
    kpiKey: 'quality_management',
    target: 95,
    actual: 92,
    weight: 25,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'manual',
    comments: 'Seguimiento de gestion del area QA.',
    dataSource: 'manual',
    criteriaStatus: 'approved',
    criteriaText: 'Checklist de liderazgo y gestion de backlog.',
    evidenceUrl: 'https://demo.kpimanager.local/evidence/admin-quality',
    measurementStatus: 'approved',
    measurementMode: 'manual',
    reason: 'Carga manual de demo',
  },
  {
    collaboratorKey: 'johana',
    kpiKey: 'skill_coverage',
    target: 100,
    actual: 88,
    weight: 20,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'manual',
    comments: 'Cobertura de habilidades del area.',
    dataSource: 'manual',
    criteriaStatus: 'approved',
    criteriaText: 'Matriz de skills actualizada al cierre de marzo.',
    measurementStatus: 'approved',
    measurementMode: 'manual',
  },
  {
    collaboratorKey: 'pedro',
    kpiKey: 'stories_delivered',
    target: 20,
    actual: 18,
    weight: 35,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Historias cerradas por QA lead.',
    dataSource: 'jira',
    sourceConfig: { source: 'jira', board: 'QA' },
    criteriaStatus: 'approved',
    criteriaText: 'Historias QA completadas y validadas.',
    measurementStatus: 'approved',
    measurementMode: 'import',
    reason: 'Seed demo desde integracion Jira',
  },
  {
    collaboratorKey: 'pedro',
    kpiKey: 'performance_score',
    target: 100,
    actual: 84,
    weight: 10,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'manual',
    comments: 'Performance score de referencia para agregacion.',
    dataSource: 'manual',
    criteriaStatus: 'approved',
    criteriaText: 'Evaluacion consolidada del QA lead.',
    measurementStatus: 'approved',
    measurementMode: 'manual',
  },
  {
    collaboratorKey: 'mauro',
    kpiKey: 'stories_delivered',
    target: 16,
    actual: 14,
    weight: 35,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Historias cerradas por QA analyst.',
    dataSource: 'jira',
    sourceConfig: { source: 'jira', board: 'QA' },
    criteriaStatus: 'approved',
    criteriaText: 'Historias QA completadas.',
    measurementStatus: 'approved',
    measurementMode: 'import',
  },
  {
    collaboratorKey: 'mauro',
    kpiKey: 'defect_leakage',
    target: 5,
    actual: 4,
    weight: 20,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Menor leakage es mejor.',
    dataSource: 'jira',
    sourceConfig: { source: 'jira', metric: 'defect_leakage' },
    criteriaStatus: 'approved',
    criteriaText: 'Defectos post release identificados.',
    measurementStatus: 'approved',
    measurementMode: 'import',
  },
  {
    collaboratorKey: 'mauro',
    kpiKey: 'performance_score',
    target: 100,
    actual: 78,
    weight: 10,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'manual',
    comments: 'Performance score de referencia para agregacion.',
    dataSource: 'manual',
    criteriaStatus: 'approved',
    criteriaText: 'Evaluacion consolidada del QA analyst.',
    measurementStatus: 'approved',
    measurementMode: 'manual',
  },
  {
    collaboratorKey: 'alexis',
    kpiKey: 'revenue',
    target: 150000,
    actual: 162000,
    weight: 40,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Revenue consolidado del mes.',
    dataSource: 'looker',
    sourceConfig: { source: 'looker', queryId: 'rev_march_2026' },
    criteriaStatus: 'approved',
    criteriaText: 'Revenue validado con BI.',
    measurementStatus: 'approved',
    measurementMode: 'import',
  },
  {
    collaboratorKey: 'alexis',
    kpiKey: 'performance_score',
    target: 100,
    actual: 89,
    weight: 10,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'manual',
    comments: 'Performance score comercial.',
    dataSource: 'manual',
    criteriaStatus: 'approved',
    criteriaText: 'Evaluacion consolidada de revenue.',
    measurementStatus: 'approved',
    measurementMode: 'manual',
  },
  {
    collaboratorKey: 'ale',
    kpiKey: 'opportunities',
    target: 10,
    actual: 12,
    weight: 30,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Oportunidades calificadas durante marzo.',
    dataSource: 'generic_api',
    sourceConfig: { source: 'generic_api', endpoint: '/demo/opportunities' },
    criteriaStatus: 'approved',
    criteriaText: 'Leads calificados por revenue ops.',
    measurementStatus: 'approved',
    measurementMode: 'import',
  },
  {
    collaboratorKey: 'andrea',
    kpiKey: 'csat',
    target: 90,
    actual: 94,
    weight: 30,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Encuestas de satisfaccion del mes.',
    dataSource: 'sheets',
    sourceConfig: { source: 'sheets', spreadsheetId: 'demo-csat' },
    criteriaStatus: 'approved',
    criteriaText: 'Promedio de satisfaccion del cliente.',
    measurementStatus: 'approved',
    measurementMode: 'import',
  },
  {
    collaboratorKey: 'andrea',
    kpiKey: 'performance_score',
    target: 100,
    actual: 91,
    weight: 10,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'manual',
    comments: 'Performance score customer success.',
    dataSource: 'manual',
    criteriaStatus: 'approved',
    criteriaText: 'Evaluacion consolidada del area de customer success.',
    measurementStatus: 'approved',
    measurementMode: 'manual',
  },
  {
    collaboratorKey: 'agustina',
    kpiKey: 'time_to_hire',
    target: 45,
    actual: 38,
    weight: 20,
    subPeriodKey: 'marzo_2026',
    status: 'approved',
    curationStatus: 'approved',
    inputMode: 'import',
    comments: 'Tiempo promedio de cobertura de vacantes.',
    dataSource: 'generic_api',
    sourceConfig: { source: 'generic_api', endpoint: '/demo/time-to-hire' },
    criteriaStatus: 'approved',
    criteriaText: 'Promedio consolidado de cobertura.',
    measurementStatus: 'approved',
    measurementMode: 'import',
  },
  {
    collaboratorKey: 'abel',
    kpiKey: 'quality_management',
    target: 90,
    actual: null,
    weight: 15,
    subPeriodKey: 'marzo_2026',
    status: 'proposed',
    curationStatus: 'in_review',
    inputMode: 'manual',
    comments: 'Caso de curaduria pendiente.',
    dataSource: 'manual',
    criteriaStatus: 'in_review',
    criteriaText: 'Se propone valor de calidad en revision.',
    evidenceUrl: 'https://demo.kpimanager.local/evidence/abel-quality',
    measurementStatus: 'proposed',
    measurementMode: 'manual',
    reason: 'Pendiente de revision de curaduria',
  },
]

const scopeKpiSeeds: ScopeKpiSeed[] = [
  {
    key: 'qa_performance',
    name: 'QA Performance Score',
    description: 'Performance consolidada de QA desde KPIs individuales.',
    kpiKey: 'performance_score',
    orgScopeKey: 'qa',
    ownerLevel: 'area',
    sourceMode: 'aggregated',
    target: 100,
    weight: 20,
    subPeriodKey: 'marzo_2026',
    inputMode: 'auto',
    status: 'approved',
    curationStatus: 'approved',
  },
  {
    key: 'revenue_performance',
    name: 'Revenue Performance Score',
    description: 'Performance comercial del area.',
    kpiKey: 'performance_score',
    orgScopeKey: 'revenue',
    ownerLevel: 'area',
    sourceMode: 'direct',
    target: 100,
    actual: 87,
    weight: 25,
    subPeriodKey: 'marzo_2026',
    inputMode: 'manual',
    status: 'approved',
    curationStatus: 'approved',
  },
  {
    key: 'cs_performance',
    name: 'Customer Success Performance Score',
    description: 'Performance consolidada de customer success.',
    kpiKey: 'performance_score',
    orgScopeKey: 'customer_success',
    ownerLevel: 'area',
    sourceMode: 'direct',
    target: 100,
    actual: 91,
    weight: 20,
    subPeriodKey: 'marzo_2026',
    inputMode: 'manual',
    status: 'approved',
    curationStatus: 'approved',
  },
  {
    key: 'time_to_hire_scope',
    name: 'People Time to Hire',
    description: 'KPI de people para pruebas de scope directo.',
    kpiKey: 'time_to_hire',
    orgScopeKey: 'rrhh',
    ownerLevel: 'area',
    sourceMode: 'direct',
    target: 45,
    actual: 38,
    weight: 10,
    subPeriodKey: 'marzo_2026',
    inputMode: 'import',
    status: 'approved',
    curationStatus: 'approved',
  },
  {
    key: 'company_performance',
    name: 'Company Performance Score',
    description: 'Performance corporativa agregada desde areas.',
    kpiKey: 'performance_score',
    orgScopeKey: 'company',
    ownerLevel: 'company',
    sourceMode: 'aggregated',
    target: 100,
    weight: 30,
    subPeriodKey: 'marzo_2026',
    inputMode: 'auto',
    status: 'approved',
    curationStatus: 'approved',
  },
  {
    key: 'company_revenue',
    name: 'Revenue Mensual Company',
    description: 'Revenue corporativo para pruebas directas de scope e integracion.',
    kpiKey: 'revenue',
    orgScopeKey: 'company',
    ownerLevel: 'company',
    sourceMode: 'direct',
    target: 150000,
    actual: 162000,
    weight: 35,
    subPeriodKey: 'marzo_2026',
    inputMode: 'import',
    status: 'approved',
    curationStatus: 'approved',
  },
  {
    key: 'executive_company_mix',
    name: 'Executive Company Mix',
    description: 'KPI ejecutivo mixto con señal directa y agregacion corporativa.',
    kpiKey: 'executive_mix_score',
    orgScopeKey: 'company',
    ownerLevel: 'executive',
    sourceMode: 'mixed',
    target: 100,
    weight: 25,
    subPeriodKey: 'marzo_2026',
    inputMode: 'manual',
    status: 'approved',
    curationStatus: 'approved',
    mixedConfig: {
      directWeight: 40,
      aggregatedWeight: 60,
      directLabel: 'Pulso ejecutivo',
      aggregatedLabel: 'Consolidado company',
    },
  },
]

const mappingSeeds: DataSourceMappingSeed[] = [
  { sourceType: 'global', entityType: 'collaborator', entityKey: 'johana', externalKey: 'Johana Manzanares' },
  { sourceType: 'looker', entityType: 'collaborator', entityKey: 'johana', externalKey: 'admin@empresa.demo' },
  { sourceType: 'jira', entityType: 'collaborator', entityKey: 'pedro', externalKey: '712020:pedro-sirvent', externalLabel: 'Pedro Jira' },
  { sourceType: 'global', entityType: 'collaborator', entityKey: 'pedro', externalKey: 'Pedro Sirvent' },
  { sourceType: 'jira', entityType: 'collaborator', entityKey: 'mauro', externalKey: '712020:mauro-toubes', externalLabel: 'Mauro Jira' },
  { sourceType: 'looker', entityType: 'collaborator', entityKey: 'alexis', externalKey: 'acantenys@empresa.demo' },
  { sourceType: 'generic_api', entityType: 'collaborator', entityKey: 'ale', externalKey: 'ale_de_haro' },
  { sourceType: 'sheets', entityType: 'collaborator', entityKey: 'andrea', externalKey: 'andrea.acciardi' },
  { sourceType: 'global', entityType: 'org_scope', entityKey: 'company', externalKey: 'company', externalLabel: 'Company' },
  { sourceType: 'looker', entityType: 'org_scope', entityKey: 'company', externalKey: 'COMPANY', externalLabel: 'Company code' },
  { sourceType: 'global', entityType: 'org_scope', entityKey: 'qa', externalKey: 'QA' },
  { sourceType: 'jira', entityType: 'org_scope', entityKey: 'qa', externalKey: 'quality_assurance' },
  { sourceType: 'global', entityType: 'org_scope', entityKey: 'revenue', externalKey: 'Revenue' },
  { sourceType: 'generic_api', entityType: 'org_scope', entityKey: 'revenue', externalKey: 'REV' },
]

const findPreservedCollaborator = async () => {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM collaborators
     WHERE email = 'admin@empresa.demo' OR name = 'Johana Manzanares'
     ORDER BY id ASC
     LIMIT 1`
  )
  if (rows?.[0]) return rows[0]

  const [fallbackRows] = await pool.query<any[]>(
    `SELECT * FROM collaborators
     ORDER BY (role = 'admin') DESC, id ASC
     LIMIT 1`
  )
  return fallbackRows?.[0] || null
}

const buildMonthlySubperiods = () => {
  const months = [
    ['enero_2026', 'Enero 2026', '2026-01-01', '2026-01-31', 'closed'],
    ['febrero_2026', 'Febrero 2026', '2026-02-01', '2026-02-28', 'closed'],
    ['marzo_2026', 'Marzo 2026', '2026-03-01', '2026-03-31', 'open'],
    ['abril_2026', 'Abril 2026', '2026-04-01', '2026-04-30', 'open'],
    ['mayo_2026', 'Mayo 2026', '2026-05-01', '2026-05-31', 'open'],
    ['junio_2026', 'Junio 2026', '2026-06-01', '2026-06-30', 'open'],
    ['julio_2026', 'Julio 2026', '2026-07-01', '2026-07-31', 'open'],
    ['agosto_2026', 'Agosto 2026', '2026-08-01', '2026-08-31', 'open'],
    ['septiembre_2026', 'Septiembre 2026', '2026-09-01', '2026-09-30', 'open'],
    ['octubre_2026', 'Octubre 2026', '2026-10-01', '2026-10-31', 'open'],
    ['noviembre_2026', 'Noviembre 2026', '2026-11-01', '2026-11-30', 'open'],
    ['diciembre_2026', 'Diciembre 2026', '2026-12-01', '2026-12-31', 'open'],
  ] as const

  return months.map(([key, name, startDate, endDate, status]) => ({
    key,
    name,
    startDate,
    endDate,
    status,
    weight: key === 'marzo_2026' ? 10 : 8.18,
  }))
}

const ensureConnectorEnums = async (conn: any) => {
  await conn.query(
    `ALTER TABLE auth_profiles
     MODIFY COLUMN connector ENUM('jira','xray','sheets','azure_devops','github','servicenow','zendesk','generic_api','looker','other')
     NOT NULL DEFAULT 'jira'`
  )
  await conn.query(
    `ALTER TABLE integration_templates
     MODIFY COLUMN connector ENUM('jira','xray','sheets','azure_devops','github','servicenow','zendesk','generic_api','looker','other')
     NOT NULL DEFAULT 'jira'`
  )
  await conn.query(
    `ALTER TABLE integrations
     MODIFY COLUMN type ENUM('jira','xray','db','excel','api','manual','generic_api','looker','other')
     NOT NULL DEFAULT 'api'`
  )
}

const clearDatabaseKeepingJohana = async (conn: any, johanaId: number) => {
  const dbName = process.env.DB_NAME || 'gestion_kpi'
  const [tables] = await conn.query<any[]>(
    `SELECT table_name as name
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_type = 'BASE TABLE'`,
    [dbName]
  )

  const tableNames = (tables || [])
    .map((row) => row.name as string)
    .filter((name) => name !== 'collaborators')

  await conn.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const tableName of tableNames) {
    await conn.query(`TRUNCATE TABLE \`${tableName}\``)
    console.log(`🧹 Tabla limpiada: ${tableName}`)
  }
  await conn.query('DELETE FROM collaborators WHERE id <> ?', [johanaId])
  await conn.query('UPDATE collaborators SET managerId = NULL, orgScopeId = NULL WHERE id = ?', [johanaId])
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')
}

const insertAreaTree = async (conn: any) => {
  const ids: Record<string, number> = {}
  for (const area of areaSeeds) {
    const parentId = area.parentKey ? ids[area.parentKey] : null
    const [result] = await conn.query('INSERT INTO areas (name, parentId) VALUES (?, ?)', [area.name, parentId])
    ids[area.key] = Number(result.insertId)
  }
  return ids
}

const insertOrgScopes = async (conn: any, calendarProfileId: number) => {
  const ids: Record<string, number> = {}
  for (const scope of orgScopeSeeds) {
    const parentId = scope.parentKey ? ids[scope.parentKey] : null
    const [result] = await conn.query(
      `INSERT INTO org_scopes (name, type, parentId, calendarProfileId, metadata, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [scope.name, scope.type, parentId, calendarProfileId, asJson(scope.metadata)]
    )
    ids[scope.key] = Number(result.insertId)
  }
  return ids
}

const insertCollaborators = async (conn: any, johanaId: number, orgScopeIds: Record<string, number>) => {
  const collaboratorIds: Record<string, number> = { johana: johanaId }
  const johanaPasswordHash = await bcrypt.hash(DEMO_JOHANA_PASSWORD, 10)

  await conn.query(
    `UPDATE collaborators
     SET name = ?, position = ?, area = ?, email = ?, passwordHash = ?, role = 'admin', hasSuperpowers = 1,
         status = 'active', inactiveReason = NULL, inactiveAt = NULL, managerId = NULL, orgScopeId = ?,
         mfaEnabled = 0, mfaCodeHash = NULL, mfaCodeExpiresAt = NULL,
         passwordResetTokenHash = NULL, passwordResetExpiresAt = NULL,
         ssoProviderId = NULL, ssoSubject = NULL, authSource = 'local'
     WHERE id = ?`,
    ['Johana Manzanares', 'QA Manager', 'QA', DEMO_JOHANA_EMAIL, johanaPasswordHash, orgScopeIds.qa, johanaId]
  )

  for (const seed of collaboratorSeeds) {
    const [result] = await conn.query(
      `INSERT INTO collaborators
       (name, position, area, managerId, role, hasSuperpowers, status, inactiveReason, email, passwordHash, mfaEnabled, orgScopeId)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [
        seed.name,
        seed.position,
        seed.area,
        seed.role,
        seed.hasSuperpowers ? 1 : 0,
        seed.status || 'active',
        seed.inactiveReason || null,
        seed.email,
        orgScopeIds[seed.orgScopeKey],
      ]
    )
    collaboratorIds[seed.key] = Number(result.insertId)
  }

  const managerMap: Record<string, string | null | undefined> = {
    johana: null,
    ...Object.fromEntries(collaboratorSeeds.map((seed) => [seed.key, seed.managerKey || null])),
  }

  for (const [key, collaboratorId] of Object.entries(collaboratorIds)) {
    const managerKey = managerMap[key]
    const managerId = managerKey ? collaboratorIds[managerKey] : null
    await conn.query('UPDATE collaborators SET managerId = ? WHERE id = ?', [managerId, collaboratorId])
  }

  return collaboratorIds
}

const insertRolesAndPermissions = async (conn: any, collaboratorIds: Record<string, number>) => {
  const roles = [
    { code: 'admin', name: 'Administrador', description: 'Acceso total de demo' },
    { code: 'director', name: 'Director', description: 'Gestion por area' },
    { code: 'leader', name: 'Leader', description: 'Seguimiento operativo' },
    { code: 'collaborator', name: 'Collaborator', description: 'Seguimiento individual' },
  ]
  const permissions = [
    { code: 'config.manage', description: 'Gestion de configuracion' },
    { code: 'integrations.manage', description: 'Gestion de integraciones' },
    { code: 'security.manage', description: 'Gestion de seguridad' },
    { code: 'scope.manage', description: 'Gestion de KPIs por scope' },
    { code: 'curation.review', description: 'Revision de curaduria' },
    { code: 'collaborators.manage', description: 'Gestion de colaboradores' },
  ]

  const roleIds: Record<string, number> = {}
  const permissionIds: Record<string, number> = {}

  for (const role of roles) {
    const [result] = await conn.query(
      'INSERT INTO roles (code, name, description, editable) VALUES (?, ?, ?, 1)',
      [role.code, role.name, role.description]
    )
    roleIds[role.code] = Number(result.insertId)
  }

  for (const permission of permissions) {
    const [result] = await conn.query(
      'INSERT INTO permissions (code, description) VALUES (?, ?)',
      [permission.code, permission.description]
    )
    permissionIds[permission.code] = Number(result.insertId)
  }

  const rolePermissionMap: Record<string, string[]> = {
    admin: Object.keys(permissionIds),
    director: ['scope.manage', 'curation.review', 'collaborators.manage'],
    leader: ['curation.review'],
    collaborator: [],
  }

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionMap)) {
    for (const permissionCode of permissionCodes) {
      await conn.query(
        'INSERT INTO role_permissions (roleId, permissionId) VALUES (?, ?)',
        [roleIds[roleCode], permissionIds[permissionCode]]
      )
    }
  }

  const collaboratorRoleMap: Record<string, string> = {
    johana: 'admin',
    pedro: 'leader',
    mauro: 'collaborator',
    alexis: 'director',
    ale: 'collaborator',
    andrea: 'leader',
    agustina: 'director',
    abel: 'collaborator',
    carolina: 'collaborator',
  }

  for (const [key, roleCode] of Object.entries(collaboratorRoleMap)) {
    await conn.query(
      'INSERT INTO collaborator_roles (collaboratorId, roleId) VALUES (?, ?)',
      [collaboratorIds[key], roleIds[roleCode]]
    )
  }

  await conn.query(
    'INSERT INTO collaborator_permissions (collaboratorId, permissionId) VALUES (?, ?), (?, ?)',
    [
      collaboratorIds.johana,
      permissionIds['integrations.manage'],
      collaboratorIds.johana,
      permissionIds['security.manage'],
    ]
  )
}

const insertPeriodAndSubperiods = async (conn: any, calendarProfileId: number) => {
  const [periodResult] = await conn.query(
    'INSERT INTO periods (name, startDate, endDate, status) VALUES (?, ?, ?, ?)',
    [DEMO_PERIOD_NAME, DEMO_PERIOD_START, DEMO_PERIOD_END, 'open']
  )
  const periodId = Number(periodResult.insertId)
  const subPeriodIds: Record<string, number> = {}

  for (const subPeriod of buildMonthlySubperiods()) {
    const [result] = await conn.query(
      `INSERT INTO calendar_subperiods
       (periodId, calendarProfileId, name, startDate, endDate, weight, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        periodId,
        calendarProfileId,
        subPeriod.name,
        subPeriod.startDate,
        subPeriod.endDate,
        subPeriod.weight,
        subPeriod.status,
      ]
    )
    subPeriodIds[subPeriod.key] = Number(result.insertId)
  }

  return { periodId, subPeriodIds }
}

const insertKpis = async (conn: any, periodId: number) => {
  const ids: Record<string, number> = {}
  for (const seed of kpiSeeds) {
    const [result] = await conn.query(
      `INSERT INTO kpis
       (name, description, type, criteria, formula, macroKPIId, defaultDataSource, defaultCriteriaTemplate, defaultCalcRule, direction)
       VALUES (?, ?, ?, NULL, ?, NULL, ?, NULL, NULL, ?)`,
      [
        seed.name,
        seed.description,
        seed.type,
        getDefaultFormula(seed.direction),
        seed.defaultDataSource || null,
        seed.direction,
      ]
    )
    const kpiId = Number(result.insertId)
    ids[seed.key] = kpiId
    for (const area of seed.areas) {
      await conn.query('INSERT INTO kpi_areas (kpiId, area) VALUES (?, ?)', [kpiId, area])
    }
    await conn.query('INSERT INTO kpi_periods (kpiId, periodId) VALUES (?, ?)', [kpiId, periodId])
  }
  return ids
}

const insertObjectives = async (conn: any, kpiIds: Record<string, number>) => {
  const objectiveIds: Record<string, number> = {}
  for (const objective of objectiveSeeds) {
    const parentId = objective.parentKey ? objectiveIds[objective.parentKey] : null
    const [result] = await conn.query(
      'INSERT INTO objective_trees (level, name, parentId) VALUES (?, ?, ?)',
      [objective.level, objective.name, parentId]
    )
    objectiveIds[objective.key] = Number(result.insertId)
  }

  for (const seed of kpiSeeds) {
    for (const treeKey of seed.treeKeys) {
      await conn.query(
        'INSERT INTO objective_trees_kpis (objectiveTreeId, kpiId) VALUES (?, ?)',
        [objectiveIds[treeKey], kpiIds[seed.key]]
      )
    }
  }

  return objectiveIds
}

const insertObjectiveScopeKpis = async (
  conn: any,
  objectiveIds: Record<string, number>,
  scopeKpiIds: Record<string, number>
) => {
  for (const seed of objectiveScopeLinkSeeds) {
    await conn.query(
      'INSERT INTO objective_trees_scope_kpis (objectiveTreeId, scopeKpiId) VALUES (?, ?)',
      [objectiveIds[seed.objectiveKey], scopeKpiIds[seed.scopeKpiKey]]
    )
  }
}

let collaboratorKpisHasPlanValue: boolean | null = null

const hasCollaboratorKpisPlanValue = async (conn: any) => {
  if (collaboratorKpisHasPlanValue !== null) {
    return collaboratorKpisHasPlanValue
  }

  const [rows] = await conn.query<any[]>(
    `SELECT COUNT(*) as count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'collaborator_kpis'
       AND column_name = 'planValue'`
  )
  collaboratorKpisHasPlanValue = Number(rows?.[0]?.count || 0) > 0
  return collaboratorKpisHasPlanValue
}

const createAssignment = async (
  conn: any,
  seed: AssignmentSeed,
  collaboratorIds: Record<string, number>,
  kpiIds: Record<string, number>,
  subPeriodIds: Record<string, number>,
  periodId: number,
  monthlyCalendarProfileId: number,
  createdBy: number
) => {
  const kpiSeed = kpiSeeds.find((item) => item.key === seed.kpiKey)
  if (!kpiSeed) throw new Error(`KPI no encontrado para seed ${seed.kpiKey}`)

  const actual = seed.actual ?? null
  const variation =
    actual == null ? null : round2(calculateVariation(kpiSeed.direction, seed.target, actual, getDefaultFormula(kpiSeed.direction)))
  const weightedResult = variation == null ? null : round2(calculateWeightedResult(variation, seed.weight))
  const includePlanValue = await hasCollaboratorKpisPlanValue(conn)

  const assignmentColumns = [
    'collaboratorId',
    'kpiId',
    'periodId',
    'calendarProfileId',
    'subPeriodId',
    'target',
    'actual',
    'weight',
    'variation',
    'weightedResult',
    'status',
    'comments',
    ...(includePlanValue ? ['planValue'] : []),
    'curationStatus',
    'dataSource',
    'sourceConfig',
    'curatorUserId',
    'activeCriteriaVersionId',
    'inputMode',
    'lastMeasurementId',
  ]

  const assignmentValues = [
    collaboratorIds[seed.collaboratorKey],
    kpiIds[seed.kpiKey],
    periodId,
    monthlyCalendarProfileId,
    subPeriodIds[seed.subPeriodKey],
    seed.target,
    actual,
    seed.weight,
    variation,
    weightedResult,
    seed.status,
    seed.comments || null,
    ...(includePlanValue ? [seed.target] : []),
    seed.curationStatus,
    seed.dataSource || null,
    asJson(seed.sourceConfig || null),
    createdBy,
    null,
    seed.inputMode || 'manual',
    null,
  ]

  const assignmentPlaceholders = assignmentColumns.map(() => '?').join(', ')

  const [assignmentResult] = await conn.query(
    `INSERT INTO collaborator_kpis
     (${assignmentColumns.join(', ')})
     VALUES (${assignmentPlaceholders})`,
    assignmentValues
  )

  const assignmentId = Number(assignmentResult.insertId)

  const [criteriaResult] = await conn.query(
    `INSERT INTO kpi_criteria_versions
     (assignmentId, dataSource, sourceConfig, criteriaText, evidenceUrl, status, createdBy, reviewedBy, comment, reviewedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      assignmentId,
      seed.dataSource || null,
      asJson(seed.sourceConfig || null),
      seed.criteriaText || null,
      seed.evidenceUrl || null,
      seed.criteriaStatus || 'approved',
      createdBy,
      seed.criteriaStatus === 'approved' ? createdBy : null,
      seed.status === 'proposed' ? 'Pendiente de curaduria' : 'Version activa de demo',
      seed.criteriaStatus === 'approved' ? '2026-03-15 10:00:00' : null,
    ]
  )

  const criteriaVersionId = Number(criteriaResult.insertId)
  let measurementId: number | null = null

  if (seed.measurementStatus && seed.actual != null) {
    const [measurementResult] = await conn.query(
      `INSERT INTO kpi_measurements
       (assignmentId, scopeKpiId, periodId, subPeriodId, value, mode, status, capturedBy, criteriaVersionId, reason, evidenceUrl, sourceRunId)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignmentId,
        periodId,
        subPeriodIds[seed.subPeriodKey],
        seed.actual,
        seed.measurementMode || 'manual',
        seed.measurementStatus,
        createdBy,
        criteriaVersionId,
        seed.reason || null,
        seed.evidenceUrl || null,
        seed.dataSource && seed.measurementMode === 'import' ? `seed-${seed.dataSource}-${assignmentId}` : null,
      ]
    )
    measurementId = Number(measurementResult.insertId)
  }

  await conn.query(
    'UPDATE collaborator_kpis SET activeCriteriaVersionId = ?, lastMeasurementId = ? WHERE id = ?',
    [criteriaVersionId, measurementId, assignmentId]
  )

  return { assignmentId, criteriaVersionId, measurementId }
}

const createScopeKpi = async (
  conn: any,
  seed: ScopeKpiSeed,
  scopeIds: Record<string, number>,
  kpiIds: Record<string, number>,
  subPeriodIds: Record<string, number>,
  periodId: number
) => {
  const kpiSeed = kpiSeeds.find((item) => item.key === seed.kpiKey)
  if (!kpiSeed) throw new Error(`KPI no encontrado para scope seed ${seed.kpiKey}`)

  const actual = seed.actual ?? null
  const directActual = seed.sourceMode === 'direct' ? actual : null
  const aggregatedActual = seed.sourceMode === 'aggregated' ? actual : null
  const variation =
    actual == null ? null : round2(calculateVariation(kpiSeed.direction, seed.target, actual, getDefaultFormula(kpiSeed.direction)))
  const weightedResult = variation == null ? null : round2(calculateWeightedResult(variation, seed.weight))

  const [result] = await conn.query(
    `INSERT INTO scope_kpis
     (name, description, kpiId, orgScopeId, periodId, subPeriodId, ownerLevel, sourceMode, mixedConfig, target, actual, directActual,
      aggregatedActual, weight, variation, weightedResult, status, inputMode, curationStatus, lastMeasurementId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      seed.name,
      seed.description,
      kpiIds[seed.kpiKey],
      scopeIds[seed.orgScopeKey],
      periodId,
      subPeriodIds[seed.subPeriodKey],
      seed.ownerLevel,
      seed.sourceMode,
      seed.mixedConfig ? JSON.stringify(seed.mixedConfig) : null,
      seed.target,
      actual,
      directActual,
      aggregatedActual,
      seed.weight,
      variation,
      weightedResult,
      seed.status || 'approved',
      seed.inputMode || 'manual',
      seed.curationStatus || 'approved',
    ]
  )
  return Number(result.insertId)
}

const insertScopeMeasurement = async (
  conn: any,
  scopeKpiId: number,
  periodId: number,
  subPeriodId: number,
  value: number,
  mode: 'manual' | 'import' | 'auto',
  capturedBy: number,
  sourceRunId?: string | null
) => {
  const [result] = await conn.query(
    `INSERT INTO kpi_measurements
     (assignmentId, scopeKpiId, periodId, subPeriodId, value, mode, status, capturedBy, criteriaVersionId, reason, evidenceUrl, sourceRunId)
     VALUES (NULL, ?, ?, ?, ?, ?, 'approved', ?, NULL, ?, NULL, ?)`,
    [scopeKpiId, periodId, subPeriodId, value, mode, capturedBy, 'Seed demo de scope KPI', sourceRunId || null]
  )
  return Number(result.insertId)
}

const computeWeightedAverage = (items: Array<{ value: number; weight: number }>) => {
  const totalWeight = items.reduce((acc, item) => acc + item.weight, 0)
  if (!totalWeight) return 0
  return round2(items.reduce((acc, item) => acc + item.value * item.weight, 0) / totalWeight)
}

const syncScopeActual = async (
  conn: any,
  scopeKpiId: number,
  kpiKey: string,
  target: number,
  weight: number,
  actual: number,
  periodId: number,
  subPeriodId: number,
  capturedBy: number,
  mode: 'manual' | 'import' | 'auto',
  sourceRunId?: string | null,
  component: 'direct' | 'aggregated' = 'direct'
) => {
  const kpiSeed = kpiSeeds.find((item) => item.key === kpiKey)
  if (!kpiSeed) throw new Error(`KPI no encontrado para scope sync ${kpiKey}`)
  const [scopeRows] = await conn.query(
    `SELECT sourceMode, actual, directActual, aggregatedActual, mixedConfig FROM scope_kpis WHERE id = ? LIMIT 1`,
    [scopeKpiId]
  )
  const scopeRow = Array.isArray(scopeRows) ? scopeRows[0] : scopeRows?.[0]
  const sourceMode = scopeRow?.sourceMode || 'direct'
  let directActual = scopeRow?.directActual ?? null
  let aggregatedActual = scopeRow?.aggregatedActual ?? null
  if (sourceMode === 'mixed') {
    if (component === 'aggregated') {
      aggregatedActual = actual
    } else {
      directActual = actual
    }
  } else if (sourceMode === 'aggregated') {
    aggregatedActual = actual
  } else {
    directActual = actual
  }
  const effectiveActual = computeScopeKpiActual({
    sourceMode,
    directActual,
    aggregatedActual,
    fallbackActual: scopeRow?.actual ?? null,
    mixedConfig: parseScopeKpiMixedConfig(scopeRow?.mixedConfig),
  })
  const variation =
    effectiveActual == null
      ? null
      : round2(calculateVariation(kpiSeed.direction, target, effectiveActual, getDefaultFormula(kpiSeed.direction)))
  const weightedResult = variation == null ? null : round2(calculateWeightedResult(variation, weight))
  const measurementId = await insertScopeMeasurement(conn, scopeKpiId, periodId, subPeriodId, actual, mode, capturedBy, sourceRunId)
  await conn.query(
    `UPDATE scope_kpis
     SET actual = ?, directActual = ?, aggregatedActual = ?, variation = ?, weightedResult = ?, lastMeasurementId = ?
     WHERE id = ?`,
    [effectiveActual, directActual, aggregatedActual, variation, weightedResult, measurementId, scopeKpiId]
  )
  return { measurementId, variation, weightedResult, actual: effectiveActual, directActual, aggregatedActual }
}

const seedDataSourceMappings = async (
  conn: any,
  collaboratorIds: Record<string, number>,
  orgScopeIds: Record<string, number>
) => {
  for (const mapping of mappingSeeds) {
    const entityId =
      mapping.entityType === 'collaborator'
        ? collaboratorIds[mapping.entityKey]
        : orgScopeIds[mapping.entityKey]

    await conn.query(
      `INSERT INTO data_source_mappings
       (sourceType, entityType, entityId, externalKey, normalizedKey, externalLabel, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        mapping.sourceType,
        mapping.entityType,
        entityId,
        mapping.externalKey,
        normalizeExternalKey(mapping.externalKey),
        mapping.externalLabel || null,
        asJson(mapping.metadata || null),
      ]
    )
  }
}

const seedIntegrationDemo = async (
  conn: any,
  collaboratorIds: Record<string, number>,
  orgScopeIds: Record<string, number>,
  assignmentIds: Record<string, number>,
  scopeKpiIds: Record<string, number>,
  periodId: number,
  subPeriodId: number
) => {
  const authConfig = {
    email: 'demo-qa@empresa.demo',
    apiToken: 'demo-token-not-real',
    note: 'Perfil de demo. No usar en produccion.',
  }
  const [authResult] = await conn.query(
    `INSERT INTO auth_profiles (name, connector, endpoint, authType, authConfig)
     VALUES (?, 'jira', ?, 'basic', ?)`,
    ['Jira Demo QA', 'https://demo.atlassian.net', JSON.stringify(authConfig)]
  )
  const authProfileId = Number(authResult.insertId)

  const params = {
    baseFilter:
      'project IN ("GT Business Team", "LID SQUAD", "Regimenes Especiales SQUAD", "Integraciones SQUAD", GT_MISIM)',
    issueTypes: ['Historia'],
    dateField: 'statusCategoryChangedDate',
    testerField: '"Tester[User Picker (single user)]"',
    users: ['712020:pedro-sirvent'],
    extraJqlA: 'AND statusCategory = Done',
    period: 'custom',
    from: '2026-03-01',
    to: '2026-04-01',
  }

  const [templateResult] = await conn.query(
    `INSERT INTO integration_templates
     (name, connector, queryTestsTemplate, queryStoriesTemplate, formulaTemplate, schedule, authProfileId, enabled, metricType, isSpecific, metricTypeUi)
     VALUES (?, 'jira', ?, ?, ?, ?, ?, 1, 'count', 0, 'count')`,
    [
      'historias acumuladas',
      '{baseFilter}\nAND issuetype IN ({issueTypes})\nAND statusCategory = Done\nAND {dateField} >= {from}\nAND {dateField} < {to}\nAND {testerField} IN ({users})',
      '',
      'COUNT',
      '0 9 * * 1-5',
      authProfileId,
    ]
  )
  const templateId = Number(templateResult.insertId)

  const [assignmentTargetResult] = await conn.query(
    `INSERT INTO integration_targets
     (templateId, scopeType, scopeId, orgScopeId, params, assignmentId, scopeKpiId, enabled)
     VALUES (?, 'area', ?, ?, ?, ?, NULL, 1)`,
    [templateId, 'QA', orgScopeIds.qa, JSON.stringify(params), assignmentIds['pedro:stories_delivered']]
  )
  const assignmentTargetId = Number(assignmentTargetResult.insertId)

  const [scopeTargetResult] = await conn.query(
    `INSERT INTO integration_targets
     (templateId, scopeType, scopeId, orgScopeId, params, assignmentId, scopeKpiId, enabled)
     VALUES (?, 'company', ?, ?, ?, NULL, ?, 1)`,
    [templateId, 'Company', orgScopeIds.company, JSON.stringify(params), scopeKpiIds.company_revenue]
  )
  const scopeTargetId = Number(scopeTargetResult.insertId)

  await conn.query(
    `INSERT INTO integration_template_runs
     (templateId, targetId, status, startedAt, finishedAt, triggeredBy, message, outputs, error, archived)
     VALUES (?, ?, 'success', ?, ?, ?, ?, ?, NULL, 0)`,
    [
      templateId,
      assignmentTargetId,
      '2026-03-15 09:10:00',
      '2026-03-15 09:10:14',
      collaboratorIds.johana,
      'Ejecucion seed demo para asignacion individual',
      JSON.stringify({
        metricType: 'count',
        metricTypeUi: 'count',
        testsTotal: 18,
        storiesTotal: 0,
        computed: 18,
        periodId,
        subPeriodId,
        assignmentId: assignmentIds['pedro:stories_delivered'],
        skipped: false,
        skipReason: null,
      }),
    ]
  )

  await conn.query(
    `INSERT INTO integration_template_runs
     (templateId, targetId, status, startedAt, finishedAt, triggeredBy, message, outputs, error, archived)
     VALUES (?, ?, 'success', ?, ?, ?, ?, ?, NULL, 0)`,
    [
      templateId,
      scopeTargetId,
      '2026-03-15 09:15:00',
      '2026-03-15 09:15:11',
      collaboratorIds.johana,
      'Ejecucion seed demo para scope KPI',
      JSON.stringify({
        metricType: 'count',
        metricTypeUi: 'count',
        testsTotal: 162000,
        storiesTotal: 0,
        computed: 162000,
        periodId,
        subPeriodId,
        scopeKpiId: scopeKpiIds.company_revenue,
        skipped: true,
        skipReason: 'El destino ya tiene medicion cargada',
      }),
    ]
  )
}

const run = async () => {
  const preservedCollaborator = await findPreservedCollaborator()
  if (!preservedCollaborator) {
    throw new Error('No se encontro ningun colaborador para preservar durante el seed demo.')
  }

  const conn = await pool.getConnection()
  try {
    console.log(`🧪 Iniciando reset demo. Se preserva usuario ${preservedCollaborator.name} (id=${preservedCollaborator.id}).`)
    await ensureConnectorEnums(conn)
    await clearDatabaseKeepingJohana(conn, Number(preservedCollaborator.id))

    const [monthlyProfileResult] = await conn.query(
      'INSERT INTO calendar_profiles (name, description, frequency, active) VALUES (?, ?, ?, 1)',
      [DEMO_CALENDAR_NAME, 'Calendario mensual para dataset demo', 'monthly']
    )
    const monthlyCalendarProfileId = Number(monthlyProfileResult.insertId)

    const [quarterlyProfileResult] = await conn.query(
      'INSERT INTO calendar_profiles (name, description, frequency, active) VALUES (?, ?, ?, 1)',
      [DEMO_QUARTERLY_CALENDAR_NAME, 'Calendario trimestral para areas ejecutivas', 'quarterly']
    )
    const quarterlyCalendarProfileId = Number(quarterlyProfileResult.insertId)

    await insertAreaTree(conn)
    const orgScopeIds = await insertOrgScopes(conn, monthlyCalendarProfileId)
    await conn.query('UPDATE org_scopes SET calendarProfileId = ? WHERE id = ?', [quarterlyCalendarProfileId, orgScopeIds.company])

    const collaboratorIds = await insertCollaborators(conn, Number(preservedCollaborator.id), orgScopeIds)
    await insertRolesAndPermissions(conn, collaboratorIds)

    const { periodId, subPeriodIds } = await insertPeriodAndSubperiods(conn, monthlyCalendarProfileId)
    const kpiIds = await insertKpis(conn, periodId)
    const objectiveIds = await insertObjectives(conn, kpiIds)

    const assignmentIds: Record<string, number> = {}
    for (const seed of assignmentSeeds) {
      const { assignmentId } = await createAssignment(
        conn,
        seed,
        collaboratorIds,
        kpiIds,
        subPeriodIds,
        periodId,
        monthlyCalendarProfileId,
        collaboratorIds.johana
      )
      assignmentIds[`${seed.collaboratorKey}:${seed.kpiKey}`] = assignmentId
      if (seed.status === 'approved') {
        await conn.query(
          `INSERT INTO collaborator_kpi_plan
           (collaboratorId, kpiId, periodId, subPeriodId, target, weightOverride, source)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            collaboratorIds[seed.collaboratorKey],
            kpiIds[seed.kpiKey],
            periodId,
            subPeriodIds[seed.subPeriodKey],
            seed.target,
            seed.weight,
            'seed-demo',
          ]
        )
      }
    }

    const scopeKpiIds: Record<string, number> = {}
    for (const seed of scopeKpiSeeds) {
      scopeKpiIds[seed.key] = await createScopeKpi(conn, seed, orgScopeIds, kpiIds, subPeriodIds, periodId)
    }

    await insertObjectiveScopeKpis(conn, objectiveIds, scopeKpiIds)

    await conn.query(
      `INSERT INTO scope_kpi_links
       (scopeKpiId, childType, collaboratorAssignmentId, childScopeKpiId, contributionWeight, aggregationMethod, formulaConfig, sortOrder)
       VALUES (?, 'collaborator', ?, NULL, ?, 'weighted_avg', NULL, 0),
              (?, 'collaborator', ?, NULL, ?, 'weighted_avg', NULL, 1)`,
      [scopeKpiIds.qa_performance, assignmentIds['pedro:performance_score'], 55, scopeKpiIds.qa_performance, assignmentIds['mauro:performance_score'], 45]
    )

    const qaActual = computeWeightedAverage([
      { value: 84, weight: 55 },
      { value: 78, weight: 45 },
    ])
    const qaSync = await syncScopeActual(
      conn,
      scopeKpiIds.qa_performance,
      'performance_score',
      100,
      20,
      qaActual,
      periodId,
      subPeriodIds.marzo_2026,
      collaboratorIds.johana,
      'auto',
      'seed-aggregation-qa'
    )

    await conn.query(
      `INSERT INTO scope_kpi_aggregation_runs
       (scopeKpiId, periodId, subPeriodId, status, inputsSnapshot, resultValue, message, createdBy)
       VALUES (?, ?, ?, 'success', ?, ?, ?, ?)`,
      [
        scopeKpiIds.qa_performance,
        periodId,
        subPeriodIds.marzo_2026,
        JSON.stringify({
          children: [
            { assignmentId: assignmentIds['pedro:performance_score'], value: 84, weight: 55 },
            { assignmentId: assignmentIds['mauro:performance_score'], value: 78, weight: 45 },
          ],
        }),
        qaActual,
        'Seed demo collaborator -> scope',
        collaboratorIds.johana,
      ]
    )

    const directScopeSeeds = scopeKpiSeeds.filter((seed) =>
      ['revenue_performance', 'cs_performance', 'time_to_hire_scope', 'company_revenue'].includes(seed.key)
    )
    for (const seed of directScopeSeeds) {
      await syncScopeActual(
        conn,
        scopeKpiIds[seed.key],
        seed.kpiKey,
        seed.target,
        seed.weight,
        seed.actual || 0,
        periodId,
        subPeriodIds[seed.subPeriodKey],
        collaboratorIds.johana,
        seed.inputMode || 'manual',
        `seed-${seed.key}`
      )
    }

    await conn.query(
      `INSERT INTO scope_kpi_links
       (scopeKpiId, childType, collaboratorAssignmentId, childScopeKpiId, contributionWeight, aggregationMethod, formulaConfig, sortOrder)
       VALUES (?, 'scope', NULL, ?, ?, 'weighted_avg', NULL, 0),
              (?, 'scope', NULL, ?, ?, 'weighted_avg', NULL, 1),
              (?, 'scope', NULL, ?, ?, 'weighted_avg', NULL, 2)`,
      [
        scopeKpiIds.company_performance,
        scopeKpiIds.qa_performance,
        30,
        scopeKpiIds.company_performance,
        scopeKpiIds.revenue_performance,
        40,
        scopeKpiIds.company_performance,
        scopeKpiIds.cs_performance,
        30,
      ]
    )

    const companyActual = computeWeightedAverage([
      { value: qaActual, weight: 30 },
      { value: 87, weight: 40 },
      { value: 91, weight: 30 },
    ])
    await syncScopeActual(
      conn,
      scopeKpiIds.company_performance,
      'performance_score',
      100,
      30,
      companyActual,
      periodId,
      subPeriodIds.marzo_2026,
      collaboratorIds.johana,
      'auto',
      'seed-aggregation-company'
    )

    await conn.query(
      `INSERT INTO scope_kpi_aggregation_runs
       (scopeKpiId, periodId, subPeriodId, status, inputsSnapshot, resultValue, message, createdBy)
       VALUES (?, ?, ?, 'success', ?, ?, ?, ?)`,
      [
        scopeKpiIds.company_performance,
        periodId,
        subPeriodIds.marzo_2026,
        JSON.stringify({
          children: [
            { scopeKpiId: scopeKpiIds.qa_performance, value: qaActual, weight: 30 },
            { scopeKpiId: scopeKpiIds.revenue_performance, value: 87, weight: 40 },
            { scopeKpiId: scopeKpiIds.cs_performance, value: 91, weight: 30 },
          ],
        }),
        companyActual,
        'Seed demo scope -> scope',
        collaboratorIds.johana,
      ]
    )

    await syncScopeActual(
      conn,
      scopeKpiIds.executive_company_mix,
      'executive_mix_score',
      100,
      25,
      92,
      periodId,
      subPeriodIds.marzo_2026,
      collaboratorIds.johana,
      'manual',
      'seed-direct-executive',
      'direct'
    )

    await conn.query(
      `INSERT INTO scope_kpi_links
       (scopeKpiId, childType, collaboratorAssignmentId, childScopeKpiId, contributionWeight, aggregationMethod, formulaConfig, sortOrder)
       VALUES (?, 'scope', NULL, ?, ?, 'weighted_avg', NULL, 0)`,
      [scopeKpiIds.executive_company_mix, scopeKpiIds.company_performance, 100]
    )

    const executiveSync = await syncScopeActual(
      conn,
      scopeKpiIds.executive_company_mix,
      'executive_mix_score',
      100,
      25,
      companyActual,
      periodId,
      subPeriodIds.marzo_2026,
      collaboratorIds.johana,
      'auto',
      'seed-aggregation-executive',
      'aggregated'
    )

    await conn.query(
      `INSERT INTO scope_kpi_aggregation_runs
       (scopeKpiId, periodId, subPeriodId, status, inputsSnapshot, resultValue, message, createdBy)
       VALUES (?, ?, ?, 'success', ?, ?, ?, ?)`,
      [
        scopeKpiIds.executive_company_mix,
        periodId,
        subPeriodIds.marzo_2026,
        JSON.stringify({
          sourceMode: 'mixed',
          directActual: 92,
          aggregatedActual: companyActual,
          finalActual: executiveSync.actual,
          children: [{ scopeKpiId: scopeKpiIds.company_performance, value: companyActual, weight: 100 }],
        }),
        companyActual,
        'Seed demo mixed direct + aggregated',
        collaboratorIds.johana,
      ]
    )

    await conn.query(
      `INSERT INTO kpi_scope_weights (kpiId, scopeId, weight) VALUES
       (?, ?, 20), (?, ?, 25), (?, ?, 20), (?, ?, 30), (?, ?, 35), (?, ?, 25)`,
      [
        kpiIds.performance_score,
        orgScopeIds.qa,
        kpiIds.performance_score,
        orgScopeIds.revenue,
        kpiIds.performance_score,
        orgScopeIds.customer_success,
        kpiIds.performance_score,
        orgScopeIds.company,
        kpiIds.revenue,
        orgScopeIds.company,
        kpiIds.executive_mix_score,
        orgScopeIds.company,
      ]
    )

    await seedDataSourceMappings(conn, collaboratorIds, orgScopeIds)
    await seedIntegrationDemo(conn, collaboratorIds, orgScopeIds, assignmentIds, scopeKpiIds, periodId, subPeriodIds.marzo_2026)

    console.log('✅ Dataset demo generado correctamente.')
    console.log(
      JSON.stringify(
        {
          collaborators: Object.keys(collaboratorIds).length,
          kpis: Object.keys(kpiIds).length,
          collaboratorAssignments: Object.keys(assignmentIds).length,
          scopeKpis: Object.keys(scopeKpiIds).length,
          objectiveTrees: objectiveSeeds.length,
          periodId,
          subPeriodId: subPeriodIds.marzo_2026,
          sampleScopeKpiId: scopeKpiIds.company_performance,
          sampleMixedScopeKpiId: scopeKpiIds.executive_company_mix,
        },
        null,
        2
      )
    )
  } finally {
    conn.release()
    await pool.end()
  }
}

run()
  .catch((error) => {
    console.error('❌ Error generando dataset demo:', error)
    process.exit(1)
  })
