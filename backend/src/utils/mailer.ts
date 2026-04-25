import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { appEnv } from '../config/env'

export const isMailConfigured = () =>
  Boolean(appEnv.resendApiKey || (appEnv.smtpHost && appEnv.smtpUser && appEnv.smtpPass))

const createTransport = () => {
  if (!appEnv.smtpHost || !appEnv.smtpUser || !appEnv.smtpPass) {
    throw new Error('SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)')
  }

  return nodemailer.createTransport({
    host: appEnv.smtpHost,
    port: appEnv.smtpPort,
    secure: appEnv.smtpSecure,
    requireTLS: appEnv.smtpRequireTls,
    ...(appEnv.smtpIpv4Only ? { family: 4 } : {}),
    auth: {
      user: appEnv.smtpUser,
      pass: appEnv.smtpPass,
    },
  })
}

export async function verifyMailTransport() {
  if (appEnv.resendApiKey) {
    // Resend API — verificación liviana: intentar instanciar el cliente
    const resend = new Resend(appEnv.resendApiKey)
    if (!resend) throw new Error('No se pudo inicializar Resend')
    return
  }
  const transporter = createTransport()
  await transporter.verify()
}

export async function sendMail(options: { to: string; subject: string; html: string; text?: string; replyTo?: string }) {
  if (appEnv.resendApiKey) {
    const resend = new Resend(appEnv.resendApiKey)
    const { error } = await resend.emails.send({
      from: appEnv.smtpFrom,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      ...(options.replyTo ? { replyTo: options.replyTo } : appEnv.smtpReplyTo ? { replyTo: appEnv.smtpReplyTo } : {}),
    })
    if (error) throw new Error(error.message)
    return
  }

  const transporter = createTransport()
  await transporter.sendMail({
    from: appEnv.smtpFrom,
    ...(options.replyTo ? { replyTo: options.replyTo } : appEnv.smtpReplyTo ? { replyTo: appEnv.smtpReplyTo } : {}),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })
}
