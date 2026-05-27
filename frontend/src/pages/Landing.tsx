import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { contactEmail, contactPhones } from '../config/runtime'
import api from '../services/api'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './Landing.css'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const HERO_CONTROLS = [
  {
    key: 'sales',
    min: 45,
    max: 100,
    initial: 82,
  },
  {
    key: 'delivery',
    min: 45,
    max: 100,
    initial: 74,
  },
  {
    key: 'engagement',
    min: 45,
    max: 100,
    initial: 79,
  },
] as const

const CONTACT_API_ERROR_KEYS: Record<string, string> = {
  CONTACT_DEMO_INVALID: 'landing:contact.api_errors.invalid_form',
  CONTACT_DEMO_SUBMIT_FAILED: 'landing:contact.api_errors.submit_failed',
}

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
  { key: 'dashboard', icon: '📊' },
  { key: 'outlier', icon: '🤖' },
  { key: 'checkins', icon: '📅' },
  { key: 'integrations', icon: '🔗' },
  { key: 'simulator', icon: '🧪' },
  { key: 'marketplace', icon: '📦' },
  { key: 'pdf', icon: '📄' },
  { key: 'security', icon: '🛡️' },
] as const

const COMMERCIAL_STEPS = [
  { step: '01', key: 'setup' },
  { step: '02', key: 'import' },
  { step: '03', key: 'track' },
] as const

const VALUE_PILLARS = [
  {
    key: 'visibility',
    icon: '👁',
  },
  {
    key: 'deviation',
    icon: '⚡',
  },
  {
    key: 'action',
    icon: '🎯',
  },
 ] as const

const OUTCOMES = [
  { key: 'detect', icon: '⚡' },
  { key: 'avoid', icon: '🚫' },
  { key: 'report', icon: '📄' },
] as const

const IMPACT_METRICS = [1, 2, 3, 4] as const

const PLANS = [
  {
    key: 'starter',
    featured: false,
    ctaStyle: 'outline' as const,
    features: [true, true, true, true, true, false, false, false],
  },
  {
    key: 'pro',
    featured: true,
    ctaStyle: 'primary' as const,
    features: [true, true, true, true, true, true, true, false],
  },
  {
    key: 'enterprise',
    featured: false,
    ctaStyle: 'outline' as const,
    features: [true, true, true, true, true, true, true, true],
  },
 ] as const

const TESTIMONIALS = [
  {
    key: 't1',
    color: '#15803d',
    initials: 'MR',
  },
  {
    key: 't2',
    color: '#1d4ed8',
    initials: 'LM',
  },
  {
    key: 't3',
    color: '#7c3aed',
    initials: 'SG',
  },
 ] as const

const PROBLEM_KEYS = ['p1', 'p2', 'p3', 'p4'] as const
const FAQ_IDS = [1, 2, 3, 4, 5, 6, 7] as const

const DEMO_SCREENS = [
  { key: 'dashboard', icon: '📊', path: 'dashboard' },
  { key: 'kpis', icon: '📋', path: 'kpis' },
  { key: 'risk', icon: '⚠️', path: 'mapa-riesgo' },
  { key: 'executive', icon: '🏆', path: 'tablero-ejecutivo' },
  { key: 'report', icon: '📄', path: 'reportes' },
] as const

const DEMO_AREAS = [
  { name: 'Comercial', score: 82, trend: '+4%', status: 'green' as const, kpis: ['Cierre · 88%', 'Pipeline · 92%', 'NPS · 115%'] },
  { name: 'Tecnología', score: 71, trend: '−2%', status: 'yellow' as const, kpis: ['Deploy · 94%', 'Bugs · 76%', 'Uptime · 99%'] },
  { name: 'Operaciones', score: 65, trend: '+1%', status: 'yellow' as const, kpis: ['Entrega · 79%', 'Eficiencia · 68%', 'Stock · 91%'] },
  { name: 'RRHH', score: 89, trend: '+3%', status: 'green' as const, kpis: ['Retención · 103%', 'Clima · 88%', 'Capacitación · 96%'] },
]

