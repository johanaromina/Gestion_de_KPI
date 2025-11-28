// Tipos compartidos para el backend

export interface Collaborator {
  id: number
  name: string
  position: string
  area: string
  managerId?: number
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
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
  macroKPIId?: number
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
  createdAt?: Date
  updatedAt?: Date
}

export interface ObjectiveTree {
  id: number
  level: 'company' | 'direction' | 'management' | 'leadership' | 'individual'
  name: string
  parentId?: number
}

