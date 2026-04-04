import { useState } from 'react'
import { Link } from 'react-router-dom'
import { contactDemoSubject, contactEmail, contactPhones } from '../config/runtime'
import api from '../services/api'
import './Landing.css'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const HERO_CONTROLS = [
  {
    key: 'sales',
    label: 'Tracción comercial',
    hint: 'Pipeline y cierre',
    min: 45,
    max: 100,
    initial: 82,
  },
  {
    key: 'delivery',
    label: 'Entrega operativa',
    hint: 'Cumplimiento y lead time',
    min: 45,
    max: 100,
    initial: 74,
  },
  {
    key: 'engagement',
    label: 'Compromiso del equipo',
    hint: 'Clima y seguimiento',
    min: 45,
    max: 100,
    initial: 79,
  },
] as const

type DemoFormState = {
  name: string
  company: string
  email: string
  phone: string
  usersCount: string
}

const INITIAL_DEMO_FORM: DemoFormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  usersCount: '',
}

const FEATURES = [
  {
    icon: '📊',
    title: 'Dashboard ejecutivo en tiempo real',
    desc: 'Visualizá el estado de todos tus KPIs en un semáforo organizacional. Verde, amarillo y rojo para entender prioridades sin abrir múltiples reportes.',
    tag: 'Tablero + árbol de objetivos',
  },
  {
    icon: '🤖',
    title: 'Curaduría con detección de outliers',
    desc: 'El sistema detecta automáticamente valores atípicos usando z-score estadístico y alerta antes de aprobar un dato sospechoso.',
    tag: 'Controles antes de aprobar',
  },
  {
    icon: '📅',
    title: 'Check-ins semanales',
    desc: 'Tres preguntas rápidas cada semana para capturar avance, bloqueos y foco. Los líderes ganan contexto sin sumar reuniones.',
    tag: 'Seguimiento continuo',
  },
  {
    icon: '🔗',
    title: 'Integraciones externas',
    desc: 'Conectá Google Sheets, APIs REST o archivos CSV para que los KPIs se actualicen según el calendario operativo que definas.',
    tag: 'Google Sheets · REST · CSV',
  },
  {
    icon: '🧪',
    title: 'Simulación de escenarios',
    desc: 'Probá cambios en KPIs clave y estimá cómo impactan en el estado general del equipo o la compañía.',
    tag: 'Análisis de impacto',
  },
  {
    icon: '📦',
    title: 'Marketplace de templates',
    desc: 'Partí de KPIs listos para importar y acelerá la implementación con estructuras ya pensadas para distintas áreas.',
    tag: '36 templates · 6 industrias',
  },
  {
    icon: '📄',
    title: 'Reportes ejecutivos en PDF',
    desc: 'Generá reportes con narrativa automática en español para dirección, comités y reuniones de seguimiento.',
    tag: 'Salida ejecutiva',
  },
  {
    icon: '🛡️',
    title: 'Seguridad y auditoría',
    desc: 'Roles, MFA, SSO, auditoría completa y credenciales protegidas para operar con estándares corporativos.',
    tag: 'Enterprise-ready',
  },
]

const COMMERCIAL_STEPS = [
  {
    step: '01',
    title: 'Demo guiada',
    desc: 'Recorremos el tablero ejecutivo, la curaduría, los check-ins y el esquema de reporting con un caso cercano a tu operación.',
  },
  {
    step: '02',
    title: 'Relevamiento funcional',
    desc: 'Validamos usuarios, áreas, KPIs, seguridad, SSO e integraciones para definir el alcance real de implementación.',
  },
  {
    step: '03',
    title: 'Propuesta y compra',
    desc: 'Armamos la propuesta comercial, el onboarding y el plan de salida a producción según tu contexto y prioridades.',
  },
]

