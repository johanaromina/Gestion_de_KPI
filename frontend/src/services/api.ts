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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthSessionProbe = String(error.config?.url || '').includes('/auth/me')

    if (
      error.response?.status === 401 &&
      !isAuthSessionProbe &&
      window.location.pathname !== '/login' &&
      !_redirectingToLogin
    ) {
      _redirectingToLogin = true
      window.location.replace('/login?session=expired')
    }
    return Promise.reject(error)
  }
)

export default api
