export type TemplateMetricType = 'count' | 'ratio' | 'sla' | 'value' | 'value_agg' | 'manual'

export type TemplatePreset =
  | 'count'
  | 'ratio'
  | 'sla'
  | 'sheets_value'
  | 'sheets_agg'
  | 'sheets_grid'
  | 'sheets_grid_agg'
  | 'api_value'
  | 'api_agg'
  | 'looker_value'
  | 'looker_agg'
  | 'manual'

export type TemplateFormState = {
  name: string
  connector: string
  metricType: TemplateMetricType
  queryTestsTemplate: string
  queryStoriesTemplate: string
  formulaTemplate: string
  schedule: string
  authProfileId: string
  enabled: boolean
}

export const metricTypeToBackend = (metricType: string): 'count' | 'ratio' => {
  if (metricType === 'ratio' || metricType === 'sla') return 'ratio'
  return 'count'
}

export const metricTypeLabel = (metricType?: string) => {
  switch (metricType) {
    case 'count':
      return 'COUNT'
    case 'ratio':
      return 'RATIO'
    case 'sla':
      return 'SLA'
    case 'value':
      return 'VALUE'
    case 'value_agg':
      return 'VALUE_AGG'
    case 'manual':
      return 'MANUAL'
    default:
      return metricType === 'count' ? 'COUNT' : 'RATIO'
  }
}

