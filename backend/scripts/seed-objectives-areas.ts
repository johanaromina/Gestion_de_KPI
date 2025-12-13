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

async function linkKpi(objectiveTreeId: number, kpiId: number) {
  await pool.query(
    'INSERT IGNORE INTO objective_trees_kpis (objectiveTreeId, kpiId) VALUES (?, ?)',
    [objectiveTreeId, kpiId]
  )
}

async function main() {
  // asegurar raíz
  const [roots] = await pool.query(
    "SELECT id FROM objective_trees WHERE level = 'company' ORDER BY id LIMIT 1"
  )
  const rootId =
    (roots as any[])[0]?.id ||
    (await getOrCreateTreeNode('Compañía', 'company', null))

  // crear nodos de área
  const [areas] = await pool.query('SELECT DISTINCT area FROM collaborators WHERE area IS NOT NULL')
  const areaMap = new Map<string, number>()
  for (const row of areas as any[]) {
    const name = row.area || 'Sin área'
    const id = await getOrCreateTreeNode(name, 'direction', rootId)
    areaMap.set(name, id)
  }

  // crear nodos individuales y vincular KPIs
  const [assignments] = await pool.query(
    `SELECT ck.collaboratorId, c.name as collaboratorName, c.area, ck.kpiId
     FROM collaborator_kpis ck
     INNER JOIN collaborators c ON ck.collaboratorId = c.id`
  )

  const individualMap = new Map<number, number>()

  for (const row of assignments as any[]) {
    const collabId = row.collaboratorId
    if (!individualMap.has(collabId)) {
      const areaId = areaMap.get(row.area) || rootId
      const nodeId = await getOrCreateTreeNode(row.collaboratorName, 'individual', areaId)
      individualMap.set(collabId, nodeId)
    }
    const nodeId = individualMap.get(collabId)!
    await linkKpi(nodeId, row.kpiId)
    const areaId = areaMap.get(row.area)
    if (areaId) {
      await linkKpi(areaId, row.kpiId)
    }
  }

  console.log('Árbol por áreas e individuos generado.')
  await pool.end()
}

main().catch((err) => {
  console.error('Error generando árbol por áreas', err)
  pool.end()
  process.exit(1)
})