const PLANS = [
  {
    name: 'Starter',
    desc: 'Para equipos pequeños que quieren ordenar sus KPIs con una implementación ágil.',
    amount: 'USD 100',
    period: '/ mes',
    featured: false,
    cta: 'Solicitar demo',
    ctaStyle: 'outline' as const,
    features: [
      { text: 'Hasta 10 colaboradores', included: true },
      { text: 'KPIs individuales y grupales', included: true },
      { text: 'Dashboard ejecutivo', included: true },
      { text: 'Check-ins semanales', included: true },
      { text: 'Templates del marketplace', included: true },
      { text: 'Integraciones externas', included: false },
      { text: 'Simulador de escenarios', included: false },
      { text: 'SSO / MFA', included: false },
    ],
  },
  {
    name: 'Professional',
    desc: 'Para organizaciones que necesitan visibilidad completa y automatización operativa.',
    amount: 'USD 200',
    period: '/ mes',
    featured: true,
    cta: 'Coordinar demo',
    ctaStyle: 'primary' as const,
    features: [
      { text: 'Hasta 50 colaboradores', included: true },
      { text: 'KPIs individuales y grupales', included: true },
      { text: 'Dashboard ejecutivo + árbol de objetivos', included: true },
      { text: 'Check-ins semanales', included: true },
      { text: 'Templates del marketplace', included: true },
      { text: 'Integraciones Google Sheets, REST y CSV', included: true },
      { text: 'Simulador de escenarios', included: true },
      { text: 'SSO / MFA', included: false },
    ],
  },
  {
    name: 'Enterprise',
    desc: 'Para estructuras complejas con mayores requisitos de seguridad y acompañamiento.',
    amount: 'USD 400',
    period: '/ mes',
    featured: false,
    cta: 'Hablar con ventas',
    ctaStyle: 'outline' as const,
    features: [
      { text: 'Colaboradores ilimitados', included: true },
      { text: 'Todo lo de Professional', included: true },
      { text: 'SSO corporativo (SAML / OAuth2)', included: true },
      { text: 'MFA obligatorio por política', included: true },
      { text: 'Auditoría completa de acciones', included: true },
      { text: 'Exportación PDF con narrativa', included: true },
      { text: 'Soporte dedicado y SLA', included: true },
      { text: 'Onboarding personalizado', included: true },
    ],
  },
]

const TESTIMONIALS = [
  {
    quote: 'Antes tardábamos horas en armar el reporte mensual de KPIs. Ahora lo tenemos en un click con el PDF ejecutivo. El tablero de semáforos cambió cómo ve los números toda la dirección.',
    name: 'Martina R.',
    role: 'Directora de RRHH · Empresa de servicios',
    color: '#15803d',
    initials: 'MR',
  },
  {
    quote: 'La detección de outliers nos ahorró aprobar datos incorrectos al menos tres veces en el primer mes. El sistema marca la anomalía antes de que llegue a la curaduría.',
    name: 'Leandro M.',
    role: 'Head of Operations · SaaS B2B',
    color: '#1d4ed8',
    initials: 'LM',
  },
  {
    quote: 'Los check-ins semanales cambiaron la cultura del equipo. Antes nadie reportaba nada, ahora tenemos contexto de cada área cada semana sin reuniones extra.',
    name: 'Sofía G.',
    role: 'CEO · Consultora de gestión',
    color: '#7c3aed',
    initials: 'SG',
  },
]

const FAQS = [
  {
    q: '¿Puedo importar mis KPIs existentes?',
    a: 'Sí. El marketplace incluye templates listos para importar y también podés crear KPIs personalizados con fórmulas propias desde el módulo de configuración.',
  },
  {
    q: '¿Cómo funciona la integración con Google Sheets?',
    a: 'Configurás la URL de la hoja, el rango de celdas y la frecuencia de actualización. El sistema toma el valor automáticamente y lo registra como medición del KPI correspondiente.',
  },
  {
    q: '¿El sistema es multiempresa?',
    a: 'Cada instancia es single-tenant: una empresa, una base de datos, sin mezcla de datos. Eso garantiza aislamiento y control operativo.',
  },
  {
    q: '¿Qué pasa si un colaborador propone un valor muy fuera de lo normal?',
    a: 'El sistema calcula el z-score del valor respecto al historial y muestra una advertencia visual antes de que el líder apruebe. Para muestras pequeñas usa desvío porcentual.',
  },
  {
    q: '¿Cómo solicito una demo y avanzo con la compra?',
    a: 'Coordinamos una demo, relevamos cantidad de usuarios, integraciones y requisitos de seguridad, y luego armamos la propuesta comercial e implementación.',
  },
]

