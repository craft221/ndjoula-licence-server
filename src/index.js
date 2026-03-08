const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const config = require('./config')
const { pool, query } = require('./database/connection')

const app = express()

// Railway/Render utilisent un reverse proxy — nécessaire pour express-rate-limit
app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? [config.serverUrl]
    : true
}))
app.use(express.json({ limit: '10kb' }))

// Routes
app.use('/api/health', require('./routes/health'))
app.use('/api/licence', require('./routes/licence'))
app.use('/api/payment', require('./routes/payment'))
app.use('/api/admin', require('./routes/admin'))

// Run migrations
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'database', 'migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    try {
      await query(sql)
      console.log(`Migration ${file} appliquée`)
    } catch (err) {
      // Tables may already exist
      if (!err.message.includes('already exists')) {
        console.error(`Erreur migration ${file}:`, err.message)
      }
    }
  }
}

// Start
async function start() {
  try {
    // Diagnostic de démarrage (sans fuite de credentials)
    console.log('=== DIAGNOSTIC DÉMARRAGE ===')
    console.log('PORT:', process.env.PORT)
    console.log('NODE_ENV:', process.env.NODE_ENV)
    console.log('DATABASE_URL définie:', !!process.env.DATABASE_URL)
    console.log('API_SECRET défini:', !!process.env.API_SECRET)
    console.log('LICENCE_PRIVATE_KEY définie:', !!process.env.LICENCE_PRIVATE_KEY)
    console.log('PAYDUNYA_MODE:', process.env.PAYDUNYA_MODE)
    console.log('=== FIN DIAGNOSTIC ===')

    // Test DB connection
    await pool.query('SELECT 1')
    console.log('PostgreSQL connecté')

    // Run migrations
    await runMigrations()

    app.listen(config.port, () => {
      console.log(`Serveur de licences démarré sur le port ${config.port}`)
      console.log(`Mode: ${config.nodeEnv}`)
      console.log(`PayDunya: ${config.paydunya.mode}`)
    })
  } catch (err) {
    console.error('Erreur démarrage serveur:', err)
    process.exit(1)
  }
}

start()
