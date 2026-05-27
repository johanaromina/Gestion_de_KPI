/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { KPI } from '../types'
import { KPI_TEMPLATE_CATEGORIES, KPITemplate } from '../data/kpiTemplates'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './MarketplaceKPI.css'

type MarketplaceTemplate = KPITemplate & {
  templateId: string
  categoryId: string
  categoryLabel: string
  categoryIcon: string
  displayName: string
  displayDescription: string
  displayCriteria: string
  displayUnit: string
  matchNames: string[]
}

const toCatalogKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const MARKETPLACE_TEMPLATE_PREFIX = '__marketplace_template__:'

const normalizeTemplateName = (value: string) => value.trim().toLowerCase()

const buildTemplateId = (categoryId: string, templateId: string) =>
  `${categoryId}.${templateId}`

const buildTemplateMarker = (templateId: string) =>
  `${MARKETPLACE_TEMPLATE_PREFIX}${templateId}`

const parseTemplateMarker = (value?: string | null) =>
  value?.startsWith(MARKETPLACE_TEMPLATE_PREFIX)
    ? value.slice(MARKETPLACE_TEMPLATE_PREFIX.length)
    : null

export default function MarketplaceKPI() {
  const { t, i18n } = useTranslation('marketplace')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'

  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MarketplaceTemplate | null>(null)
  const [importResult, setImportResult] = useState<{ ok: string[]; skip: string[]; fail: string[] } | null>(null)

  const directionLabel = (d: KPITemplate['direction']) =>
    t(`direction.${d}`, { defaultValue: d })

  const typeLabel = (kpiType: KPITemplate['type']) =>
    t(`type.${kpiType}`, { defaultValue: kpiType })

  const categoryLabel = (categoryId: string) =>
    t(`catalog.${categoryId}.label`, { defaultValue: categoryId })

  const templateText = (
    categoryId: string,
    templateId: string,
    field: 'name' | 'description' | 'criteria',
  ) =>
    t(`catalog.${categoryId}.templates.${templateId}.${field}`, {
      defaultValue: templateId,
    })

  const templateTextForLanguage = (
    language: 'es' | 'en',
    categoryId: string,
    templateId: string,
    field: 'name' | 'description' | 'criteria',
  ) =>
    i18n.getFixedT(language, 'marketplace')(`catalog.${categoryId}.templates.${templateId}.${field}`, {
      defaultValue: templateId,
    })

  const unitLabel = (unit?: string) => {
    if (!unit) return ''
    const unitKey = toCatalogKey(unit)
    return unitKey ? t(`units.${unitKey}`, { defaultValue: unit }) : unit
  }

  const { data: existingKpis } = useQuery<KPI[]>('kpis', async () => (await api.get('/kpis')).data)

  const existingNames = useMemo(
    () => new Set((existingKpis || []).map((k) => normalizeTemplateName(k.name))),
    [existingKpis]
  )

  const existingTemplateIds = useMemo(
    () =>
      new Set(
        (existingKpis || [])
          .map((k) => parseTemplateMarker(k.defaultCalcRule))
          .filter((value): value is string => Boolean(value))
      ),
    [existingKpis]
  )

  const allTemplates = useMemo(
    (): MarketplaceTemplate[] =>
      KPI_TEMPLATE_CATEGORIES.flatMap((cat) =>
        cat.templates.map((tmpl) => ({
          ...tmpl,
          templateId: buildTemplateId(cat.id, tmpl.id),
          categoryId: cat.id,
          categoryLabel: categoryLabel(cat.id),
          categoryIcon: cat.icon,
          displayName: templateText(cat.id, tmpl.id, 'name'),
          displayDescription: templateText(cat.id, tmpl.id, 'description'),
          displayCriteria: templateText(cat.id, tmpl.id, 'criteria'),
          displayUnit: unitLabel(tmpl.unit),
          matchNames: Array.from(
            new Set([
              templateText(cat.id, tmpl.id, 'name'),
              templateTextForLanguage('es', cat.id, tmpl.id, 'name'),
              templateTextForLanguage('en', cat.id, tmpl.id, 'name'),
            ])
          ),
        }))
      ),
    [i18n.resolvedLanguage]
  )

  const displayNameByTemplateId = useMemo(
    () => new Map(allTemplates.map((tmpl) => [tmpl.templateId, tmpl.displayName])),
    [allTemplates]
  )

  const templateAlreadyExists = (tmpl: MarketplaceTemplate) =>
    existingTemplateIds.has(tmpl.templateId) ||
    tmpl.matchNames.some((name) => existingNames.has(normalizeTemplateName(name)))

  const filtered = useMemo(() => {
    let list = allTemplates
    if (selectedCategory !== 'all') list = list.filter((tmpl) => tmpl.categoryId === selectedCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (tmpl) =>
          tmpl.displayName.toLowerCase().includes(q) ||
          tmpl.displayDescription.toLowerCase().includes(q) ||
          tmpl.categoryLabel.toLowerCase().includes(q)
      )
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

  const selectAll = () => setSelected(new Set(filtered.map((tmpl) => tmpl.templateId)))
  const clearAll = () => setSelected(new Set())

  const importMutation = useMutation(
    async (templates: typeof allTemplates) => {
      const ok: string[] = []
      const skip: string[] = []
      const fail: string[] = []

      for (const tmpl of templates) {
        if (templateAlreadyExists(tmpl)) {
          skip.push(tmpl.templateId)
          continue
        }
        try {
          await api.post('/kpis', {
            name: tmpl.displayName,
            description: tmpl.displayDescription,
            type: tmpl.type,
            direction: tmpl.direction,
            criteria: tmpl.displayCriteria,
            formula: tmpl.formula,
            defaultCalcRule: buildTemplateMarker(tmpl.templateId),
          })
          ok.push(tmpl.templateId)
        } catch {
          fail.push(tmpl.templateId)
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
    const toImport = allTemplates.filter((tmpl) => selected.has(tmpl.templateId))
    if (!toImport.length) return
    importMutation.mutate(toImport)
  }

  return (
    <div className="marketplace-page">
      {/* Header */}
      <div className="marketplace-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">
            {t('subtitle', { count: allTemplates.length })}
          </p>
        </div>
        {selected.size > 0 && (
          <button
            className="btn-primary marketplace-import-btn"
            onClick={handleImport}
            disabled={importMutation.isLoading}
          >
            {importMutation.isLoading ? t('importing') : t('import_btn', { count: selected.size })}
          </button>
        )}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="marketplace-result">
          {importResult.ok.length > 0 && (
            <div className="marketplace-result-row ok">
                <span className="marketplace-result-icon">✓</span>
              <span>
                <span dangerouslySetInnerHTML={{ __html: t('result.imported', { count: importResult.ok.length }) }} />
                {' '}{importResult.ok.map((id) => displayNameByTemplateId.get(id) || id).join(', ')}
              </span>
            </div>
          )}
          {importResult.skip.length > 0 && (
            <div className="marketplace-result-row skip">
                <span className="marketplace-result-icon">⊘</span>
              <span>
                <span dangerouslySetInnerHTML={{ __html: t('result.skipped', { count: importResult.skip.length }) }} />
                {' '}{importResult.skip.map((id) => displayNameByTemplateId.get(id) || id).join(', ')}
              </span>
            </div>
          )}
          {importResult.fail.length > 0 && (
            <div className="marketplace-result-row fail">
                <span className="marketplace-result-icon">✕</span>
              <span>
                <span dangerouslySetInnerHTML={{ __html: t('result.failed', { count: importResult.fail.length }) }} />
                {' '}{importResult.fail.map((id) => displayNameByTemplateId.get(id) || id).join(', ')}
              </span>
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
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="marketplace-categories">
          <button
            className={`marketplace-cat-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            {t('cat_all', { count: allTemplates.length })}
          </button>
          {KPI_TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`marketplace-cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.icon} {categoryLabel(cat.id)} ({cat.templates.length})
            </button>
          ))}
        </div>
      </div>

      {/* Selection bar */}
      {filtered.length > 0 && (
        <div className="marketplace-selection-bar">
          <span className="marketplace-selection-count">
            {selected.size > 0 ? t('selection.count', { count: selected.size }) : t('selection.none')}
          </span>
          <div className="marketplace-selection-actions">
            <button className="marketplace-link-btn" onClick={selectAll}>
              {t('selection.select_all', { count: filtered.length })}
            </button>
            {selected.size > 0 && (
              <button className="marketplace-link-btn" onClick={clearAll}>{t('selection.clear')}</button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="marketplace-empty">{t('empty')}</div>
      ) : (
        <div className="marketplace-grid">
          {filtered.map((tmpl) => {
            const alreadyExists = templateAlreadyExists(tmpl)
            const isSelected = selected.has(tmpl.templateId)
            return (
              <div
                key={tmpl.templateId}
                className={`marketplace-card ${isSelected ? 'selected' : ''} ${alreadyExists ? 'exists' : ''}`}
                onClick={() => !alreadyExists && toggleSelect(tmpl.templateId)}
              >
                <div className="marketplace-card-top">
                  <span className="marketplace-card-category">{tmpl.categoryIcon} {tmpl.categoryLabel}</span>
                  {alreadyExists
                    ? <span className="marketplace-card-badge exists">{t('card.exists_badge')}</span>
                    : isSelected
                    ? <span className="marketplace-card-badge selected">{t('card.selected_badge')}</span>
                    : null
                  }
                </div>
                <h3 className="marketplace-card-name">{tmpl.displayName}</h3>
                <p className="marketplace-card-desc">{tmpl.displayDescription}</p>
                <div className="marketplace-card-meta">
                  <span className={`marketplace-type-pill type-${tmpl.type}`}>{typeLabel(tmpl.type)}</span>
                  <span className={`marketplace-dir-pill dir-${tmpl.direction}`}>{directionLabel(tmpl.direction)}</span>
                  {tmpl.suggestedTarget && (
                    <span className="marketplace-target-pill">
                      {t('modal.target_label')}: {new Intl.NumberFormat(locale).format(tmpl.suggestedTarget)}{tmpl.displayUnit ? ` ${tmpl.displayUnit}` : ''}
                    </span>
                  )}
                </div>
                <button
                  className="marketplace-preview-btn"
                  onClick={(e) => { e.stopPropagation(); setPreview(tmpl) }}
                >
                  {t('card.preview_btn')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="marketplace-modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setPreview(null))}
        >
          <div className="marketplace-modal" onClick={(e) => e.stopPropagation()}>
            <div className="marketplace-modal-header">
              <div>
                <span className="marketplace-modal-cat">{preview.categoryIcon} {preview.categoryLabel}</span>
                <h2 className="marketplace-modal-name">{preview.displayName}</h2>
              </div>
              <button className="marketplace-modal-close" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="marketplace-modal-body">
              <p className="marketplace-modal-desc">{preview.displayDescription}</p>
              <div className="marketplace-modal-grid">
                <div className="marketplace-modal-field">
                  <span className="marketplace-modal-label">{t('modal.type_label')}</span>
                  <span>{typeLabel(preview.type)}</span>
                </div>
                <div className="marketplace-modal-field">
                  <span className="marketplace-modal-label">{t('modal.direction_label')}</span>
                  <span>{directionLabel(preview.direction)}</span>
                </div>
                {preview.suggestedTarget && (
                  <div className="marketplace-modal-field">
                    <span className="marketplace-modal-label">{t('modal.target_label')}</span>
                    <span>{new Intl.NumberFormat(locale).format(preview.suggestedTarget)} {preview.displayUnit || ''}</span>
                  </div>
                )}
              </div>
              <div className="marketplace-modal-field full">
                <span className="marketplace-modal-label">{t('modal.criteria_label')}</span>
                <p className="marketplace-modal-criteria">{preview.displayCriteria}</p>
              </div>
              {preview.formula && (
                <div className="marketplace-modal-field full">
                  <span className="marketplace-modal-label">{t('modal.formula_label')}</span>
                  <code className="marketplace-modal-formula">{preview.formula}</code>
                </div>
              )}
            </div>
            <div className="marketplace-modal-actions">
              <button className="btn-secondary" onClick={() => setPreview(null)}>{t('modal.close')}</button>
              {templateAlreadyExists(preview) ? (
                <span className="marketplace-modal-exists">{t('modal.exists_in_catalog')}</span>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => {
                    toggleSelect(preview.templateId)
                    setPreview(null)
                  }}
                >
                  {selected.has(preview.templateId) ? t('modal.deselect') : t('modal.select_to_import')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
