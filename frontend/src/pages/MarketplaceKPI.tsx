/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import { KPI_TEMPLATE_CATEGORIES, KPITemplate } from '../data/kpiTemplates'
import './MarketplaceKPI.css'

const directionLabel = (d: KPITemplate['direction']) =>
  d === 'growth' ? 'Crecimiento ↑' : d === 'reduction' ? 'Reducción ↓' : 'Exacto ='

const typeLabel = (t: KPITemplate['type']) =>
  ({ manual: 'Manual', count: 'Conteo', ratio: 'Ratio', sla: 'SLA', value: 'Valor' }[t] || t)

export default function MarketplaceKPI() {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<KPITemplate | null>(null)
  const [importResult, setImportResult] = useState<{ ok: string[]; skip: string[]; fail: string[] } | null>(null)

  const { data: existingKpis } = useQuery<KPI[]>('kpis', async () => (await api.get('/kpis')).data)

  const existingNames = useMemo(
    () => new Set((existingKpis || []).map((k) => k.name.toLowerCase().trim())),
    [existingKpis]
  )

  const allTemplates = useMemo(
    () => KPI_TEMPLATE_CATEGORIES.flatMap((cat) => cat.templates.map((t) => ({ ...t, categoryId: cat.id, categoryLabel: cat.label, categoryIcon: cat.icon }))),
    []
  )

  const filtered = useMemo(() => {
    let list = allTemplates
    if (selectedCategory !== 'all') list = list.filter((t) => t.categoryId === selectedCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    }
    return list
  }, [allTemplates, selectedCategory, search])

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(filtered.map((t) => t.name)))
  const clearAll = () => setSelected(new Set())

  const importMutation = useMutation(
    async (templates: typeof allTemplates) => {
      const ok: string[] = []
      const skip: string[] = []
      const fail: string[] = []

      for (const t of templates) {
        if (existingNames.has(t.name.toLowerCase().trim())) {
          skip.push(t.name)
          continue
        }
        try {
          await api.post('/kpis', {
            name: t.name,
            description: t.description,
            type: t.type,
            direction: t.direction,
            criteria: t.criteria,
            formula: t.formula,
          })
          ok.push(t.name)
        } catch {
          fail.push(t.name)
        }
      }
      return { ok, skip, fail }
    },
    {
      onSuccess: (result) => {
        setImportResult(result)
        setSelected(new Set())
        queryClient.invalidateQueries('kpis')
      },
    }
  )

  const handleImport = () => {
    const toImport = allTemplates.filter((t) => selected.has(t.name))
    if (!toImport.length) return
    importMutation.mutate(toImport)
  }

  return (
    <div className="marketplace-page">
      {/* Header */}
      <div className="marketplace-header">
        <div>
          <h1>Marketplace de KPI Templates</h1>
          <p className="subtitle">
            {allTemplates.length} templates por industria listos para importar. Seleccioná los que aplican a tu organización y se crean en un click.
          </p>
        </div>
        {selected.size > 0 && (
          <button
            className="btn-primary marketplace-import-btn"
            onClick={handleImport}
            disabled={importMutation.isLoading}
          >
            {importMutation.isLoading ? 'Importando...' : `Importar ${selected.size} KPI${selected.size > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="marketplace-result">
          {importResult.ok.length > 0 && (
            <div className="marketplace-result-row ok">
              <span className="marketplace-result-icon">✓</span>
              <span><strong>{importResult.ok.length} importados:</strong> {importResult.ok.join(', ')}</span>
            </div>
          )}
          {importResult.skip.length > 0 && (
            <div className="marketplace-result-row skip">
              <span className="marketplace-result-icon">⊘</span>
              <span><strong>{importResult.skip.length} ya existían:</strong> {importResult.skip.join(', ')}</span>
            </div>
          )}
          {importResult.fail.length > 0 && (
            <div className="marketplace-result-row fail">
              <span className="marketplace-result-icon">✕</span>
              <span><strong>{importResult.fail.length} fallaron:</strong> {importResult.fail.join(', ')}</span>
            </div>
          )}
          <button className="marketplace-result-close" onClick={() => setImportResult(null)}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="marketplace-filters">
        <div className="marketplace-search-wrap">
          <input
            type="text"
            className="marketplace-search"
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="marketplace-categories">
          <button
            className={`marketplace-cat-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Todos ({allTemplates.length})
          </button>
          {KPI_TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`marketplace-cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.icon} {cat.label} ({cat.templates.length})
            </button>
          ))}
        </div>
      </div>

      {/* Selection bar */}
      {filtered.length > 0 && (
        <div className="marketplace-selection-bar">
          <span className="marketplace-selection-count">
            {selected.size > 0 ? `${selected.size} seleccionados` : 'Seleccioná los KPIs a importar'}
          </span>
          <div className="marketplace-selection-actions">
            <button className="marketplace-link-btn" onClick={selectAll}>Seleccionar todos ({filtered.length})</button>
            {selected.size > 0 && <button className="marketplace-link-btn" onClick={clearAll}>Limpiar selección</button>}
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="marketplace-empty">No hay templates que coincidan con tu búsqueda.</div>
      ) : (
        <div className="marketplace-grid">
          {filtered.map((t) => {
            const alreadyExists = existingNames.has(t.name.toLowerCase().trim())
            const isSelected = selected.has(t.name)
            return (
              <div
                key={`${t.categoryId}-${t.name}`}
                className={`marketplace-card ${isSelected ? 'selected' : ''} ${alreadyExists ? 'exists' : ''}`}
                onClick={() => !alreadyExists && toggleSelect(t.name)}
              >
                <div className="marketplace-card-top">
                  <span className="marketplace-card-category">{t.categoryIcon} {t.categoryLabel}</span>
                  {alreadyExists
                    ? <span className="marketplace-card-badge exists">Ya existe</span>
                    : isSelected
                    ? <span className="marketplace-card-badge selected">✓ Seleccionado</span>
                    : null
                  }
                </div>
                <h3 className="marketplace-card-name">{t.name}</h3>
                <p className="marketplace-card-desc">{t.description}</p>
                <div className="marketplace-card-meta">
                  <span className={`marketplace-type-pill type-${t.type}`}>{typeLabel(t.type)}</span>
                  <span className={`marketplace-dir-pill dir-${t.direction}`}>{directionLabel(t.direction)}</span>
                  {t.suggestedTarget && (
                    <span className="marketplace-target-pill">
                      Meta sugerida: {new Intl.NumberFormat('es-AR').format(t.suggestedTarget)}{t.unit ? ` ${t.unit}` : ''}
                    </span>
                  )}
                </div>
                <button
                  className="marketplace-preview-btn"
                  onClick={(e) => { e.stopPropagation(); setPreview(t) }}
                >
                  Ver detalle
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="marketplace-modal-overlay" onClick={() => setPreview(null)}>
          <div className="marketplace-modal" onClick={(e) => e.stopPropagation()}>
            <div className="marketplace-modal-header">
              <div>
                <span className="marketplace-modal-cat">{(preview as any).categoryIcon} {(preview as any).categoryLabel}</span>
                <h2 className="marketplace-modal-name">{preview.name}</h2>
              </div>
              <button className="marketplace-modal-close" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="marketplace-modal-body">
              <p className="marketplace-modal-desc">{preview.description}</p>
              <div className="marketplace-modal-grid">
                <div className="marketplace-modal-field">
                  <span className="marketplace-modal-label">Tipo</span>
                  <span>{typeLabel(preview.type)}</span>
                </div>
                <div className="marketplace-modal-field">
                  <span className="marketplace-modal-label">Dirección</span>
                  <span>{directionLabel(preview.direction)}</span>
                </div>
                {preview.suggestedTarget && (
                  <div className="marketplace-modal-field">
                    <span className="marketplace-modal-label">Meta sugerida</span>
                    <span>{new Intl.NumberFormat('es-AR').format(preview.suggestedTarget)} {preview.unit || ''}</span>
                  </div>
                )}
              </div>
              <div className="marketplace-modal-field full">
                <span className="marketplace-modal-label">Criterio de medición</span>
                <p className="marketplace-modal-criteria">{preview.criteria}</p>
              </div>
              {preview.formula && (
                <div className="marketplace-modal-field full">
                  <span className="marketplace-modal-label">Fórmula de variación</span>
                  <code className="marketplace-modal-formula">{preview.formula}</code>
                </div>
              )}
            </div>
            <div className="marketplace-modal-actions">
              <button className="btn-secondary" onClick={() => setPreview(null)}>Cerrar</button>
              {existingNames.has(preview.name.toLowerCase().trim()) ? (
                <span className="marketplace-modal-exists">Ya existe en tu catálogo</span>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => {
                    toggleSelect(preview.name)
                    setPreview(null)
                  }}
                >
                  {selected.has(preview.name) ? 'Quitar selección' : 'Seleccionar para importar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
