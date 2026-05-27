import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
/* eslint-disable @typescript-eslint/no-explicit-any */
import './ConsistencyAlerts.css'

interface ConsistencyAlertsProps {
  collaboratorId: number
  periodId: number
}

interface ValidationIssue {
  type: string
  severity: 'error' | 'warning' | 'info'
  message: string
  details?: any
}

interface ValidationResponse {
  valid: boolean
  issues: ValidationIssue[]
  summary: {
    total: number
    errors: number
    warnings: number
    info: number
  }
}

export default function ConsistencyAlerts({
  collaboratorId,
  periodId,
}: ConsistencyAlertsProps) {
  const { t } = useTranslation('assignments')
  const { data: validation, isLoading } = useQuery<ValidationResponse>(
    ['validation', collaboratorId, periodId],
    async () => {
      const response = await api.get('/validation/consistency', {
        params: { collaboratorId, periodId },
      })
      return response.data
    },
    {
      enabled: !!collaboratorId && !!periodId,
      retry: false,
    }
  )

  if (isLoading || !validation || validation.issues.length === 0) {
    return null
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return '📋'
    }
  }

  const getSeverityClass = (severity: string) => {
    return `alert-${severity}`
  }

  const getIssueMessage = (issue: ValidationIssue) => {
    switch (issue.type) {
      case 'weight_sum':
        return t('consistency_alerts.messages.weight_sum', {
          total: Number(issue.details?.totalWeight || 0).toFixed(2),
        })
      case 'macro_kpi_missing':
        return t('consistency_alerts.messages.macro_kpi_missing', {
          kpi: issue.details?.kpiName || '',
          macro: issue.details?.macroKpiName || '',
        })
      case 'unlinked_kpis':
        return t('consistency_alerts.messages.unlinked_kpis', {
          count: Number(issue.details?.count || issue.details?.kpis?.length || 0),
        })
      case 'kpi_saturation':
        return t('consistency_alerts.messages.kpi_saturation', {
          count: Number(issue.details?.kpiCount || 0),
          max: Number(issue.details?.recommendedMax || 0),
        })
      default:
        return issue.message
    }
  }

  return (
    <div className="consistency-alerts">
      <div className="alerts-header">
        <h3>{t('consistency_alerts.title')}</h3>
        {validation.valid && (
          <span className="valid-badge">✅ {t('consistency_alerts.valid')}</span>
        )}
      </div>

      {validation.issues.map((issue, index) => (
        <div key={index} className={`alert ${getSeverityClass(issue.severity)}`}>
          <div className="alert-icon">{getSeverityIcon(issue.severity)}</div>
          <div className="alert-content">
            <div className="alert-message">{getIssueMessage(issue)}</div>
            {issue.details && (
              <div className="alert-details">
                {issue.type === 'unlinked_kpis' && issue.details.kpis && (
                  <ul>
                    {issue.details.kpis.map((kpi: any, i: number) => (
                      <li key={i}>{kpi.name}</li>
                    ))}
                  </ul>
                )}
                {issue.type === 'weight_sum' && (
                  <div className="detail-item">
                    <strong>{t('consistency_alerts.details.difference')}</strong>{' '}
                    {issue.details.difference.toFixed(2)}%
                  </div>
                )}
                {issue.type === 'kpi_saturation' && (
                  <div className="detail-item">
                    <strong>{t('consistency_alerts.details.recommended')}</strong>{' '}
                    {t('consistency_alerts.details.maximum_kpis', {
                      count: issue.details.recommendedMax,
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
