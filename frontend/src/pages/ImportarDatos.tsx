import { useRef, useState } from 'react'
import { useMutation } from 'react-query'
import { useTranslation } from 'react-i18next'
import { TFunction } from 'i18next'
import api from '../services/api'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './ImportarDatos.css'

type Tab = 'areas' | 'colaboradores'

type AreaRow = { name: string; type: string; parentName: string; _errors?: string[] }
type ColabRow = { name: string; email: string; position: string; role: string; areaName: string; _errors?: string[] }

type ImportError = { row: number; code?: string; message: string; values?: Record<string, unknown> }
type ImportResult = { total: number; created: number; errors: ImportError[] }
type ImportResponse = { total?: number; created?: number; errors?: ImportError[]; _submittedCount?: number }

const AREA_TYPES = ['company', 'area', 'team', 'business_unit']
const VALID_ROLES = ['collaborator', 'leader', 'director', 'admin']

const AREA_IMPORT_API_ERROR_KEYS: Record<string, string> = {
  ORG_SCOPE_IMPORT_ROWS_REQUIRED: 'areas.api_errors.rows_required',
  ORG_SCOPE_IMPORT_NAME_EMPTY: 'areas.api_errors.name_empty',
  ORG_SCOPE_IMPORT_NAME_EXISTS: 'areas.api_errors.name_exists',
  ORG_SCOPE_IMPORT_PARENT_NOT_FOUND: 'areas.api_errors.parent_not_found',
  ORG_SCOPE_IMPORT_DUPLICATE: 'areas.api_errors.duplicate',
  ORG_SCOPE_IMPORT_COMPANY_ALREADY_EXISTS: 'areas.api_errors.company_exists',
  ORG_SCOPE_IMPORT_COMPANY_PARENT_INVALID: 'areas.api_errors.company_parent_invalid',
  ORG_SCOPE_IMPORT_FAILED: 'areas.api_errors.import_failed',
}

const COLLABORATOR_IMPORT_API_ERROR_KEYS: Record<string, string> = {
  COLLABORATOR_IMPORT_FORBIDDEN: 'collaborators.api_errors.forbidden',
  COLLABORATOR_IMPORT_ROWS_REQUIRED: 'collaborators.api_errors.rows_required',
  COLLABORATOR_IMPORT_NAME_EMPTY: 'collaborators.api_errors.name_empty',
  COLLABORATOR_IMPORT_ROLE_INVALID: 'collaborators.api_errors.role_invalid',
  COLLABORATOR_IMPORT_EMAIL_EXISTS: 'collaborators.api_errors.email_exists',
  COLLABORATOR_IMPORT_AREA_NOT_FOUND: 'collaborators.api_errors.area_not_found',
  COLLABORATOR_IMPORT_FAILED: 'collaborators.api_errors.import_failed',
}

// ── Parser CSV simple ────────────────────────────────────────────────────────

