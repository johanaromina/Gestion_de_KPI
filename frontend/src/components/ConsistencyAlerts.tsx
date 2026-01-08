import { useQuery } from 'react-query'
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

  return (
    <div className="consistency-alerts">
      <div className="alerts-header">
        <h3>Validaciones de Consistencia</h3>
        {validation.valid && (
          <span className="valid-badge">✅ Todo correcto</span>
        )}
      </div>

      {validation.issues.map((issue, index) => (
        <div key={index} className={`alert ${getSeverityClass(issue.severity)}`}>
          <div className="alert-icon">{getSeverityIcon(issue.severity)}</div>
          <div className="alert-content">
            <div className="alert-message">{issue.message}</div>
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
                    <strong>Diferencia:</strong>{' '}
                    {issue.details.difference.toFixed(2)}%
                  </div>
                )}
                {issue.type === 'kpi_saturation' && (
                  <div className="detail-item">
                    <strong>Recomendado:</strong> Máximo{' '}
                    {issue.details.recommendedMax} KPIs
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