const normalizePhoneHref = (value: string) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [heroControls, setHeroControls] = useState(() => ({
    sales: HERO_CONTROLS[0].initial,
    delivery: HERO_CONTROLS[1].initial,
    engagement: HERO_CONTROLS[2].initial,
  }))
  const [demoForm, setDemoForm] = useState<DemoFormState>(INITIAL_DEMO_FORM)
  const [demoSubmitState, setDemoSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [demoSubmitMessage, setDemoSubmitMessage] = useState('')

  const demoHref = '#contacto'
  const contactMailHref = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(contactDemoSubject)}`
    : '#contacto'

  const phoneCards = contactPhones.map((value, index) => {
    const normalized = normalizePhoneHref(value)
    return {
      label: index === 0 ? 'Teléfono comercial' : `Teléfono ${index + 1}`,
      value,
      href: normalized ? `tel:${normalized}` : '#contacto',
    }
  })

  const contactCards = [
    ...(contactEmail
      ? [
          {
            label: 'Email comercial',
            value: contactEmail,
            href: contactMailHref,
          },
        ]
      : []),
    ...phoneCards,
  ]

  const primaryPhone = phoneCards[0]
  const hasDirectChannels = contactCards.length > 0
  const { sales, delivery, engagement } = heroControls
  const overallScore = clamp(Math.round(sales * 0.42 + delivery * 0.34 + engagement * 0.24), 0, 100)
  const volatility = Math.round((Math.abs(sales - delivery) + Math.abs(delivery - engagement) + Math.abs(engagement - sales)) / 3)
  const criticalBase = Math.round(
    (sales < 62 ? 9 : 3)
    + (delivery < 65 ? 10 : 3)
    + (engagement < 68 ? 8 : 2)
    + volatility * 0.18
  )
  const criticalPct = clamp(criticalBase, 4, 26)
  const greenPct = clamp(Math.round(overallScore - volatility * 0.25), 42, 88)
  const riskPct = clamp(100 - greenPct - criticalPct, 8, 42)
  const normalizedGreenPct = 100 - riskPct - criticalPct
  const summaryTone = overallScore >= 80 ? 'green' : overallScore >= 65 ? 'yellow' : 'red'
  const summaryLabel = summaryTone === 'green'
    ? 'Escenario sólido'
    : summaryTone === 'yellow'
      ? 'Atención operativa'
      : 'Riesgo ejecutivo'
  const scenarioLabel = volatility <= 8 ? 'Escenario balanceado' : volatility <= 16 ? 'Escenario sensible' : 'Escenario inestable'
  const weakestDriver = [
    { key: 'sales', label: 'la tracción comercial', value: sales },
    { key: 'delivery', label: 'la capacidad de entrega', value: delivery },
    { key: 'engagement', label: 'el compromiso del equipo', value: engagement },
  ].sort((a, b) => a.value - b.value)[0]

  let insightTitle = 'Dirección con visibilidad inmediata'
  let insightText = 'Los tres frentes se sostienen y el tablero puede usarse para decidir sin reconstruir el contexto manualmente.'
  if (summaryTone === 'yellow') {
    insightTitle = `Conviene intervenir en ${weakestDriver.label}`
    insightText = `El escenario sigue siendo gestionable, pero ${weakestDriver.label} ya empieza a empujar indicadores al amarillo y a exigir seguimiento más fino.`
  }
  if (summaryTone === 'red') {
    insightTitle = `La presión se concentra en ${weakestDriver.label}`
    insightText = `Al caer ${weakestDriver.label}, aumenta el peso de KPIs críticos y la dirección pierde margen para esperar al cierre del período.`
  }

  const heroRows = [
    {
      label: 'Tracción comercial · Q2 2026',
      value: sales,
      tone: sales >= 80 ? 'green' : sales >= 65 ? 'yellow' : 'red',
      prefix: sales >= 80 ? '↑' : sales >= 65 ? '◎' : '↓',
    },
    {
      label: 'Entrega comprometida',
      value: delivery,
      tone: delivery >= 80 ? 'green' : delivery >= 65 ? 'yellow' : 'red',
      prefix: delivery >= 80 ? '↑' : delivery >= 65 ? '◎' : '↓',
    },
    {
      label: 'Compromiso del equipo',
      value: engagement,
      tone: engagement >= 80 ? 'green' : engagement >= 65 ? 'yellow' : 'red',
      prefix: engagement >= 80 ? '↑' : engagement >= 65 ? '◎' : '↓',
    },
  ]

  const departmentBars = [
    { label: 'Comercial', pct: clamp(Math.round(sales + 6 - volatility * 0.12), 38, 98) },
    { label: 'Tecnología', pct: clamp(Math.round(delivery * 0.72 + engagement * 0.28), 35, 96) },
    { label: 'Operaciones', pct: clamp(Math.round(delivery * 0.78 + sales * 0.22 - 4), 32, 95) },
    { label: 'RRHH', pct: clamp(Math.round(engagement * 0.8 + delivery * 0.2 + 4), 36, 97) },
  ]

  const handleHeroControlChange = (key: 'sales' | 'delivery' | 'engagement', value: number) => {
    setHeroControls((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleDemoFormChange = (field: keyof DemoFormState, value: string) => {
    setDemoForm((current) => ({
      ...current,
      [field]: value,
    }))

    if (demoSubmitState !== 'idle') {
      setDemoSubmitState('idle')
      setDemoSubmitMessage('')
    }
  }

  const handleDemoRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDemoSubmitState('loading')
    setDemoSubmitMessage('')

    try {
      const response = await api.post('/contact/demo-request', {
        ...demoForm,
        usersCount: Number(demoForm.usersCount),
      })

      setDemoSubmitState('success')
      setDemoForm(INITIAL_DEMO_FORM)
      setDemoSubmitMessage(
        response.data?.delivery === 'manual'
          ? 'Recibimos tu solicitud. En este entorno la derivación automática no está configurada; usá también los teléfonos para acelerar el contacto.'
          : response.data?.message || 'Recibimos tu solicitud. El equipo comercial te va a contactar pronto.'
      )
    } catch (error: any) {
      setDemoSubmitState('error')
      setDemoSubmitMessage(
        error.response?.data?.error || 'No pudimos enviar la solicitud. Probá nuevamente o usá los canales directos.'
      )
    }
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <a href="/" className="landing-nav-brand">
          <div className="landing-nav-mark">KPI</div>
          <span className="landing-nav-name">KPI Manager</span>
        </a>
        <div className="landing-nav-actions">
          <Link to="/login" className="landing-btn-ghost">Iniciar sesión</Link>
          <a href={demoHref} className="landing-btn-primary">Solicitar demo</a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <div className="landing-hero-eyebrow">
              <span className="landing-hero-eyebrow-dot" />
              Demo guiada + propuesta comercial
            </div>
            <h1 className="landing-hero-title">
              Convertí tus KPIs en<br />
              <span>decisiones ejecutivas confiables</span><br />
              sin perder trazabilidad
            </h1>
            <p className="landing-hero-subtitle">
              KPI Manager centraliza objetivos, seguimiento y reporting ejecutivo en una instancia aislada para tu empresa. Solicitá una demo para revisar compra, onboarding, seguridad e integraciones.
            </p>
            <div className="landing-hero-ctas">
              <a href={demoHref} className="landing-hero-cta-primary">
                Solicitar demo →
              </a>
              <a href="#demo" className="landing-hero-cta-secondary">
                Ver proceso comercial
              </a>
            </div>
            <div className="landing-hero-trust">
              <div className="landing-hero-trust-avatars">
                <div className="landing-hero-trust-avatar">MR</div>
                <div className="landing-hero-trust-avatar">LM</div>
                <div className="landing-hero-trust-avatar">SG</div>
                <div className="landing-hero-trust-avatar">+</div>
              </div>
              <span>Implementación guiada para dirección, operaciones, RRHH y finanzas</span>
            </div>
            {contactCards.length > 0 && (
              <div className="landing-hero-contact-rail">
                {contactCards.slice(0, 3).map((contact) => (
                  <a className="landing-hero-contact-card" href={contact.href} key={`${contact.label}-${contact.value}`}>
                    <span className="landing-hero-contact-label">{contact.label}</span>
                    <span className="landing-hero-contact-value">{contact.value}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="landing-hero-visual">
            <div className="landing-hero-mockup">
              <div className="landing-mockup-bar">
                <div className="landing-mockup-dot" />
                <div className="landing-mockup-dot" />
                <div className="landing-mockup-dot" />
                <div className="landing-mockup-url">kpimanager.com.ar/tablero-ejecutivo</div>
              </div>
              <div className="landing-mockup-body">
                <div className="landing-mockup-live-strip">
                  <span className="landing-mockup-live-badge">Demo interactiva</span>
                  <span className="landing-mockup-live-note">Mové los drivers y mirá cómo cambia el semáforo</span>
                </div>
                <div className="landing-mockup-metrics">
                  <div className={`landing-mockup-metric ${summaryTone}`}>
                    <div className="landing-mockup-metric-val">{normalizedGreenPct}%</div>
                    <div className="landing-mockup-metric-label">En verde</div>
                  </div>
                  <div className="landing-mockup-metric yellow">
                    <div className="landing-mockup-metric-val">{riskPct}%</div>
                    <div className="landing-mockup-metric-label">En riesgo</div>
                  </div>
                  <div className="landing-mockup-metric red">
                    <div className="landing-mockup-metric-val">{criticalPct}%</div>
                    <div className="landing-mockup-metric-label">Crítico</div>
                  </div>
                </div>

                <div className={`landing-mockup-insight ${summaryTone}`}>
                  <div className="landing-mockup-insight-topline">
                    <span className={`landing-mockup-status-pill ${summaryTone}`}>{summaryLabel}</span>
                    <span className="landing-mockup-scenario-label">{scenarioLabel}</span>
                  </div>
                  <div className="landing-mockup-insight-score">
                    <span className="landing-mockup-insight-score-value">{overallScore}%</span>
                    <span className="landing-mockup-insight-score-label">salud operativa proyectada</span>
                  </div>
                  <div className="landing-mockup-insight-title">{insightTitle}</div>
                  <p className="landing-mockup-insight-text">{insightText}</p>
                </div>

                {heroRows.map((row) => (
                  <div className="landing-mockup-row" key={row.label}>
                    <span className="landing-mockup-row-name">{row.label}</span>
                    <span className={`landing-mockup-badge ${row.tone}`}>{row.prefix} {row.value}%</span>
                  </div>
                ))}

                <div className="landing-mockup-bar-chart">
                  {departmentBars.map((row) => (
                    <div className="landing-mockup-bar-row" key={row.label}>
                      <span>{row.label}</span>
                      <div className="landing-mockup-bar-fill">
                        <div className="landing-mockup-bar-inner" style={{ width: `${row.pct}%` }} />
                      </div>
                      <span>{row.pct}%</span>
                    </div>
                  ))}
                </div>

                <div className="landing-mockup-controls">
                  <div className="landing-mockup-controls-head">
                    <div>
                      <div className="landing-mockup-controls-title">Probá el impacto de tus drivers</div>
                      <div className="landing-mockup-controls-subtitle">Simulá un escenario comercial antes de pedir la demo</div>
                    </div>
                    <div className={`landing-mockup-controls-score ${summaryTone}`}>{overallScore}%</div>
                  </div>
                  <div className="landing-mockup-controls-grid">
                    {HERO_CONTROLS.map((control) => (
                      <label className="landing-mockup-slider-card" key={control.key}>
                        <div className="landing-mockup-slider-topline">
                          <div>
                            <span className="landing-mockup-slider-label">{control.label}</span>
                            <span className="landing-mockup-slider-hint">{control.hint}</span>
                          </div>
                          <span className="landing-mockup-slider-value">{heroControls[control.key]}%</span>
                        </div>
                        <input
                          aria-label={control.label}
                          className="landing-mockup-slider"
                          type="range"
                          min={control.min}
                          max={control.max}
                          value={heroControls[control.key]}
                          onChange={(event) => handleHeroControlChange(control.key, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-stats">
        <div className="landing-stats-inner">
          <div className="landing-stat">
            <div className="landing-stat-value">36+</div>
            <div className="landing-stat-label">Templates de KPIs listos</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">6</div>
            <div className="landing-stat-label">Industrias cubiertas</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">100%</div>
            <div className="landing-stat-label">Instancia aislada por cliente</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">&lt;1min</div>
            <div className="landing-stat-label">Para generar un reporte ejecutivo</div>
          </div>
        </div>
      </section>

      <section className="landing-process" id="demo">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Cómo avanzar</div>
          <h2 className="landing-section-title">El acceso se coordina por demo, relevamiento y propuesta</h2>
          <p className="landing-section-subtitle">
            La app no es freemium. Primero revisamos tu contexto y después definimos la modalidad de compra e implementación más adecuada.
          </p>
        </div>
        <div className="landing-process-grid">
          {COMMERCIAL_STEPS.map((step) => (
            <article className="landing-process-card" key={step.step}>
              <div className="landing-process-step">{step.step}</div>
              <h3 className="landing-process-title">{step.title}</h3>
              <p className="landing-process-desc">{step.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Funcionalidades</div>
          <h2 className="landing-section-title">Todo lo que necesitás para gestionar KPIs en serio</h2>
          <p className="landing-section-subtitle">
            Desde la captura del dato hasta el reporte ejecutivo, cubrimos todo el ciclo de vida de tus indicadores.
          </p>
        </div>
        <div className="landing-features-grid">
          {FEATURES.map((feature) => (
            <div className="landing-feature-card" key={feature.title}>
              <div className="landing-feature-icon">{feature.icon}</div>
              <h3 className="landing-feature-title">{feature.title}</h3>
              <p className="landing-feature-desc">{feature.desc}</p>
              <span className="landing-feature-tag">✓ {feature.tag}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-pricing" id="planes">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Planes y alcance</div>
          <h2 className="landing-section-title">Elegí la modalidad que mejor se adapta a tu estructura</h2>
          <p className="landing-section-subtitle">
            La activación se coordina con demo previa y propuesta comercial según usuarios, integraciones, seguridad y acompañamiento requerido.
          </p>
        </div>
        <div className="landing-pricing-grid">
          {PLANS.map((plan) => (
            <div className={`landing-plan ${plan.featured ? 'featured' : ''}`} key={plan.name}>
              {plan.featured && <div className="landing-plan-badge">Más solicitado</div>}
              <div>
                <h3 className="landing-plan-name">{plan.name}</h3>
                <p className="landing-plan-desc">{plan.desc}</p>
              </div>
              <div className="landing-plan-price">
                <span className="landing-plan-amount">{plan.amount}</span>
                <span className="landing-plan-period">{plan.period}</span>
              </div>
              <hr className="landing-plan-divider" />
              <ul className="landing-plan-features">
                {plan.features.map((feature) => (
                  <li className="landing-plan-feature" key={feature.text}>
                    <span className={`landing-plan-check ${feature.included ? '' : 'muted'}`}>
                      {feature.included ? '✓' : '–'}
                    </span>
                    <span style={{ color: feature.included ? undefined : '#94a3b8' }}>{feature.text}</span>
                  </li>
                ))}
              </ul>
              <a href={demoHref} className={`landing-plan-cta ${plan.ctaStyle}`}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
        <p className="landing-pricing-note">
          La compra y el acceso se gestionan con el equipo comercial luego de la demo.
        </p>
      </section>

      <section className="landing-proof">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Testimonios</div>
          <h2 className="landing-section-title">Lo que dicen los equipos que ya lo usan</h2>
        </div>
        <div className="landing-proof-grid">
          {TESTIMONIALS.map((testimonial) => (
            <div className="landing-proof-card" key={testimonial.name}>
              <div className="landing-proof-stars">★★★★★</div>
              <p className="landing-proof-quote">"{testimonial.quote}"</p>
              <div className="landing-proof-author">
                <div className="landing-proof-avatar" style={{ background: testimonial.color }}>{testimonial.initials}</div>
                <div>
                  <div className="landing-proof-name">{testimonial.name}</div>
                  <div className="landing-proof-role">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-faq">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Preguntas frecuentes</div>
          <h2 className="landing-section-title">Todo lo que querés saber</h2>
        </div>
        <div className="landing-faq-list">
          {FAQS.map((faq, index) => (
            <div className={`landing-faq-item ${openFaq === index ? 'open' : ''}`} key={faq.q}>
              <button className="landing-faq-q" onClick={() => setOpenFaq(openFaq === index ? null : index)}>
                {faq.q}
                <span className="landing-faq-icon">+</span>
              </button>
              <p className="landing-faq-a">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta-section" id="contacto">
        <div className="landing-cta-inner">
          <div className="landing-section-eyebrow landing-section-eyebrow-light">Contacto comercial</div>
          <h2 className="landing-cta-title">
            Solicitá una demo y<br />
            <span>gestionamos la compra con tu equipo</span>
          </h2>
          <p className="landing-cta-subtitle">
            Completá el formulario y relevamos usuarios, KPIs, seguridad, integraciones y modalidad de implementación.
          </p>
          <div className="landing-contact-layout">
            <form className="landing-demo-form" onSubmit={handleDemoRequestSubmit}>
              <div className="landing-demo-form-header">
                <div className="landing-demo-form-title">Pedí una demo guiada</div>
                <div className="landing-demo-form-copy">
                  Te contactamos para coordinar una reunión breve y revisar el alcance comercial.
                </div>
              </div>
              <div className="landing-demo-form-grid">
                <label className="landing-demo-field">
                  <span className="landing-demo-label">Nombre</span>
                  <input
                    className="landing-demo-input"
                    type="text"
                    value={demoForm.name}
                    onChange={(event) => handleDemoFormChange('name', event.target.value)}
                    placeholder="Tu nombre"
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </label>
                <label className="landing-demo-field">
                  <span className="landing-demo-label">Empresa</span>
                  <input
                    className="landing-demo-input"
                    type="text"
                    value={demoForm.company}
                    onChange={(event) => handleDemoFormChange('company', event.target.value)}
                    placeholder="Nombre de la empresa"
                    autoComplete="organization"
                    maxLength={160}
                    required
                  />
                </label>
                <label className="landing-demo-field">
                  <span className="landing-demo-label">Mail</span>
                  <input
                    className="landing-demo-input"
                    type="email"
                    value={demoForm.email}
                    onChange={(event) => handleDemoFormChange('email', event.target.value)}
                    placeholder="nombre@empresa.com"
                    autoComplete="email"
                    maxLength={180}
                    required
                  />
                </label>
                <label className="landing-demo-field">
                  <span className="landing-demo-label">Teléfono</span>
                  <input
                    className="landing-demo-input"
                    type="tel"
                    value={demoForm.phone}
                    onChange={(event) => handleDemoFormChange('phone', event.target.value)}
                    placeholder="+54 9 ..."
                    autoComplete="tel"
                    maxLength={40}
                    required
                  />
                </label>
                <label className="landing-demo-field landing-demo-field-full">
                  <span className="landing-demo-label">Cantidad de usuarios</span>
                  <input
                    className="landing-demo-input"
                    type="number"
                    min="1"
                    max="50000"
                    step="1"
                    value={demoForm.usersCount}
                    onChange={(event) => handleDemoFormChange('usersCount', event.target.value)}
                    placeholder="Ej: 35"
                    inputMode="numeric"
                    required
                  />
                </label>
              </div>
              {demoSubmitState !== 'idle' && demoSubmitMessage && (
                <div className={`landing-demo-status ${demoSubmitState}`}>
                  {demoSubmitMessage}
                </div>
              )}
              <div className="landing-demo-form-actions">
                <button className="landing-cta-primary landing-demo-submit" type="submit" disabled={demoSubmitState === 'loading'}>
                  {demoSubmitState === 'loading' ? 'Enviando solicitud...' : 'Enviar solicitud de demo →'}
                </button>
                <div className="landing-demo-form-note">Respuesta comercial estimada: dentro de 1 día hábil.</div>
              </div>
            </form>
            <div className="landing-contact-side">
              <div className="landing-contact-side-title">Canales directos</div>
              <p className="landing-contact-side-copy">
                Si preferís avanzar por llamada o correo, también podés usar estos datos de contacto.
              </p>
              {hasDirectChannels ? (
                <div className="landing-contact-grid">
                  {contactCards.map((contact) => (
                    <a className="landing-contact-card" href={contact.href} key={`${contact.label}-${contact.value}`}>
                      <span className="landing-contact-label">{contact.label}</span>
                      <span className="landing-contact-value">{contact.value}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="landing-contact-empty">
                  Definí el mail y los teléfonos comerciales en la configuración del frontend para publicar esta sección.
                </div>
              )}
              <div className="landing-cta-actions landing-contact-actions">
                {contactEmail && (
                  <a href={contactMailHref} className="landing-cta-secondary">Escribir por mail</a>
                )}
                {primaryPhone ? (
                  <a href={primaryPhone.href} className="landing-cta-secondary">Llamar al equipo comercial</a>
                ) : (
                  <Link to="/login" className="landing-cta-secondary">Iniciar sesión</Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand-block">
          <div className="landing-footer-brand">KPI Manager</div>
          <div className="landing-footer-copy">© {new Date().getFullYear()} KPI Manager. Todos los derechos reservados.</div>
        </div>
        {contactCards.length > 0 && (
          <div className="landing-footer-contacts">
            {contactCards.map((contact) => (
              <a className="landing-footer-contact" href={contact.href} key={`footer-${contact.label}-${contact.value}`}>
                {contact.value}
              </a>
            ))}
          </div>
        )}
        <Link to="/login" className="landing-footer-link">Iniciar sesión →</Link>
      </footer>
    </div>
  )
}
