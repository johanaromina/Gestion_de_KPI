import { buildNarrative, NarrativeInput } from './executiveNarrative'

const fmt = (v: number | null | undefined, digits = 1) =>
  v == null ? '-' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(v)

const riskColor = (v: number | null | undefined) => {
  if (v == null) return '#9ca3af'
  if (v >= 100) return '#15803d'
  if (v >= 80) return '#b45309'
  return '#b91c1c'
}

const riskBg = (v: number | null | undefined) => {
  if (v == null) return '#f9fafb'
  if (v >= 100) return '#f0fdf4'
  if (v >= 80) return '#fffbeb'
  return '#fef2f2'
}

const riskLabel = (v: number | null | undefined) => {
  if (v == null) return 'Sin datos'
  if (v >= 100) return 'En track'
  if (v >= 80) return 'Atención'
  return 'En riesgo'
}

export interface ExportArea {
  name: string
  type: string
  averageVariation: number | null
  kpiCount: number
  kpis: Array<{ name: string; variation: number | null; target: number; actual: number | null }>
}

export interface ExportData {
  periodName: string | null | undefined
  subPeriodName?: string | null
  companyName: string
  summary: {
    averageVariation: number | null | undefined
    totalScopeKpis: number
    approvedScopeKpis: number
    completionRate: number | null | undefined
    weightedResultTotal: number | null | undefined
  }
  objectiveNames: string[]
  areas: ExportArea[]
}

