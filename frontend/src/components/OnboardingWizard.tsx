import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import './OnboardingWizard.css'

interface Step {
  id: string
  number: number
  title: string
  description: string
  completed: boolean
  action: string
  path: string
  blockedBy?: string
}

interface Props {
  stats: {
    totalCollaborators: number
    totalOrgUnits?: number
    activePeriods: number
    totalKPIs: number
    totalAssignments: number
  }
  onDismiss: () => void
}

export default function OnboardingWizard({ stats, onDismiss }: Props) {
  const { t } = useTranslation('config')
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(true)

  const hasOrgStructure = (stats.totalOrgUnits ?? stats.totalCollaborators) > 0
  const hasKPIs = stats.totalKPIs > 0
  const hasActivePeriod = stats.activePeriods > 0
  const hasAssignments = stats.totalAssignments > 0

  const steps: Step[] = [
    {
      id: 'org',
      number: 1,
      title: t('onboarding.steps.org.title'),
      description: t('onboarding.steps.org.description'),
      completed: hasOrgStructure,
      action: t('onboarding.steps.org.action'),
      path: '/configuracion',
    },
    {
      id: 'kpis',
      number: 2,
      title: t('onboarding.steps.kpis.title'),
      description: t('onboarding.steps.kpis.description'),
      completed: hasKPIs,
      action: t('onboarding.steps.kpis.action'),
      path: '/kpis',
      blockedBy: !hasOrgStructure ? t('onboarding.blocked', { step: 1 }) : undefined,
    },
    {
      id: 'period',
      number: 3,
      title: t('onboarding.steps.period.title'),
      description: t('onboarding.steps.period.description'),
      completed: hasActivePeriod,
      action: t('onboarding.steps.period.action'),
      path: '/periodos',
      blockedBy: !hasKPIs ? t('onboarding.blocked', { step: 2 }) : undefined,
    },
    {
      id: 'assignments',
      number: 4,
      title: t('onboarding.steps.assignments.title'),
      description: t('onboarding.steps.assignments.description'),
      completed: hasAssignments,
      action: t('onboarding.steps.assignments.action'),
      path: '/asignaciones',
      blockedBy: !hasActivePeriod ? t('onboarding.blocked', { step: 3 }) : undefined,
    },
  ]

  const completedCount = steps.filter((s) => s.completed).length
  const allDone = completedCount === steps.length
  const progressPct = Math.round((completedCount / steps.length) * 100)

  if (allDone) {
    return (
      <div className="onboarding-done">
        <span className="onboarding-done-icon">✓</span>
        <div>
          <strong>{t('onboarding.done.title')}</strong>
          <span> {t('onboarding.done.message')}</span>
        </div>
        <button className="onboarding-dismiss" onClick={onDismiss}>
          {t('onboarding.hide')}
        </button>
      </div>
    )
  }

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-header" onClick={() => setExpanded((v) => !v)}>
        <div className="onboarding-header-left">
          <span className="onboarding-title">
            {t('onboarding.title')}
          </span>
          <span className="onboarding-progress-label">
            {t('onboarding.progress', { done: completedCount, total: steps.length })}
          </span>
        </div>
        <div className="onboarding-header-right">
          <div className="onboarding-progress-bar">
            <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="onboarding-toggle">{expanded ? '▲' : '▼'}</span>
          <button
            className="onboarding-dismiss"
            onClick={(e) => { e.stopPropagation(); onDismiss() }}
          >
            {t('onboarding.hide')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="onboarding-steps">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`onboarding-step ${step.completed ? 'done' : ''} ${step.blockedBy ? 'blocked' : ''}`}
            >
              <div className="onboarding-step-icon">
                {step.completed ? '✓' : step.number}
              </div>
              <div className="onboarding-step-body">
                <div className="onboarding-step-title">{step.title}</div>
                <div className="onboarding-step-desc">{step.description}</div>
                {step.blockedBy && (
                  <div className="onboarding-step-blocked">{step.blockedBy}</div>
                )}
              </div>
              {!step.completed && !step.blockedBy && (
                <button
                  className="onboarding-step-action"
                  onClick={() => navigate(step.path)}
                >
                  {step.action}
                </button>
              )}
              {step.completed && (
                <span className="onboarding-step-done-label">{t('onboarding.completed_label')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
