import { Request, Response } from 'express'
import { buildNotificationSummary, runNotifications } from '../utils/notifications'

export const getNotificationSummary = async (req: Request, res: Response) => {
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

export const triggerNotifications = async (req: Request, res: Response) => {
  try {
    await runNotifications()
    res.json({ message: 'Notificaciones ejecutadas' })
  } catch (error: any) {
    console.error('Error running notifications:', error)
    res.status(500).json({ error: 'Error al ejecutar notificaciones' })
  }
}
