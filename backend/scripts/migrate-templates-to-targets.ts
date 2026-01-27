import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_kpi',
}

const placeholderRegex = /\{[a-zA-Z0-9_]+\}/g

const getPlaceholders = (text?: string | null) => {
  if (!text) return []
  return text.match(placeholderRegex) || []
}

const computeIsSpecific = (metricType: 'count' | 'ratio', tests?: string | null, stories?: string | null) => {
  const testsPlaceholders = getPlaceholders(tests)
  const storiesPlaceholders = metricType === 'ratio' ? getPlaceholders(stories) : []
  return testsPlaceholders.length === 0 && storiesPlaceholders.length === 0
}

async function run() {
  const connection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
  })

  try {
    console.log('✅ Conectado a MySQL')

    // Ensure new columns exist
    try {
      await connection.query(
        `ALTER TABLE integration_templates
         ADD COLUMN metricType ENUM('count', 'ratio') NOT NULL DEFAULT 'ratio'`
      )
      console.log('✅ Columna metricType agregada')
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error
      console.log('ℹ️  metricType ya existe')
    }

    try {
      await connection.query(
        `ALTER TABLE integration_templates
         ADD COLUMN isSpecific TINYINT(1) NOT NULL DEFAULT 0`
      )
      console.log('✅ Columna isSpecific agregada')
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error
      console.log('ℹ️  isSpecific ya existe')
    }

    const [templates] = await connection.query<any[]>(
      `SELECT id, name, metricType, queryTestsTemplate, queryStoriesTemplate, isSpecific
       FROM integration_templates`
    )

    let updatedCount = 0
    let exampleTargets = 0

    for (const template of templates || []) {
      const metricType: 'count' | 'ratio' = template.metricType === 'count' ? 'count' : 'ratio'
      const isSpecific = computeIsSpecific(metricType, template.queryTestsTemplate, template.queryStoriesTemplate)

      if (template.isSpecific !== (isSpecific ? 1 : 0)) {
        await connection.query(`UPDATE integration_templates SET isSpecific = ? WHERE id = ?`, [isSpecific ? 1 : 0, template.id])
        updatedCount += 1
      }

      if (!isSpecific) continue

      const [targetRows] = await connection.query<any[]>(
        `SELECT id FROM integration_targets WHERE templateId = ? AND scopeId = ? LIMIT 1`,
        [template.id, '_example']
      )
      if (targetRows?.length) continue

      const params = {
        note: 'Target de ejemplo generado por migracion para plantillas especificas',
      }

      await connection.query(
        `INSERT INTO integration_targets (templateId, scopeType, scopeId, orgScopeId, params, assignmentId, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [template.id, 'area', '_example', null, JSON.stringify(params), null, 0]
      )
      exampleTargets += 1
    }

    console.log(`✅ Plantillas actualizadas (isSpecific): ${updatedCount}`)
    console.log(`✅ Targets _example creados: ${exampleTargets}`)
    console.log('✅ Migracion completada')
  } finally {
    await connection.end()
  }
}

run().catch((error) => {
  console.error('❌ Error en migracion:', error?.message || error)
  process.exit(1)
})

