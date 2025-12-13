import { useQuery } from 'react-query'
import api from '../services/api'

export interface User {
  id: number
  name: string
  role: 'admin' | 'director' | 'manager' | 'leader' | 'collaborator'
  area?: string
  collaboratorId: number
  hasSuperpowers?: boolean
  permissions?: string[]
}

export function useAuth() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null

  const { data: user, isLoading, error } = useQuery<User>(
    'currentUser',
    async () => {
      const response = await api.get('/auth/me')
      return response.data
    },
    {
      enabled: !!token,
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
  }
}
