import { Request, Response } from 'express'
import { z } from 'zod'
import { appEnv } from '../config/env'
import { isMailConfigured, sendMail } from '../utils/mailer'

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().min(7).max(40),
  usersCount: z.coerce.number().int().min(1).max(50000),
})

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const submitDemoRequest = async (req: Request, res: Response) => {
  try {
    const parsed = demoRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Revisá los datos del formulario e intentá nuevamente.' })
    }

    const payload = {
      ...parsed.data,
      email: parsed.data.email.trim().toLowerCase(),
      phone: parsed.data.phone.trim(),
    }

    const origin = req.get('origin') || req.get('referer') || appEnv.frontendBaseUrl
    const subject = `Solicitud de demo - ${payload.company}`
    const text = [
      'Nueva solicitud de demo de KPI Manager',
      '',
      `Nombre: ${payload.name}`,
      `Empresa: ${payload.company}`,
      `Email: ${payload.email}`,
      `Telefono: ${payload.phone}`,
      `Cantidad de usuarios: ${payload.usersCount}`,
      `Origen: ${origin}`,
    ].join('\n')
    const html = `
      <h2>Nueva solicitud de demo</h2>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr><td><strong>Nombre:</strong></td><td>${escapeHtml(payload.name)}</td></tr>
        <tr><td><strong>Empresa:</strong></td><td>${escapeHtml(payload.company)}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${escapeHtml(payload.email)}</td></tr>
        <tr><td><strong>Telefono:</strong></td><td>${escapeHtml(payload.phone)}</td></tr>
        <tr><td><strong>Cantidad de usuarios:</strong></td><td>${payload.usersCount}</td></tr>
        <tr><td><strong>Origen:</strong></td><td>${escapeHtml(origin)}</td></tr>
      </table>
    `

    const demoRecipient = appEnv.demoRequestTo || appEnv.smtpUser
    const canDeliverByEmail = Boolean(demoRecipient && isMailConfigured())
    if (canDeliverByEmail) {
      await sendMail({
        to: demoRecipient,
        subject,
        html,
        text,
        replyTo: payload.email,
      })

      return res.json({
        message: 'Recibimos tu solicitud. El equipo comercial te va a contactar pronto.',
        delivery: 'email',
      })
    }

    console.log('[contact] demo request received without automatic delivery:', {
      ...payload,
      origin,
      at: new Date().toISOString(),
    })

    return res.status(202).json({
      message: 'Recibimos tu solicitud. En este entorno la derivacion automatica no esta configurada.',
      delivery: 'manual',
    })
  } catch (error) {
    console.error('Error submitting demo request:', error)
    return res.status(500).json({
      error: 'No pudimos enviar la solicitud. Intentá nuevamente o usá los canales directos de contacto.',
    })
  }
}
