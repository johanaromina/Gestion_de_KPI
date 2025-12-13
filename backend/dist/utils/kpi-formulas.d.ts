import { KPIType } from '../types';
/**
 * Calcula la variación (porcentaje de cumplimiento) según el tipo de KPI
 * @param type Tipo de KPI (growth, reduction, exact)
 * @param target Valor objetivo
 * @param actual Valor actual alcanzado
 * @param customFormula Fórmula personalizada opcional (ej: "(actual / target) * 100")
 * @returns Porcentaje de cumplimiento (0-100+)
 */
export declare function calculateVariation(type: KPIType, target: number, actual: number, customFormula?: string): number;
/**
 * Calcula el alcance ponderado
 * @param variation Porcentaje de variación (0-100+)
 * @param weight Ponderación del KPI (0-100)
 * @returns Alcance ponderado
 */
export declare function calculateWeightedResult(variation: number, weight: number): number;
/**
 * Valida que una fórmula personalizada sea segura y válida
 * @param formula Fórmula a validar
 * @returns true si es válida, false si no
 */
export declare function validateFormula(formula: string): {
    valid: boolean;
    error?: string;
};
/**
 * Obtiene la fórmula por defecto según el tipo de KPI
 * @param type Tipo de KPI
 * @returns Fórmula por defecto
 */
export declare function getDefaultFormula(type: KPIType): string;
//# sourceMappingURL=kpi-formulas.d.ts.map