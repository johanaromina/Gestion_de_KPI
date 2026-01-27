import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_kpi',
}

async function seed() {
  const connection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
  })

  try {
    console.log('✅ Conectado a MySQL')

    const [authRows] = await connection.query<any[]>(
      `SELECT id FROM auth_profiles WHERE name = ? LIMIT 1`,
      ['Jira - Default']
    )
    let authProfileId: number | null = authRows?.[0]?.id || null
    if (!authProfileId) {
      const [authResult] = await connection.query<any>(
        `INSERT INTO auth_profiles (name, connector, endpoint, authType, authConfig)
         VALUES (?, ?, ?, ?, ?)`,
        ['Jira - Default', 'jira', 'https://your-domain.atlassian.net', 'none', null]
      )
      authProfileId = authResult.insertId
      console.log('✅ Auth profile creado')
    } else {
      console.log('ℹ️  Auth profile ya existe')
    }

    const [scopeRows] = await connection.query<any[]>(
      `SELECT id FROM org_scopes WHERE name = ? AND type = ? LIMIT 1`,
      ['Company', 'company']
    )
    let companyScopeId: number | null = scopeRows?.[0]?.id || null
    if (!companyScopeId) {
      const metadata = {
        projects: ['GT_MISIM'],
        issueTypeTest: 'Test',
        issueTypeStory: ['Historia'],
        testerField: '"Tester[User Picker (single user)]"',
        period: 'previous_month',
        authProfileId,
      }
      const [scopeResult] = await connection.query<any>(
        `INSERT INTO org_scopes (name, type, parentId, metadata, active)
         VALUES (?, ?, ?, ?, ?)`,
        ['Company', 'company', null, JSON.stringify(metadata), 1]
      )
      companyScopeId = scopeResult.insertId
      console.log('✅ Org scope Company creado')
    } else {
      console.log('ℹ️  Org scope Company ya existe')
    }

    const [areaRows] = await connection.query<any[]>(
      `SELECT id FROM org_scopes WHERE name = ? AND type = ? LIMIT 1`,
      ['QA', 'area']
    )
    let qaScopeId: number | null = areaRows?.[0]?.id || null
    if (!qaScopeId) {
      const metadata = {
        projects: ['GT_MISIM', 'GT Business Team'],
        period: 'previous_month',
      }
      const [areaResult] = await connection.query<any>(
        `INSERT INTO org_scopes (name, type, parentId, metadata, active)
         VALUES (?, ?, ?, ?, ?)`,
        ['QA', 'area', companyScopeId, JSON.stringify(metadata), 1]
      )
      qaScopeId = areaResult.insertId
      console.log('✅ Org scope QA creado')
    } else {
      console.log('ℹ️  Org scope QA ya existe')
    }

    const [templateRows] = await connection.query<any[]>(
      `SELECT id FROM integration_templates WHERE name = ? LIMIT 1`,
      ['Ratio Tests/Historias (Mes anterior)']
    )
    let templateId: number | null = templateRows?.[0]?.id || null
    if (!templateId) {
      const testsTemplate = [
        'project IN ({projects})',
        'AND issuetype = {issueTypeTest}',
        'AND {testerField} IN ({users})',
        'AND updated >= {from}',
        'AND updated < {to}',
      ].join('\n')
      const storiesTemplate = [
        'project IN ({projects})',
        'AND issuetype IN ({issueTypeStory})',
        'AND statusCategory = Done',
        'AND statusCategoryChangedDate >= {from}',
        'AND statusCategoryChangedDate < {to}',
        'AND {testerField} IN ({users})',
      ].join('\n')
      const [templateResult] = await connection.query<any>(
        `INSERT INTO integration_templates
         (name, connector, metricType, queryTestsTemplate, queryStoriesTemplate, formulaTemplate, schedule, authProfileId, isSpecific, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Ratio Tests/Historias (Mes anterior)',
          'jira',
          'ratio',
          testsTemplate,
          storiesTemplate,
          'tests / stories',
          '0 9 1 * *',
          authProfileId,
          0,
          1,
        ]
      )
      templateId = templateResult.insertId
      console.log('✅ Template creado')
    } else {
      console.log('ℹ️  Template ya existe')
    }

    if (templateId && qaScopeId) {
      const [targetRows] = await connection.query<any[]>(
        `SELECT id FROM integration_targets WHERE templateId = ? AND orgScopeId = ? LIMIT 1`,
        [templateId, qaScopeId]
      )
      if (!targetRows?.length) {
        const params = {
          users: [],
        }
        await connection.query(
          `INSERT INTO integration_targets
           (templateId, scopeType, scopeId, orgScopeId, params, assignmentId, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [templateId, 'area', 'QA', qaScopeId, JSON.stringify(params), null, 1]
        )
        console.log('✅ Target QA creado')
      } else {
        console.log('ℹ️  Target QA ya existe')
      }
    }

    console.log('✅ Seed completado')
  } finally {
    await connection.end()
  }
}

seed().catch((error) => {
  console.error('❌ Error en seed:', error?.message || error)
  process.exit(1)
})