const DEMO_KPIS_DATA = [
  { name: 'Tasa de cierre comercial', owner: 'María R.', goal: '25%', actual: '22%', pct: 88, status: 'yellow' as const },
  { name: 'NPS clientes', owner: 'Carlos M.', goal: '45 pts', actual: '52 pts', pct: 115, status: 'green' as const },
  { name: 'Tiempo de entrega', owner: 'Ana L.', goal: '5 días', actual: '6.2 días', pct: 79, status: 'red' as const },
  { name: 'Retención de empleados', owner: 'Sofía G.', goal: '90%', actual: '93%', pct: 103, status: 'green' as const },
  { name: 'Ingresos MRR', owner: 'Pedro V.', goal: '$50k', actual: '$47k', pct: 94, status: 'yellow' as const },
  { name: 'Tickets < SLA', owner: 'Juan P.', goal: '95%', actual: '97%', pct: 102, status: 'green' as const },
]

function DemoDashboard() {
  return (
    <div className="ldp-screen">
      <div className="ldp-topbar">
        <span className="ldp-breadcrumb">Dashboard <span className="ldp-sep">›</span> Q2 2026</span>
        <span className="ldp-badge ldp-badge-yellow">Salud global · 78%</span>
      </div>
      <div className="ldp-dash-grid">
        {DEMO_AREAS.map((area) => (
          <div key={area.name} className={`ldp-area-card ldp-tone-${area.status}`}>
            <div className="ldp-area-head">
              <span className="ldp-area-name">{area.name}</span>
              <span className={`ldp-badge ldp-badge-${area.status}`}>{area.score}%</span>
            </div>
            <div className="ldp-area-trend">{area.trend} vs mes ant.</div>
            <div className="ldp-area-tags">
              {area.kpis.map((k) => <span key={k} className="ldp-tag">{k}</span>)}
            </div>
          </div>
        ))}
      </div>
      <div className="ldp-summary-bar">
        <span className="ldp-chip ldp-chip-green">✓ 12 en verde</span>
        <span className="ldp-chip ldp-chip-yellow">◎ 4 en riesgo</span>
        <span className="ldp-chip ldp-chip-red">✕ 2 críticos</span>
        <span className="ldp-chip ldp-chip-gray">18 KPIs activos</span>
      </div>
    </div>
  )
}

