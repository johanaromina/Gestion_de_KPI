export type KPITemplate = {
  id: string
  type: 'manual' | 'count' | 'ratio' | 'sla' | 'value'
  direction: 'growth' | 'reduction' | 'exact'
  formula?: string
  suggestedTarget?: number
  unit?: string
}

export type KPITemplateCategory = {
  id: string
  icon: string
  templates: KPITemplate[]
}

export const KPI_TEMPLATE_CATEGORIES: KPITemplateCategory[] = [
  {
    id: 'sales',
    icon: '📈',
    templates: [
      { id: 'ingresos_mensuales', type: 'value', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 1000000, unit: '$' },
      { id: 'nuevos_clientes_adquiridos', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 20, unit: 'clientes' },
      { id: 'tasa_de_conversion', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 30, unit: '%' },
      { id: 'ticket_promedio', type: 'value', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 50000, unit: '$' },
      { id: 'retencion_de_clientes', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 90, unit: '%' },
      { id: 'churn_rate', type: 'ratio', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 3, unit: '%' },
    ],
  },
  {
    id: 'tech',
    icon: '💻',
    templates: [
      { id: 'tickets_cerrados', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 50, unit: 'tickets' },
      { id: 'bugs_criticos_resueltos', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 10, unit: 'bugs' },
      { id: 'uptime_del_servicio', type: 'sla', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 99.9, unit: '%' },
      { id: 'tiempo_de_respuesta_promedio_api', type: 'value', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 200, unit: 'ms' },
      { id: 'cobertura_de_tests', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 80, unit: '%' },
      { id: 'deploys_a_produccion', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 8, unit: 'deploys' },
      { id: 'mean_time_to_recovery_mttr', type: 'value', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 30, unit: 'min' },
    ],
  },
  {
    id: 'hr',
    icon: '👥',
    templates: [
      { id: 'tasa_de_retencion_de_talento', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 90, unit: '%' },
      { id: 'tiempo_de_cobertura_de_vacantes', type: 'value', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 30, unit: 'días' },
      { id: 'nps_de_empleados_enps', type: 'value', direction: 'growth', formula: '((actual + 100) / (target + 100)) * 100', suggestedTarget: 30, unit: 'puntos' },
      { id: 'ausentismo', type: 'ratio', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 2, unit: '%' },
      { id: 'capacitaciones_completadas', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 4, unit: 'cursos' },
    ],
  },
  {
    id: 'ops',
    icon: '⚙️',
    templates: [
      { id: 'on_time_delivery_otd', type: 'sla', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 95, unit: '%' },
      { id: 'costo_operativo_por_unidad', type: 'value', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 100, unit: '$' },
      { id: 'tasa_de_defectos', type: 'ratio', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 1, unit: '%' },
      { id: 'productividad_por_colaborador', type: 'value', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 100, unit: 'u/persona' },
      { id: 'sla_de_atencion_al_cliente', type: 'sla', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 95, unit: '%' },
    ],
  },
  {
    id: 'marketing',
    icon: '📣',
    templates: [
      { id: 'leads_generados', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 200, unit: 'leads' },
      { id: 'costo_por_lead_cpl', type: 'value', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 500, unit: '$' },
      { id: 'trafico_organico', type: 'count', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 10000, unit: 'sesiones' },
      { id: 'tasa_de_apertura_de_emails', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 25, unit: '%' },
      { id: 'roi_de_campanas', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 300, unit: '%' },
    ],
  },
  {
    id: 'finance',
    icon: '💰',
    templates: [
      { id: 'ebitda', type: 'value', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 500000, unit: '$' },
      { id: 'dias_de_cobro_dso', type: 'value', direction: 'reduction', formula: '(target / actual) * 100', suggestedTarget: 30, unit: 'días' },
      { id: 'liquidez_corriente', type: 'ratio', direction: 'growth', formula: '(actual / target) * 100', suggestedTarget: 1.5, unit: 'ratio' },
      { id: 'presupuesto_ejecutado', type: 'ratio', direction: 'exact', formula: '100 - (Math.abs(actual - target) / target) * 100', suggestedTarget: 100, unit: '%' },
    ],
  },
]
