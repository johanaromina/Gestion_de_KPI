type ValidationError = { field: string; message: string }

export function validateString(
  val: unknown,
  field: string,
  maxLen = 255
): ValidationError | null {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { field, message: `${field} es requerido` }
  }
  if (String(val).trim().length > maxLen) {
    return { field, message: `${field} no puede superar ${maxLen} caracteres` }
  }
  return null
}

export function validateEmail(val: unknown, field = 'email'): ValidationError | null {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { field, message: `${field} es requerido` }
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!EMAIL_RE.test(String(val).trim())) {
    return { field, message: `${field} no tiene un formato válido` }
  }
  return null
}

export function validateEnum<T extends string>(
  val: unknown,
  field: string,
  allowed: readonly T[]
): ValidationError | null {
  if (val === undefined || val === null) {
    return { field, message: `${field} es requerido` }
  }
  if (!allowed.includes(val as T)) {
    return { field, message: `${field} debe ser uno de: ${allowed.join(', ')}` }
  }
  return null
}

export function validateNumber(
  val: unknown,
  field: string,
  { min, max }: { min?: number; max?: number } = {}
): ValidationError | null {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { field, message: `${field} es requerido` }
  }
  const n = Number(val)
  if (isNaN(n)) {
    return { field, message: `${field} debe ser un número` }
  }
  if (min !== undefined && n < min) {
    return { field, message: `${field} debe ser mayor o igual a ${min}` }
  }
  if (max !== undefined && n > max) {
    return { field, message: `${field} debe ser menor o igual a ${max}` }
  }
  return null
}

export function collectErrors(checks: Array<ValidationError | null>): ValidationError[] {
  return checks.filter((e): e is ValidationError => e !== null)
}
