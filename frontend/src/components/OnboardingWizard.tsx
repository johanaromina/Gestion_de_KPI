import { useState } from 'react'
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
      title: 'Definí la estructura organizacional',
      description: 'Creá las áreas y equipos de tu empresa. Esto define quién es responsable de qué KPI.',
      completed: hasOrgStructure,
      action: 'Ir a Configuración →',
      path: '/configuracion',
    },
    {
      id: 'kpis',
      number: 2,
      title: 'Cargá los KPIs de tu empresa',
      description: 'Definí qué vas a medir: ventas, tickets resueltos, NPS, cumplimiento de entregas, etc.',
      completed: hasKPIs,
      action: 'Ir a KPIs →',
      path: '/kpis',
      blockedBy: !hasOrgStructure ? 'Primero completá el paso 1' : undefined,
    },
    {
      id: 'period',
      number: 3,
      title: 'Creá un período activo',
      description: 'Definí el ciclo de evaluación (anual, semestral, trimestral) y sus sub-períodos.',
      completed: hasActivePeriod,
      action: 'Ir a Períodos →',
      path: '/periodos',
      blockedBy: !hasKPIs ? 'Primero completá el paso 2' : undefined,
    },
    {
      id: 'assignments',
      number: 4,
      title: 'Asigná KPIs a tus colaboradores',
      description: 'Definí qué KPI mide cada persona, con su objetivo y peso en la evaluación.',
      completed: hasAssignments,
      action: 'Ir a Asignaciones →',
      path: '/asignaciones',
      blockedBy: !hasActivePeriod ? 'Primero completá el paso 3' : undefined,
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
          <strong>¡Sistema configurado!</strong>
          <span> Ya podés empezar a cargar datos y ver resultados.</span>
        </div>
        <button className="onboarding-dismiss" onClick={onDismiss}>
          Ocultar
        </button>
      </div>
    )
  }

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-header" onClick={() => setExpanded((v) => !v)}>
        <div className="onboarding-header-left">
          <span className="onboarding-title">
            Configuración inicial
          </span>
          <span className="onboarding-progress-label">
            {completedCount} de {steps.length} pasos completados
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
            Ocultar
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
                <span className="onboarding-step-done-label">Completado</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
