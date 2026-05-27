import { Response } from 'express'

export type ApiErrorValues = Record<string, unknown>
export type ApiErrorExtra = Record<string, unknown>

type ApiErrorFallback = {
  status: number
  code: string
  error: string
  values?: ApiErrorValues
  extra?: ApiErrorExtra
}

export class HttpApiError extends Error {
  status: number
  code: string
  values?: ApiErrorValues

  constructor(status: number, code: string, error: string, values?: ApiErrorValues) {
    super(error)
    this.name = 'HttpApiError'
    this.status = status
    this.code = code
    this.values = values
  }
}

export const apiError = (status: number, code: string, error: string, values?: ApiErrorValues) =>
  new HttpApiError(status, code, error, values)

export const isApiError = (value: unknown): value is HttpApiError => value instanceof HttpApiError

export const sendApiError = (
  res: Response,
  status: number,
  code: string,
  error: string,
  values?: ApiErrorValues,
  extra?: ApiErrorExtra
) => {
  const payload = {
    code,
    error,
    ...(values ? { values } : {}),
    ...(extra || {}),
  }
  return res.status(status).json(payload)
}

export const sendCaughtApiError = (
  res: Response,
  caught: unknown,
  fallback: ApiErrorFallback
) => {
  if (isApiError(caught)) {
    return sendApiError(res, caught.status, caught.code, caught.message, caught.values)
  }

  return sendApiError(res, fallback.status, fallback.code, fallback.error, fallback.values, fallback.extra)
}