function detectCsvDelimiter(headerLine: string) {
  const counts = [
    { delimiter: ',', count: (headerLine.match(/,/g) || []).length },
    { delimiter: ';', count: (headerLine.match(/;/g) || []).length },
    { delimiter: '\t', count: (headerLine.match(/\t/g) || []).length },
  ]
  return counts.sort((a, b) => b.count - a.count)[0]?.count ? counts.sort((a, b) => b.count - a.count)[0].delimiter : ','
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseCsv(text: string): string[][] {
  const normalized = text
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return []

  const delimiter = detectCsvDelimiter(lines[0])
  return lines.map((line) => splitCsvLine(line, delimiter))
}

function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildImportResult(total: number, data?: ImportResponse | null): ImportResult {
  return {
    total,
    created: Number(data?.created || 0),
    errors: Array.isArray(data?.errors) ? data.errors : [],
  }
}

function getRejectedCount(result: ImportResult) {
  return Math.max(result.total - result.created, result.errors.length)
}

function getImportErrorMessage(
  error: ImportError,
  t: TFunction,
  codeMap: Record<string, string>
) {
  return resolveApiErrorMessage(error, t, { codeMap }) || error.message
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function ImportarDatos() {
  const { t } = useTranslation(['import', 'common'])
  const [tab, setTab] = useState<Tab>('areas')
  const areaTemplateCsv = t('areas.template_csv')
  const areaTemplateFilename = t('areas.template_filename')
  const collaboratorTemplateCsv = t('collaborators.template_csv')
  const collaboratorTemplateFilename = t('collaborators.template_filename')

  // Areas
  const [areaRows, setAreaRows] = useState<AreaRow[]>([])
  const [areaResult, setAreaResult] = useState<ImportResult | null>(null)
  const areaInputRef = useRef<HTMLInputElement>(null)

  // Colaboradores
  const [colabRows, setColabRows] = useState<ColabRow[]>([])
  const [colabResult, setColabResult] = useState<ImportResult | null>(null)
  const colabInputRef = useRef<HTMLInputElement>(null)

  // ── Parsear CSV de áreas ──────────────────────────────────────────────────

  const handleAreaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = parseCsv(text)
      if (lines.length < 2) return
      const header = lines[0].map((h) => h.toLowerCase())
      const nameIdx = header.findIndex((h) => h.includes('nombre') || h === 'name')
      const typeIdx = header.findIndex((h) => h.includes('tipo') || h === 'type')
      const parentIdx = header.findIndex((h) => h.includes('padre') || h.includes('parent'))

      const rows: AreaRow[] = lines.slice(1).map((cols) => {
        const row: AreaRow = {
          name: nameIdx >= 0 ? cols[nameIdx] || '' : cols[0] || '',
          type: typeIdx >= 0 ? cols[typeIdx] || 'area' : cols[1] || 'area',
          parentName: parentIdx >= 0 ? cols[parentIdx] || '' : cols[2] || '',
        }
        const errs: string[] = []
        if (!row.name) errs.push(t('areas.err_name_empty'))
        if (row.type && !AREA_TYPES.includes(row.type.toLowerCase())) errs.push(t('areas.err_type_invalid', { type: row.type }))
        if (errs.length) row._errors = errs
        return row
      })
      setAreaRows(rows)
      setAreaResult(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Parsear CSV de colaboradores ──────────────────────────────────────────

  const handleColabFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = parseCsv(text)
      if (lines.length < 2) return
      const header = lines[0].map((h) => h.toLowerCase())
      const nameIdx = header.findIndex((h) => h.includes('nombre') || h === 'name')
      const emailIdx = header.findIndex((h) => h.includes('email') || h.includes('mail'))
      const posIdx = header.findIndex((h) => h.includes('cargo') || h.includes('posicion') || h.includes('position'))
      const roleIdx = header.findIndex((h) => h.includes('rol') || h === 'role')
      const areaIdx = header.findIndex((h) => h.includes('area') || h.includes('equipo'))

      const rows: ColabRow[] = lines.slice(1).map((cols) => {
        const row: ColabRow = {
          name: nameIdx >= 0 ? cols[nameIdx] || '' : cols[0] || '',
          email: emailIdx >= 0 ? cols[emailIdx] || '' : cols[1] || '',
          position: posIdx >= 0 ? cols[posIdx] || '' : cols[2] || '',
          role: roleIdx >= 0 ? cols[roleIdx] || 'collaborator' : cols[3] || 'collaborator',
          areaName: areaIdx >= 0 ? cols[areaIdx] || '' : cols[4] || '',
        }
        const errs: string[] = []
        if (!row.name) errs.push(t('collaborators.err_name_empty'))
        if (row.role && !VALID_ROLES.includes(row.role.toLowerCase())) errs.push(t('collaborators.err_role_invalid', { role: row.role }))
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errs.push(t('collaborators.err_email_invalid'))
        if (errs.length) row._errors = errs
        return row
      })
      setColabRows(rows)
      setColabResult(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const importAreasMutation = useMutation(
    async () => {
      const submittedCount = areaRows.length
      const res = await api.post('/org-scopes/import', {
        rows: areaRows.map(({ name, type, parentName }) => ({ name, type: type || 'area', parentName: parentName || undefined })),
      })
      return { ...res.data, _submittedCount: submittedCount }
    },
    {
      onSuccess: (data: ImportResponse) => {
        const result = buildImportResult(Number(data?._submittedCount || data?.total || areaRows.length), data)
        setAreaResult(result)
        if (result.created > 0) setAreaRows([])
      },
      onError: (err: any) => {
        setAreaResult(buildImportResult(areaRows.length, {
          created: 0,
          errors: [{
            row: 0,
            message: resolveApiErrorMessage(err, t, {
              codeMap: AREA_IMPORT_API_ERROR_KEYS,
              fallbackKey: 'areas.error_import',
            }),
          }],
        }))
      },
    }
  )

  const importColabMutation = useMutation(
    async () => {
      const submittedCount = colabRows.length
      const res = await api.post('/collaborators/import', {
        rows: colabRows.map(({ name, email, position, role, areaName }) => ({
          name, email: email || undefined, position: position || undefined,
          role: role || 'collaborator', areaName: areaName || undefined,
        })),
      })
      return { ...res.data, _submittedCount: submittedCount }
    },
    {
      onSuccess: (data: ImportResponse) => {
        const result = buildImportResult(Number(data?._submittedCount || data?.total || colabRows.length), data)
        setColabResult(result)
        if (result.created > 0) setColabRows([])
      },
      onError: (err: any) => {
        setColabResult(buildImportResult(colabRows.length, {
          created: 0,
          errors: [{
            row: 0,
            message: resolveApiErrorMessage(err, t, {
              codeMap: COLLABORATOR_IMPORT_API_ERROR_KEYS,
              fallbackKey: 'collaborators.error_import',
            }),
          }],
        }))
      },
    }
  )

  const hasAreaErrors = areaRows.some((r) => r._errors?.length)
  const hasColabErrors = colabRows.some((r) => r._errors?.length)

  return (
    <div className="importar-page">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="import-tabs">
        <button
          className={`import-tab ${tab === 'areas' ? 'import-tab--active' : ''}`}
          onClick={() => setTab('areas')}
        >
          📂 {t('tab_areas')}
        </button>
        <button
          className={`import-tab ${tab === 'colaboradores' ? 'import-tab--active' : ''}`}
          onClick={() => setTab('colaboradores')}
        >
          👥 {t('tab_collaborators')}
        </button>
      </div>

      {/* ── Tab Áreas ── */}
      {tab === 'areas' && (
        <div className="import-section">
          <div className="import-info-box">
            <p>
              <strong>{t('areas.format_title')}</strong>{' '}
              <span dangerouslySetInnerHTML={{ __html: t('areas.format_cols') }} />
            </p>
            <p dangerouslySetInnerHTML={{ __html: t('areas.format_sep') }} />
            <p dangerouslySetInnerHTML={{ __html: t('areas.format_types') }} />
            <p dangerouslySetInnerHTML={{ __html: t('areas.format_root') }} />
            <p dangerouslySetInnerHTML={{ __html: t('areas.format_single_company') }} />
            <button
              className="btn-download-template"
              onClick={() => downloadTemplate(areaTemplateCsv, areaTemplateFilename)}
            >
              {t('areas.download_template')}
            </button>
          </div>

          <div className="import-upload-row">
            <input ref={areaInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleAreaFile} />
            <button className="btn-upload" onClick={() => areaInputRef.current?.click()}>
              📁 {t('areas.select_file')}
            </button>
            {areaRows.length > 0 && (
              <span className="import-file-info">{t('areas.rows_loaded', { count: areaRows.length })}</span>
            )}
          </div>

          {areaRows.length > 0 && (
            <>
              <div className="import-preview-scroll">
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>{t('areas.table_num')}</th>
                      <th>{t('areas.table_name')}</th>
                      <th>{t('areas.table_type')}</th>
                      <th>{t('areas.table_parent')}</th>
                      <th>{t('areas.table_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areaRows.map((row, i) => (
                      <tr key={i} className={row._errors?.length ? 'import-row--error' : 'import-row--ok'}>
                        <td className="import-row-num">{i + 1}</td>
                        <td>{row.name || <span className="import-empty">{t('areas.empty_value')}</span>}</td>
                        <td>
                          <span className="import-type-badge">
                            {t(`organigrama:types.${row.type?.toLowerCase()}`, { defaultValue: row.type || 'area' })}
                          </span>
                        </td>
                        <td>{row.parentName || <span className="import-empty">—</span>}</td>
                        <td>
                          {row._errors?.length
                            ? <span className="import-status import-status--error">⚠ {row._errors.join(', ')}</span>
                            : <span className="import-status import-status--ok">{t('areas.status_ok')}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="import-actions">
                <button className="btn-import-cancel" onClick={() => { setAreaRows([]); setAreaResult(null) }}>
                  {t('areas.cancel')}
                </button>
                <button
                  className="btn-import-confirm"
                  disabled={hasAreaErrors || importAreasMutation.isLoading}
                  onClick={() => importAreasMutation.mutate()}
                >
                  {importAreasMutation.isLoading ? t('areas.importing') : t('areas.import_btn', { count: areaRows.length })}
                </button>
              </div>
            </>
          )}

          {areaResult && (
            <div className={`import-result ${areaResult.created > 0 ? 'import-result--success' : 'import-result--partial'}`}>
              <p dangerouslySetInnerHTML={{ __html: t(areaResult.total !== 1 ? 'areas.result_imported_plural' : 'areas.result_imported', { created: areaResult.created, total: areaResult.total }) }} />
              {getRejectedCount(areaResult) > 0 ? (
                <p dangerouslySetInnerHTML={{ __html: t('areas.result_rejected', { count: getRejectedCount(areaResult) }) }} />
              ) : (
                <p>{t('areas.result_all_ok')}</p>
              )}
              {areaResult.errors.length > 0 && (
                <>
                  <p>{t('areas.result_errors', { count: areaResult.errors.length })}</p>
                  <ul>
                    {areaResult.errors.map((e, i) => (
                      <li key={i}>
                        {e.row > 0 ? `${e.row}: ` : ''}
                        {getImportErrorMessage(e, t, AREA_IMPORT_API_ERROR_KEYS)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {areaResult.created > 0 && areaResult.errors.length > 0 && (
                <p className="import-result-note">{t('areas.result_note')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Colaboradores ── */}
      {tab === 'colaboradores' && (
        <div className="import-section">
          <div className="import-info-box">
            <p>
              <strong>{t('collaborators.format_title')}</strong>{' '}
              <span dangerouslySetInnerHTML={{ __html: t('collaborators.format_cols') }} />
            </p>
            <p dangerouslySetInnerHTML={{ __html: t('collaborators.format_roles') }} />
            <p dangerouslySetInnerHTML={{ __html: t('collaborators.format_email') }} />
            <p dangerouslySetInnerHTML={{ __html: t('collaborators.format_no_invite') }} />
            <button
              className="btn-download-template"
              onClick={() => downloadTemplate(collaboratorTemplateCsv, collaboratorTemplateFilename)}
            >
              {t('collaborators.download_template')}
            </button>
          </div>

          <div className="import-upload-row">
            <input ref={colabInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleColabFile} />
            <button className="btn-upload" onClick={() => colabInputRef.current?.click()}>
              📁 {t('collaborators.select_file')}
            </button>
            {colabRows.length > 0 && (
              <span className="import-file-info">{t('collaborators.rows_loaded', { count: colabRows.length })}</span>
            )}
          </div>

          {colabRows.length > 0 && (
            <>
              <div className="import-preview-scroll">
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>{t('collaborators.table_num')}</th>
                      <th>{t('collaborators.table_name')}</th>
                      <th>{t('collaborators.table_email')}</th>
                      <th>{t('collaborators.table_position')}</th>
                      <th>{t('collaborators.table_role')}</th>
                      <th>{t('collaborators.table_area')}</th>
                      <th>{t('collaborators.table_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colabRows.map((row, i) => (
                      <tr key={i} className={row._errors?.length ? 'import-row--error' : 'import-row--ok'}>
                        <td className="import-row-num">{i + 1}</td>
                        <td>{row.name || <span className="import-empty">{t('collaborators.empty_value')}</span>}</td>
                        <td>{row.email || <span className="import-empty">—</span>}</td>
                        <td>{row.position || <span className="import-empty">—</span>}</td>
                        <td>
                          <span className="import-type-badge">
                            {t(`common:roles.${String(row.role || 'collaborator').toLowerCase()}`, {
                              defaultValue: row.role || 'collaborator',
                            })}
                          </span>
                        </td>
                        <td>{row.areaName || <span className="import-empty">—</span>}</td>
                        <td>
                          {row._errors?.length
                            ? <span className="import-status import-status--error">⚠ {row._errors.join(', ')}</span>
                            : <span className="import-status import-status--ok">{t('collaborators.status_ok')}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="import-actions">
                <button className="btn-import-cancel" onClick={() => { setColabRows([]); setColabResult(null) }}>
                  {t('collaborators.cancel')}
                </button>
                <button
                  className="btn-import-confirm"
                  disabled={hasColabErrors || importColabMutation.isLoading}
                  onClick={() => importColabMutation.mutate()}
                >
                  {importColabMutation.isLoading ? t('collaborators.importing') : t('collaborators.import_btn', { count: colabRows.length })}
                </button>
              </div>
            </>
          )}

          {colabResult && (
            <div className={`import-result ${colabResult.created > 0 ? 'import-result--success' : 'import-result--partial'}`}>
              <p dangerouslySetInnerHTML={{ __html: t(colabResult.total !== 1 ? 'collaborators.result_imported_plural' : 'collaborators.result_imported', { created: colabResult.created, total: colabResult.total }) }} />
              {getRejectedCount(colabResult) > 0 ? (
                <p dangerouslySetInnerHTML={{ __html: t('collaborators.result_rejected', { count: getRejectedCount(colabResult) }) }} />
              ) : (
                <p>{t('collaborators.result_all_ok')}</p>
              )}
              {colabResult.errors.length > 0 && (
                <>
                  <p>{t('collaborators.result_errors', { count: colabResult.errors.length })}</p>
                  <ul>
                    {colabResult.errors.map((e, i) => (
                      <li key={i}>
                        {e.row > 0 ? `${e.row}: ` : ''}
                        {getImportErrorMessage(e, t, COLLABORATOR_IMPORT_API_ERROR_KEYS)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {colabResult.created > 0 && colabResult.errors.length > 0 && (
                <p className="import-result-note">{t('collaborators.result_note')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
