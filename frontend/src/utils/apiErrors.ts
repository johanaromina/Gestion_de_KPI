import { TFunction } from 'i18next'

export type ApiErrorValues = Record<string, unknown>

export type ApiErrorPayload = {
  code?: string
  error?: string
  message?: string
  values?: ApiErrorValues
}

type ApiErrorLike =
  | ApiErrorPayload
  | {
      response?: {
        data?: ApiErrorPayload
      }
      message?: string
    }
  | null
  | undefined

type ResolveApiErrorOptions = {
  codeMap?: Record<string, string>
  fallbackKey?: string
  fallbackValue?: string
  values?: ApiErrorValues
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const getApiErrorPayload = (errorLike: ApiErrorLike): ApiErrorPayload | undefined => {
  if (!isPlainObject(errorLike)) return undefined

  const responseData = (errorLike as { response?: { data?: unknown } }).response?.data
  if (isPlainObject(responseData)) {
    return responseData as ApiErrorPayload
  }

  if ('code' in errorLike || 'error' in errorLike || 'message' in errorLike || 'values' in errorLike) {
    return errorLike as ApiErrorPayload
  }

  return undefined
}

export const resolveApiErrorMessage = (
  errorLike: ApiErrorLike,
  t: TFunction,
  options: ResolveApiErrorOptions = {}
) => {
  const payload = getApiErrorPayload(errorLike)
  const values = {
    ...(payload?.values || {}),
    ...(options.values || {}),
  }

  const translationKey = payload?.code ? options.codeMap?.[payload.code] : undefined
  if (translationKey) {
    const translated = t(translationKey, { ...values, defaultValue: '' })
    if (translated) return translated
  }

  if (options.fallbackKey) {
    const fallbackMessage = t(options.fallbackKey, { ...values, defaultValue: '' })
    if (fallbackMessage) return fallbackMessage
  }

  if (payload?.error) return payload.error
  if (payload?.message) return payload.message
  if (typeof (errorLike as { message?: unknown } | null | undefined)?.message === 'string') {
    return (errorLike as { message: string }).message
  }

  return options.fallbackValue || ''
}
