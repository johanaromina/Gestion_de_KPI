import { createContext, useCallback, useContext, useState } from 'react'
import './Dialog.css'

type DialogVariant = 'danger' | 'warning' | 'info'
type DialogType = 'confirm' | 'alert' | 'prompt'

interface DialogOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
  placeholder?: string
  defaultValue?: string
}

interface DialogState {
  open: boolean
  type: DialogType
  message: string
  options: DialogOptions
  resolve: ((value: any) => void) | null
}

export interface DialogContextValue {
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>
  alert: (message: string, options?: DialogOptions) => Promise<void>
  prompt: (message: string, options?: DialogOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogContextValue | null>(null)

const CLOSED: DialogState = { open: false, type: 'confirm', message: '', options: {}, resolve: null }

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(CLOSED)
  const [promptValue, setPromptValue] = useState('')

  const confirm = useCallback((message: string, options: DialogOptions = {}): Promise<boolean> =>
    new Promise((resolve) => setState({ open: true, type: 'confirm', message, options, resolve })),
  [])

  const alert = useCallback((message: string, options: DialogOptions = {}): Promise<void> =>
    new Promise((resolve) => setState({ open: true, type: 'alert', message, options, resolve })),
  [])

  const prompt = useCallback((message: string, options: DialogOptions = {}): Promise<string | null> => {
    setPromptValue(options.defaultValue ?? '')
    return new Promise((resolve) => setState({ open: true, type: 'prompt', message, options, resolve }))
  }, [])

  const handleConfirm = () => {
    const { resolve, type } = state
    setState(CLOSED)
    if (resolve) resolve(type === 'prompt' ? promptValue : true)
  }

  const handleCancel = () => {
    const { resolve, type } = state
    setState(CLOSED)
    if (resolve) resolve(type === 'prompt' ? null : false)
  }

  const { open, type, message, options } = state
  const { title, confirmLabel, cancelLabel, variant = 'info', placeholder } = options

  const defaultTitle =
    type === 'alert' ? 'Aviso' : type === 'prompt' ? 'Ingresar valor' : 'Confirmar acción'
  const defaultConfirm = type === 'alert' ? 'Aceptar' : 'Confirmar'

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {open && (
        <div className="dialog-overlay" onClick={type === 'alert' ? handleConfirm : undefined}>
          <div className="dialog-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <span className={`dialog-icon dialog-icon-${variant}`}>
                {variant === 'danger' ? '⚠' : variant === 'warning' ? '⚡' : 'ℹ'}
              </span>
              <h3 className="dialog-title">{title ?? defaultTitle}</h3>
            </div>
            <p className="dialog-message">{message}</p>
            {type === 'prompt' && (
              <input
                className="dialog-input"
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={placeholder ?? ''}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm()
                  if (e.key === 'Escape') handleCancel()
                }}
              />
            )}
            <div className="dialog-actions">
              {type !== 'alert' && (
                <button className="btn-secondary" onClick={handleCancel}>
                  {cancelLabel ?? 'Cancelar'}
                </button>
              )}
              <button
                className={`btn-primary${variant === 'danger' ? ' dialog-btn-danger' : variant === 'warning' ? ' dialog-btn-warning' : ''}`}
                onClick={handleConfirm}
                autoFocus={type === 'alert'}
              >
                {confirmLabel ?? defaultConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog debe usarse dentro de DialogProvider')
  return ctx
}
