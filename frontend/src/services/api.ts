import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const API_BASE_URL_NORMALIZED = API_BASE_URL.replace(/\/+$/, '')

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL_NORMALIZED}${normalizedPath}`
}

let _redirectingToLogin = false
let _consecutive401Count = 0
let _last401At = 0
const CONSECUTIVE_401_WINDOW_MS = 2000
const CONSECUTIVE_401_LOOP_THRESHOLD = 5

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status !== 401 || _redirectingToLogin) {
      return Promise.reject(error)
    }

    const now = Date.now()
    _consecutive401Count = now - _last401At < CONSECUTIVE_401_WINDOW_MS ? _consecutive401Count + 1 : 1
    _last401At = now

    const isAuthSessionProbe = String(error.config?.url || '').includes('/auth/me')
    // Session probes are normally excluded (RequireAuth/HomeRoute handle them via SPA routing),
    // but if one is somehow stuck in a tight retry loop, force a hard redirect anyway so the
    // user isn't left staring at a frozen/flickering screen forever.
    const isRunawayProbe = isAuthSessionProbe && _consecutive401Count >= CONSECUTIVE_401_LOOP_THRESHOLD

    if ((!isAuthSessionProbe || isRunawayProbe) && window.location.pathname !== '/login') {
      _redirectingToLogin = true
      window.location.replace('/login?session=expired')
    }
    return Promise.reject(error)
  }
)

export default api
