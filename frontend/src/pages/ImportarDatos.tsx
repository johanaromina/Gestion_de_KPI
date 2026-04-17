import { useRef, useState } from 'react'
import { useMutation } from 'react-query'
import api from '../services/api'
import './ImportarDatos.css'

type Tab = 'areas' | 'colaboradores'

type AreaRow = { name: string; type: string; parentName: string; _errors?: string[] }
type ColabRow = { name: string; email: string; position: string; role: string; areaName: string; _errors?: string[] }

type ImportError = { row: number; message: string }

const AREA_TYPES = ['company', 'area', 'team', 'business_unit']
const AREA_TYPE_LABEL: Record<string, string> = { company: 'Empresa', area: 'Área', team: 'Equipo', business_unit: 'Unidad de negocio' }
const VALID_ROLES = ['collaborator', 'leader', 'director', 'admin']

const AREA_TEMPLATE = `nombre,tipo,area_padre
Empresa SA,company,
Dirección Comercial,area,Empresa SA
Ventas Norte,team,Dirección Comercial
Ventas Sur,team,Dirección Comercial`

const COLAB_TEMPLATE = `nombre,email,cargo,rol,area
Juan Pérez,juan@empresa.com,Vendedor,collaborator,Ventas Norte
Ana García,ana@empresa.com,Líder de Ventas,leader,Dirección Comercial
Mario López,,Analista,collaborator,Ventas Sur`

// ── Parser CSV simple ────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
    )
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

// ── Componente principal ─────────────────────────────────────────────────────