function DemoKPIs() {
  return (
    <div className="ldp-screen">
      <div className="ldp-topbar">
        <span className="ldp-breadcrumb">KPIs <span className="ldp-sep">›</span> Mis indicadores · Q2 2026</span>
        <div className="ldp-filter-pills">
          <span className="ldp-pill ldp-pill-active">Todos (18)</span>
          <span className="ldp-pill">En riesgo (4)</span>
          <span className="ldp-pill">Críticos (2)</span>
        </div>
      </div>
      <div className="ldp-kpi-table">
        <div className="ldp-krow ldp-krow-head">
          <span>Indicador</span><span>Objetivo</span><span>Actual</span><span>%</span><span>Estado</span>
        </div>
        {DEMO_KPIS_DATA.map((k) => (
          <div key={k.name} className="ldp-krow">
            <div className="ldp-kpi-cell">
              <span className="ldp-kpi-nm">{k.name}</span>
              <small className="ldp-kpi-own">{k.owner}</small>
            </div>
            <span className="ldp-kv">{k.goal}</span>
            <span className="ldp-kv">{k.actual}</span>
            <span className={`ldp-kv ldp-kv-${k.status}`}>{k.pct}%</span>
            <span className={`ldp-badge ldp-badge-${k.status}`}>
              {k.status === 'green' ? 'OK' : k.status === 'yellow' ? 'Riesgo' : 'Crítico'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoRiskMap() {
  return (
    <div className="ldp-screen">
      <div className="ldp-topbar">
        <span className="ldp-breadcrumb">Análisis <span className="ldp-sep">›</span> Mapa de riesgo · Q2 2026</span>
      </div>
      <div className="ldp-risk-layout">
        <div className="ldp-risk-yaxis">
          <span>Alta prob.</span><span>Media</span><span>Baja prob.</span>
        </div>
        <div className="ldp-risk-body">
          <div className="ldp-risk-grid">
            <div className="ldp-rc ldp-rc-yellow"><span className="ldp-rdot ldp-rdot-yellow">Bugs críticos</span></div>
            <div className="ldp-rc ldp-rc-yellow" />
            <div className="ldp-rc ldp-rc-red"><span className="ldp-rdot ldp-rdot-red">Tiempo de entrega</span></div>
            <div className="ldp-rc ldp-rc-green"><span className="ldp-rdot ldp-rdot-green">Deploy freq.</span></div>
            <div className="ldp-rc ldp-rc-yellow" />
            <div className="ldp-rc ldp-rc-yellow">
              <span className="ldp-rdot ldp-rdot-yellow">MRR</span>
              <span className="ldp-rdot ldp-rdot-yellow">Cierre</span>
            </div>
            <div className="ldp-rc ldp-rc-green">
              <span className="ldp-rdot ldp-rdot-green">NPS</span>
              <span className="ldp-rdot ldp-rdot-green">Retención</span>
            </div>
            <div className="ldp-rc ldp-rc-green"><span className="ldp-rdot ldp-rdot-green">Tickets SLA</span></div>
            <div className="ldp-rc ldp-rc-yellow" />
          </div>
          <div className="ldp-risk-xaxis">
            <span>Bajo impacto</span><span>Medio</span><span>Alto impacto</span>
          </div>
        </div>
      </div>
      <div className="ldp-summary-bar">
        <span className="ldp-chip ldp-chip-red">1 crítico</span>
        <span className="ldp-chip ldp-chip-yellow">4 a vigilar</span>
        <span className="ldp-chip ldp-chip-green">5 bajo riesgo</span>
      </div>
    </div>
  )
}

function DemoExecutive() {
  return (
    <div className="ldp-screen">
      <div className="ldp-topbar">
        <span className="ldp-breadcrumb">Tablero ejecutivo <span className="ldp-sep">›</span> Q2 2026</span>
        <span className="ldp-date-chip">Mayo 2026</span>
      </div>
      <div className="ldp-exec-layout">
        <div className="ldp-exec-score-card">
          <div className="ldp-exec-ring">
            <span className="ldp-exec-num">78</span>
            <span className="ldp-exec-den">/100</span>
          </div>
          <div className="ldp-exec-meta">
            <div className="ldp-exec-label">Salud operativa global</div>
            <div className="ldp-exec-sub">Q2 2026 · 18 KPIs activos</div>
            <div className="ldp-exec-chips">
              <span className="ldp-chip ldp-chip-green">12 verde</span>
              <span className="ldp-chip ldp-chip-yellow">4 riesgo</span>
              <span className="ldp-chip ldp-chip-red">2 crítico</span>
            </div>
          </div>
        </div>
        <div className="ldp-exec-areas">
          {DEMO_AREAS.map((area) => (
            <div key={area.name} className="ldp-exec-row">
              <span className={`ldp-dot ldp-dot-${area.status}`} />
              <span className="ldp-exec-area">{area.name}</span>
              <div className="ldp-exec-bar">
                <div
                  className="ldp-exec-fill"
                  style={{
                    width: `${area.score}%`,
                    background: area.status === 'green' ? '#22c55e' : area.status === 'yellow' ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <span className="ldp-exec-pct">{area.score}%</span>
              <span className={`ldp-trend ${area.trend.startsWith('+') ? 'ldp-up' : 'ldp-dn'}`}>{area.trend}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DemoReport() {
  return (
    <div className="ldp-screen ldp-screen-report">
      <div className="ldp-topbar">
        <span className="ldp-breadcrumb">Reportes <span className="ldp-sep">›</span> PDF ejecutivo · Q2 2026</span>
        <button className="ldp-export-btn" type="button">⬇ Exportar PDF</button>
      </div>
      <div className="ldp-pdf-doc">
        <div className="ldp-pdf-hdr">
          <div className="ldp-pdf-logo">KPI</div>
          <div>
            <div className="ldp-pdf-brand">KPI Manager · Reporte Ejecutivo</div>
            <div className="ldp-pdf-sub">Q2 2026 · Acme Corp · Mayo 2026</div>
          </div>
        </div>
        <div className="ldp-pdf-metrics">
          {DEMO_AREAS.map((a) => (
            <div key={a.name} className={`ldp-pdf-met ldp-tone-${a.status}`}>
              <span className="ldp-pdf-met-val">{a.score}%</span>
              <span className="ldp-pdf-met-lbl">{a.name}</span>
            </div>
          ))}
        </div>
        <div className="ldp-pdf-s">
          <div className="ldp-pdf-sh">Resumen ejecutivo</div>
          <p className="ldp-pdf-body">La compañía muestra una salud operativa del <strong>78%</strong> al cierre del período. RRHH lidera el rendimiento (89%), seguida de Comercial (82%). Tecnología y Operaciones requieren atención focalizada por desvíos en tiempos de entrega y eficiencia operativa.</p>
        </div>
        <div className="ldp-pdf-s">
          <div className="ldp-pdf-sh">KPIs bajo seguimiento</div>
          <div className="ldp-pdf-risks">
            <div className="ldp-pdf-rrow"><span className="ldp-badge ldp-badge-red">Crítico</span><span>Tiempo de entrega · 6.2 días vs 5 días objetivo (79%)</span></div>
            <div className="ldp-pdf-rrow"><span className="ldp-badge ldp-badge-yellow">Riesgo</span><span>Ingresos MRR · $47k vs $50k objetivo (94%)</span></div>
            <div className="ldp-pdf-rrow"><span className="ldp-badge ldp-badge-yellow">Riesgo</span><span>Tasa de cierre · 22% vs 25% objetivo (88%)</span></div>
          </div>
        </div>
        <div className="ldp-pdf-footer">Generado automáticamente · KPI Manager · kpimanager@gmail.com · Mayo 2026</div>
      </div>
    </div>
  )
}

const normalizePhoneHref = (value: string) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

export default function Landing() {
  const { t, i18n } = useTranslation('landing')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [heroControls, setHeroControls] = useState(() => ({
    sales: HERO_CONTROLS[0].initial,
    delivery: HERO_CONTROLS[1].initial,
    engagement: HERO_CONTROLS[2].initial,
  }))
  const [demoForm, setDemoForm] = useState<DemoFormState>(INITIAL_DEMO_FORM)
  const [demoSubmitState, setDemoSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [demoSubmitMessage, setDemoSubmitMessage] = useState('')
  const [demoScreen, setDemoScreen] = useState(0)
  const [demoPaused, setDemoPaused] = useState(false)

  useEffect(() => {
    if (demoPaused) return
    const id = setInterval(() => setDemoScreen((p) => (p + 1) % DEMO_SCREENS.length), 4500)
    return () => clearInterval(id)
  }, [demoPaused])

  const demoHref = '#contacto'
  const demoPreviewHref = '#demo'
  const contactMailHref = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(t('contact.mail_subject'))}`
    : '#contacto'

  const phoneCards = contactPhones.map((value, index) => {
    const normalized = normalizePhoneHref(value)
    return {
      label: index === 0 ? t('hero.phone_label_0') : t('hero.phone_label_n', { n: index + 1 }),
      value,
      href: normalized ? `tel:${normalized}` : '#contacto',
    }
  })

  const contactCards = [
    ...(contactEmail
      ? [
          {
            label: t('hero.email_label'),
            value: contactEmail,
            href: contactMailHref,
          },
        ]
      : []),
    ...phoneCards,
  ]

  const primaryPhone = phoneCards[0]
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
    ? t('hero.summary.green')
    : summaryTone === 'yellow'
      ? t('hero.summary.yellow')
      : t('hero.summary.red')
  const scenarioLabel = volatility <= 8 ? t('hero.scenario.balanced') : volatility <= 16 ? t('hero.scenario.sensitive') : t('hero.scenario.unstable')
  const weakestDriver = [
    { key: 'sales', label: t('hero.driver_sales'), value: sales },
    { key: 'delivery', label: t('hero.driver_delivery'), value: delivery },
    { key: 'engagement', label: t('hero.driver_engagement'), value: engagement },
  ].sort((a, b) => a.value - b.value)[0]

  let insightTitle = t('hero.insight.green_title')
  let insightText = t('hero.insight.green_text')
  if (summaryTone === 'yellow') {
    insightTitle = t('hero.insight.yellow_title', { driver: weakestDriver.label })
    insightText = t('hero.insight.yellow_text', { driver: weakestDriver.label })
  }
  if (summaryTone === 'red') {
    insightTitle = t('hero.insight.red_title', { driver: weakestDriver.label })
    insightText = t('hero.insight.red_text', { driver: weakestDriver.label })
  }

  const heroControlLabels = HERO_CONTROLS.map((control) => ({
    ...control,
    label: t(`hero.controls.${control.key}_label`),
    hint: t(`hero.controls.${control.key}_hint`),
  }))

  const heroRows = [
    {
      label: t('hero.rows.sales_label'),
      value: sales,
      tone: sales >= 80 ? 'green' : sales >= 65 ? 'yellow' : 'red',
      prefix: sales >= 80 ? '↑' : sales >= 65 ? '◎' : '↓',
    },
    {
      label: t('hero.rows.delivery_label'),
      value: delivery,
      tone: delivery >= 80 ? 'green' : delivery >= 65 ? 'yellow' : 'red',
      prefix: delivery >= 80 ? '↑' : delivery >= 65 ? '◎' : '↓',
    },
    {
      label: t('hero.rows.engagement_label'),
      value: engagement,
      tone: engagement >= 80 ? 'green' : engagement >= 65 ? 'yellow' : 'red',
      prefix: engagement >= 80 ? '↑' : engagement >= 65 ? '◎' : '↓',
    },
  ]

  const departmentBars = [
    { label: t('hero.depts.commercial'), pct: clamp(Math.round(sales + 6 - volatility * 0.12), 38, 98) },
    { label: t('hero.depts.technology'), pct: clamp(Math.round(delivery * 0.72 + engagement * 0.28), 35, 96) },
    { label: t('hero.depts.operations'), pct: clamp(Math.round(delivery * 0.78 + sales * 0.22 - 4), 32, 95) },
    { label: t('hero.depts.hr'), pct: clamp(Math.round(engagement * 0.8 + delivery * 0.2 + 4), 36, 97) },
  ]

  const impactMetrics = IMPACT_METRICS.map((metric) => ({
    value: t(`stats.metric_${metric}_value`),
    label: t(`stats.metric_${metric}_label`),
  }))
  const problems = PROBLEM_KEYS.map((key) => t(`problem.items.${key}`))
  const valuePillars = VALUE_PILLARS.map((pillar) => {
    return {
      ...pillar,
      title: t(`problem.pillars.${pillar.key}_title`),
      desc: t(`problem.pillars.${pillar.key}_desc`),
    }
  })
  const commercialSteps = COMMERCIAL_STEPS.map((step) => {
    return {
      ...step,
      title: t(`process.steps.${step.key}_title`),
      desc: t(`process.steps.${step.key}_desc`),
    }
  })
  const outcomes = OUTCOMES.map((o) => ({
    ...o,
    title: t(`outcomes.${o.key}_title`),
    desc: t(`outcomes.${o.key}_desc`),
  }))
  const features = FEATURES.map((feature) => ({
    ...feature,
    title: t(`features.${feature.key}_title`),
    desc: t(`features.${feature.key}_desc`),
    tag: t(`features.${feature.key}_tag`),
  }))
  const plans = PLANS.map((plan) => ({
    ...plan,
    name: t(`pricing.plans.${plan.key}_name`),
    desc: t(`pricing.plans.${plan.key}_desc`),
    amount: t(`pricing.plans.${plan.key}_amount`),
    period: t(`pricing.plans.${plan.key}_period`),
    cta: t(`pricing.plans.${plan.key}_cta`),
    features: plan.features.map((included, index) => ({
      included,
      text: t(`pricing.plans.${plan.key}_f${index + 1}`),
    })),
  }))
  const testimonials = TESTIMONIALS.map((testimonial) => ({
    ...testimonial,
    quote: t(`testimonials.${testimonial.key}_quote`),
    name: t(`testimonials.${testimonial.key}_name`),
    role: t(`testimonials.${testimonial.key}_role`),
  }))
  const faqs = FAQ_IDS.map((id) => ({
    q: t(`faq.q${id}`),
    a: t(`faq.a${id}`),
  }))

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
          ? t('contact.success_manual')
          : response.data?.message || t('contact.success_default')
      )
    } catch (error: any) {
      setDemoSubmitState('error')
      setDemoSubmitMessage(
        resolveApiErrorMessage(error, t, {
          codeMap: CONTACT_API_ERROR_KEYS,
          fallbackKey: 'contact.error_default',
        })
      )
    }
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/landing" className="landing-nav-brand">
          <div className="landing-nav-mark">KPI</div>
          <span className="landing-nav-name">KPI Manager</span>
        </Link>
        <div className="landing-nav-actions">
          <div className="landing-lang-switcher">
            <button
              className={`landing-lang-btn${i18n.language === 'es' ? ' active' : ''}`}
              onClick={() => i18n.changeLanguage('es')}
            >ES</button>
            <span className="landing-lang-sep" />
            <button
              className={`landing-lang-btn${i18n.language === 'en' ? ' active' : ''}`}
              onClick={() => i18n.changeLanguage('en')}
            >EN</button>
          </div>
          <Link to="/login" className="landing-btn-ghost">{t('nav.login')}</Link>
          <a href={demoHref} className="landing-btn-primary">{t('nav.demo_btn')}</a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <div className="landing-hero-eyebrow">
              <span className="landing-hero-eyebrow-dot" />
              {t('hero.eyebrow')}
            </div>
            <h1 className="landing-hero-title">
              {t('hero.title_line1')}<br />
              <span>{t('hero.title_line2')}</span>
            </h1>
            <p className="landing-hero-subtitle">
              {t('hero.subtitle')}
            </p>
            <div className="landing-hero-ctas">
              <a href={demoPreviewHref} className="landing-hero-cta-primary">
                {t('hero.cta_demo_link')}
              </a>
              <a href="#como-funciona" className="landing-hero-cta-secondary">
                {t('hero.cta_how')}
              </a>
              <a href={demoHref} className="landing-hero-cta-ghost">
                {t('hero.cta_demo')}
              </a>
            </div>
            <div className="landing-hero-trust-pills">
              <span className="landing-hero-trust-pill">{t('hero.trust_p1')}</span>
              <span className="landing-hero-trust-pill">{t('hero.trust_p2')}</span>
              <span className="landing-hero-trust-pill">{t('hero.trust_p3')}</span>
            </div>
            <div className="landing-hero-trust">
              <div className="landing-hero-trust-avatars">
                <div className="landing-hero-trust-avatar">MR</div>
                <div className="landing-hero-trust-avatar">LM</div>
                <div className="landing-hero-trust-avatar">SG</div>
                <div className="landing-hero-trust-avatar">+</div>
              </div>
              <span>{t('hero.trust')}</span>
            </div>
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
                  <span className="landing-mockup-live-badge">{t('hero.mockup.live_badge')}</span>
                  <span className="landing-mockup-live-note">{t('hero.mockup.live_note')}</span>
                </div>
                <div className="landing-mockup-metrics">
                  <div className={`landing-mockup-metric ${summaryTone}`}>
                    <div className="landing-mockup-metric-val">{normalizedGreenPct}%</div>
                    <div className="landing-mockup-metric-label">{t('hero.mockup.green_label')}</div>
                  </div>
                  <div className="landing-mockup-metric yellow">
                    <div className="landing-mockup-metric-val">{riskPct}%</div>
                    <div className="landing-mockup-metric-label">{t('hero.mockup.risk_label')}</div>
                  </div>
                  <div className="landing-mockup-metric red">
                    <div className="landing-mockup-metric-val">{criticalPct}%</div>
                    <div className="landing-mockup-metric-label">{t('hero.mockup.critical_label')}</div>
                  </div>
                </div>

                <div className={`landing-mockup-insight ${summaryTone}`}>
                  <div className="landing-mockup-insight-topline">
                    <span className={`landing-mockup-status-pill ${summaryTone}`}>{summaryLabel}</span>
                    <span className="landing-mockup-scenario-label">{scenarioLabel}</span>
                  </div>
                  <div className="landing-mockup-insight-score">
                    <span className="landing-mockup-insight-score-value">{overallScore}%</span>
                    <span className="landing-mockup-insight-score-label">{t('hero.mockup.score_label')}</span>
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
                      <div className="landing-mockup-controls-title">{t('hero.mockup.controls_title')}</div>
                      <div className="landing-mockup-controls-subtitle">{t('hero.mockup.controls_subtitle')}</div>
                    </div>
                    <div className={`landing-mockup-controls-score ${summaryTone}`}>{overallScore}%</div>
                  </div>
                  <div className="landing-mockup-controls-grid">
                    {heroControlLabels.map((control) => (
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

      <section className="landing-demo-preview" id="demo">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">{t('demo_preview.eyebrow')}</div>
          <h2 className="landing-section-title">{t('demo_preview.title')}</h2>
          <p className="landing-section-subtitle">{t('demo_preview.subtitle')}</p>
        </div>
        <div className="ldp-container">
          <div className="ldp-nav">
            {DEMO_SCREENS.map((screen, index) => (
              <button
                key={screen.key}
                type="button"
                className={`ldp-nav-tab${demoScreen === index ? ' active' : ''}`}
                onClick={() => { setDemoScreen(index); setDemoPaused(true) }}
              >
                <span>{screen.icon}</span>
                {t(`demo_preview.tabs.${screen.key}`)}
              </button>
            ))}
            <button
              type="button"
              className="ldp-pause-btn"
              onClick={() => setDemoPaused((p) => !p)}
              aria-label={demoPaused ? t('demo_preview.play') : t('demo_preview.pause')}
            >
              {demoPaused ? '▶' : '⏸'}
            </button>
          </div>
          <div className="ldp-stage">
            {demoScreen === 0 && <DemoDashboard />}
            {demoScreen === 1 && <DemoKPIs />}
            {demoScreen === 2 && <DemoRiskMap />}
            {demoScreen === 3 && <DemoExecutive />}
            {demoScreen === 4 && <DemoReport />}
          </div>
          <div className="ldp-dots">
            {DEMO_SCREENS.map((screen, index) => (
              <button
                key={screen.key}
                type="button"
                className={`ldp-dot-btn${demoScreen === index ? ' active' : ''}`}
                onClick={() => { setDemoScreen(index); setDemoPaused(true) }}
                aria-label={t(`demo_preview.tabs.${screen.key}`)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="landing-stats">
        <div className="landing-stats-eyebrow">{t('stats.eyebrow')}</div>
        <div className="landing-stats-inner">
          {impactMetrics.map((m) => (
            <div className="landing-stat" key={m.value}>
              <div className="landing-stat-value">{m.value}</div>
              <div className="landing-stat-label">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-problem">
        <div className="landing-problem-inner">
          <div className="landing-problem-left">
            <div className="landing-section-eyebrow">{t('problem.eyebrow')}</div>
            <h2 className="landing-problem-title">
              <Trans ns="landing" i18nKey="problem.quote" components={{ br: <br /> }} />
            </h2>
            <ul className="landing-problem-list">
              {problems.map((p) => (
                <li key={p} className="landing-problem-item">
                  <span className="landing-problem-bullet">✗</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-problem-right">
            <div className="landing-section-eyebrow">{t('problem.value_eyebrow')}</div>
            <h2 className="landing-problem-title">
              <Trans ns="landing" i18nKey="problem.value_quote" components={{ br: <br /> }} />
            </h2>
            <div className="landing-pillars">
              {valuePillars.map((p) => (
                <div key={p.title} className="landing-pillar">
                  <span className="landing-pillar-icon">{p.icon}</span>
                  <div>
                    <strong className="landing-pillar-title">{p.title}</strong>
                    <span className="landing-pillar-desc">{p.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-process" id="como-funciona">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">{t('process.eyebrow')}</div>
          <h2 className="landing-section-title">
            <Trans ns="landing" i18nKey="process.title" components={{ br: <br /> }} />
          </h2>
          <p className="landing-section-subtitle">
            {t('process.subtitle')}
          </p>
        </div>
        <div className="landing-process-grid">
          {commercialSteps.map((step) => (
            <article className="landing-process-card" key={step.step}>
              <div className="landing-process-step">{step.step}</div>
              <h3 className="landing-process-title">{step.title}</h3>
              <p className="landing-process-desc">{step.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-outcomes">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">{t('outcomes.eyebrow')}</div>
          <h2 className="landing-section-title">{t('outcomes.title')}</h2>
          <p className="landing-section-subtitle">{t('outcomes.subtitle')}</p>
        </div>
        <div className="landing-outcomes-grid">
          {outcomes.map((o) => (
            <div className="landing-outcome-card" key={o.key}>
              <div className="landing-feature-icon">{o.icon}</div>
              <h3 className="landing-feature-title">{o.title}</h3>
              <p className="landing-feature-desc">{o.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">{t('features.eyebrow')}</div>
          <h2 className="landing-section-title">{t('features.title')}</h2>
          <p className="landing-section-subtitle">
            {t('features.subtitle')}
          </p>
        </div>
        <div className="landing-features-grid">
          {features.map((feature) => (
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
          <div className="landing-section-eyebrow">{t('pricing.eyebrow')}</div>
          <h2 className="landing-section-title">{t('pricing.title')}</h2>
          <p className="landing-section-subtitle">
            {t('pricing.subtitle')}
          </p>
        </div>
        <div className="landing-pricing-grid">
          {plans.map((plan) => (
            <div className={`landing-plan ${plan.featured ? 'featured' : ''}`} key={plan.name}>
              {plan.featured && <div className="landing-plan-badge">{t('pricing.featured_badge')}</div>}
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
              <a href={demoHref} className={`landing-plan-cta ${plan.ctaStyle}`}>{plan.cta}</a>
            </div>
          ))}
        </div>
        <p className="landing-pricing-note">
          {t('pricing.note')}
        </p>
        <div className="landing-payment-strip">
          <span className="landing-payment-secure">🔒 {t('pricing.payment_secure')}</span>
          <span className="landing-payment-sep" />
          <div className="landing-payment-methods">
            <span className="landing-payment-badge">Visa</span>
            <span className="landing-payment-badge">Mastercard</span>
            <span className="landing-payment-badge">PayPal</span>
            <span className="landing-payment-badge">Stripe</span>
          </div>
        </div>
      </section>

      <section className="landing-proof">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">{t('testimonials.eyebrow')}</div>
          <h2 className="landing-section-title">{t('testimonials.title')}</h2>
        </div>
        <div className="landing-proof-grid">
          {testimonials.map((testimonial) => (
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
          <div className="landing-section-eyebrow">{t('faq.eyebrow')}</div>
          <h2 className="landing-section-title">{t('faq.title')}</h2>
        </div>
        <div className="landing-faq-list">
          {faqs.map((faq, index) => (
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
          <div className="landing-section-eyebrow landing-section-eyebrow-light">{t('contact.eyebrow')}</div>
          <h2 className="landing-cta-title">
            {t('contact.title_line1')}<br />
            <span>{t('contact.title_line2')}</span>
          </h2>
          <p className="landing-cta-subtitle">
            {t('contact.subtitle')}
          </p>
          <div className="landing-contact-layout">
            <form className="landing-demo-form" onSubmit={handleDemoRequestSubmit}>
              <div className="landing-demo-form-header">
                <div className="landing-demo-form-title">{t('contact.form_title')}</div>
                <div className="landing-demo-form-copy">
                  {t('contact.form_copy')}
                </div>
              </div>
              <div className="landing-demo-form-grid">
                <label className="landing-demo-field">
                  <span className="landing-demo-label">{t('contact.field_name')}</span>
                  <input
                    className="landing-demo-input"
                    type="text"
                    value={demoForm.name}
                    onChange={(event) => handleDemoFormChange('name', event.target.value)}
                    placeholder={t('contact.field_name_placeholder')}
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </label>
                <label className="landing-demo-field">
                  <span className="landing-demo-label">{t('contact.field_company')}</span>
                  <input
                    className="landing-demo-input"
                    type="text"
                    value={demoForm.company}
                    onChange={(event) => handleDemoFormChange('company', event.target.value)}
                    placeholder={t('contact.field_company_placeholder')}
                    autoComplete="organization"
                    maxLength={160}
                    required
                  />
                </label>
                <label className="landing-demo-field">
                  <span className="landing-demo-label">{t('contact.field_email')}</span>
                  <input
                    className="landing-demo-input"
                    type="email"
                    value={demoForm.email}
                    onChange={(event) => handleDemoFormChange('email', event.target.value)}
                    placeholder={t('contact.field_email_placeholder')}
                    autoComplete="email"
                    maxLength={180}
                    required
                  />
                </label>
                <label className="landing-demo-field">
                  <span className="landing-demo-label">{t('contact.field_phone')}</span>
                  <input
                    className="landing-demo-input"
                    type="tel"
                    value={demoForm.phone}
                    onChange={(event) => handleDemoFormChange('phone', event.target.value)}
                    placeholder={t('contact.field_phone_placeholder')}
                    autoComplete="tel"
                    maxLength={40}
                    required
                  />
                </label>
                <label className="landing-demo-field landing-demo-field-full">
                  <span className="landing-demo-label">{t('contact.field_users')}</span>
                  <input
                    className="landing-demo-input"
                    type="number"
                    min="1"
                    max="50000"
                    step="1"
                    value={demoForm.usersCount}
                    onChange={(event) => handleDemoFormChange('usersCount', event.target.value)}
                    placeholder={t('contact.field_users_placeholder')}
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
                  {demoSubmitState === 'loading' ? t('contact.submit_loading') : t('contact.submit')}
                </button>
                <div className="landing-demo-form-note">{t('contact.form_note')}</div>
              </div>
            </form>
            <div className="landing-contact-side">
              <div className="landing-contact-side-title">{t('contact.side_title')}</div>
              <p className="landing-contact-side-copy">
                {t('contact.side_copy')}
              </p>
              <div className="landing-contact-grid">
                {contactCards.map((contact) => (
                  <a className="landing-contact-card" href={contact.href} key={`${contact.label}-${contact.value}`}>
                    <span className="landing-contact-label">{contact.label}</span>
                    <span className="landing-contact-value">{contact.value}</span>
                  </a>
                ))}
              </div>
              <div className="landing-cta-actions landing-contact-actions">
                <a href={contactMailHref} className="landing-cta-secondary">{t('contact.btn_email')}</a>
                <a href={primaryPhone.href} className="landing-cta-secondary">{t('contact.btn_call')}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand-block">
          <div className="landing-footer-brand">KPI Manager</div>
          <div className="landing-footer-copy">{t('footer.copyright', { year: new Date().getFullYear() })}</div>
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
        <Link to="/login" className="landing-footer-link">{t('footer.login')}</Link>
      </footer>
    </div>
  )
}
