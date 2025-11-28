// Constantes del backend

export const ROLES = {
  ADMIN: 'admin',
  DIRECTOR: 'director',
  MANAGER: 'manager',
  LEADER: 'leader',
  COLLABORATOR: 'collaborator',
} as const

export const PERIOD_STATUS = {
  OPEN: 'open',
  IN_REVIEW: 'in_review',
  CLOSED: 'closed',
} as const

export const KPI_STATUS = {
  DRAFT: 'draft',
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  CLOSED: 'closed',
} as const

export const KPI_TYPES = {
  GROWTH: 'growth',
  REDUCTION: 'reduction',
  EXACT: 'exact',
} as const

export const OBJECTIVE_LEVELS = {
  COMPANY: 'company',
  DIRECTION: 'direction',
  MANAGEMENT: 'management',
  LEADERSHIP: 'leadership',
  INDIVIDUAL: 'individual',
} as const

