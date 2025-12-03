import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import { testConnection } from './config/database'

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

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`)
  
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

