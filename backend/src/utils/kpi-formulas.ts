import { KPIDirection, KPIType } from '../types'

/**
 * Calcula la variación (porcentaje de cumplimiento) según el tipo de KPI
 * @param type Tipo de KPI (growth, reduction, exact)
 * @param target Valor objetivo
 * @param actual Valor actual alcanzado
 * @param customFormula Fórmula personalizada opcional (ej: "(actual / target) * 100")
 * @returns Porcentaje de cumplimiento (0-100+)
 */
const resolveDirection = (value: KPIType | KPIDirection | string | undefined): KPIDirection => {
  if (value === 'growth' || value === 'reduction' || value === 'exact') return value
  if (value === 'sla') return 'reduction'
  return 'growth'
}

export function calculateVariation(
  typeOrDirection: KPIType | KPIDirection | string,
  target: number,
  actual: number,
  customFormula?: string
): number {
  const targetValue = Number(target)
  const actualValue = Number(actual)
  const direction = resolveDirection(typeOrDirection)

  // Validaciones básicas
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return 0
  }

  if (actual === null || actual === undefined || !Number.isFinite(actualValue)) {
    return 0
  }

  // Si hay una fórmula personalizada, usarla
  if (customFormula) {
    try {
      return evaluateCustomFormula(customFormula, { target: targetValue, actual: actualValue })
    } catch (error) {
      console.error('Error evaluando fórmula personalizada:', error)
      // Fallback a fórmula por defecto según tipo
    }
  }

  // Fórmulas por defecto según tipo
  switch (direction) {
    case 'growth':
      // Crecimiento: (Actual / Target) * 100
      // Ejemplo: Target=100, Actual=120 → 120%
      // Si Actual > Target, el resultado puede ser > 100%
      if (actualValue <= 0) return 0
      return (actualValue / targetValue) * 100

    case 'reduction':
      // Reducción: (Target / Actual) * 100
      // Ejemplo: Target=100 (tiempo objetivo), Actual=80 (tiempo real) → 125%
      // Menor actual = mejor resultado (más alto el %)
      // Si Actual = 0, retornar 0 para evitar división por cero
      if (actualValue <= 0) return 0
      return (targetValue / actualValue) * 100

    case 'exact':
      // Exacto: 100 si es igual, penalización por diferencia
      // Ejemplo: Target=100, Actual=100 → 100%
      // Ejemplo: Target=100, Actual=90 → 90% (penalización del 10%)
      // Ejemplo: Target=100, Actual=110 → 90% (penalización del 10%)
      const diff = Math.abs(actualValue - targetValue)
      const percentageDiff = (diff / targetValue) * 100
      return Math.max(0, 100 - percentageDiff)

    default:
      return 0
  }
}

/**
 * Evalúa una fórmula personalizada con variables
 * @param formula Fórmula en formato string (ej: "(actual / target) * 100")
 * @param variables Objeto con variables disponibles (target, actual)
 * @returns Resultado numérico de la fórmula
 */
function evaluateCustomFormula(
  formula: string,
  variables: { target: number; actual: number }
): number {
  // Validar que la fórmula contenga solo caracteres seguros
  // Permitimos: números, operadores, paréntesis, espacios, y funciones Math permitidas
  const allowedFunctions = ['Math.abs', 'Math.max', 'Math.min']
  let sanitizedFormula = formula.trim()

  // Verificar que solo contenga caracteres permitidos
  const safePattern = /^[a-zA-Z0-9+\-*/().\s]+$/
  if (!safePattern.test(sanitizedFormula)) {
    throw new Error('Fórmula contiene caracteres no permitidos')
  }

  // Verificar que solo use funciones Math permitidas
  const mathFunctionPattern = /Math\.\w+/g
  const mathFunctions = sanitizedFormula.match(mathFunctionPattern) || []
  for (const func of mathFunctions) {
    if (!allowedFunctions.includes(func)) {
      throw new Error(`Función no permitida: ${func}`)
    }
  }

  try {
    // Evaluar la fórmula de forma segura
    // Nota: En producción, considerar usar una librería de evaluación de expresiones más segura
    // Inyectamos las variables y funciones Math permitidas en el contexto
    const result = Function(
      `"use strict"; 
       const target = ${variables.target};
       const actual = ${variables.actual};
       return (${sanitizedFormula})`
    )()
    
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      throw new Error('El resultado de la fórmula no es un número válido')
    }

    return result
  } catch (error: any) {
    throw new Error(`Error al evaluar fórmula: ${error.message || error}`)
  }
}

/**
 * Calcula el alcance ponderado
 * @param variation Porcentaje de variación (0-100+)
 * @param weight Ponderación del KPI (0-100)
 * @returns Alcance ponderado
 */
export function calculateWeightedResult(variation: number, weight: number): number {
  return (variation * weight) / 100
}

/**
 * Valida que una fórmula personalizada sea segura y válida
 * @param formula Fórmula a validar
 * @returns true si es válida, false si no
 */
export function validateFormula(formula: string): {
  valid: boolean
  error?: string
} {
  if (!formula || !formula.trim()) {
    return { valid: false, error: 'La fórmula no puede estar vacía' }
  }

  // Validar caracteres permitidos
  const allowedPattern = /^[a-zA-Z0-9+\-*/().\s]+$/
  if (!allowedPattern.test(formula)) {
    return {
      valid: false,
      error: 'La fórmula contiene caracteres no permitidos',
    }
  }

  // Verificar que solo use funciones Math permitidas
  const allowedFunctions = ['Math.abs', 'Math.max', 'Math.min']
  const mathFunctionPattern = /Math\.\w+/g
  const mathFunctions = formula.match(mathFunctionPattern) || []
  for (const func of mathFunctions) {
    if (!allowedFunctions.includes(func)) {
      return {
        valid: false,
        error: `Función no permitida: ${func}. Solo se permiten: ${allowedFunctions.join(', ')}`,
      }
    }
  }

  // Intentar evaluar con valores de prueba
  try {
    evaluateCustomFormula(formula, { target: 100, actual: 100 })
    return { valid: true }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}

/**
 * Obtiene la fórmula por defecto según el tipo de KPI
 * @param type Tipo de KPI
 * @returns Fórmula por defecto
 */
export function getDefaultFormula(type: KPIType | KPIDirection | string): string {
  switch (resolveDirection(type)) {
    case 'growth':
      return '(actual / target) * 100'
    case 'reduction':
      return '(target / actual) * 100'
    case 'exact':
      return '100 - (Math.abs(actual - target) / target) * 100'
    default:
      return '(actual / target) * 100'
  }
}