export const buildTemplatePreset = (preset: TemplatePreset, authProfileId: string): TemplateFormState => {
  if (preset === 'count') {
    return {
      name: 'Jira – COUNT (Generic)',
      connector: 'jira',
      metricType: 'count',
      queryTestsTemplate:
        'project IN ({projects})\nAND issuetype IN ({issueTypesA})\nAND {dateFieldA} >= {from}\nAND {dateFieldA} < {to}\n{extraJqlA}',
      queryStoriesTemplate: '',
      formulaTemplate: 'A',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'ratio') {
    return {
      name: 'Jira – RATIO A/B (Generic)',
      connector: 'jira',
      metricType: 'ratio',
      queryTestsTemplate:
        'project IN ({projects})\nAND issuetype IN ({issueTypesA})\nAND {dateFieldA} >= {from}\nAND {dateFieldA} < {to}\n{extraJqlA}',
      queryStoriesTemplate:
        'project IN ({projects})\nAND issuetype IN ({issueTypesB})\nAND {dateFieldB} >= {from}\nAND {dateFieldB} < {to}\n{extraJqlB}',
      formulaTemplate: 'A / B',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'sla') {
    return {
      name: 'Jira – SLA (On-time / Total)',
      connector: 'jira',
      metricType: 'sla',
      queryTestsTemplate:
        'project IN ({projects})\nAND issuetype IN ({issueTypesA})\nAND statusCategory = Done\nAND {dateFieldEnd} >= {from}\nAND {dateFieldEnd} < {to}\nAND {dateFieldEnd} <= {dateFieldLimit}\n{extraJqlA}',
      queryStoriesTemplate:
        'project IN ({projects})\nAND issuetype IN ({issueTypesB})\nAND statusCategory = Done\nAND {dateFieldEnd} >= {from}\nAND {dateFieldEnd} < {to}\n{extraJqlB}',
      formulaTemplate: 'A / B',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'sheets_value') {
    return {
      name: 'Sheets – VALUE (Direct)',
      connector: 'sheets',
      metricType: 'value',
      queryTestsTemplate:
        'sheetKey={sheetKey}\n tab={tab}\n periodColumn={periodColumn}\n areaColumn={areaColumn}\n kpiColumn={kpiColumn}\n valueColumn={valueColumn}',
      queryStoriesTemplate: '',
      formulaTemplate: 'VALUE',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'sheets_agg') {
    return {
      name: 'Sheets – AGG (SUM/AVG)',
      connector: 'sheets',
      metricType: 'value_agg',
      queryTestsTemplate:
        'sheetKey={sheetKey}\n tab={tab}\n aggregation={SUM|AVG}\n periodColumn={periodColumn}\n areaColumn={areaColumn}\n kpiColumn={kpiColumn}\n valueColumn={valueColumn}',
      queryStoriesTemplate: '',
      formulaTemplate: 'AGG',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'sheets_grid') {
    return {
      name: 'Sheets – Grid by Leader/Collaborator',
      connector: 'sheets',
      metricType: 'value',
      queryTestsTemplate:
        'sheetKey={sheetKey}\n range={range}\n areaColumn={areaColumn}\n collaboratorColumn={collaboratorColumn}\n kpiColumn={kpiColumn}',
      queryStoriesTemplate: '',
      formulaTemplate: 'VALUE',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'sheets_grid_agg') {
    return {
      name: 'Sheets – Grid AGG by Leader/Collaborator',
      connector: 'sheets',
      metricType: 'value_agg',
      queryTestsTemplate:
        'sheetKey={sheetKey}\n range={range}\n areaColumn={areaColumn}\n collaboratorColumn={collaboratorColumn}\n kpiColumn={kpiColumn}\n aggregation={SUM|AVG}',
      queryStoriesTemplate: '',
      formulaTemplate: 'AGG',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'api_value') {
    return {
      name: 'API – VALUE (Direct)',
      connector: 'generic_api',
      metricType: 'value',
      queryTestsTemplate: 'path={path}\nmethod={method}\nresultPath={resultPath}\nvaluePath={valuePath}',
      queryStoriesTemplate: '',
      formulaTemplate: 'VALUE',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'api_agg') {
    return {
      name: 'API – AGG (SUM/AVG/COUNT)',
      connector: 'generic_api',
      metricType: 'value_agg',
      queryTestsTemplate:
        'path={path}\nmethod={method}\nresultPath={resultPath}\nvaluePath={valuePath}\naggregation={aggregation}',
      queryStoriesTemplate: '',
      formulaTemplate: 'AGG',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'looker_value') {
    return {
      name: 'Looker – VALUE (query/look/dashboard)',
      connector: 'looker',
      metricType: 'value',
      queryTestsTemplate:
        'resourceType={resourceType}\nresourceId={resourceId}\nresultFormat={resultFormat}\nresultPath={resultPath}\nvaluePath={valuePath}',
      queryStoriesTemplate: '',
      formulaTemplate: 'VALUE',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  if (preset === 'looker_agg') {
    return {
      name: 'Looker – AGG (query/look/dashboard)',
      connector: 'looker',
      metricType: 'value_agg',
      queryTestsTemplate:
        'resourceType={resourceType}\nresourceId={resourceId}\nresultFormat={resultFormat}\nresultPath={resultPath}\nvaluePath={valuePath}\naggregation={aggregation}',
      queryStoriesTemplate: '',
      formulaTemplate: 'AGG',
      schedule: '',
      authProfileId,
      enabled: true,
    }
  }
  return {
    name: 'Manual / CSV – Measurement',
    connector: 'manual',
    metricType: 'manual',
    queryTestsTemplate: 'manual',
    queryStoriesTemplate: '',
    formulaTemplate: 'VALUE',
    schedule: '',
    authProfileId: '',
    enabled: true,
  }
}

export const getAuthProfileHint = (connector: string) => {
  if (connector === 'jira' || connector === 'xray') {
    return 'Jira/Xray: usa email + API token (Basic) o Bearer token.'
  }
  if (connector === 'sheets') {
    return 'Google Sheets: soporta hojas por lider con KPI/Area/Colaborador y meses en columnas. Si la planilla es publica, podes dejar sin auth o usar API Key.'
  }
  if (connector === 'generic_api') {
    return 'Generic API: usa endpoint base + Bearer, API Key, Basic o sin auth, segun la fuente.'
  }
  if (connector === 'looker') {
    return 'Looker: usa endpoint base de la instancia y auth por token o clientId/clientSecret.'
  }
  if (connector === 'manual') {
    return 'Manual/CSV no requiere auth profile.'
  }
  return ''
}
