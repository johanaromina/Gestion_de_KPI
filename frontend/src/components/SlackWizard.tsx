import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import './SlackWizard.css'

interface SlackWizardProps {
  onClose: () => void
}

type Step = 'status' | 'instructions' | 'paste' | 'test' | 'done'

export default function SlackWizard({ onClose }: SlackWizardProps) {
  const [step, setStep] = useState<Step>('status')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery(
    'slack-config',
    async () => {
      const res = await api.get('/notifications/slack-config')
      return res.data as { configured: boolean; preview: string; source: string }
    },
    {
      onSuccess: (data) => {
        if (data.configured && step === 'status') {
          // ya configurado, mostrar pantalla de estado
        }
      },
    }
  )

  const saveMutation = useMutation(
    async (url: string) => {
      await api.post('/notifications/slack-config', { webhookUrl: url })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('slack-config')
        setError('')
        setStep('test')
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || 'Error al guardar')
      },
    }
  )

  const testMutation = useMutation(
    async () => {
      await api.post('/notifications/slack-config/test')
    },
    {
      onSuccess: () => {
        setError('')
        setStep('done')
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || 'No se pudo enviar el mensaje de prueba')
      },
    }
  )

  const deleteMutation = useMutation(
    async () => {
      await api.delete('/notifications/slack-config')
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('slack-config')
        setStep('status')
      },
    }
  )

  const handleSave = () => {
    if (!webhookUrl.trim()) {
      setError('Pegá la URL del webhook')
      return
    }
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      setError('La URL debe empezar con https://hooks.slack.com/')
      return
    }
    setError('')
    saveMutation.mutate(webhookUrl.trim())
  }

  const stepIndex: Record<Step, number> = { status: 0, instructions: 1, paste: 2, test: 3, done: 4 }
  const totalSteps = 3

  return (
    <div className="slack-wizard-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="slack-wizard-modal">

        <div className="slack-wizard-header">
          <div className="slack-wizard-title">
            <span className="slack-wizard-icon">💬</span>
            <div>
              <h2>Conectar Slack</h2>
              <p>Recibí alertas de KPIs directamente en tu canal</p>
            </div>
          </div>
          <button className="slack-wizard-close" onClick={onClose}>✕</button>
        </div>

        {step !== 'status' && step !== 'done' && (
          <div className="slack-wizard-progress">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className={`progress-dot ${n < stepIndex[step] ? 'done' : n === stepIndex[step] ? 'active' : ''}`}
              />
            ))}
            <span className="progress-label">Paso {stepIndex[step]} de {totalSteps}</span>
          </div>
        )}

        {error && <div className="slack-wizard-error">{error}</div>}

        <div className="slack-wizard-body">

          {/* ESTADO ACTUAL */}
          {step === 'status' && (
            <div className="wizard-step">
              {isLoading ? (
                <div className="slack-loading">Verificando configuración…</div>
              ) : config?.configured ? (
                <>
                  <div className="slack-status-badge slack-status-badge--ok">
                    <span>✅</span> Slack conectado
                  </div>
                  <p className="step-hint">
                    Las alertas se envían al webhook configurado:
                    <br />
                    <code className="slack-preview">{config.preview}</code>
                  </p>
                  <div className="slack-status-actions">
                    <button
                      className="btn-wizard-secondary btn-danger"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isLoading}
                    >
                      {deleteMutation.isLoading ? 'Eliminando…' : '🗑 Desconectar Slack'}
                    </button>
                    <button
                      className="btn-wizard-primary"
                      onClick={() => testMutation.mutate()}
                      disabled={testMutation.isLoading}
                    >
                      {testMutation.isLoading ? 'Enviando…' : '📨 Enviar mensaje de prueba'}
                    </button>
                  </div>
                  <p className="step-hint step-hint-sm" style={{ marginTop: 16 }}>
                    Para cambiar el canal, desconectá y volvé a configurar.
                  </p>
                </>
              ) : (
                <>
                  <div className="slack-status-badge slack-status-badge--off">
                    <span>⚪</span> Slack no configurado
                  </div>
                  <p className="step-hint">
                    Conectá tu workspace de Slack para recibir alertas automáticas cuando:
                  </p>
                  <ul className="slack-benefits">
                    <li>🔴 Un KPI está por debajo del 80% de cumplimiento</li>
                    <li>📭 Un colaborador no cargó sus valores</li>
                    <li>📅 Un período está por vencer</li>
                  </ul>
                  <div className="wizard-actions">
                    <button className="btn-wizard-secondary" onClick={onClose}>Ahora no</button>
                    <button className="btn-wizard-primary" onClick={() => setStep('instructions')}>
                      Configurar →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PASO 1: INSTRUCCIONES */}
          {step === 'instructions' && (
            <div className="wizard-step">
              <h3>Crear un Incoming Webhook en Slack</h3>
              <p className="step-hint">Seguí estos pasos en Slack (tarda menos de 2 minutos):</p>
              <ol className="slack-steps">
                <li>
                  Abrí <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">api.slack.com/apps</a> e iniciá sesión con tu cuenta de Slack.
                </li>
                <li>
                  Hacé clic en <strong>Create New App</strong> → elegí <strong>From scratch</strong>.
                </li>
                <li>
                  Poné un nombre (ej. <code>KPI Manager</code>) y elegí tu workspace.
                </li>
                <li>
                  En el menú izquierdo, hacé clic en <strong>Incoming Webhooks</strong>.
                </li>
                <li>
                  Activá el toggle <strong>Activate Incoming Webhooks</strong>.
                </li>
                <li>
                  Hacé clic en <strong>Add New Webhook to Workspace</strong>, elegí el canal donde querés recibir las alertas y confirmá.
                </li>
                <li>
                  Copiá la URL que aparece. Empieza con <code>https://hooks.slack.com/services/...</code>
                </li>
              </ol>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('status')}>← Atrás</button>
                <button className="btn-wizard-primary" onClick={() => setStep('paste')}>
                  Ya tengo la URL →
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: PEGAR URL */}
          {step === 'paste' && (
            <div className="wizard-step">
              <h3>Pegá la URL del webhook</h3>
              <p className="step-hint">
                Copiá la URL desde la página de tu app en Slack y pegala acá.
              </p>
              <label className="field-label">Webhook URL</label>
              <input
                className="wizard-input"
                type="text"
                placeholder="https://hooks.slack.com/services/T.../B.../..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                autoFocus
              />
              <p className="step-hint step-hint-sm">
                La URL se guarda de forma segura. No se muestra completa una vez guardada.
              </p>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('instructions')}>← Atrás</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleSave}
                  disabled={saveMutation.isLoading}
                >
                  {saveMutation.isLoading ? 'Guardando…' : 'Guardar →'}
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: PRUEBA */}
          {step === 'test' && (
            <div className="wizard-step">
              <h3>Probar la conexión</h3>
              <p className="step-hint">
                Webhook guardado. Enviá un mensaje de prueba para verificar que llegue a tu canal de Slack.
              </p>
              <div className="slack-test-preview">
                <div className="slack-test-msg">
                  <strong>KPI Manager</strong>
                  <span className="slack-test-badge">App</span>
                  <p>✅ <em>KPI Manager conectado a Slack</em></p>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>Vas a recibir alertas aquí cuando haya KPIs en riesgo…</p>
                </div>
              </div>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={onClose}>Omitir prueba</button>
                <button
                  className="btn-wizard-primary"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isLoading}
                >
                  {testMutation.isLoading ? 'Enviando…' : '📨 Enviar mensaje de prueba'}
                </button>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div className="wizard-step wizard-done">
              <div className="done-icon">🎉</div>
              <h3>¡Slack conectado!</h3>
              <p>
                El mensaje de prueba se envió correctamente. A partir de ahora vas a recibir alertas
                automáticas en tu canal de Slack.
              </p>
              <p className="step-hint">
                Las alertas se disparan cuando cambian los datos: KPIs en riesgo, valores faltantes
                o períodos por vencer.
              </p>
              <div className="wizard-actions">
                <button className="btn-wizard-primary" onClick={onClose}>Listo</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