export default function ImportarDatos() {
  const [tab, setTab] = useState<Tab>('areas')

  // Areas
  const [areaRows, setAreaRows] = useState<AreaRow[]>([])
  const [areaResult, setAreaResult] = useState<{ created: number; errors: ImportError[] } | null>(null)
  const areaInputRef = useRef<HTMLInputElement>(null)

  // Colaboradores
  const [colabRows, setColabRows] = useState<ColabRow[]>([])
  const [colabResult, setColabResult] = useState<{ created: number; errors: ImportError[] } | null>(null)
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
        if (!row.name) errs.push('Nombre vacío')
        if (row.type && !AREA_TYPES.includes(row.type.toLowerCase())) errs.push(`Tipo inválido: "${row.type}"`)
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
        if (!row.name) errs.push('Nombre vacío')
        if (row.role && !VALID_ROLES.includes(row.role.toLowerCase())) errs.push(`Rol inválido: "${row.role}"`)
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errs.push('Email inválido')
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
      const res = await api.post('/org-scopes/import', {
        rows: areaRows.map(({ name, type, parentName }) => ({ name, type: type || 'area', parentName: parentName || undefined })),
      })
      return res.data
    },
    {
      onSuccess: (data) => {
        setAreaResult(data)
        if (data.created > 0) setAreaRows([])
      },
      onError: (err: any) => {
        setAreaResult({ created: 0, errors: [{ row: 0, message: err?.response?.data?.error || 'Error al importar' }] })
      },
    }
  )

  const importColabMutation = useMutation(
    async () => {
      const res = await api.post('/collaborators/import', {
        rows: colabRows.map(({ name, email, position, role, areaName }) => ({
          name, email: email || undefined, position: position || undefined,
          role: role || 'collaborator', areaName: areaName || undefined,
        })),
      })
      return res.data
    },
    {
      onSuccess: (data) => {
        setColabResult(data)
        if (data.created > 0) setColabRows([])
      },
      onError: (err: any) => {
        setColabResult({ created: 0, errors: [{ row: 0, message: err?.response?.data?.error || 'Error al importar' }] })
      },
    }
  )

  const hasAreaErrors = areaRows.some((r) => r._errors?.length)
  const hasColabErrors = colabRows.some((r) => r._errors?.length)

  return (
    <div className="importar-page">
      <div className="page-header">
        <div>
          <h1>Importar datos</h1>
          <p className="subtitle">Cargá áreas y colaboradores masivamente desde un archivo CSV o Excel</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="import-tabs">
        <button
          className={`import-tab ${tab === 'areas' ? 'import-tab--active' : ''}`}
          onClick={() => setTab('areas')}
        >
          📂 Áreas y equipos
        </button>
        <button
          className={`import-tab ${tab === 'colaboradores' ? 'import-tab--active' : ''}`}
          onClick={() => setTab('colaboradores')}
        >
          👥 Colaboradores
        </button>
      </div>

      {/* ── Tab Áreas ── */}
      {tab === 'areas' && (
        <div className="import-section">
          <div className="import-info-box">
            <p><strong>Formato esperado:</strong> archivo CSV con columnas <code>nombre, tipo, area_padre</code></p>
            <p>Tipos válidos: <code>company</code> · <code>area</code> · <code>team</code> · <code>business_unit</code></p>
            <p>Dejá <code>area_padre</code> vacío para los nodos raíz. El orden no importa: el sistema resuelve la jerarquía.</p>
            <button className="btn-download-template" onClick={() => downloadTemplate(AREA_TEMPLATE, 'plantilla_areas.csv')}>
              ⬇ Descargar plantilla
            </button>
          </div>

          <div className="import-upload-row">
            <input ref={areaInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleAreaFile} />
            <button className="btn-upload" onClick={() => areaInputRef.current?.click()}>
              📁 Seleccionar archivo CSV
            </button>
            {areaRows.length > 0 && (
              <span className="import-file-info">{areaRows.length} filas cargadas</span>
            )}
          </div>

          {areaRows.length > 0 && (
            <>
              <div className="import-preview-scroll">
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Área padre</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areaRows.map((row, i) => (
                      <tr key={i} className={row._errors?.length ? 'import-row--error' : 'import-row--ok'}>
                        <td className="import-row-num">{i + 1}</td>
                        <td>{row.name || <span className="import-empty">vacío</span>}</td>
                        <td>
                          <span className="import-type-badge">
                            {AREA_TYPE_LABEL[row.type?.toLowerCase()] || row.type || 'area'}
                          </span>
                        </td>
                        <td>{row.parentName || <span className="import-empty">—</span>}</td>
                        <td>
                          {row._errors?.length
                            ? <span className="import-status import-status--error">⚠ {row._errors.join(', ')}</span>
                            : <span className="import-status import-status--ok">✓ OK</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="import-actions">
                <button className="btn-import-cancel" onClick={() => { setAreaRows([]); setAreaResult(null) }}>
                  Cancelar
                </button>
                <button
                  className="btn-import-confirm"
                  disabled={hasAreaErrors || importAreasMutation.isLoading}
                  onClick={() => importAreasMutation.mutate()}
                >
                  {importAreasMutation.isLoading ? 'Importando…' : `Importar ${areaRows.length} áreas`}
                </button>
              </div>
            </>
          )}

          {areaResult && (
            <div className={`import-result ${areaResult.created > 0 ? 'import-result--success' : 'import-result--partial'}`}>
              {areaResult.created > 0 && (
                <p>✅ <strong>{areaResult.created} área{areaResult.created !== 1 ? 's' : ''}</strong> importada{areaResult.created !== 1 ? 's' : ''} correctamente.</p>
              )}
              {areaResult.errors.length > 0 && (
                <>
                  <p>⚠ {areaResult.errors.length} fila{areaResult.errors.length !== 1 ? 's' : ''} con error{areaResult.errors.length !== 1 ? 'es' : ''}:</p>
                  <ul>
                    {areaResult.errors.map((e, i) => (
                      <li key={i}>{e.row > 0 ? `Fila ${e.row}: ` : ''}{e.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Colaboradores ── */}
      {tab === 'colaboradores' && (
        <div className="import-section">
          <div className="import-info-box">
            <p><strong>Formato esperado:</strong> archivo CSV con columnas <code>nombre, email, cargo, rol, area</code></p>
            <p>Roles válidos: <code>collaborator</code> · <code>leader</code> · <code>director</code> · <code>admin</code></p>
            <p>El <code>email</code> es opcional. El <code>area</code> debe coincidir exactamente con el nombre de un área existente.</p>
            <p>Los colaboradores importados <strong>no reciben email de invitación</strong>. Podés enviarlo después desde la lista de colaboradores.</p>
            <button className="btn-download-template" onClick={() => downloadTemplate(COLAB_TEMPLATE, 'plantilla_colaboradores.csv')}>
              ⬇ Descargar plantilla
            </button>
          </div>

          <div className="import-upload-row">
            <input ref={colabInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleColabFile} />
            <button className="btn-upload" onClick={() => colabInputRef.current?.click()}>
              📁 Seleccionar archivo CSV
            </button>
            {colabRows.length > 0 && (
              <span className="import-file-info">{colabRows.length} filas cargadas</span>
            )}
          </div>

          {colabRows.length > 0 && (
            <>
              <div className="import-preview-scroll">
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Cargo</th>
                      <th>Rol</th>
                      <th>Área</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colabRows.map((row, i) => (
                      <tr key={i} className={row._errors?.length ? 'import-row--error' : 'import-row--ok'}>
                        <td className="import-row-num">{i + 1}</td>
                        <td>{row.name || <span className="import-empty">vacío</span>}</td>
                        <td>{row.email || <span className="import-empty">—</span>}</td>
                        <td>{row.position || <span className="import-empty">—</span>}</td>
                        <td><span className="import-type-badge">{row.role || 'collaborator'}</span></td>
                        <td>{row.areaName || <span className="import-empty">—</span>}</td>
                        <td>
                          {row._errors?.length
                            ? <span className="import-status import-status--error">⚠ {row._errors.join(', ')}</span>
                            : <span className="import-status import-status--ok">✓ OK</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="import-actions">
                <button className="btn-import-cancel" onClick={() => { setColabRows([]); setColabResult(null) }}>
                  Cancelar
                </button>
                <button
                  className="btn-import-confirm"
                  disabled={hasColabErrors || importColabMutation.isLoading}
                  onClick={() => importColabMutation.mutate()}
                >
                  {importColabMutation.isLoading ? 'Importando…' : `Importar ${colabRows.length} colaboradores`}
                </button>
              </div>
            </>
          )}

          {colabResult && (
            <div className={`import-result ${colabResult.created > 0 ? 'import-result--success' : 'import-result--partial'}`}>
              {colabResult.created > 0 && (
                <p>✅ <strong>{colabResult.created} colaborador{colabResult.created !== 1 ? 'es' : ''}</strong> importado{colabResult.created !== 1 ? 's' : ''} correctamente.</p>
              )}
              {colabResult.errors.length > 0 && (
                <>
                  <p>⚠ {colabResult.errors.length} fila{colabResult.errors.length !== 1 ? 's' : ''} con error{colabResult.errors.length !== 1 ? 'es' : ''}:</p>
                  <ul>
                    {colabResult.errors.map((e, i) => (
                      <li key={i}>{e.row > 0 ? `Fila ${e.row}: ` : ''}{e.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
