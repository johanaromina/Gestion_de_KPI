import { useEffect, useMemo } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'

export interface User {
  id: number
  email?: string
  name: string
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
  area?: string
  collaboratorId: number
  hasSuperpowers?: boolean
  permissions?: string[]
}

export function isTokenExpired(token: string | null) {
  if (!token) return true
  try {
    const [, payload] = token.split('.')
    if (!payload) return false
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized))
    if (!decoded.exp) return false
    return decoded.exp * 1000 < Date.now()
  } catch {
    return false
  }
}

export function useAuth() {
  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('token') || sessionStorage.getItem('token')
      : null
  const expired = isTokenExpired(token)

  useEffect(() => {
    if (expired && token) {
      localStorage.removeItem('token')
      sessionStorage.removeItem('token')
    }
  }, [expired, token])

  const effectiveToken = useMemo(() => {
    if (expired) return null
    return token
  }, [expired, token])

  const { data: user, isLoading, error } = useQuery<User>(
    'currentUser',
    async () => {
      const response = await api.get('/auth/me')
      return response.data
    },
    {
      enabled: !!effectiveToken,
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 minutos
    }
  )

  const isAdmin = user?.role === 'admin'
  const isDirector = user?.role === 'director'
  const isManager = user?.role === 'manager'
  const isLeader = user?.role === 'leader'
  const isCollaborator = user?.role === 'collaborator'
  const canConfig =
    !!(
      user?.hasSuperpowers ||
      user?.permissions?.includes('config.manage') ||
      user?.permissions?.includes('config.view')
    )

  // Recursos Humanos = Admin
  const isHR = isAdmin

  // Líderes = Leader, Manager, Director
  const isLeadership = isLeader || isManager || isDirector
  const isAuthenticated = !!effectiveToken && !!user

  return {
    user,
    isLoading,
    error,
    isAdmin,
    isDirector,
    isManager,
    isLeader,
    isCollaborator,
    isHR,
    isLeadership,
    canConfig,
    isAuthenticated,
  }
}
