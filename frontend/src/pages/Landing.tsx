import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Landing.css'

const FEATURES = [
  {
    icon: '📊',
    title: 'Dashboard ejecutivo en tiempo real',
    desc: 'Visualizá el estado de todos tus KPIs en un semáforo organizacional. Verde, amarillo, rojo — de un vistazo.',
    tag: 'Tablero + Árbol de objetivos',
  },
  {
    icon: '🤖',
    title: 'Curaduria con detección de outliers',
    desc: 'El sistema detecta automáticamente valores atípicos usando z-score estadístico y te alerta antes de aprobar un dato sospechoso.',
    tag: 'IA asistida',
  },
  {
    icon: '📅',
    title: 'Check-ins semanales',
    desc: 'Tres preguntas rápidas cada lunes: avance, obstáculos y foco. Con estado de ánimo y vista de equipo para líderes.',
    tag: 'Engagement del equipo',
  },
  {
    icon: '🔗',
    title: 'Integraciones externas',
    desc: 'Conectá Google Sheets, APIs REST o archivos CSV para que los KPIs se actualicen solos según el calendario que configures.',
    tag: 'Google Sheets · REST · CSV',
  },
  {
    icon: '🧪',
    title: 'Simulador ¿Qué pasa si...?',
    desc: 'Mové sliders para simular el impacto de variaciones en KPIs individuales sobre el estado general de la organización.',
    tag: 'Análisis de escenarios',
  },
  {
    icon: '📦',
    title: 'Marketplace de templates',
    desc: 'Más de 36 KPIs listos para importar en 6 industrias: Ventas, Tecnología, RRHH, Operaciones, Marketing y Finanzas.',
    tag: '36 templates · 6 industrias',
  },
  {
    icon: '📄',
    title: 'Exportación PDF con narrativa',
    desc: 'Generá reportes ejecutivos en un click con texto automático en español que describe el estado del período.',
    tag: 'Reporte automático',
  },
  {
    icon: '🛡️',
    title: 'Seguridad y auditoría',
    desc: 'Control de acceso por roles, MFA, SSO, log de auditoría completo y encriptación de credenciales en reposo.',
    tag: 'Enterprise-grade',
  },
]

