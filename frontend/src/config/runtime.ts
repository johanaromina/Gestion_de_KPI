const splitCsv = (value: string | undefined) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const selfRegisterEnabled = import.meta.env.VITE_SELF_REGISTER_ENABLED === 'true'
export const contactEmail = String(import.meta.env.VITE_CONTACT_EMAIL || 'kpimanager@gmail.com').trim()
export const contactPhones = splitCsv(import.meta.env.VITE_CONTACT_PHONES || '2604618942')
export const contactDemoSubject = String(import.meta.env.VITE_CONTACT_DEMO_SUBJECT || 'Solicitud de demo KPI Manager').trim()
