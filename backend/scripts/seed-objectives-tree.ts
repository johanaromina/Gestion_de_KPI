import dotenv from 'dotenv'
import { pool } from '../src/config/database.js'

dotenv.config()

type Level = 'company' | 'direction' | 'management' | 'leadership' | 'individual'

async function getOrCreateTreeNode(
  name: string,
  level: Level,
  parentId: number | null
): Promise<number> {
  const [rows] = await pool.query('SELECT id FROM objective_trees WHERE name = ? AND level = ?', [
    name,
    level,
  ])
  const existing = (rows as any[])[0]
  if (existing) return existing.id

  const [result] = await pool.query(
    'INSERT INTO objective_trees (name, level, parentId) VALUES (?, ?, ?)',
    [name, level, parentId]
  )
  return (result as any).insertId
}

async function findKpiIdByName(name: string): Promise<number | null> {
  const [rows] = await pool.query('SELECT id FROM kpis WHERE LOWER(name) = LOWER(?)', [name])
  const exact = (rows as any[])[0]
  if (exact) return exact.id

  const [likeRows] = await pool.query('SELECT id FROM kpis WHERE name LIKE ?', [`%${name}%`])
  const like = (likeRows as any[])[0]
  if (like) return like.id

  return null
}

async function linkKpi(objectiveId: number, kpiId: number) {
  await pool.query(
    `INSERT IGNORE INTO objective_trees_kpis (objectiveTreeId, kpiId) VALUES (?, ?)`,
    [objectiveId, kpiId]
  )
}

async function main() {
  const rootName = 'Compañía'
  const rootId = await getOrCreateTreeNode(rootName, 'company', null)

  const okrs = [
    {
      name: 'OKR#1 - Convertirnos en un partner estratégico de los clientes por nuestra calidad de servicio',
      kpis: [
        'Cantidad de bajas GT',
        'Cantidad de Proyectos GT Implementados',
        'Cantidad de Proyectos GT con menos de 3 meses de demora en el Gantt comprometido',
        'NPS',
      ],
    },
    {
      name: 'OKR#2 - Escalar Regionalmente',
      kpis: ['Altas New Names Latam GT', 'Total Revenue Anual Latam GT'],
    },
    {
      name: 'OKR#3 - Consolidar nuestro modelo de negocio',
      kpis: [
        'Stock de Clientes GT Global',
        'Revenue Total Gestion (MISIM+ GT+INSURANCE)',
        'Net Profit  de Gestión Total (Misim + GT+ Insurance)',
      ],
    },
  ]

  for (const okr of okrs) {
    const okrId = await getOrCreateTreeNode(okr.name, 'direction', rootId)
    for (const kpiName of okr.kpis) {
      let kpiId = await findKpiIdByName(kpiName)
      if (!kpiId) {
        // Crear KPI macro si no existe
        const type: 'growth' | 'reduction' | 'exact' =
          kpiName.toLowerCase().includes('baja') || kpiName.toLowerCase().includes('stock')
            ? 'reduction'
            : 'growth'
        const [result] = await pool.query(
          'INSERT INTO kpis (name, type, criteria) VALUES (?, ?, ?)',
          [kpiName, type, 'KPI macro compañía']
        )
        kpiId = (result as any).insertId
        console.log(`Creado KPI macro: "${kpiName}"`)
      }
      await linkKpi(okrId, kpiId)
      console.log(`Vinculado KPI "${kpiName}" al nodo "${okr.name}"`)
    }
  }

  console.log('Árbol de objetivos cargado.')
  await pool.end()
}

main().catch((err) => {
  console.error('Error creando árbol de objetivos', err)
  pool.end()
  process.exit(1)
})
