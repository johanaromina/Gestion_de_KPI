import dotenv from 'dotenv'
import { appEnv } from '../src/config/env'
import { isMailConfigured, sendMail, verifyMailTransport } from '../src/utils/mailer'

dotenv.config()

const readArg = (name: string) => {
  const flag = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(flag))
  return match ? match.slice(flag.length) : undefined
}

async function main() {
  const to = readArg('to') || process.env.SMTP_TEST_TO || appEnv.smtpUser

  if (!isMailConfigured()) {
    throw new Error('SMTP no configurado. Completa SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.')
  }

  if (!to) {
    throw new Error('Indica un destinatario con --to=mail@dominio.com o SMTP_TEST_TO.')
  }

  console.log(`[smtp] verificando transporte contra ${appEnv.smtpHost}:${appEnv.smtpPort}...`)
  await verifyMailTransport()
  console.log('[smtp] transporte OK')

  await sendMail({
    to,
    subject: 'Prueba SMTP - KPI Manager',
    text: 'Este es un correo de prueba del entorno SMTP configurado para KPI Manager.',
    html: '<p>Este es un correo de prueba del entorno SMTP configurado para <strong>KPI Manager</strong>.</p>',
  })

  console.log(`[smtp] correo de prueba enviado a ${to}`)
}

main().catch((error: any) => {
  console.error('[smtp] error:', error?.message || error)
  process.exitCode = 1
})
