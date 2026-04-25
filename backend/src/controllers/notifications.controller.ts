import { Request, Response } from 'express'
import { buildNotificationSummary, runNotifications, sendSlackMessage } from '../utils/notifications'
import { isMailConfigured, sendMail, verifyMailTransport } from '../utils/mailer'
import { pool } from '../config/database'
import { appEnv } from '../config/env'

const ensureAppConfigTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      \`key_\` VARCHAR(120) NOT NULL UNIQUE,
      value TEXT,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export const getNotificationSummary = async (_req: Request, res: Response) => {
  try {
    const summary = await buildNotificationSummary()
    res.json({
      totals: {
        missingActual: summary.missingActual.reduce((sum, item) => sum + item.count, 0),
        atRisk: summary.atRisk.length,
        periodsExpiring: summary.periodsExpiring.length,
      },
      samples: {
        missingActual: summary.missingActual.slice(0, 3),
        atRisk: summary.atRisk.slice(0, 3),
        periodsExpiring: summary.periodsExpiring.slice(0, 3),
      },
    })
  } catch (error: any) {
    console.error('Error getting notification summary:', error)
    res.status(500).json({ error: 'Error al obtener notificaciones' })
  }
}

export const triggerNotifications = async (_req: Request, res: Response) => {
  try {
    await runNotifications()
    res.json({ message: 'Notificaciones ejecutadas' })
  } catch (error: any) {
    console.error('Error running notifications:', error)
    res.status(500).json({ error: 'Error al ejecutar notificaciones' })
  }
}

export const getSlackConfig = async (_req: Request, res: Response) => {
  try {
    await ensureAppConfigTable()
    const [rows] = await pool.query<any[]>(
      `SELECT value FROM app_config WHERE \`key_\` = 'slack_webhook_url' LIMIT 1`
    )
    const dbUrl = rows?.[0]?.value || ''
    // Devuelve si está configurado pero no expone la URL completa por seguridad
    const configured = !!(dbUrl || appEnv.slackWebhookUrl)
    const preview = dbUrl
      ? dbUrl.replace(/\/[^/]+$/, '/***')
      : appEnv.slackWebhookUrl
        ? appEnv.slackWebhookUrl.replace(/\/[^/]+$/, '/***')
        : ''
    res.json({ configured, preview, source: dbUrl ? 'db' : appEnv.slackWebhookUrl ? 'env' : 'none' })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener configuración Slack' })
  }
}

export const saveSlackConfig = async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body as { webhookUrl?: string }
    if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
      return res.status(400).json({ error: 'URL inválida. Debe ser un Incoming Webhook de Slack (https://hooks.slack.com/...)' })
    }
    await ensureAppConfigTable()
    await pool.query(
      `INSERT INTO app_config (\`key_\`, value) VALUES ('slack_webhook_url', ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [webhookUrl]
    )
    res.json({ ok: true })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al guardar configuración Slack' })
  }
}

export const deleteSlackConfig = async (_req: Request, res: Response) => {
  try {
    await ensureAppConfigTable()
    await pool.query(`DELETE FROM app_config WHERE \`key_\` = 'slack_webhook_url'`)
    res.json({ ok: true })
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar configuración Slack' })
  }
}

export const getEmailStatus = async (_req: Request, res: Response) => {
  const configured = isMailConfigured()
  res.json({
    configured,
    from: configured ? appEnv.smtpFrom : null,
    host: configured ? appEnv.smtpHost : null,
  })
}

export const testEmail = async (req: Request, res: Response) => {
  if (!isMailConfigured()) {
    return res.status(400).json({ error: 'SMTP no configurado. Agregá SMTP_HOST, SMTP_USER y SMTP_PASS en el .env del servidor.' })
  }
  try {
    await verifyMailTransport()
  } catch (err: any) {
    return res.status(400).json({ error: `Conexión SMTP fallida: ${err?.message}` })
  }
  const user = (req as any).user
  const to = user?.email
  if (!to) {
    return res.status(400).json({ error: 'Tu usuario no tiene email configurado.' })
  }
  try {
    await sendMail({
      to,
      subject: 'KPI Manager — Email configurado correctamente',
      html: `<h2>Conexión de email verificada</h2><p>Este mensaje confirma que KPI Manager puede enviar notificaciones a <strong>${to}</strong>.</p>`,
      text: `Conexión de email verificada. KPI Manager puede enviar notificaciones a ${to}.`,
    })
    res.json({ ok: true, to })
  } catch (err: any) {
    res.status(500).json({ error: `Error al enviar: ${err?.message}` })
  }
}

export const testSlackConfig = async (_req: Request, res: Response) => {
  try {
    await ensureAppConfigTable()
    const [rows] = await pool.query<any[]>(
      `SELECT value FROM app_config WHERE \`key_\` = 'slack_webhook_url' LIMIT 1`
    )
    const webhookUrl = rows?.[0]?.value || appEnv.slackWebhookUrl || ''
    if (!webhookUrl) {
      return res.status(400).json({ error: 'No hay webhook configurado' })
    }
    await sendSlackMessage(webhookUrl, '✅ Conexión con KPI Manager verificada correctamente.', [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *KPI Manager conectado a Slack*\nVas a recibir alertas aquí cuando haya KPIs en riesgo, valores faltantes o períodos por vencer.',
        },
      },
    ])
    res.json({ ok: true })
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Error al enviar mensaje de prueba' })
  }
}
