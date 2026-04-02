import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { testConnection } from './config/database.js'
import { appEnv } from './config/env.js'

// Routes
import authRoutes from './routes/auth.routes.js'
import collaboratorsRoutes from './routes/collaborators.routes.js'
import periodsRoutes from './routes/periods.routes.js'
import subPeriodsRoutes from './routes/sub-periods.routes.js'
import kpisRoutes from './routes/kpis.routes.js'
import collaboratorKpisRoutes from './routes/collaborator-kpis.routes.js'
import objectiveTreesRoutes from './routes/objective-trees.routes.js'
import validationRoutes from './routes/validation.routes.js'
import aggregatedViewsRoutes from './routes/aggregated-views.routes.js'
import reductionViewsRoutes from './routes/reduction-views.routes.js'
import exportRoutes from './routes/export.routes.js'
import auditRoutes from './routes/audit.routes.js'
import dashboardRoutes from './routes/dashboard.routes.js'
import configRoutes from './routes/config.routes.js'
import areasRoutes from './routes/areas.routes.js'
import evolutionRoutes from './routes/evolution.routes.js'
import notificationsRoutes from './routes/notifications.routes'
import curationRoutes from './routes/curation.routes.js'
import measurementsRoutes from './routes/measurements.routes.js'
import integrationsRoutes from './routes/integrations.routes.js'
import orgScopesRoutes from './routes/org-scopes.routes.js'
import calendarProfilesRoutes from './routes/calendar-profiles.routes.js'
import securityRoutes from './routes/security.routes.js'
import scopeKpisRoutes from './routes/scope-kpis.routes.js'
import dataSourceMappingsRoutes from './routes/data-source-mappings.routes.js'
import { startIntegrationsScheduler } from './utils/integrations-scheduler'
import { runNotifications } from './utils/notifications'

const app = express()
const PORT = process.env.PORT || 5000

const resolveCorsOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
  if (!origin) return callback(null, true)
  if (appEnv.corsAllowedOrigins.includes('*') || appEnv.corsAllowedOrigins.includes(origin)) {
    return callback(null, true)
  }
  return callback(new Error('Origen no permitido por CORS'))
}

// Middleware
app.use(helmet())
app.set('trust proxy', appEnv.trustProxy)
app.use(
  cors({
    origin: resolveCorsOrigin,
    credentials: true,
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', async (req, res) => {
  const dbConnected = await testConnection()
  res.json({
    status: 'ok',
    message: 'Gestion KPI API is running',
    database: dbConnected ? 'connected' : 'disconnected',
  })
})

app.get('/api/health/ready', async (req, res) => {
  const dbConnected = await testConnection()
  if (!dbConnected) {
    return res.status(503).json({
      status: 'error',
      message: 'Database not ready',
    })
  }
  return res.json({
    status: 'ok',
    message: 'Ready',
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/collaborators', collaboratorsRoutes)
app.use('/api/periods', periodsRoutes)
app.use('/api/sub-periods', subPeriodsRoutes)
app.use('/api/kpis', kpisRoutes)
app.use('/api/collaborator-kpis', collaboratorKpisRoutes)
app.use('/api/objective-trees', objectiveTreesRoutes)
app.use('/api/validation', validationRoutes)
app.use('/api/aggregated-views', aggregatedViewsRoutes)
app.use('/api', reductionViewsRoutes)
app.use('/api/export', exportRoutes)
app.use('/api', auditRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/config', configRoutes)
app.use('/api/areas', areasRoutes)
app.use('/api', evolutionRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/curation', curationRoutes)
app.use('/api/measurements', measurementsRoutes)
app.use('/api/integrations', integrationsRoutes)
app.use('/api/org-scopes', orgScopesRoutes)
app.use('/api/calendar-profiles', calendarProfilesRoutes)
app.use('/api/security', securityRoutes)
app.use('/api/scope-kpis', scopeKpisRoutes)
app.use('/api/macro-kpis', scopeKpisRoutes)
app.use('/api/data-source-mappings', dataSourceMappingsRoutes)

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`)
  console.log(`\n📋 API Endpoints:`)
  console.log(`   POST   /api/auth/login`)
  console.log(`   GET    /api/auth/me`)
  console.log(`   GET    /api/collaborators`)
  console.log(`   GET    /api/periods`)
  console.log(`   GET    /api/kpis`)
  console.log(`   GET    /api/collaborator-kpis`)
  console.log(`   GET    /api/collaborator-kpis/collaborator/:id`)
  
  // Test database connection
  console.log('\n🔌 Testing database connection...')
  const connected = await testConnection()
  if (connected) {
    console.log('✅ Database connection successful\n')
  } else {
    console.log('❌ Database connection failed\n')
    console.log('💡 Make sure to:')
    console.log('   1. Create a .env file in the backend folder')
    console.log('   2. Configure your MySQL credentials')
    console.log('   3. Run the database setup script: npm run setup:db')
  }
})

const NOTIFY_INTERVAL_MIN = parseInt(process.env.NOTIFY_INTERVAL_MIN || '10')
const shouldNotify = (process.env.NOTIFY_ENABLED || 'true').toLowerCase() === 'true'
const notifyOnStart = (process.env.NOTIFY_RUN_ON_START || 'false').toLowerCase() === 'true'

if (shouldNotify) {
  if (notifyOnStart) {
    setTimeout(() => {
      runNotifications().catch((error) => console.error('[notifications] error:', error))
    }, 5000)
  }

  setInterval(() => {
    runNotifications().catch((error) => console.error('[notifications] error:', error))
  }, NOTIFY_INTERVAL_MIN * 60 * 1000)
}

startIntegrationsScheduler()
