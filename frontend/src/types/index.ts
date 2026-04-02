// Tipos compartidos para la aplicación

export interface Collaborator {
  id: number
  name: string
  position: string
  area: string
  orgScopeId?: number | null
  calendarProfileId?: number | null
  email?: string | null
  mfaEnabled?: boolean
  managerId?: number
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
  status?: 'active' | 'inactive'
  inactiveReason?: string | null
  inactiveAt?: string | null
}

export interface Area {
  id: number
  name: string
  parentId?: number | null
  createdAt?: string
  updatedAt?: string
}

export interface OrgScope {
  id: number
  name: string
  type: 'company' | 'area' | 'team' | 'person' | 'business_unit' | 'product'
  parentId?: number | null
  calendarProfileId?: number | null
  active?: boolean
  metadata?: any
}

export interface DataSourceMapping {
  id: number
  sourceType: string
  entityType: 'collaborator' | 'org_scope'
  entityId: number
  externalKey: string
  normalizedKey?: string
  externalLabel?: string | null
  metadata?: any
  createdAt?: string
  updatedAt?: string
}

export interface Period {
  id: number
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'in_review' | 'closed'
}

export interface SubPeriod {
  id: number
  periodId: number
  calendarProfileId?: number | null
  name: string
  startDate: string
  endDate: string
  status?: 'open' | 'closed'
  weight?: number
}

export type KPIType = 'manual' | 'count' | 'ratio' | 'sla' | 'value'
export type KPIDirection = 'growth' | 'reduction' | 'exact'

export interface KPI {
  id: number
  name: string
  description: string
  type: KPIType
  direction?: KPIDirection
  criteria: string
  formula?: string
  defaultDataSource?: string
  defaultCriteriaTemplate?: string
  defaultCalcRule?: string
  macroKPIId?: number
  areas?: string[]
  periodIds?: number[]
  scopeWeights?: Array<{ scopeId: number; weight: number }>
}

export interface CollaboratorKPI {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  calendarProfileId?: number | null
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
  subPeriodWeight?: number | null
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  dataSource?: string
  dataSourceName?: string
  sourceConfig?: string
  criteriaText?: string
  criteriaVersion?: string
  criteriaUpdatedAt?: string
  criteriaUpdatedBy?: string
  inputMode?: 'manual' | 'import' | 'auto'
  lastMeasurementAt?: string
  lastMeasurementBy?: string
  kpiType?: string
  kpiDirection?: KPIDirection
  assignmentDirection?: KPIDirection
  collaboratorName?: string
  kpiName?: string
  periodName?: string
  periodStatus?: 'open' | 'in_review' | 'closed'
  subPeriodName?: string
}

export interface ScopeKPI {
  id: number
  name: string
  description?: string | null
  kpiId: number
  orgScopeId: number
  periodId: number
  subPeriodId?: number | null
  ownerLevel: 'team' | 'area' | 'business_unit' | 'company' | 'executive'
  sourceMode: 'direct' | 'aggregated' | 'mixed'
  target: number
  actual?: number | null
  directActual?: number | null
  aggregatedActual?: number | null
  mixedConfig?: {
    directWeight: number
    aggregatedWeight: number
    directLabel?: string | null
    aggregatedLabel?: string | null
  } | null
  weight: number
  variation?: number | null
  weightedResult?: number | null
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  inputMode?: 'manual' | 'import' | 'auto'
  orgScopeName?: string
  orgScopeType?: string
  kpiName?: string
  periodName?: string
  periodStatus?: 'open' | 'in_review' | 'closed'
  subPeriodName?: string
  objectiveIds?: number[]
  objectiveNames?: string[]
  objectives?: ObjectiveTree[]
}

export interface ScopeKPILink {
  id: number
  scopeKpiId: number
  childType: 'collaborator' | 'scope'
  collaboratorAssignmentId?: number | null
  childScopeKpiId?: number | null
  contributionWeight?: number | null
  aggregationMethod: 'sum' | 'avg' | 'weighted_avg'
  formulaConfig?: any
  sortOrder?: number | null
  collaboratorName?: string
  collaboratorKpiName?: string
  childScopeKpiName?: string
}

export type MacroKPI = ScopeKPI
export type MacroKPILink = ScopeKPILink

export interface ObjectiveTree {
  id: number
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentId?: number
  kpis: KPI[]
  scopeKpis?: ScopeKPI[]
}

export interface CalendarProfile {
  id: number
  name: string
  description?: string | null
  frequency: 'monthly' | 'quarterly' | 'custom'
  active: boolean
}
