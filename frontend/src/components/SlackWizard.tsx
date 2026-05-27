import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Trans, useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './SlackWizard.css'

interface SlackWizardProps {
  onClose: () => void
}

type Step = 'status' | 'instructions' | 'paste' | 'test' | 'done'

export default function SlackWizard({ onClose }: SlackWizardProps) {
  const { t } = useTranslation(['config', 'common'])
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
        setError(
          resolveApiErrorMessage(err, t, {
            fallbackKey: 'config:slack_wizard.errors.save',
          })
        )
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
        setError(
          resolveApiErrorMessage(err, t, {
            fallbackKey: 'config:slack_wizard.errors.test',
          })
        )
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
      setError(t('config:slack_wizard.errors.url_required'))
      return
    }
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      setError(t('config:slack_wizard.errors.url_invalid'))
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
              <h2>{t('config:slack_wizard.title')}</h2>
              <p>{t('config:slack_wizard.subtitle')}</p>
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
            <span className="progress-label">
              {t('config:slack_wizard.progress', { current: stepIndex[step], total: totalSteps })}
            </span>
          </div>
        )}

        {error && <div className="slack-wizard-error">{error}</div>}

        <div className="slack-wizard-body">

          {/* ESTADO ACTUAL */}
          {step === 'status' && (
            <div className="wizard-step">
              {isLoading ? (
                <div className="slack-loading">{t('config:slack_wizard.loading')}</div>
              ) : config?.configured ? (
                <>
                  <div className="slack-status-badge slack-status-badge--ok">
                    <span>✅</span> {t('config:slack_wizard.status.configured')}
                  </div>
                  <p className="step-hint">
                    {t('config:slack_wizard.status.configured_hint')}
                    <br />
                    <code className="slack-preview">{config.preview}</code>
                  </p>
                  <div className="slack-status-actions">
                    <button
                      className="btn-wizard-secondary btn-danger"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isLoading}
                    >
                      {deleteMutation.isLoading ? t('config:slack_wizard.actions.disconnecting') : `🗑 ${t('config:slack_wizard.actions.disconnect')}`}
                    </button>
                    <button
                      className="btn-wizard-primary"
                      onClick={() => testMutation.mutate()}
                      disabled={testMutation.isLoading}
                    >
                      {testMutation.isLoading ? t('config:slack_wizard.actions.sending') : `📨 ${t('config:slack_wizard.actions.send_test')}`}
                    </button>
                  </div>
                  <p className="step-hint step-hint-sm" style={{ marginTop: 16 }}>
                    {t('config:slack_wizard.status.change_channel_hint')}
                  </p>
                </>
              ) : (
                <>
                  <div className="slack-status-badge slack-status-badge--off">
                    <span>⚪</span> {t('config:slack_wizard.status.not_configured')}
                  </div>
                  <p className="step-hint">
                    {t('config:slack_wizard.status.not_configured_hint')}
                  </p>
                  <ul className="slack-benefits">
                    <li>🔴 {t('config:slack_wizard.benefits.risk')}</li>
                    <li>📭 {t('config:slack_wizard.benefits.missing')}</li>
                    <li>📅 {t('config:slack_wizard.benefits.deadline')}</li>
                  </ul>
                  <div className="wizard-actions">
                    <button className="btn-wizard-secondary" onClick={onClose}>
                      {t('config:slack_wizard.actions.not_now')}
                    </button>
                    <button className="btn-wizard-primary" onClick={() => setStep('instructions')}>
                      {t('config:slack_wizard.actions.configure')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PASO 1: INSTRUCCIONES */}
          {step === 'instructions' && (
            <div className="wizard-step">
              <h3>{t('config:slack_wizard.instructions.title')}</h3>
              <p className="step-hint">{t('config:slack_wizard.instructions.hint')}</p>
              <ol className="slack-steps">
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_1"
                    components={{
                      link: <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" />,
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_2"
                    components={{
                      strong: <strong />,
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_3"
                    components={{
                      code: <code />,
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_4"
                    components={{
                      strong: <strong />,
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_5"
                    components={{
                      strong: <strong />,
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_6"
                    components={{
                      strong: <strong />,
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="config:slack_wizard.instructions.step_7"
                    components={{
                      code: <code />,
                    }}
                  />
                </li>
              </ol>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('status')}>
                  ← {t('common:back')}
                </button>
                <button className="btn-wizard-primary" onClick={() => setStep('paste')}>
                  {t('config:slack_wizard.actions.have_url')}
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: PEGAR URL */}
          {step === 'paste' && (
            <div className="wizard-step">
              <h3>{t('config:slack_wizard.paste.title')}</h3>
              <p className="step-hint">
                {t('config:slack_wizard.paste.hint')}
              </p>
              <label className="field-label">{t('config:slack_wizard.paste.label')}</label>
              <input
                className="wizard-input"
                type="text"
                placeholder={t('config:slack_wizard.paste.placeholder')}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                autoFocus
              />
              <p className="step-hint step-hint-sm">
                {t('config:slack_wizard.paste.security_hint')}
              </p>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('instructions')}>
                  ← {t('common:back')}
                </button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleSave}
                  disabled={saveMutation.isLoading}
                >
                  {saveMutation.isLoading ? t('config:slack_wizard.actions.saving') : t('config:slack_wizard.actions.save')}
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: PRUEBA */}
          {step === 'test' && (
            <div className="wizard-step">
              <h3>{t('config:slack_wizard.test.title')}</h3>
              <p className="step-hint">
                {t('config:slack_wizard.test.hint')}
              </p>
              <div className="slack-test-preview">
                <div className="slack-test-msg">
                  <strong>{t('config:slack_wizard.test.preview_title')}</strong>
                  <span className="slack-test-badge">{t('config:slack_wizard.test.preview_badge')}</span>
                  <p>✅ <em>{t('config:slack_wizard.test.preview_message')}</em></p>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>{t('config:slack_wizard.test.preview_hint')}</p>
                </div>
              </div>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={onClose}>
                  {t('config:slack_wizard.actions.skip_test')}
                </button>
                <button
                  className="btn-wizard-primary"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isLoading}
                >
                  {testMutation.isLoading ? t('config:slack_wizard.actions.sending') : `📨 ${t('config:slack_wizard.actions.send_test')}`}
                </button>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div className="wizard-step wizard-done">
              <div className="done-icon">🎉</div>
              <h3>{t('config:slack_wizard.done.title')}</h3>
              <p>
                {t('config:slack_wizard.done.message')}
              </p>
              <p className="step-hint">
                {t('config:slack_wizard.done.hint')}
              </p>
              <div className="wizard-actions">
                <button className="btn-wizard-primary" onClick={onClose}>
                  {t('config:slack_wizard.actions.done')}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
