import { KPIDirection, KPIType } from '../types'
import { logger } from '../utils/logger'

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
      logger.error('Error evaluando fórmula personalizada:', error)
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
      // Si Actual = 0, es desempeño perfecto (cero de lo malo) → retornar 200 (se capea en display)
      if (actualValue <= 0) return 200
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

// ─── Safe formula evaluator (recursive descent parser — no eval/Function) ────

type FormulaToken =
  | { type: 'num'; value: number }
  | { type: 'var'; name: 'target' | 'actual' }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'func'; name: 'abs' | 'max' | 'min' }

function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = []
  let i = 0
  while (i < formula.length) {
    const ch = formula[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(formula[i + 1] ?? ''))) {
      let num = ''
      while (i < formula.length && /[\d.]/.test(formula[i])) num += formula[i++]
      tokens.push({ type: 'num', value: parseFloat(num) })
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch })
      i++; continue
    }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue }
    if (/[a-zA-Z]/.test(ch)) {
      let word = ''
      while (i < formula.length && /[a-zA-Z.0-9_]/.test(formula[i])) word += formula[i++]
      if (word === 'target' || word === 'actual') {
        tokens.push({ type: 'var', name: word })
      } else if (word === 'Math.abs') {
        tokens.push({ type: 'func', name: 'abs' })
      } else if (word === 'Math.max') {
        tokens.push({ type: 'func', name: 'max' })
      } else if (word === 'Math.min') {
        tokens.push({ type: 'func', name: 'min' })
      } else {
        throw new Error(`Identificador no permitido: ${word}`)
      }
      continue
    }
    throw new Error(`Carácter no permitido en fórmula: ${ch}`)
  }
  return tokens
}

class FormulaParser {
  pos = 0
  constructor(private tokens: FormulaToken[], private vars: { target: number; actual: number }) {}

  parseExpression(): number {
    let left = this.parseTerm()
    while (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos]
      if (tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        this.pos++
        const right = this.parseTerm()
        left = tok.value === '+' ? left + right : left - right
      } else break
    }
    return left
  }

  private parseTerm(): number {
    let left = this.parseFactor()
    while (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos]
      if (tok.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        this.pos++
        const right = this.parseFactor()
        if (tok.value === '/' && right === 0) throw new Error('División por cero')
        left = tok.value === '*' ? left * right : left / right
      } else break
    }
    return left
  }

  private parseFactor(): number {
    if (this.pos >= this.tokens.length) throw new Error('Fórmula incompleta')
    const tok = this.tokens[this.pos]
    if (tok.type === 'op' && tok.value === '-') {
      this.pos++
      return -this.parseFactor()
    }
    if (tok.type === 'lparen') {
      this.pos++
      const val = this.parseExpression()
      if (this.pos >= this.tokens.length || this.tokens[this.pos].type !== 'rparen')
        throw new Error('Paréntesis sin cerrar')
      this.pos++
      return val
    }
    if (tok.type === 'num') { this.pos++; return tok.value }
    if (tok.type === 'var') { this.pos++; return this.vars[tok.name] }
    if (tok.type === 'func') {
      this.pos++
      if (this.pos >= this.tokens.length || this.tokens[this.pos].type !== 'lparen')
        throw new Error(`Se esperaba '(' después de ${tok.name}`)
      this.pos++
      const args: number[] = [this.parseExpression()]
      while (this.pos < this.tokens.length && this.tokens[this.pos].type === 'comma') {
        this.pos++
        args.push(this.parseExpression())
      }
      if (this.pos >= this.tokens.length || this.tokens[this.pos].type !== 'rparen')
        throw new Error('Paréntesis sin cerrar en función')
      this.pos++
      if (tok.name === 'abs') return Math.abs(args[0])
      if (tok.name === 'max') return Math.max(...args)
      return Math.min(...args)
    }
    throw new Error(`Token inesperado en posición ${this.pos}`)
  }
}

function evaluateCustomFormula(
  formula: string,
  variables: { target: number; actual: number }
): number {
  const tokens = tokenizeFormula(formula.trim())
  const parser = new FormulaParser(tokens, variables)
  const result = parser.parseExpression()
  if (parser.pos !== tokens.length) throw new Error('Tokens inesperados al final de la fórmula')
  if (!Number.isFinite(result)) throw new Error('La fórmula produjo un valor no finito')
  return result
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
