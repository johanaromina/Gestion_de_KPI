// Tipos compartidos para la aplicación

export interface Collaborator {
  id: number
  name: string
  position: string
  area: string
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
  name: string
  startDate: string
  endDate: string
  status?: 'open' | 'closed'
  weight?: number
}

export type KPIType = 'growth' | 'reduction' | 'exact'

export interface KPI {
  id: number
  name: string
  description: string
  type: KPIType
  criteria: string
  formula?: string
  defaultDataSource?: string
  defaultCriteriaTemplate?: string
  defaultCalcRule?: string
  macroKPIId?: number
  areas?: string[]
  periodIds?: number[]
}

export interface CollaboratorKPI {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
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
}

export interface ObjectiveTree {
  id: number
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentId?: number
  kpis: KPI[]
}