const PLANS = [
  {
    name: 'Starter',
    desc: 'Para equipos pequeños que quieren ordenar sus KPIs.',
    amount: 'USD 49',
    period: '/ mes',
    featured: false,
    cta: 'Empezar gratis',
    ctaStyle: 'outline' as const,
    features: [
      { text: 'Hasta 10 colaboradores', included: true },
      { text: 'KPIs individuales y grupales', included: true },
      { text: 'Dashboard ejecutivo', included: true },
      { text: 'Check-ins semanales', included: true },
      { text: '36 templates del marketplace', included: true },
      { text: 'Integraciones externas', included: false },
      { text: 'Simulador de escenarios', included: false },
      { text: 'SSO / MFA', included: false },
    ],
  },
  {
    name: 'Professional',
    desc: 'Para organizaciones que necesitan visibilidad completa.',
    amount: 'USD 149',
    period: '/ mes',
    featured: true,
    cta: 'Comenzar ahora',
    ctaStyle: 'primary' as const,
    features: [
      { text: 'Hasta 50 colaboradores', included: true },
      { text: 'KPIs individuales y grupales', included: true },
      { text: 'Dashboard ejecutivo + Tablero ejecutivo', included: true },
      { text: 'Check-ins semanales', included: true },
      { text: '36 templates del marketplace', included: true },
      { text: 'Integraciones Google Sheets, REST, CSV', included: true },
      { text: 'Simulador de escenarios', included: true },
      { text: 'SSO / MFA', included: false },
    ],
  },
  {
    name: 'Enterprise',
    desc: 'Para grandes equipos con requisitos de seguridad avanzados.',
    amount: 'USD 399',
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
      { text: 'Exportación PDF con narrativa IA', included: true },
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
    a: 'Sí. El Marketplace incluye 36 templates listos para importar en un click. También podés crear KPIs personalizados con fórmulas propias desde el módulo de KPIs.',
  },
  {
    q: '¿Cómo funciona la integración con Google Sheets?',
    a: 'Configurás la URL de tu hoja, el rango de celdas y la frecuencia de actualización. El sistema busca el valor automáticamente y lo registra como medición del KPI correspondiente.',
  },
  {
    q: '¿El sistema es multi-empresa?',
    a: 'Cada instancia es single-tenant: una empresa, una base de datos, sin mezcla de datos. Esto garantiza aislamiento total y cumplimiento con políticas de privacidad corporativa.',
  },
  {
    q: '¿Qué pasa si un colaborador propone un valor muy fuera de lo normal?',
    a: 'El sistema calcula el z-score del valor respecto al historial del colaborador y muestra una advertencia visual antes de que el líder apruebe. Para muestras pequeñas usa desviación porcentual.',
  },
  {
    q: '¿Puedo probar el sistema antes de pagar?',
    a: 'Sí. Ofrecemos un período de prueba de 14 días con acceso completo al plan Professional. No se requiere tarjeta de crédito para empezar.',
  },
]

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="landing">
      {/* NAV */}
      <nav className="landing-nav">
        <a href="/" className="landing-nav-brand">
          <div className="landing-nav-mark">KPI</div>
          <span className="landing-nav-name">KPI Manager</span>
        </a>
        <div className="landing-nav-actions">
          <Link to="/login" className="landing-btn-ghost">Iniciar sesión</Link>
          <Link to="/login" className="landing-btn-primary">Probar gratis</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <div className="landing-hero-eyebrow">
              <span className="landing-hero-eyebrow-dot" />
              Software de gestión de KPIs
            </div>
            <h1 className="landing-hero-title">
              Medí, analizá y<br />
              <span>mejorá tu equipo</span><br />
              con claridad total
            </h1>
            <p className="landing-hero-subtitle">
              Plataforma integral de gestión de KPIs con dashboards ejecutivos, detección inteligente de anomalías, check-ins semanales e integraciones externas. Todo lo que necesitás para tomar decisiones basadas en datos reales.
            </p>
            <div className="landing-hero-ctas">
              <Link to="/login" className="landing-hero-cta-primary">
                Empezar gratis →
              </Link>
              <a href="#planes" className="landing-hero-cta-secondary">
                Ver planes
              </a>
            </div>
            <div className="landing-hero-trust">
              <div className="landing-hero-trust-avatars">
                <div className="landing-hero-trust-avatar">MR</div>
                <div className="landing-hero-trust-avatar">LM</div>
                <div className="landing-hero-trust-avatar">SG</div>
                <div className="landing-hero-trust-avatar">+</div>
              </div>
              <span>Usado por equipos de operaciones, RRHH y finanzas</span>
            </div>
          </div>

          {/* Mock UI */}
          <div className="landing-hero-visual">
            <div className="landing-hero-mockup">
              <div className="landing-mockup-bar">
                <div className="landing-mockup-dot" />
                <div className="landing-mockup-dot" />
                <div className="landing-mockup-dot" />
                <div className="landing-mockup-url">kpimanager.com.ar/tablero-ejecutivo</div>
              </div>
              <div className="landing-mockup-body">
                <div className="landing-mockup-metrics">
                  <div className="landing-mockup-metric green">
                    <div className="landing-mockup-metric-val">74%</div>
                    <div className="landing-mockup-metric-label">En verde</div>
                  </div>
                  <div className="landing-mockup-metric">
                    <div className="landing-mockup-metric-val">18%</div>
                    <div className="landing-mockup-metric-label">En riesgo</div>
                  </div>
                  <div className="landing-mockup-metric red">
                    <div className="landing-mockup-metric-val">8%</div>
                    <div className="landing-mockup-metric-label">Crítico</div>
                  </div>
                </div>

                <div className="landing-mockup-row">
                  <span className="landing-mockup-row-name">Ventas · Q1 2026</span>
                  <span className="landing-mockup-badge green">↑ +12%</span>
                </div>
                <div className="landing-mockup-row">
                  <span className="landing-mockup-row-name">Retención de talento</span>
                  <span className="landing-mockup-badge yellow">◎ 87%</span>
                </div>
                <div className="landing-mockup-row">
                  <span className="landing-mockup-row-name">Tiempo de entrega</span>
                  <span className="landing-mockup-badge red">↓ -5%</span>
                </div>

                <div className="landing-mockup-bar-chart">
                  {[
                    { label: 'Comercial', pct: 88 },
                    { label: 'Tecnología', pct: 72 },
                    { label: 'Operaciones', pct: 65 },
                    { label: 'RRHH', pct: 91 },
                  ].map((row) => (
                    <div className="landing-mockup-bar-row" key={row.label}>
                      <span>{row.label}</span>
                      <div className="landing-mockup-bar-fill">
                        <div className="landing-mockup-bar-inner" style={{ width: `${row.pct}%` }} />
                      </div>
                      <span>{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
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
            <div className="landing-stat-label">Sin mezcla de datos entre clientes</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">&lt;1min</div>
            <div className="landing-stat-label">Para generar un reporte ejecutivo</div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="landing-features">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Funcionalidades</div>
          <h2 className="landing-section-title">Todo lo que necesitás para gestionar KPIs en serio</h2>
          <p className="landing-section-subtitle">
            Desde el ingreso de datos hasta el reporte ejecutivo, cubrimos todo el ciclo de vida de tus indicadores.
          </p>
        </div>
        <div className="landing-features-grid">
          {FEATURES.map((f) => (
            <div className="landing-feature-card" key={f.title}>
              <div className="landing-feature-icon">{f.icon}</div>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-desc">{f.desc}</p>
              <span className="landing-feature-tag">✓ {f.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="landing-pricing" id="planes">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Planes y precios</div>
          <h2 className="landing-section-title">Elegí el plan que se adapta a tu equipo</h2>
          <p className="landing-section-subtitle">
            Sin costos ocultos. Podés cambiar de plan en cualquier momento. 14 días de prueba gratis en todos los planes.
          </p>
        </div>
        <div className="landing-pricing-grid">
          {PLANS.map((plan) => (
            <div className={`landing-plan ${plan.featured ? 'featured' : ''}`} key={plan.name}>
              {plan.featured && <div className="landing-plan-badge">Más popular</div>}
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
                {plan.features.map((f) => (
                  <li className="landing-plan-feature" key={f.text}>
                    <span className={`landing-plan-check ${f.included ? '' : 'muted'}`}>
                      {f.included ? '✓' : '–'}
                    </span>
                    <span style={{ color: f.included ? undefined : '#94a3b8' }}>{f.text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/login" className={`landing-plan-cta ${plan.ctaStyle}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="landing-proof">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Testimonios</div>
          <h2 className="landing-section-title">Lo que dicen los equipos que ya lo usan</h2>
        </div>
        <div className="landing-proof-grid">
          {TESTIMONIALS.map((t) => (
            <div className="landing-proof-card" key={t.name}>
              <div className="landing-proof-stars">★★★★★</div>
              <p className="landing-proof-quote">"{t.quote}"</p>
              <div className="landing-proof-author">
                <div className="landing-proof-avatar" style={{ background: t.color }}>{t.initials}</div>
                <div>
                  <div className="landing-proof-name">{t.name}</div>
                  <div className="landing-proof-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-faq">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">Preguntas frecuentes</div>
          <h2 className="landing-section-title">Todo lo que querés saber</h2>
        </div>
        <div className="landing-faq-list">
          {FAQS.map((faq, i) => (
            <div className={`landing-faq-item ${openFaq === i ? 'open' : ''}`} key={i}>
              <button className="landing-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {faq.q}
                <span className="landing-faq-icon">+</span>
              </button>
              <p className="landing-faq-a">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="landing-cta-section">
        <div className="landing-cta-inner">
          <h2 className="landing-cta-title">
            Empezá a medir lo que<br />
            <span>realmente importa</span>
          </h2>
          <p className="landing-cta-subtitle">
            14 días de prueba gratis. Sin tarjeta de crédito. Configuración en minutos.
          </p>
          <div className="landing-cta-actions">
            <Link to="/login" className="landing-cta-primary">Crear cuenta gratis →</Link>
            <a href="#planes" className="landing-cta-secondary">Ver planes</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">KPI Manager</div>
        <div className="landing-footer-copy">© {new Date().getFullYear()} KPI Manager. Todos los derechos reservados.</div>
        <Link to="/login" className="landing-footer-link">Iniciar sesión →</Link>
      </footer>
    </div>
  )
}
