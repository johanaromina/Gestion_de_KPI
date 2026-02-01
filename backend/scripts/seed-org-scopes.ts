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

const companyName = 'SIDOM'
const areaNames = [
  'Producto',
  'Ingenieria',
  'QA',
  'Desarrollo',
  'Customer Success',
  'Delivery',
  'Revenue',
  'Tecnologia',
  'Administracion',
  'HR',
]

async function seedOrgScopes() {
  const connection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
  })

  try {
    console.log('✅ Conectado a MySQL')

    const [companyRows] = await connection.query<any[]>(
      `SELECT id FROM org_scopes WHERE name = ? AND type = 'company' LIMIT 1`,
      [companyName]
    )
    let companyId: number | null = companyRows?.[0]?.id || null
    if (!companyId) {
      const [result] = await connection.query<any>(
        `INSERT INTO org_scopes (name, type, parentId, metadata, active)
         VALUES (?, 'company', NULL, NULL, 1)`,
        [companyName]
      )
      companyId = result.insertId
      console.log(`✅ Company creada: ${companyName}`)
    } else {
      console.log('ℹ️  Company ya existe')
    }

    for (const area of areaNames) {
      const [rows] = await connection.query<any[]>(
        `SELECT id FROM org_scopes WHERE name = ? AND type = 'area' LIMIT 1`,
        [area]
      )
      if (rows?.length) {
        continue
      }
      await connection.query(
        `INSERT INTO org_scopes (name, type, parentId, metadata, active)
         VALUES (?, 'area', ?, NULL, 1)`,
        [area, companyId]
      )
      console.log(`✅ Area creada: ${area}`)
    }

    console.log('✅ Org scopes base listos')
  } catch (error: any) {
    console.error('❌ Error al ejecutar el seed:', error.message)
    console.error('Detalle:', error)
    process.exit(1)
  } finally {
    await connection.end()
  }
}

seedOrgScopes()
