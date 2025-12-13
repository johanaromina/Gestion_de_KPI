// Tipos compartidos para la aplicación

export interface Collaborator {
  id: number
  name: string
  position: string
  area: string
  managerId?: number
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
  status?: 'active' | 'inactive'
  inactiveReason?: string | null
  inactiveAt?: string | null
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
  macroKPIId?: number
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
}

export interface ObjectiveTree {
  id: number
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentId?: number
  kpis: KPI[]
}
