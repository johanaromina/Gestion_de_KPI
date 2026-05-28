import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'

const VITE_PRELOAD_RELOAD_KEY = 'vite-preload-reload-ts'
const VITE_PRELOAD_RELOAD_WINDOW_MS = 10000

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()

  const now = Date.now()
  const lastReload = Number(sessionStorage.getItem(VITE_PRELOAD_RELOAD_KEY) || '0')

  if (now - lastReload < VITE_PRELOAD_RELOAD_WINDOW_MS) {
    console.error('[vite] preload error persisted after reload', event.payload)
    return
  }

  sessionStorage.setItem(VITE_PRELOAD_RELOAD_KEY, String(now))
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
