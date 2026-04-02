import jwt from 'jsonwebtoken'
import { appEnv } from '../config/env'

export interface AuthUserPayload {
  id: number
  email: string
  name: string
  role: string
  area?: string
  collaboratorId?: number
  hasSuperpowers?: boolean
  permissions?: string[]
}

export const buildTokenPayload = (collaborator: any, permissions: string[]): AuthUserPayload => ({
  id: collaborator.id,
  email: collaborator.email || '',
  name: collaborator.name,
  role: collaborator.role,
  area: collaborator.area,
  collaboratorId: collaborator.id,
  hasSuperpowers: collaborator.hasSuperpowers === 1 || collaborator.hasSuperpowers === true,
  permissions,
})

export const getSessionExpiry = (rememberMe?: boolean) => (rememberMe ? '30d' : '1d')

export const issueAuthToken = (collaborator: any, permissions: string[], rememberMe?: boolean) =>
  jwt.sign(buildTokenPayload(collaborator, permissions), appEnv.jwtSecret, {
    expiresIn: getSessionExpiry(rememberMe),
  })
