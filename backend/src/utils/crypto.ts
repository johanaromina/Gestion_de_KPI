import crypto from 'crypto'
import { appEnv } from '../config/env'

const RAW_KEY = appEnv.authEncryptionKey

const getKey = () => {
  if (!RAW_KEY) {
    return null
  }
  const key = Buffer.from(RAW_KEY.padEnd(32, '0')).subarray(0, 32)
  return key
}

export const encryptSecret = (plaintext: string): string => {
  const key = getKey()
  if (!key) return plaintext
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export const decryptSecret = (payload: string): string => {
  if (!payload || !payload.startsWith('v1:')) return payload
  const key = getKey()
  if (!key) return payload
  const parts = payload.split(':')
  if (parts.length !== 4) return payload
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const data = Buffer.from(parts[3], 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return dec.toString('utf8')
}
