export type AuthProfileRow = {
  id: number
  name: string
  connector: string
  endpoint?: string | null
  authType?: string | null
  authConfig?: string | null
}

export type TemplateRow = {
  id: number
  name: string
  connector: string
  metricType?: 'count' | 'ratio' | null
  metricTypeUi?: string | null
  queryTestsTemplate?: string | null
  queryStoriesTemplate?: string | null
  formulaTemplate?: string | null
  authProfileId?: number | null
  schedule?: string | null
  isSpecific?: number | null
  enabled?: number | null
}

export type TargetRow = {
  id: number
  templateId: number
  scopeType: string
  scopeId: string
  params?: string | null
  assignmentId?: number | null
  scopeKpiId?: number | null
  macroKpiId?: number | null
  orgScopeId?: number | null
  enabled?: number | null
}

export type ConnectorAdapterContext = {
  template: TemplateRow
  target: TargetRow
  authProfile: AuthProfileRow | null
  authConfig: any
  params: Record<string, any>
}

export type ConnectorAdapterResult = {
  computed: number
  measurements?: Array<{
    assignmentId?: number | null
    scopeKpiId?: number | null
    value: number
    externalKey?: string | null
    raw?: any
  }>
  outputs?: {
    testsTotal?: number
    storiesTotal?: number
    testsJql?: string
    storiesJql?: string
    formula?: string
    sheetMeta?: any
    sourceMeta?: any
  }
}

export interface ConnectorAdapter {
  supportedConnectors: string[]
  run(context: ConnectorAdapterContext): Promise<ConnectorAdapterResult>
}
