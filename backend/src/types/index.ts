// Tipos compartidos para el backend

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
  hasSuperpowers?: boolean
  permissions?: string[]
  status?: 'active' | 'inactive'
  inactiveReason?: string | null
  inactiveAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export interface Period {
  id: number
  name: string
  startDate: Date
  endDate: Date
  status: 'open' | 'in_review' | 'closed'
  createdAt?: Date
  updatedAt?: Date
}

export interface SubPeriod {
  id: number
  periodId: number
  calendarProfileId?: number | null
  name: string
  startDate: Date
  endDate: Date
  status?: 'open' | 'closed'
  weight?: number
  createdAt?: Date
  updatedAt?: Date
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
  defaultDataSource?: string | null
  defaultCriteriaTemplate?: string | null
  defaultCalcRule?: string | null
  macroKPIId?: number
  areas?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export type ScopeKPIOwnerLevel = 'team' | 'area' | 'business_unit' | 'company' | 'executive'
export type ScopeKPISourceMode = 'direct' | 'aggregated' | 'mixed'
export type ScopeKPIChildType = 'collaborator' | 'scope'
export type ScopeKPIAggregationMethod =
  | 'sum'
  | 'avg'
  | 'weighted_avg'
  | 'ratio'
  | 'formula'
  | 'min'
  | 'max'

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
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  dataSource?: string | null
  sourceConfig?: string | null
  curatorUserId?: number | null
  activeCriteriaVersionId?: number | null
  inputMode?: 'manual' | 'import' | 'auto'
  lastMeasurementId?: number | null
  createdAt?: Date
  updatedAt?: Date
}

export interface KPICriteriaVersion {
  id: number
  assignmentId: number
  dataSource?: string | null
  sourceConfig?: string | null
  criteriaText?: string | null
  evidenceUrl?: string | null
  status: 'pending' | 'in_review' | 'approved' | 'rejected'
  createdBy?: number | null
  reviewedBy?: number | null
  comment?: string | null
  createdAt?: Date
  reviewedAt?: Date | null
}

export interface KPIMeasurement {
  id: number
  assignmentId?: number | null
  scopeKpiId?: number | null
  periodId?: number | null
  subPeriodId?: number | null
  value: number
  mode: 'manual' | 'import' | 'auto'
  status: 'draft' | 'proposed' | 'approved' | 'rejected'
  capturedBy?: number | null
  capturedAt?: Date
  criteriaVersionId?: number | null
  reason?: string | null
  evidenceUrl?: string | null
  sourceRunId?: string | null
}

export interface ScopeKPI {
  id: number
  name: string
  description?: string | null
  kpiId: number
  orgScopeId: number
  periodId: number
  subPeriodId?: number | null
  ownerLevel: ScopeKPIOwnerLevel
  sourceMode: ScopeKPISourceMode
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
  inputMode?: 'manual' | 'import' | 'auto'
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  lastMeasurementId?: number | null
  createdAt?: Date
  updatedAt?: Date
  objectiveIds?: number[]
  objectiveNames?: string[]
}

export interface ScopeKPILink {
  id: number
  scopeKpiId: number
  childType: ScopeKPIChildType
  collaboratorAssignmentId?: number | null
  childScopeKpiId?: number | null
  contributionWeight?: number | null
  aggregationMethod: ScopeKPIAggregationMethod
  formulaConfig?: string | null
  sortOrder?: number | null
  createdAt?: Date
}

export interface CollaboratorKPIPlan {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId: number
  target: number
  weightOverride?: number | null
  source?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface ObjectiveTree {
  id: number
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentId?: number
  kpis?: KPI[]
  scopeKpis?: ScopeKPI[]
}

export interface Area {
  id: number
  name: string
  parentId?: number | null
  createdAt?: Date
  updatedAt?: Date
}

export interface CalendarProfile {
  id: number
  name: string
  description?: string | null
  frequency: 'monthly' | 'quarterly' | 'custom'
  active: boolean
  createdAt?: Date
  updatedAt?: Date
}

// ============================================================
// OKR Types
// ============================================================

export type OKRObjectiveStatus = 'draft' | 'active' | 'closed'
export type OKRKeyResultType = 'simple' | 'kpi_linked'
export type OKRKeyResultStatus = 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'completed'

export interface OKRObjective {
  id: number
  title: string
  description?: string | null
  parentId?: number | null
  orgScopeId?: number | null
  periodId: number
  ownerId: number
  status: OKRObjectiveStatus
  progress: number
  createdAt?: Date
  updatedAt?: Date
  // Enriched fields
  ownerName?: string
  orgScopeName?: string
  periodName?: string
  keyResults?: OKRKeyResult[]
  children?: OKRObjective[]
}

export interface OKRKeyResult {
  id: number
  objectiveId: number
  title: string
  description?: string | null
  krType: OKRKeyResultType
  // Simple type
  startValue?: number | null
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  // KPI-linked type
  collaboratorKpiId?: number | null
  scopeKpiId?: number | null
  // Common
  weight: number
  ownerId?: number | null
  status: OKRKeyResultStatus
  sortOrder: number
  createdAt?: Date
  updatedAt?: Date
  // Enriched fields
  ownerName?: string
  progressPercent?: number
  // KPI linked enrichment
  kpiName?: string
  kpiActual?: number | null
  kpiTarget?: number | null
}

export interface OKRCheckIn {
  id: number
  keyResultId: number
  value: number
  note?: string | null
  authorId: number
  createdAt?: Date
  // Enriched
  authorName?: string
}
