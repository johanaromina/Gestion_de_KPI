import nodemailer from 'nodemailer'
import { appEnv } from '../config/env'

export const isMailConfigured = () => Boolean(appEnv.smtpHost && appEnv.smtpUser && appEnv.smtpPass)

const createTransport = () => {
  if (!isMailConfigured()) {
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
  const transporter = createTransport()
  await transporter.verify()
}

export async function sendMail(options: { to: string; subject: string; html: string; text?: string }) {
  const transporter = createTransport()

  await transporter.sendMail({
    from: appEnv.smtpFrom,
    ...(appEnv.smtpReplyTo ? { replyTo: appEnv.smtpReplyTo } : {}),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })
}
