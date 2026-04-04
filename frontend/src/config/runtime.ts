const splitCsv = (value: string | undefined) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const selfRegisterEnabled = import.meta.env.VITE_SELF_REGISTER_ENABLED === 'true'
export const contactEmail = String(import.meta.env.VITE_CONTACT_EMAIL || '').trim()
export const contactPhones = splitCsv(import.meta.env.VITE_CONTACT_PHONES)
export const contactDemoSubject = String(import.meta.env.VITE_CONTACT_DEMO_SUBJECT || 'Solicitud de demo KPI Manager').trim()
