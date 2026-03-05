const { Pool } = require('pg')
const config = require('../config')

// Debug: log DATABASE_URL presence (not the full value for security)
const dbUrl = config.databaseUrl || process.env.DATABASE_URL
if (dbUrl) {
  console.log('DATABASE_URL trouvée, longueur:', dbUrl.length)
  console.log('DATABASE_URL commence par:', dbUrl.substring(0, 15) + '...')
  // Parse to check hostname
  try {
    const url = new URL(dbUrl)
    console.log('Hostname parsé:', url.hostname)
    console.log('Port parsé:', url.port)
  } catch (e) {
    console.error('DATABASE_URL invalide:', e.message)
  }
} else {
  console.error('ERREUR: DATABASE_URL est vide ou non définie!')
  console.log('Variables d\'env disponibles:', Object.keys(process.env).filter(k => k.includes('DATA') || k.includes('PG') || k.includes('PORT')).join(', '))
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
})

pool.on('error', (err) => {
  console.error('Erreur PostgreSQL inattendue:', err)
})

async function query(text, params) {
  const result = await pool.query(text, params)
  return result
}

async function getClient() {
  return pool.connect()
}

module.exports = { pool, query, getClient }
