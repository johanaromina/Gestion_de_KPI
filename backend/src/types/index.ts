// Tipos compartidos para el backend

export interface Collaborator {
  id: number
  name: string
  position: string
  area: string
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
  name: string
  startDate: Date
  endDate: Date
  status?: 'open' | 'closed'
  weight?: number
  createdAt?: Date
  updatedAt?: Date
}

export type KPIType = 'growth' | 'reduction' | 'exact'

export interface KPI {
  id: number
  name: string
  description: string
  type: KPIType
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
  assignmentId: number
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

export interface CollaboratorKPIPlan {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId: number
  target: number
  weight: number
  source?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface ObjectiveTree {
  id: number
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentId?: number
}

export interface Area {
  id: number
  name: string
  parentId?: number | null
  createdAt?: Date
  updatedAt?: Date
}