export function exportExecutivePDF(data: ExportData) {
  const period = [data.periodName, data.subPeriodName].filter(Boolean).join(' · ')
  const date = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

  const topRisk = data.areas
    .flatMap((a) => a.kpis.map((k) => ({ ...k, scopeName: a.name })))
    .filter((k) => k.variation != null)
    .sort((a, b) => (a.variation ?? 999) - (b.variation ?? 999))
    .slice(0, 5)

  const topPerformers = data.areas
    .flatMap((a) => a.kpis.map((k) => ({ ...k, scopeName: a.name })))
    .filter((k) => k.variation != null && (k.variation ?? 0) >= 100)
    .sort((a, b) => (b.variation ?? 0) - (a.variation ?? 0))
    .slice(0, 5)

  const narrativeInput: NarrativeInput = {
    periodName: data.periodName,
    subPeriodName: data.subPeriodName,
    companyName: data.companyName,
    averageVariation: data.summary.averageVariation,
    totalScopeKpis: data.summary.totalScopeKpis,
    approvedScopeKpis: data.summary.approvedScopeKpis,
    completionRate: data.summary.completionRate,
    weightedResultTotal: data.summary.weightedResultTotal,
    objectiveNames: data.objectiveNames,
    areas: data.areas.map((a) => ({ name: a.name, type: a.type, averageVariation: a.averageVariation, kpiCount: a.kpiCount })),
    topRisk,
    topPerformers,
  }

  const narrative = buildNarrative(narrativeInput)

  const areasRows = data.areas
    .map(
      (area) => `
      <div class="area-card">
        <div class="area-header" style="background:${riskBg(area.averageVariation)};border-left:4px solid ${riskColor(area.averageVariation)}">
          <div>
            <span class="area-name">${area.name}</span>
            <span class="area-type">${area.type.replace('_', ' ')}</span>
          </div>
          <div class="area-avg" style="color:${riskColor(area.averageVariation)}">
            ${fmt(area.averageVariation)}%
            <span class="area-risk-label">${riskLabel(area.averageVariation)}</span>
          </div>
        </div>
        ${
          area.kpis.length > 0
            ? `<table class="kpi-table">
            <thead><tr><th>KPI</th><th>Target</th><th>Real</th><th>Variación</th></tr></thead>
            <tbody>
              ${area.kpis
                .map(
                  (k) => `<tr>
                <td>${k.name}</td>
                <td>${fmt(k.target, 0)}</td>
                <td>${k.actual != null ? fmt(k.actual, 1) : '-'}</td>
                <td style="color:${riskColor(k.variation)};font-weight:700">${k.variation != null ? `${fmt(k.variation)}%` : '-'}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>`
            : '<p class="no-kpis">Sin KPIs registrados.</p>'
        }
      </div>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Reporte Ejecutivo — ${data.companyName} — ${period || date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1f2937; background: #fff; }
    .page { max-width: 900px; margin: 0 auto; padding: 32px 40px; }

    /* Header */
    .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #f97316; padding-bottom: 16px; margin-bottom: 24px; }
    .report-title { font-size: 22px; font-weight: 800; color: #111827; }
    .report-meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .report-logo { font-size: 13px; font-weight: 700; color: #f97316; }

    /* Summary pills */
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
    .summary-label { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-value { font-size: 20px; font-weight: 800; color: #111827; margin-top: 4px; }
    .summary-sub { font-size: 10px; color: #9ca3af; margin-top: 2px; }

    /* Narrative */
    .narrative-section { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px; }
    .narrative-title { font-size: 12px; font-weight: 700; color: #92400e; margin-bottom: 8px; }
    .narrative-text { font-size: 12px; color: #374151; line-height: 1.7; white-space: pre-line; }

    /* Areas */
    .section-title { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    .area-card { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
    .area-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; }
    .area-name { font-size: 13px; font-weight: 700; color: #111827; }
    .area-type { font-size: 10px; color: #6b7280; background: #f3f4f6; padding: 2px 7px; border-radius: 4px; margin-left: 8px; }
    .area-avg { font-size: 18px; font-weight: 800; text-align: right; }
    .area-risk-label { display: block; font-size: 10px; font-weight: 600; opacity: 0.8; }
    .kpi-table { width: 100%; border-collapse: collapse; }
    .kpi-table th { background: #f9fafb; padding: 6px 12px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    .kpi-table td { padding: 6px 12px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
    .kpi-table tr:last-child td { border-bottom: none; }
    .no-kpis { padding: 10px 14px; color: #9ca3af; font-style: italic; font-size: 11px; }

    /* Footer */
    .report-footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }

    /* Print */
    @media print {
      body { font-size: 11px; }
      .page { padding: 16px 20px; }
      .area-card { page-break-inside: avoid; }
      .no-print { display: none !important; }
      @page { margin: 1.5cm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="report-header">
      <div>
        <div class="report-title">Reporte Ejecutivo — ${data.companyName}</div>
        <div class="report-meta">${period || 'Período actual'} · Generado el ${date}</div>
      </div>
      <div class="report-logo">KPI Manager</div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Variación promedio</div>
        <div class="summary-value" style="color:${riskColor(data.summary.averageVariation)}">${fmt(data.summary.averageVariation)}%</div>
        <div class="summary-sub">${riskLabel(data.summary.averageVariation)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Cobertura</div>
        <div class="summary-value">${fmt(data.summary.completionRate, 0)}%</div>
        <div class="summary-sub">${data.summary.approvedScopeKpis} / ${data.summary.totalScopeKpis} KPIs</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Resultado ponderado</div>
        <div class="summary-value">${fmt(data.summary.weightedResultTotal)}</div>
        <div class="summary-sub">puntos</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Áreas analizadas</div>
        <div class="summary-value">${data.areas.length}</div>
        <div class="summary-sub">${data.objectiveNames.length} objetivos</div>
      </div>
    </div>

    <div class="narrative-section">
      <div class="narrative-title">Análisis ejecutivo automático</div>
      <div class="narrative-text">${narrative}</div>
    </div>

    <div class="section-title">Detalle por área</div>
    ${areasRows || '<p style="color:#9ca3af">Sin áreas con datos.</p>'}

    <div class="report-footer">
      <span>KPI Manager — Reporte generado el ${date}</span>
      <span>${data.companyName} · ${period || 'Período actual'}</span>
    </div>

    <div class="no-print" style="text-align:center;margin-top:28px">
      <button onclick="window.print()" style="background:#f97316;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
        Imprimir / Guardar PDF
      </button>
      <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-left:10px">
        Cerrar
      </button>
    </div>
  </div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
}
