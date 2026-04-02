import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { pool } from '../src/config/database'

dotenv.config()

const readArg = (name: string) => {
  const flag = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(flag))
  return match ? match.slice(flag.length) : undefined
}

const adminName = readArg('name') || process.env.BOOTSTRAP_ADMIN_NAME || 'Admin Inicial'
const adminEmail = (readArg('email') || process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase()
const adminPassword = readArg('password') || process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
const adminPosition = readArg('position') || process.env.BOOTSTRAP_ADMIN_POSITION || 'Administrador General'
const adminArea = readArg('area') || process.env.BOOTSTRAP_ADMIN_AREA || 'Administracion'

async function bootstrapAdmin() {
  if (!adminEmail || !adminPassword) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD son obligatorios')
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  const [existingRows] = await pool.query<any[]>(
    'SELECT id FROM collaborators WHERE email = ? LIMIT 1',
    [adminEmail]
  )

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const existing = existingRows[0]
    await pool.query(
      `UPDATE collaborators
       SET name = ?, position = ?, area = ?, role = 'admin', status = 'active',
           passwordHash = ?, mfaEnabled = 0, authSource = 'local'
       WHERE id = ?`,
      [adminName, adminPosition, adminArea, passwordHash, existing.id]
    )
    console.log(`✅ Admin actualizado: ${adminEmail} (id=${existing.id})`)
  } else {
    const [result] = await pool.query<any>(
      `INSERT INTO collaborators
       (name, position, area, role, status, email, passwordHash, mfaEnabled, authSource)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?, 0, 'local')`,
      [adminName, adminPosition, adminArea, adminEmail, passwordHash]
    )
    console.log(`✅ Admin creado: ${adminEmail} (id=${result.insertId})`)
  }

  console.log('💡 Ya podes iniciar sesion con el admin bootstrap.')
}

bootstrapAdmin()
  .catch((error: any) => {
    console.error('❌ Error bootstrap admin:', error?.message || error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
