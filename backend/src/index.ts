import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import { testConnection } from './config/database.js'

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

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(helmet())
app.use(cors())
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
