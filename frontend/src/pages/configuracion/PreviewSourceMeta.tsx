import { useTranslation } from 'react-i18next'

type SummaryItem = {
  label: string
  value: string
}

type PreviewRow = {
  externalKey?: unknown
  previewValue?: unknown
}

type SourceMetaRecord = Record<string, unknown>

const isRecord = (value: unknown): value is SourceMetaRecord => typeof value === 'object' && value !== null

const readString = (value: unknown) => {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

const readNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const readStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item))
}

const readPreviewRows = (value: unknown): PreviewRow[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

const formatPreviewMetricValue = (value: unknown, emptyLabel: string) => {
  if (value === null || value === undefined || value === '') return emptyLabel
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : emptyLabel
  return String(value)
}

export const PreviewSourceMeta = ({ sourceMeta }: { sourceMeta: unknown }) => {
  const { t } = useTranslation('config')
  if (!isRecord(sourceMeta)) return null

  const connector = readString(sourceMeta.connector)
  const previewRows = readPreviewRows(sourceMeta.previewRows)
  const unmappedKeys = readStringArray(sourceMeta.unmappedKeys)
  const matchedRows = readNumber(sourceMeta.matchedRows)
  const mappedRows = readNumber(sourceMeta.mappedRows)
  const unmappedCount = readNumber(sourceMeta.unmappedCount) || unmappedKeys.length
  const resolvedResource =
    sourceMeta.resolvedResourceType && sourceMeta.resolvedResourceId
      ? `${sourceMeta.resolvedResourceType} · ${sourceMeta.resolvedResourceId}`
      : ''
  const requestedResource =
    sourceMeta.resourceType && sourceMeta.resourceId ? `${sourceMeta.resourceType} · ${sourceMeta.resourceId}` : ''

  const summaryItems: SummaryItem[] = []

  if (connector) {
    summaryItems.push({
      label: t('preview_meta.labels.connector'),
      value: connector,
    })
  }
  if (requestedResource) {
    summaryItems.push({
      label: t('preview_meta.labels.requested_resource'),
      value: requestedResource,
    })
  }
  if (resolvedResource && resolvedResource !== requestedResource) {
    summaryItems.push({
      label: t('preview_meta.labels.resolved_resource'),
      value: resolvedResource,
    })
  }
  if (sourceMeta.resultFormat) {
    summaryItems.push({
      label: t('preview_meta.labels.format'),
      value: String(sourceMeta.resultFormat),
    })
  }
  if (sourceMeta.aggregation) {
    summaryItems.push({
      label: t('preview_meta.labels.aggregation'),
      value: String(sourceMeta.aggregation),
    })
  }
  if (matchedRows > 0 || mappedRows > 0 || unmappedCount > 0) {
    summaryItems.push({
      label: t('preview_meta.labels.rows'),
      value: t('preview_meta.rows_summary', {
        matched: matchedRows,
        mapped: mappedRows,
        unmapped: unmappedCount,
      }),
    })
  }
  if (sourceMeta.resultPath || sourceMeta.mappingResultPath) {
    summaryItems.push({
      label: t('preview_meta.labels.result_path'),
      value: String(sourceMeta.mappingResultPath || sourceMeta.resultPath),
    })
  }
  if (sourceMeta.mappingKeyPath) {
    summaryItems.push({
      label: t('preview_meta.labels.key_path'),
      value: String(sourceMeta.mappingKeyPath),
    })
  }
  if (sourceMeta.mappingValuePath || sourceMeta.valuePath) {
    summaryItems.push({
      label: t('preview_meta.labels.value_path'),
      value: String(sourceMeta.mappingValuePath || sourceMeta.valuePath),
    })
  }
  if (sourceMeta.extractedValue !== undefined) {
    summaryItems.push({
      label: t('preview_meta.labels.extracted_value'),
      value: formatPreviewMetricValue(sourceMeta.extractedValue, t('preview_meta.not_available')),
    })
  }

  return (
    <div className="preview-meta-block">
      {summaryItems.length > 0 ? (
        <div className="preview-meta-grid">
          {summaryItems.map((item) => (
            <div key={`${item.label}-${item.value}`} className="preview-meta-card">
              <div className="preview-meta-label">{item.label}</div>
              <div className="preview-meta-value">{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {connector === 'looker' && sourceMeta.dashboardElementTitle ? (
        <div className="form-hint">
          {t('preview_meta.dashboard_element_resolved')} <strong>{String(sourceMeta.dashboardElementTitle)}</strong>
          {sourceMeta.dashboardElementId ? ` · id ${sourceMeta.dashboardElementId}` : ''}
        </div>
      ) : null}

      {unmappedCount > 0 ? (
        <div className="form-warning">
          {t('preview_meta.unmapped_warning')}: <strong>{unmappedKeys.slice(0, 10).join(', ')}</strong>
          {unmappedCount > 10 ? ` ${t('preview_meta.unmapped_more', { count: unmappedCount - 10 })}` : '.'}
        </div>
      ) : null}

      {previewRows.length > 0 ? (
        <div className="preview-jql">
          <strong>{t('preview_meta.sample_rows')}</strong>
          <div className="preview-meta-table-wrap">
            <table className="preview-meta-table">
              <thead>
                <tr>
                  <th>{t('preview_meta.table.external_key')}</th>
                  <th>{t('preview_meta.table.preview_value')}</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${String(row.externalKey || 'row')}-${index}`}>
                    <td>{String(row.externalKey || '')}</td>
                    <td>{formatPreviewMetricValue(row.previewValue, t('preview_meta.not_available'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sourceMeta.requestUrl ? (
        <div className="preview-jql">
          <strong>{t('preview_meta.request_url')}</strong>
          <pre>{String(sourceMeta.requestUrl)}</pre>
        </div>
      ) : null}
    </div>
  )
}
